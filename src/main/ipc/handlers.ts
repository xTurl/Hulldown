import { app, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import * as configService from '../services/config';
import * as cacheService from '../services/cache';
import * as wgService from '../services/wargaming';
import * as newsService from '../services/news';
import * as patchesService from '../services/patches';
import * as claudeService from '../services/claude';
import * as replayParser from '../services/replay-parser';
import * as updaterService from '../services/updater';
import { calculateWn8, calculateWnx } from '../../shared/utils/wn8';
import { assertString, assertNumber, assertOptionalNumber, assertBoolean, assertConfig } from './validators';
import type { Tank, TankDetails, BattleRecord } from '../../shared/types';

const ONE_HOUR = 60 * 60 * 1000;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// In-memory cache for expensive WG API responses — cleared on app restart or manual cache clear
let memTankStats: wgService.WgTankStat[] | null = null;
let memEncyclopedia: Record<number, wgService.WgVehicle> | null = null;
let memFetchedAt = 0;
// In-flight deduplication: concurrent callers share one fetch instead of hammering the WG API
let pendingWgData: Promise<{ tankStats: wgService.WgTankStat[]; encyclopedia: Record<number, wgService.WgVehicle> }> | null = null;

// WN8 expected values cache (XVM) — 24 h TTL, best-effort (null = unavailable)
let memWn8Exp: Map<number, wgService.Wn8ExpEntry> | null = null;
let memWn8ExpFetchedAt = 0;
const WN8_EXP_TTL = 24 * ONE_HOUR;

// name → tankId reverse lookup built from encyclopedia
let memNameToTankId: Map<string, number> | null = null;
// vehicle tag → tankId lookup (more reliable than name matching for replay enrichment)
let memTagToTankId: Map<string, number> | null = null;

// Timestamp of the last successful replay scan — used to limit incremental scans
let lastScanTime = 0;

/**
 * Extracts the WG vehicle tag from a replay playerVehicle key.
 * "uk-GB123_GSOR_1006_v7"  → "GB123_GSOR_1006_v7"
 * "sweden:S10_Strv_107_12" → "S10_Strv_107_12"
 */
function extractVehicleTag(tankKey: string): string {
  return tankKey.replace(/^[^:-]+-/, '').replace(/^[^:]+:/, '');
}

function clearMemCache() {
  memTankStats = null;
  memEncyclopedia = null;
  memFetchedAt = 0;
  memNameToTankId = null;
  memTagToTankId = null;
  pendingWgData = null;
}

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

const WG_API_KEY = process.env.WG_API_KEY || '';

async function getWgData(config: ReturnType<typeof configService.getConfig>) {
  if (memTankStats && memEncyclopedia && Date.now() - memFetchedAt < ONE_HOUR) {
    return { tankStats: memTankStats, encyclopedia: memEncyclopedia };
  }
  // Return the in-flight promise if a fetch is already running — prevents duplicate WG API
  // requests when multiple IPC handlers call getWgData concurrently on a cold cache.
  if (pendingWgData) return pendingWgData;

  pendingWgData = (async () => {
    try {
      const [tankStats, encyclopedia] = await Promise.all([
        wgService.getPlayerTankStats(config.accountId, WG_API_KEY, config.region),
        wgService.getVehicleEncyclopedia(WG_API_KEY, config.region),
      ]);
      memTankStats = tankStats;
      memEncyclopedia = encyclopedia;
      memFetchedAt = Date.now();
      // Build reverse lookups for battle enrichment
      memNameToTankId = new Map(Object.values(encyclopedia).map(v => [v.name, v.tank_id]));
      memTagToTankId  = new Map(Object.values(encyclopedia).map(v => [v.tag,  v.tank_id]));
      return { tankStats, encyclopedia };
    } catch (e) {
      // Don't cache failed requests
      clearMemCache();
      throw e;
    } finally {
      pendingWgData = null;
    }
  })();

  return pendingWgData;
}

async function getWn8Exp(): Promise<Map<number, wgService.Wn8ExpEntry> | null> {
  if (memWn8Exp && Date.now() - memWn8ExpFetchedAt < WN8_EXP_TTL) return memWn8Exp;
  try {
    memWn8Exp = await wgService.getWn8ExpectedValues();
    memWn8ExpFetchedAt = Date.now();
  } catch (e) {
    console.warn('[WN8] Failed to fetch expected values, falling back to approximation:', e instanceof Error ? e.message : e);
    memWn8Exp = null;
  }
  return memWn8Exp;
}

function expForTank(tankId: number): import('../../shared/utils/wn8').Wn8Expected | undefined {
  return memWn8Exp?.get(tankId);
}

function buildTank(t: wgService.WgTankStat, vehicle: wgService.WgVehicle | undefined): Tank {
  const stats = t.all;
  const battles = stats.battles;
  const exp = expForTank(t.tank_id);
  return {
    tankId: t.tank_id,
    name: vehicle?.name || `Tank #${t.tank_id}`,
    tier: vehicle?.tier || 0,
    type: vehicle?.type || 'unknown',
    nation: vehicle?.nation || 'unknown',
    isPremium: vehicle?.is_premium || false,
    battles,
    wins: stats.wins,
    winRate: battles > 0 ? Math.round((stats.wins / battles) * 1000) / 10 : 0,
    wn8: calculateWn8(stats, exp),
    wnx: calculateWnx(stats, exp),
    hasExpectedValues: !!exp,
    avgDamage: battles > 0 ? Math.round(stats.damage_dealt / battles) : 0,
    avgDamageAssisted: Math.round(stats.avg_damage_assisted_radio ?? stats.avg_damage_assisted ?? 0),
    avgDamageAssistedTrack: Math.round(stats.avg_damage_assisted_track ?? 0),
    avgDamageBlocked: Math.round(stats.avg_damage_blocked ?? 0),
    avgFrags: battles > 0 ? Math.round((stats.frags / battles) * 100) / 100 : 0,
    avgSpots: battles > 0 ? Math.round((stats.spotted / battles) * 100) / 100 : 0,
    survivalRate: battles > 0 ? Math.round((stats.survived_battles / battles) * 1000) / 10 : 0,
    avgXp: battles > 0 ? Math.round(stats.xp / battles) : 0,
  };
}

const CLASS_LABELS: Record<string, string> = {
  heavyTank: 'Heavy Tank',
  mediumTank: 'Medium Tank',
  lightTank: 'Light Tank',
  'AT-SPG': 'Tank Destroyer',
  SPG: 'Artillery',
};

function computeOverallWn8AndWnx(tankStats: wgService.WgTankStat[]): { wn8: number; wnx: number } {
  let totalBattles = 0;
  let totalWn8Weighted = 0;
  let totalWnxWeighted = 0;
  for (const t of tankStats) {
    if (t.all.battles === 0) continue;
    const exp = expForTank(t.tank_id);
    // When the XVM expected-values map is loaded, skip tanks that have no entry —
    // this matches tomato.gg / noobmeter behaviour (fallback formula distorts the overall).
    if (memWn8Exp && !exp) continue;
    totalWn8Weighted += calculateWn8(t.all, exp) * t.all.battles;
    totalWnxWeighted += calculateWnx(t.all, exp) * t.all.battles;
    totalBattles += t.all.battles;
  }
  if (totalBattles === 0) return { wn8: 0, wnx: 0 };
  return {
    wn8: Math.round(totalWn8Weighted / totalBattles),
    wnx: Math.round(totalWnxWeighted / totalBattles),
  };
}

function buildPlayerContext(
  tankStats: wgService.WgTankStat[],
  encyclopedia: Record<number, wgService.WgVehicle>,
): claudeService.PlayerContext {
  const byClass: Record<string, { battles: number; wins: number; wn8Weighted: number }> = {};
  let totalBattles = 0;
  let totalWins = 0;
  let totalWn8Weighted = 0;

  for (const t of tankStats) {
    if (t.all.battles === 0) continue;
    const rawType = encyclopedia[t.tank_id]?.type || 'unknown';
    const label = CLASS_LABELS[rawType] || rawType;
    if (!byClass[label]) byClass[label] = { battles: 0, wins: 0, wn8Weighted: 0 };
    const wn8 = calculateWn8(t.all);
    byClass[label].battles += t.all.battles;
    byClass[label].wins += t.all.wins;
    byClass[label].wn8Weighted += wn8 * t.all.battles;
    totalBattles += t.all.battles;
    totalWins += t.all.wins;
    totalWn8Weighted += wn8 * t.all.battles;
  }

  const byClassResult: claudeService.PlayerContext['byClass'] = {};
  for (const [label, s] of Object.entries(byClass)) {
    byClassResult[label] = {
      battles: s.battles,
      winRate: Math.round((s.wins / s.battles) * 1000) / 10,
      wn8: Math.round(s.wn8Weighted / s.battles),
    };
  }

  return {
    totalBattles,
    overallWinRate: totalBattles > 0 ? Math.round((totalWins / totalBattles) * 1000) / 10 : 0,
    overallWn8: totalBattles > 0 ? Math.round(totalWn8Weighted / totalBattles) : 0,
    byClass: byClassResult,
  };
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
  handle('config:get', () => configService.getConfig());

  handle('config:save', (config) => {
    clearMemCache();
    cacheService.clearPlayerInfoCache();
    configService.saveConfig(assertConfig(config));
  });

  handle('player:search', (username, region) =>
    wgService.searchPlayer(assertString(username, 'username'), WG_API_KEY, assertString(region, 'region'))
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
      wgService.getPlayerInfo(config.accountId, WG_API_KEY, config.region),
      getWgData(config),
      getWn8Exp(), // warms memWn8Exp cache for accurate per-tank WN8 calculations
    ]);
    const stats = playerInfo.statistics.all;
    const overall = computeOverallWn8AndWnx(tankStats);
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
      getWgData(config),
      getWn8Exp(),  // pre-warm expected values cache in parallel
    ]);

    cacheService.backfillMissingWnx(computeOverallWn8AndWnx(tankStats).wnx);

    return tankStats
      .filter(t => t.all.battles > 0)
      .map(t => buildTank(t, encyclopedia[t.tank_id]))
      .sort((a, b) => b.battles - a.battles);
  });

  handle('tanks:details', async (tankId) => {
    const id = assertNumber(tankId, 'tankId');
    const cached = cacheService.getTankDetails(id);
    if (cached && isValidTankDetails(cached.data)) return cached.data;

    const config = configService.getConfig();
    const { tankStats, encyclopedia } = await getWgData(config);
    const tankStat = tankStats.find(t => t.tank_id === id);
    if (!tankStat) throw new Error(`Tank ${id} not found`);

    const prevDetails = isValidTankDetails(cached?.data) ? (cached!.data as TankDetails) : undefined;
    const details: TankDetails = {
      ...buildTank(tankStat, encyclopedia[id]),
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
    if (details.recommendations && !assertBoolean(force, 'force')) return details;

    const config = configService.getConfig();
    const playerContext = memTankStats && memEncyclopedia
      ? buildPlayerContext(memTankStats, memEncyclopedia)
      : undefined;

    const replayContext = cacheService.getReplayTankContext(config.accountId, details.name);

    const recommendations = await claudeService.generateTankRecommendations(
      details, details.mapStats, config.claudeApiKey, playerContext, replayContext
    );

    const updated: TankDetails = { ...details, recommendations };
    cacheService.saveTankDetails(id, updated);
    return updated;
  });

  handle('cache:clearMem', () => {
    clearMemCache();
  });

  handle('cache:clearPlayerInfo', () => {
    cacheService.clearPlayerInfoCache();
  });

  handle('cache:clear', () => {
    clearMemCache();
    cacheService.clearAll();
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
  });

  handle('replays:scan', async (quick) => {
    const config = configService.getConfig();
    if (!config.replaysDir) return { added: 0, skipped: 0, errors: 0 };
    const knownIds = cacheService.getKnownArenaIds(config.accountId);
    // Incremental scan: only parse replay files whose filename date is within a
    // 2-minute safety buffer of the last scan. This skips thousands of already-
    // known files and keeps the auto-refresh tick fast regardless of library size.
    const sinceMs = (quick && lastScanTime > 0) ? lastScanTime - 2 * 60 * 1000 : undefined;
    const result = await replayParser.scanReplays(
      config.replaysDir,
      config.accountId,
      config.username,
      knownIds,
      (batch) => cacheService.insertBattles(batch as BattleRecord[]),
      sinceMs,
    );
    lastScanTime = Date.now();
    // WoT rewrites replay files with full stats after battle end, even for
    // battles the player left early. The scan inserts the complete version
    // under its real arenaUniqueID; clean up the stale partial_ counterparts.
    cacheService.cleanupPartialBattles(config.accountId);

    // Re-parse any remaining partial battles by reading their original .wotreplay files.
    // The incremental scan's filename-date filter skips files whose name timestamp has moved
    // outside the 2-minute safety window, even if WoT has since appended block1 to them.
    // Reading them directly here costs one stat+read per pending partial — negligible.
    const partials = cacheService.getPartialBattles(config.accountId);
    if (partials.length > 0) {
      for (const partial of partials) {
        const filename = partial.arenaId.slice('partial_'.length);
        const filePath = path.join(config.replaysDir, `${filename}.wotreplay`);
        const reParsed = replayParser.parseReplay(filePath);
        if (reParsed && reParsed.result !== 'incomplete') {
          cacheService.resolvePartialBattle(config.accountId, partial.arenaId, {
            ...reParsed,
            id: 0,
            accountId: config.accountId,
          } as BattleRecord);
          result.added++;
        }
      }

      // Fallback: if WoT did not rewrite the dated file (observed on some Windows setups),
      // check temp.wotreplay — WoT appends block1 there when the server battle ends.
      const stillPartials = cacheService.getPartialBattles(config.accountId);
      if (stillPartials.length > 0) {
        const tempPath = path.join(config.replaysDir, 'temp.wotreplay');
        const tempParsed = replayParser.parseReplay(tempPath);
        if (tempParsed && tempParsed.result !== 'incomplete') {
          for (const partial of stillPartials) {
            if (partial.tankKey === tempParsed.tankKey && partial.playedAt === tempParsed.playedAt) {
              cacheService.resolvePartialBattle(config.accountId, partial.arenaId, {
                ...tempParsed,
                id: 0,
                accountId: config.accountId,
              } as BattleRecord);
              result.added++;
              break;
            }
          }
        }
      }
    }

    return result;
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
    await Promise.all([getWn8Exp(), getWgData(config)]);

    return battles.map(b => {
      // Prefer tag-based lookup (exact match to WG internal vehicle tag) over name matching
      const tankId = memTagToTankId?.get(extractVehicleTag(b.tankKey))
        ?? memNameToTankId?.get(b.tankName);
      const exp = tankId !== undefined ? memWn8Exp?.get(tankId) : undefined;
      const vehicle = tankId !== undefined ? memEncyclopedia?.[tankId] : undefined;
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
        tankType: vehicle?.type,
        tankIsPremium: vehicle?.is_premium,
        wn8: calculateWn8(single, exp),
        wnx: calculateWnx(
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
