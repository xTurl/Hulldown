/**
 * WG data service: orchestrates fetching/caching of Wargaming API data
 * (tank stats + vehicle encyclopedia), XVM WN8 expected values, and the
 * derived WN8/WNX computations used across IPC handlers.
 *
 * Caching layers: in-memory (per app session, 1 h TTL) → SQLite (survives
 * restarts, 1 h TTL) → network. Concurrent cold-cache callers share a single
 * in-flight fetch.
 */
import * as wgService from './wargaming';
import * as cacheService from './cache';
import { calculateWn8, calculateWnx } from '../../shared/utils/wn8';
import { extractVehicleTag } from '../../shared/utils/vehicles';
import { HOUR, DAY } from '../../shared/utils/time';
import type { Tank, AppConfig } from '../../shared/types';
import type { PlayerContext } from '../ai/tank-recommendations';

export const WG_API_KEY = process.env.WG_API_KEY || '';

const ONE_HOUR = HOUR;
const WN8_EXP_TTL = DAY;

// In-memory cache for expensive WG API responses — cleared on app restart or manual cache clear
let memTankStats: wgService.WgTankStat[] | null = null;
let memEncyclopedia: Record<number, wgService.WgVehicle> | null = null;
let memFetchedAt = 0;
// In-flight deduplication: concurrent callers share one fetch instead of hammering the WG API
let pendingWgData: Promise<WgData> | null = null;

// WN8 expected values cache (XVM) — 24 h TTL, best-effort (null = unavailable)
let memWn8Exp: Map<number, wgService.Wn8ExpEntry> | null = null;
let memWn8ExpFetchedAt = 0;

// name → tankId reverse lookup built from encyclopedia
let memNameToTankId: Map<string, number> | null = null;
// vehicle tag → tankId lookup (more reliable than name matching for replay enrichment)
let memTagToTankId: Map<string, number> | null = null;

export interface WgData {
  tankStats: wgService.WgTankStat[];
  encyclopedia: Record<number, wgService.WgVehicle>;
}

export function clearMemCache(): void {
  memTankStats = null;
  memEncyclopedia = null;
  memFetchedAt = 0;
  memNameToTankId = null;
  memTagToTankId = null;
  pendingWgData = null;
}

function buildLookups(encyclopedia: Record<number, wgService.WgVehicle>): void {
  memNameToTankId = new Map(Object.values(encyclopedia).map(v => [v.name, v.tank_id]));
  memTagToTankId  = new Map(Object.values(encyclopedia).map(v => [v.tag,  v.tank_id]));
}

export async function getWgData(config: AppConfig): Promise<WgData> {
  if (memTankStats && memEncyclopedia && Date.now() - memFetchedAt < ONE_HOUR) {
    return { tankStats: memTankStats, encyclopedia: memEncyclopedia };
  }

  // Check SQLite cache before hitting the network — survives app restarts.
  // This eliminates the 2-5s WG API wait on every launch after the first.
  if (!memTankStats || !memEncyclopedia) {
    const sqliteCache = cacheService.getWgDataCache(config.accountId);
    if (sqliteCache && Date.now() - sqliteCache.updatedAt < ONE_HOUR) {
      memTankStats    = sqliteCache.tankStats as wgService.WgTankStat[];
      memEncyclopedia = sqliteCache.encyclopedia as Record<number, wgService.WgVehicle>;
      memFetchedAt    = sqliteCache.updatedAt;
      buildLookups(memEncyclopedia);
      return { tankStats: memTankStats, encyclopedia: memEncyclopedia };
    }
  }

  // Return the in-flight promise if a fetch is already running — prevents duplicate WG API
  // requests when multiple IPC handlers call getWgData concurrently on a cold cache.
  if (pendingWgData) return pendingWgData;

  pendingWgData = (async () => {
    try {
      const tankStats = await wgService.getPlayerTankStats(config.accountId, WG_API_KEY, config.region);
      // Only fetch encyclopedia entries for tanks the player actually owns —
      // the full encyclopedia is ~1000 vehicles, the player typically has far fewer.
      const tankIds = tankStats.map(t => t.tank_id);
      const encyclopedia = await wgService.getVehicleEncyclopedia(WG_API_KEY, config.region, tankIds);
      memTankStats = tankStats;
      memEncyclopedia = encyclopedia;
      memFetchedAt = Date.now();
      // Build reverse lookups for battle enrichment
      buildLookups(encyclopedia);
      // Persist to SQLite so the next startup skips the network call
      cacheService.saveWgDataCache(config.accountId, tankStats, encyclopedia);
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

export async function getWn8Exp(): Promise<Map<number, wgService.Wn8ExpEntry> | null> {
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

export function expForTank(tankId: number): wgService.Wn8ExpEntry | undefined {
  return memWn8Exp?.get(tankId);
}

/** True when the XVM expected-values map has been loaded this session. */
export function hasExpMap(): boolean {
  return memWn8Exp !== null;
}

/**
 * Resolves a battle's tank to a WG tankId. Prefers tag-based lookup
 * (exact match to WG internal vehicle tag) over name matching.
 */
export function resolveTankId(tankKey: string, tankName: string): number | undefined {
  return memTagToTankId?.get(extractVehicleTag(tankKey)) ?? memNameToTankId?.get(tankName);
}

export function getVehicle(tankId: number | undefined): wgService.WgVehicle | undefined {
  return tankId !== undefined ? memEncyclopedia?.[tankId] : undefined;
}

/** Returns the in-memory WG data if warm, without triggering a fetch. */
export function getMemWgData(): WgData | null {
  return memTankStats && memEncyclopedia
    ? { tankStats: memTankStats, encyclopedia: memEncyclopedia }
    : null;
}

export function buildTank(t: wgService.WgTankStat, vehicle: wgService.WgVehicle | undefined): Tank {
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

export function computeOverallWn8AndWnx(tankStats: wgService.WgTankStat[]): { wn8: number; wnx: number } {
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

const CLASS_LABELS: Record<string, string> = {
  heavyTank: 'Heavy Tank',
  mediumTank: 'Medium Tank',
  lightTank: 'Light Tank',
  'AT-SPG': 'Tank Destroyer',
  SPG: 'Artillery',
};

export function buildPlayerContext(
  tankStats: wgService.WgTankStat[],
  encyclopedia: Record<number, wgService.WgVehicle>,
): PlayerContext {
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

  const byClassResult: PlayerContext['byClass'] = {};
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
