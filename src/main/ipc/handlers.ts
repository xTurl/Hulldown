import { app, ipcMain, shell, dialog } from 'electron';
import * as configService from '../services/config';
import * as cacheService from '../services/cache';
import * as analyticsService from '../services/analytics';
import * as wgService from '../services/wargaming';
import * as wgData from '../services/wg-data';
import * as newsService from '../services/news';
import * as patchesService from '../services/patches';
import * as replayParser from '../services/replay-parser';
import * as replayScan from '../services/replay-scan';
import * as updaterService from '../services/updater';
import { calculateWn8, calculateWnx } from '../../shared/utils/wn8';
import { assertString, assertNumber, assertOptionalNumber, assertConfig } from './validators';
import type { TankDetails, BattleDebrief, WeeklyCoachReport, FreeAIUsageInfo } from '../../shared/types';
import { withAICache } from '../services/claude';
import { getFreeAIUsage } from '../services/free-ai';
import { generateTankRecommendations } from '../ai/tank-recommendations';
import { runBattleDebrief } from '../ai/battle-debrief';
import { runWeeklyCoach } from '../ai/weekly-coach';
import { getIsoWeek } from '../../shared/utils/dates';
import { HOUR, DAY, WEEK } from '../../shared/utils/time';

const ONE_HOUR = HOUR;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/** Wraps an IPC handler so all errors are caught and logged before re-throwing. */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[IPC:${channel}]`, msg);
      throw e;
    }
  });
}

function isValidTankDetails(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.tankId === 'number' &&
    typeof d.wnx === 'number' &&
    typeof d.avgDamageAssisted === 'number' &&
    typeof d.avgDamageAssistedTrack === 'number' &&
    typeof d.avgDamageBlocked === 'number' &&
    typeof d.survivalRate === 'number' &&
    typeof d.avgFrags === 'number' &&
    typeof d.avgSpots === 'number' &&
    typeof d.avgXp === 'number'
  );
}

export function registerHandlers(): void {
  // The renderer never receives the raw Claude API key — only a boolean flag.
  // This keeps the key out of renderer memory / DevTools.
  handle('config:get', () => {
    const { claudeApiKey, ...rest } = configService.getConfig();
    return { ...rest, hasClaudeApiKey: claudeApiKey.length > 0 };
  });

  handle('config:save', (config) => {
    const prev = configService.getConfig();
    // Write-only key contract: a non-empty string replaces the stored key,
    // anything else (undefined / '') preserves it.
    const incoming = (config ?? {}) as Record<string, unknown>;
    const claudeApiKey =
      typeof incoming.claudeApiKey === 'string' && incoming.claudeApiKey.trim() !== ''
        ? incoming.claudeApiKey.trim()
        : prev.claudeApiKey;
    const validated = assertConfig({ ...incoming, claudeApiKey });
    wgData.clearMemCache();
    cacheService.clearPlayerInfoCache();
    // If the account changed, the cached WG data belongs to a different player
    if (prev.accountId !== validated.accountId) {
      cacheService.clearWgDataCache(prev.accountId);
    }
    configService.saveConfig(validated);
  });

  handle('player:search', (username, region) =>
    wgService.searchPlayer(assertString(username, 'username'), wgData.WG_API_KEY, assertString(region, 'region'))
  );

  handle('player:info', async () => {
    const cached = cacheService.getPlayerInfo();
    if (cached && Date.now() - cached.updatedAt < ONE_HOUR) return cached.data;

    const config = configService.getConfig();
    // Fetch all three data sources in parallel.
    // Per-tank weighted average WN8 is always more accurate than the raw aggregate formula,
    // so we ensure tank stats and XVM expected values are loaded even if tanks:list hasn't
    // been called yet this session. Both are in-memory cached so after first call this is instant.
    const [playerInfo, { tankStats }, _wn8Exp] = await Promise.all([
      wgService.getPlayerInfo(config.accountId, wgData.WG_API_KEY, config.region),
      wgData.getWgData(config),
      wgData.getWn8Exp(), // warms expected-values cache for accurate per-tank WN8 calculations
    ]);
    const stats = playerInfo.statistics.all;
    const overall = wgData.computeOverallWn8AndWnx(tankStats);
    const wn8 = overall.wn8;
    const result = {
      accountId: playerInfo.account_id,
      username: playerInfo.nickname,
      createdAt: playerInfo.created_at,
      lastBattle: playerInfo.last_battle_time,
      statistics: stats,
      wn8,
    };
    cacheService.savePlayerInfo(result);

    const last = cacheService.getLastProgressSnapshot(config.accountId);
    if (!last || stats.battles > last.battles) {
      cacheService.saveProgressSnapshot({
        accountId: config.accountId,
        takenAt: Date.now(),
        battles: stats.battles,
        wn8,
        wnx: overall.wnx,
        winRate: stats.battles > 0 ? Math.round((stats.wins / stats.battles) * 1000) / 10 : 0,
        rawWins: stats.wins,
        rawDamage: stats.damage_dealt,
        rawFrags: stats.frags,
        rawSurvived: stats.survived_battles,
        rawXp: stats.xp,
        rawSpotted: stats.spotted,
        rawDroppedCp: stats.dropped_capture_points,
      });
    }

    return result;
  });

  handle('tanks:list', async () => {
    const config = configService.getConfig();
    const [{ tankStats, encyclopedia }] = await Promise.all([
      wgData.getWgData(config),
      wgData.getWn8Exp(),  // pre-warm expected values cache in parallel
    ]);

    cacheService.backfillMissingWnx(config.accountId, wgData.computeOverallWn8AndWnx(tankStats).wnx);

    return tankStats
      .filter(t => t.all.battles > 0)
      .map(t => wgData.buildTank(t, encyclopedia[t.tank_id]))
      .sort((a, b) => b.battles - a.battles);
  });

  handle('tanks:details', async (tankId) => {
    const id = assertNumber(tankId, 'tankId');
    const cached = cacheService.getTankDetails(id);
    if (cached && isValidTankDetails(cached.data)) return cached.data;

    const config = configService.getConfig();
    const { tankStats, encyclopedia } = await wgData.getWgData(config);
    const tankStat = tankStats.find(t => t.tank_id === id);
    if (!tankStat) throw new Error(`Tank ${id} not found`);

    const prevDetails = isValidTankDetails(cached?.data) ? (cached!.data as TankDetails) : undefined;
    const details: TankDetails = {
      ...wgData.buildTank(tankStat, encyclopedia[id]),
      mapStats: prevDetails?.mapStats ?? [],
      recommendations: prevDetails?.recommendations ?? null,
      rawStats: { ...tankStat.all } as Record<string, number>,
    };

    cacheService.saveTankDetails(id, details);
    return details;
  });

  handle('tanks:recommendations', async (tankId, force) => {
    const id = assertNumber(tankId, 'tankId');
    const cached = cacheService.getTankDetails(id);
    if (!cached) throw new Error('Tank details not loaded yet');

    if (!isValidTankDetails(cached.data)) throw new Error('Cached tank data is corrupted');
    const details = cached.data as TankDetails;
    if (details.recommendations && force !== true) return details;

    const config = configService.getConfig();
    const memData = wgData.getMemWgData();
    const playerContext = memData
      ? wgData.buildPlayerContext(memData.tankStats, memData.encyclopedia)
      : undefined;

    const replayContext = cacheService.getReplayTankContext(config.accountId, details.name);

    const recommendations = await generateTankRecommendations(
      details, details.mapStats, config.claudeApiKey, playerContext, replayContext
    );

    const updated: TankDetails = { ...details, recommendations };
    cacheService.saveTankDetails(id, updated);
    return updated;
  });

  // ---------------------------------------------------------------------------
  // battle:debrief — on-demand tactical analysis of a single battle
  // ---------------------------------------------------------------------------
  const THIRTY_DAYS_MS = 30 * DAY;

  handle('battle:debrief', async (arenaIdRaw, forceRaw) => {
    const arenaId = assertString(arenaIdRaw, 'arenaId');
    const force = forceRaw === true;

    const config = configService.getConfig();

    return withAICache<BattleDebrief>({
      force,
      getCached: () => cacheService.getBattleDebrief(config.accountId, arenaId),
      saveCached: (d) => cacheService.saveBattleDebrief(arenaId, config.accountId, d),
      compute: async () => {
        const battle = cacheService.getBattleByArenaId(config.accountId, arenaId);
        if (!battle) throw new Error('Battle not found');
        if (battle.result === 'incomplete') throw new Error('Cannot debrief an incomplete battle');

        // Gather expected values for this tank (same lookup chain as replays:list)
        await Promise.all([wgData.getWn8Exp(), wgData.getWgData(config)]);
        const tankId = wgData.resolveTankId(battle.tankKey, battle.tankName);
        const expEntry = tankId !== undefined ? wgData.expForTank(tankId) : undefined;
        const vehicle = wgData.getVehicle(tankId);
        const baseline = cacheService.getTankBaseline(config.accountId, battle.tankKey, THIRTY_DAYS_MS);

        return runBattleDebrief({ battle, vehicle, expEntry, baseline }, config.claudeApiKey);
      },
    });
  });

  // ---------------------------------------------------------------------------
  // coach:weekly-report — action-oriented 7-day performance analysis
  // ---------------------------------------------------------------------------
  handle('coach:weekly-report', async (forceRaw) => {
    const force = forceRaw === true;
    const config = configService.getConfig();

    const endMs = Date.now();
    const isoWeek = getIsoWeek(endMs);

    return withAICache<WeeklyCoachReport>({
      force,
      getCached: () => cacheService.getWeeklyReport(config.accountId, isoWeek),
      // Reject pre-schema-bump reports (missing commonMistakes / focusTanks) so they regenerate.
      isCachedValid: (r) => Array.isArray(r.commonMistakes) && Array.isArray(r.focusTanks),
      saveCached: (r) => cacheService.saveWeeklyReport(config.accountId, isoWeek, r),
      compute: async () => {
        const data = analyticsService.getWeeklyCoachData(config.accountId, endMs);
        if (data.thisWeek.battles === 0) {
          throw new Error("No battles this week — play some tanks first!");
        }
        return runWeeklyCoach(data, config.claudeApiKey, endMs - WEEK, endMs);
      },
    });
  });

  // ai:usage — today's free-tier usage, so the UI can show remaining counts.
  // Returns null when the user has their own Claude key (unlimited — nothing
  // to count) or when the free AI proxy is unreachable (fail silently, this
  // is a non-critical status check).
  handle('ai:usage', async (): Promise<FreeAIUsageInfo | null> => {
    const config = configService.getConfig();
    if (config.claudeApiKey) return null;
    try {
      return await getFreeAIUsage();
    } catch (e) {
      console.warn('[ai:usage] Failed to fetch free AI usage:', e instanceof Error ? e.message : e);
      return null;
    }
  });

  handle('coach:report-history', (limitRaw) => {
    const config = configService.getConfig();
    const limitRequested = assertOptionalNumber(limitRaw, 'limit', 10);
    const limit = Math.max(1, Math.min(limitRequested, 100));
    return cacheService.listWeeklyReports(config.accountId, limit);
  });

  handle('cache:clearMem', () => {
    wgData.clearMemCache();
  });

  handle('cache:clearPlayerInfo', () => {
    cacheService.clearPlayerInfoCache();
  });

  // Clears WG API + AI caches but preserves the parsed battle database —
  // old replay files may no longer exist on disk, so battles are not recoverable.
  handle('cache:clear', () => {
    wgData.clearMemCache();
    cacheService.clearApiCaches();
  });

  handle('cache:stats', () => cacheService.getStats());

  handle('progress:list', () => {
    const config = configService.getConfig();
    return cacheService.getProgressSnapshots(config.accountId);
  });

  handle('news:fetch', () => {
    const config = configService.getConfig();
    return newsService.fetchNews(config.region);
  });

  handle('patches:fetch', () => {
    const config = configService.getConfig();
    return patchesService.fetchPatches(config.region);
  });

  handle('session:today', () => {
    const config = configService.getConfig();
    return cacheService.getTodaySession(config.accountId);
  });

  handle('player:detect', () => {
    const config = configService.getConfig();
    if (!config.replaysDir) return null;
    return replayParser.detectPlayerFromReplays(config.replaysDir);
  });

  handle('player:detect-all', () => {
    const config = configService.getConfig();
    if (!config.replaysDir) return [];
    return replayParser.detectAllPlayersFromReplays(config.replaysDir);
  });

  handle('replays:tank-maps', (tankName) => {
    const config = configService.getConfig();
    const ctx = cacheService.getReplayTankContext(config.accountId, assertString(tankName, 'tankName'));
    return ctx?.mapStats ?? [];
  });

  handle('replays:clear', () => {
    const config = configService.getConfig();
    cacheService.clearBattles(config.accountId);
    replayScan.resetScanState(config.accountId);
  });

  handle('replays:scan', () => {
    const config = configService.getConfig();
    return replayScan.scanReplayDirectory(config);
  });

  handle('replays:list', async (limit, offset) => {
    const config = configService.getConfig();
    const battles = cacheService.getBattles(
      config.accountId,
      assertOptionalNumber(limit, 'limit', 10),
      assertOptionalNumber(offset, 'offset', 0),
    );
    // Ensure expected values and name→tankId mapping are loaded.
    // Both are in-memory cached so after first call this is instant.
    await Promise.all([wgData.getWn8Exp(), wgData.getWgData(config)]);

    return battles.map(b => {
      const tankId = wgData.resolveTankId(b.tankKey, b.tankName);
      const exp = tankId !== undefined ? wgData.expForTank(tankId) : undefined;
      const vehicle = wgData.getVehicle(tankId);
      // When the XVM expected-values map is loaded but has no entry for this tank
      // (e.g. recently added vehicles not yet covered by XVM), skip WN8/WNX rather
      // than running the rough fallback formula. The fallback produces wildly inflated
      // per-battle values (single wins at high damage can push past 3000+) because it
      // was designed for multi-battle averages, not individual games.
      // Consistent with computeOverallWn8AndWnx and replays:recent-stats which both
      // already skip tanks without expected values.
      const noExpMap = wgData.hasExpMap() && exp === undefined;
      const single = {
        battles: 1,
        wins: b.result === 'win' ? 1 : 0,
        damage_dealt: b.damage,
        frags: b.kills,
        spotted: b.spotted,
        dropped_capture_points: b.droppedCapture,
      };
      if (b.result === 'incomplete') return { ...b, tankType: vehicle?.type, tankIsPremium: vehicle?.is_premium, wn8: undefined, wnx: undefined };
      return {
        ...b,
        // Normalize names stored before the _v<N> stripping fix was applied.
        tankName: b.tankName.replace(/ v\d+$/, ''),
        tankType: vehicle?.type,
        tankIsPremium: vehicle?.is_premium,
        wn8: noExpMap ? undefined : calculateWn8(single, exp),
        wnx: noExpMap ? undefined : calculateWnx(
          { ...single, avg_damage_assisted_radio: b.assist },
          exp,
        ),
      };
    });
  });

  handle('replays:count', () => {
    const config = configService.getConfig();
    return cacheService.getBattlesCount(config.accountId);
  });

  handle('replays:recent-stats', async (limitRaw) => {
    const config = configService.getConfig();
    const limit = assertOptionalNumber(limitRaw, 'limit', 1000);
    await Promise.all([wgData.getWgData(config), wgData.getWn8Exp()]);
    const groups = cacheService.getRecentBattlesByTank(config.accountId, limit);
    let totalBattles = 0;
    let totalWn8Weighted = 0;
    let totalWnxWeighted = 0;
    for (const g of groups) {
      if (g.battles === 0) continue;
      const tankId = wgData.resolveTankId(g.tankKey, '');
      const exp = tankId !== undefined ? wgData.expForTank(tankId) : undefined;
      if (wgData.hasExpMap() && !exp) continue;
      const stats = {
        battles: g.battles,
        wins: g.wins,
        damage_dealt: g.damage,
        frags: g.kills,
        spotted: g.spotted,
        dropped_capture_points: g.dropped,
      };
      totalWn8Weighted += calculateWn8(stats, exp) * g.battles;
      totalWnxWeighted += calculateWnx(
        { ...stats, avg_damage_assisted_radio: g.assist / g.battles },
        exp,
      ) * g.battles;
      totalBattles += g.battles;
    }
    if (totalBattles === 0) return { wn8: 0, wnx: 0, battles: 0 };
    return {
      wn8: Math.round(totalWn8Weighted / totalBattles),
      wnx: Math.round(totalWnxWeighted / totalBattles),
      battles: totalBattles,
    };
  });

  handle('replays:map-stats', (sinceMs) => {
    const config = configService.getConfig();
    return cacheService.getReplayMapStats(config.accountId, assertOptionalNumber(sinceMs, 'sinceMs', 0));
  });

  handle('replays:tank-stats', (sinceMs) => {
    const config = configService.getConfig();
    return cacheService.getReplayTankStats(config.accountId, assertOptionalNumber(sinceMs, 'sinceMs', 0));
  });

  handle('replays:economy', (days) => {
    const config = configService.getConfig();
    return cacheService.getEconomyByDay(config.accountId, assertOptionalNumber(days, 'days', 30));
  });

  handle('replays:sessions', (limit) => {
    const config = configService.getConfig();
    return cacheService.getSessions(config.accountId, assertOptionalNumber(limit, 'limit', 30));
  });

  handle('app:version', () => app.getVersion());

  handle('update:check', () => updaterService.checkForUpdates());

  handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle('shell:openExternal', (url) => {
    const urlStr = url as string;
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new Error(`Invalid URL: ${urlStr}`);
    }
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`Disallowed URL protocol: ${parsed.protocol}`);
    }
    return shell.openExternal(urlStr);
  });
}
