/**
 * Battle analytics: aggregate SQL queries over the parsed battle database
 * (per-map/per-tank stats, economy, sessions, baselines). Read-only —
 * persistence lives in repos/battles-repo.ts.
 */
import type {
  ReplayMapStat, ReplayTankStat, EconomyDay, SessionSummary, TodaySession,
} from '../../shared/types';
import { getDb } from './db';

export interface RecentTankGroup {
  tankKey: string;
  battles: number;
  wins: number;
  damage: number;
  kills: number;
  spotted: number;
  dropped: number;
  assist: number;
}

export function getRecentBattlesByTank(accountId: number, limit: number): RecentTankGroup[] {
  return getDb().prepare(`
    WITH recent AS (
      SELECT * FROM battles
      WHERE account_id = ? AND result != 'incomplete'
      ORDER BY played_at DESC LIMIT ?
    )
    SELECT tank_key as tankKey,
           COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           SUM(damage) as damage,
           SUM(kills) as kills,
           SUM(spotted) as spotted,
           SUM(dropped_capture) as dropped,
           SUM(assist) as assist
    FROM recent
    GROUP BY tank_key
  `).all(accountId, limit) as RecentTankGroup[];
}

export function getReplayMapStats(accountId: number, sinceMs: number): ReplayMapStat[] {
  const cutoff = sinceMs > 0 ? Date.now() - sinceMs : 0;
  return getDb().prepare(`
    SELECT map_name as mapName, COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(kills), 2) as avgKills,
           ROUND(AVG(assist), 0) as avgAssist,
           ROUND(AVG(spotted), 2) as avgSpotted
    FROM battles WHERE account_id = ? AND result != 'incomplete' AND (? = 0 OR played_at >= ?)
    GROUP BY map_name ORDER BY battles DESC
  `).all(accountId, cutoff, cutoff) as ReplayMapStat[];
}

export function getReplayTankStats(accountId: number, sinceMs: number): ReplayTankStat[] {
  const cutoff = sinceMs > 0 ? Date.now() - sinceMs : 0;
  return getDb().prepare(`
    SELECT tank_name as tankName, tank_key as tankKey, COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(kills), 2) as avgKills,
           ROUND(AVG(assist), 0) as avgAssist,
           ROUND(AVG(damage_blocked), 0) as avgBlocked,
           SUM(net_credits) as netCredits,
           MAX(mark_of_mastery) as bestMastery
    FROM battles WHERE account_id = ? AND result != 'incomplete' AND (? = 0 OR played_at >= ?)
    GROUP BY tank_key ORDER BY battles DESC
  `).all(accountId, cutoff, cutoff) as ReplayTankStat[];
}

export function getEconomyByDay(accountId: number, days: number): EconomyDay[] {
  const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
  return getDb().prepare(`
    SELECT strftime('%Y-%m-%d', played_at / 1000, 'unixepoch') as day,
           COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           SUM(net_credits) as netCredits,
           SUM(credits) as grossCredits,
           SUM(repair_cost) as totalRepairs
    FROM battles WHERE account_id = ? AND result != 'incomplete' AND (? = 0 OR played_at >= ?)
    GROUP BY day ORDER BY day ASC
  `).all(accountId, cutoff, cutoff) as EconomyDay[];
}

export function getTodaySession(accountId: number): TodaySession | null {
  const row = getDb().prepare(`
    SELECT COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) as losses,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(assist), 0) as avgAssist,
           ROUND(AVG(kills), 2) as avgFrags,
           ROUND(AVG(spotted), 2) as avgSpots,
           ROUND(AVG(CASE WHEN survived=1 THEN 100.0 ELSE 0 END), 1) as survivalRate,
           COUNT(DISTINCT tank_key) as tankCount,
           SUM(damage) as totalDamage, SUM(kills) as totalFrags,
           SUM(spotted) as totalSpotted, SUM(dropped_capture) as totalDropped,
           SUM(net_credits) as totalNetCredits
    FROM battles
    WHERE account_id = ?
      AND result != 'incomplete'
      AND date(played_at / 1000, 'unixepoch', 'localtime') = date('now', 'localtime')
  `).get(accountId) as TodaySession & { battles: number } | undefined;
  if (!row || row.battles === 0) return null;
  return { ...row, totalWins: row.wins };
}

export interface ReplayTankContext {
  battles: number;
  winRate: number;
  avgDamage: number;
  avgAssist: number;
  accuracy: number;       // hits/shots %
  penRate: number;        // pens/hits %
  avgDmgReceived: number;
  avgDmgBlocked: number;
  avgLifePct: number;     // lifeTime/duration %
  avgNetCredits: number;
  bestMastery: number;
  mapStats: { mapName: string; battles: number; winRate: number; avgDamage: number }[];
}

