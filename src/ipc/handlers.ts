import { ipcMain, shell } from 'electron';
import * as configService from '../services/config';
import * as cacheService from '../services/cache';
import * as wgService from '../services/wargaming';
import * as newsService from '../services/news';
import * as claudeService from '../services/claude';
import * as replayParser from '../services/replay-parser';
import { calculateWn8, calculateWnx } from '../utils/wn8';
import type { Tank, TankDetails, BattleRecord } from '../types';

const ONE_HOUR = 60 * 60 * 1000;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// In-memory cache for expensive WG API responses — cleared on app restart or manual cache clear
let memTankStats: wgService.WgTankStat[] | null = null;
let memEncyclopedia: Record<number, wgService.WgVehicle> | null = null;
let memFetchedAt = 0;

function clearMemCache() {
  memTankStats = null;
  memEncyclopedia = null;
  memFetchedAt = 0;
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
  let tankStats: wgService.WgTankStat[];
  let encyclopedia: Record<number, wgService.WgVehicle>;
  try {
    [tankStats, encyclopedia] = await Promise.all([
      wgService.getPlayerTankStats(config.accountId, WG_API_KEY, config.region),
      wgService.getVehicleEncyclopedia(WG_API_KEY, config.region),
    ]);
  } catch (e) {
    // Don't cache failed requests
    clearMemCache();
    throw e;
  }
  memTankStats = tankStats;
  memEncyclopedia = encyclopedia;
  memFetchedAt = Date.now();
  return { tankStats, encyclopedia };
}

function buildTank(t: wgService.WgTankStat, vehicle: wgService.WgVehicle | undefined): Tank {
  const stats = t.all;
  const battles = stats.battles;
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
    wn8: calculateWn8(stats),
    wnx: calculateWnx(stats),
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

function computeOverallWnx(tankStats: wgService.WgTankStat[]): number {
  let totalBattles = 0;
  let totalWnxWeighted = 0;
  for (const t of tankStats) {
    if (t.all.battles === 0) continue;
    const wnx = calculateWnx(t.all);
    totalWnxWeighted += wnx * t.all.battles;
    totalBattles += t.all.battles;
  }
  return totalBattles > 0 ? Math.round(totalWnxWeighted / totalBattles) : 0;
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
    configService.saveConfig(config as Parameters<typeof configService.saveConfig>[0]);
  });

  handle('player:search', (username, region) =>
    wgService.searchPlayer(username as string, WG_API_KEY, region as string)
  );

  handle('player:info', async () => {
    const cached = cacheService.getPlayerInfo();
    if (cached && Date.now() - cached.updatedAt < ONE_HOUR) return cached.data;

    const config = configService.getConfig();
    const playerInfo = await wgService.getPlayerInfo(config.accountId, WG_API_KEY, config.region);
    const stats = playerInfo.statistics.all;
    const wn8 = calculateWn8(stats);
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
        wnx: memTankStats ? computeOverallWnx(memTankStats) : 0,
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
    const { tankStats, encyclopedia } = await getWgData(config);

    cacheService.backfillMissingWnx(computeOverallWnx(tankStats));

    return tankStats
      .filter(t => t.all.battles > 0)
      .map(t => buildTank(t, encyclopedia[t.tank_id]))
      .sort((a, b) => b.battles - a.battles);
  });

  handle('tanks:details', async (tankId) => {
    const id = tankId as number;
    const cached = cacheService.getTankDetails(id);
    if (cached && isValidTankDetails(cached.data)) return cached.data;

    const config = configService.getConfig();
    const { tankStats, encyclopedia } = await getWgData(config);
    const tankStat = tankStats.find(t => t.tank_id === id);
    if (!tankStat) throw new Error(`Tank ${id} not found`);

    const details: TankDetails = {
      ...buildTank(tankStat, encyclopedia[id]),
      mapStats: (cached?.data as TankDetails | undefined)?.mapStats ?? [],
      recommendations: (cached?.data as TankDetails | undefined)?.recommendations ?? null,
      rawStats: tankStat.all as unknown as Record<string, number>,
    };

    cacheService.saveTankDetails(id, details);
    return details;
  });

  handle('tanks:recommendations', async (tankId, force) => {
    const id = tankId as number;
    const cached = cacheService.getTankDetails(id);
    if (!cached) throw new Error('Tank details not loaded yet');

    const details = cached.data as TankDetails;
    if (details.recommendations && !force) return details;

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

  handle('session:today', () => {
    const config = configService.getConfig();
    return cacheService.getTodaySession(config.accountId);
  });

  handle('player:detect', () => {
    const config = configService.getConfig();
    if (!config.replaysDir) return null;
    return replayParser.detectPlayerFromReplays(config.replaysDir);
  });

  handle('replays:tank-maps', (tankName) => {
    const config = configService.getConfig();
    const ctx = cacheService.getReplayTankContext(config.accountId, tankName as string);
    return ctx?.mapStats ?? [];
  });

  handle('replays:clear', () => {
    const config = configService.getConfig();
    cacheService.clearBattles(config.accountId);
  });

  handle('replays:scan', () => {
    const config = configService.getConfig();
    if (!config.replaysDir) return { added: 0, skipped: 0, errors: 0 };
    const knownIds = cacheService.getKnownArenaIds(config.accountId);
    return replayParser.scanReplays(
      config.replaysDir,
      config.accountId,
      config.username,
      knownIds,
      (batch) => cacheService.insertBattles(batch as BattleRecord[]),
    );
  });

  handle('replays:list', (limit, offset) => {
    const config = configService.getConfig();
    return cacheService.getBattles(config.accountId, (limit as number) ?? 10, (offset as number) ?? 0);
  });

  handle('replays:count', () => {
    const config = configService.getConfig();
    return cacheService.getBattlesCount(config.accountId);
  });

  handle('replays:map-stats', () => {
    const config = configService.getConfig();
    return cacheService.getReplayMapStats(config.accountId);
  });

  handle('replays:tank-stats', (sinceMs) => {
    const config = configService.getConfig();
    return cacheService.getReplayTankStats(config.accountId, (sinceMs as number) ?? 0);
  });

  handle('replays:economy', (days) => {
    const config = configService.getConfig();
    return cacheService.getEconomyByDay(config.accountId, (days as number) ?? 30);
  });

  handle('replays:sessions', (limit) => {
    const config = configService.getConfig();
    return cacheService.getSessions(config.accountId, (limit as number) ?? 30);
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