export function getReplayTankContext(
  accountId: number,
  tankName: string,
  sinceMs = 30 * 86400000,
): ReplayTankContext | null {
  const cutoff = sinceMs > 0 ? Date.now() - sinceMs : 0;
  const row = getDb().prepare(`
    SELECT COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(assist), 0) as avgAssist,
           ROUND(CAST(SUM(hits) AS REAL) / NULLIF(SUM(shots), 0) * 100, 1) as accuracy,
           ROUND(CAST(SUM(pens) AS REAL) / NULLIF(SUM(hits), 0) * 100, 1) as penRate,
           ROUND(AVG(damage_received), 0) as avgDmgReceived,
           ROUND(AVG(damage_blocked), 0) as avgDmgBlocked,
           ROUND(AVG(CAST(life_time AS REAL) / NULLIF(duration, 0) * 100), 1) as avgLifePct,
           ROUND(AVG(net_credits), 0) as avgNetCredits,
           MAX(mark_of_mastery) as bestMastery
    FROM battles WHERE account_id = ? AND result != 'incomplete' AND tank_name = ? AND (? = 0 OR played_at >= ?)
  `).get(accountId, tankName, cutoff, cutoff) as Record<string, number> | undefined;

  if (!row || row.battles === 0) return null;

  const maps = getDb().prepare(`
    SELECT map_name as mapName, COUNT(*) as battles,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDamage
    FROM battles WHERE account_id = ? AND result != 'incomplete' AND tank_name = ?
    GROUP BY map_name HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC LIMIT 10
  `).all(accountId, tankName) as { mapName: string; battles: number; winRate: number; avgDamage: number }[];

  return {
    battles:        row.battles,
    winRate:        row.winRate,
    avgDamage:      row.avgDamage,
    avgAssist:      row.avgAssist,
    accuracy:       row.accuracy ?? 0,
    penRate:        row.penRate ?? 0,
    avgDmgReceived: row.avgDmgReceived,
    avgDmgBlocked:  row.avgDmgBlocked,
    avgLifePct:     row.avgLifePct ?? 0,
    avgNetCredits:  row.avgNetCredits,
    bestMastery:    row.bestMastery ?? 0,
    mapStats:       maps,
  };
}

// TODO(perf): Replace the window-function approach with a session_id column populated at
// INSERT time. This would eliminate the full-table scan entirely. Deferred because it requires
// a schema migration and access to prev played_at during insertBattles.
export function getSessions(accountId: number, limit = 20): SessionSummary[] {
  // Cap the CTE at the most recent 2000 battles so the LAG+SUM window function never
  // scans all 16k rows just to return `limit` sessions. 2000 battles covers ~100 sessions
  // comfortably even for very long sessions, and the outer LIMIT ? keeps the final result small.
  const CTE_LIMIT = 2000;
  return getDb().prepare(`
    WITH recent AS (
      SELECT played_at, result, damage, kills, net_credits,
             spotted, dropped_capture, assist
      FROM battles WHERE account_id = ? AND result != 'incomplete'
      ORDER BY played_at DESC LIMIT ${CTE_LIMIT}
    ),
    ordered AS (
      SELECT *,
             LAG(played_at) OVER (ORDER BY played_at) as prev_at
      FROM recent
    ),
    with_session AS (
      SELECT *,
        SUM(CASE WHEN prev_at IS NULL OR played_at - prev_at > 1800000 THEN 1 ELSE 0 END)
        OVER (ORDER BY played_at) as session_num
      FROM ordered
    )
    SELECT session_num as sessionNum,
           MIN(played_at) as startedAt, MAX(played_at) as endedAt,
           COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(kills), 2) as avgKills,
           SUM(net_credits) as netCredits,
           SUM(damage) as totalDamage, SUM(kills) as totalFrags,
           SUM(spotted) as totalSpotted, SUM(dropped_capture) as totalDropped,
           SUM(assist) as totalAssist
    FROM with_session
    GROUP BY session_num ORDER BY session_num DESC LIMIT ?
  `).all(accountId, limit) as SessionSummary[];
}

// ---------------------------------------------------------------------------
// Tank Baseline — 30-day aggregate for the debrief prompt
// ---------------------------------------------------------------------------

export interface TankBaseline {
  battles: number;
  avgDamage: number;
  avgFrags: number;
  avgAssist: number;
  winRate: number;
}

export function getTankBaseline(accountId: number, tankKey: string, sinceMs: number): TankBaseline | null {
  const cutoff = Date.now() - sinceMs;
  const row = getDb().prepare(`
    SELECT COUNT(*) as battles,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(kills), 2) as avgFrags,
           ROUND(AVG(assist), 0) as avgAssist,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate
    FROM battles
    WHERE account_id = ? AND tank_key = ? AND result != 'incomplete' AND played_at >= ?
  `).get(accountId, tankKey, cutoff) as Record<string, number> | undefined;

  if (!row || row.battles === 0) return null;
  return {
    battles: row.battles,
    avgDamage: row.avgDamage,
    avgFrags: row.avgFrags,
    avgAssist: row.avgAssist,
    winRate: row.winRate,
  };
}
