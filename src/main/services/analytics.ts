import { DAY, WEEK } from '../../shared/utils/time';
import { getDb } from './db';

/** Totals for one week window. */
export interface WeekTotals {
  battles: number;
  wins: number;
  losses: number;
  hoursPlayed: number;
  totalDamage: number;
  totalFrags: number;
  totalSpotted: number;
  avgDamage: number;
  winRate: number;
  avgNetCredits: number;
  survivalRate: number;          // 0-100
  avgLifeTimeSec: number;        // avg seconds alive (all battles)
  avgDmgReceived: number;
  avgDmgBlocked: number;
  earlyDeathRate: number;        // 0-100, % of non-survived battles with lifeTime < 180s
}

export interface TankImprover {
  tankKey: string;
  tankName: string;
  battlesThisWeek: number;
  avgDmgThisWeek: number;
  avgDmgPriorMonth: number;
  delta: number;
}

export interface MapPerf {
  mapName: string;
  battles: number;
  winRate: number;
  avgDmg: number;
}

export interface HighlightBattle {
  arenaId: string;
  tankName: string;
  mapName: string;
  damage: number;
  frags: number;
  result: string;
  playedAt: number;
}

export interface ProgressDelta {
  wn8Start: number | null;
  wn8End: number | null;
  wn8Delta: number | null;
  wnxStart: number | null;
  wnxEnd: number | null;
  wnxDelta: number | null;
  wrStart: number | null;
  wrEnd: number | null;
  wrDelta: number | null;
}

export interface ThirtyDayBaseline {
  battles: number;
  wn8: number | null;
  winRate: number | null;
  avgDmg: number | null;
}

export interface WeeklyCoachData {
  thisWeek: WeekTotals;
  priorWeek: WeekTotals;
  progressDelta: ProgressDelta;
  topImprovers: TankImprover[];
  topDecliners: TankImprover[];
  bestMaps: MapPerf[];
  worstMaps: MapPerf[];
  highlightBattle: HighlightBattle | null;
  thirtyDayBaseline: ThirtyDayBaseline;
}

function computeWeekTotals(accountId: number, startMs: number, endMs: number): WeekTotals {
  const row = getDb().prepare(`
    SELECT COUNT(*) as battles,
           SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) as wins,
           SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) as losses,
           SUM(duration) as totalDuration,
           SUM(damage) as totalDamage,
           SUM(kills) as totalFrags,
           SUM(spotted) as totalSpotted,
           ROUND(AVG(damage), 0) as avgDamage,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(net_credits), 0) as avgNetCredits,
           ROUND(AVG(CASE WHEN survived=1 THEN 100.0 ELSE 0 END), 1) as survivalRate,
           ROUND(AVG(life_time), 0) as avgLifeTimeSec,
           ROUND(AVG(damage_received), 0) as avgDmgReceived,
           ROUND(AVG(damage_blocked), 0) as avgDmgBlocked,
           SUM(CASE WHEN survived=0 AND life_time > 0 AND life_time < 180 THEN 1 ELSE 0 END) as earlyDeaths,
           SUM(CASE WHEN survived=0 THEN 1 ELSE 0 END) as totalDeaths
    FROM battles
    WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
  `).get(accountId, startMs, endMs) as Record<string, number> | undefined;

  if (!row || row.battles === 0) {
    return {
      battles: 0, wins: 0, losses: 0, hoursPlayed: 0, totalDamage: 0, totalFrags: 0,
      totalSpotted: 0, avgDamage: 0, winRate: 0, avgNetCredits: 0,
      survivalRate: 0, avgLifeTimeSec: 0, avgDmgReceived: 0, avgDmgBlocked: 0, earlyDeathRate: 0,
    };
  }

  const earlyDeathRate = row.totalDeaths > 0
    ? Math.round((row.earlyDeaths / row.totalDeaths) * 1000) / 10
    : 0;

  return {
    battles: row.battles,
    wins: row.wins,
    losses: row.losses,
    hoursPlayed: Math.round((row.totalDuration / 3600) * 10) / 10,
    totalDamage: row.totalDamage,
    totalFrags: row.totalFrags,
    totalSpotted: row.totalSpotted,
    avgDamage: row.avgDamage,
    winRate: row.winRate,
    avgNetCredits: row.avgNetCredits,
    survivalRate: row.survivalRate,
    avgLifeTimeSec: row.avgLifeTimeSec,
    avgDmgReceived: row.avgDmgReceived,
    avgDmgBlocked: row.avgDmgBlocked,
    earlyDeathRate,
  };
}

export function getWeeklyCoachData(accountId: number, endMs: number): WeeklyCoachData {
  const db = getDb();
  const thisWeekStart = endMs - WEEK;
  const priorWeekStart = endMs - 2 * WEEK;
  const priorMonthStart = endMs - 37 * DAY; // prior month baseline for tank comparisons

  const thisWeek = computeWeekTotals(accountId, thisWeekStart, endMs);
  const priorWeek = computeWeekTotals(accountId, priorWeekStart, thisWeekStart);

  const snapshots = db.prepare(`
    SELECT wn8, wnx, win_rate as winRate
    FROM progress_snapshots
    WHERE account_id = ? AND taken_at >= ? AND taken_at <= ?
    ORDER BY taken_at ASC
  `).all(accountId, thisWeekStart, endMs) as { wn8: number; wnx: number; winRate: number }[];

  let progressDelta: ProgressDelta;
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    progressDelta = {
      wn8Start: first.wn8, wn8End: last.wn8, wn8Delta: last.wn8 - first.wn8,
      wnxStart: first.wnx, wnxEnd: last.wnx, wnxDelta: last.wnx - first.wnx,
      wrStart: first.winRate, wrEnd: last.winRate, wrDelta: Math.round((last.winRate - first.winRate) * 10) / 10,
    };
  } else if (snapshots.length === 1) {
    const s = snapshots[0];
    progressDelta = {
      wn8Start: s.wn8, wn8End: s.wn8, wn8Delta: 0,
      wnxStart: s.wnx, wnxEnd: s.wnx, wnxDelta: 0,
      wrStart: s.winRate, wrEnd: s.winRate, wrDelta: 0,
    };
  } else {
    progressDelta = {
      wn8Start: null, wn8End: null, wn8Delta: null,
      wnxStart: null, wnxEnd: null, wnxDelta: null,
      wrStart: null, wrEnd: null, wrDelta: null,
    };
  }

  const tanksThisWeek = db.prepare(`
    SELECT tank_key as tankKey, tank_name as tankName,
           COUNT(*) as battles,
           ROUND(AVG(damage), 0) as avgDmg
    FROM battles
    WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
    GROUP BY tank_key HAVING COUNT(*) >= 5
  `).all(accountId, thisWeekStart, endMs) as { tankKey: string; tankName: string; battles: number; avgDmg: number }[];

  const topImprovers: TankImprover[] = [];
  const topDecliners: TankImprover[] = [];

  if (tanksThisWeek.length > 0) {
    const priorRows = db.prepare(`
      SELECT tank_key as tankKey,
             ROUND(AVG(damage), 0) as avgDmg
      FROM battles
      WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
        AND tank_key IN (${tanksThisWeek.map(() => '?').join(',')})
      GROUP BY tank_key
    `).all(accountId, priorMonthStart, thisWeekStart, ...tanksThisWeek.map(t => t.tankKey)) as { tankKey: string; avgDmg: number }[];

    const priorMap = new Map(priorRows.map(r => [r.tankKey, r.avgDmg]));

    const improvers = tanksThisWeek
      .filter(t => priorMap.has(t.tankKey))
      .map(t => ({
        tankKey: t.tankKey,
        tankName: t.tankName,
        battlesThisWeek: t.battles,
        avgDmgThisWeek: t.avgDmg,
        avgDmgPriorMonth: priorMap.get(t.tankKey)!,
        delta: t.avgDmg - priorMap.get(t.tankKey)!,
      }));

    improvers.sort((a, b) => b.delta - a.delta);
    topImprovers.push(...improvers.slice(0, 5));

    const decliners = [...improvers].sort((a, b) => a.delta - b.delta);
    topDecliners.push(...decliners.slice(0, 5));
  }

  const mapsThisWeek = db.prepare(`
    SELECT map_name as mapName, COUNT(*) as battles,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate,
           ROUND(AVG(damage), 0) as avgDmg
    FROM battles
    WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
    GROUP BY map_name HAVING COUNT(*) >= 3
    ORDER BY winRate DESC
  `).all(accountId, thisWeekStart, endMs) as { mapName: string; battles: number; winRate: number; avgDmg: number }[];

  const bestMaps: MapPerf[] = mapsThisWeek.slice(0, 3).map(m => ({ mapName: m.mapName, battles: m.battles, winRate: m.winRate, avgDmg: m.avgDmg }));
  const worstMaps: MapPerf[] = [...mapsThisWeek].sort((a, b) => a.winRate - b.winRate).slice(0, 3).map(m => ({ mapName: m.mapName, battles: m.battles, winRate: m.winRate, avgDmg: m.avgDmg }));

  // Highlight battle: highest damage this week (proxy for WN8 - documented choice)
  const highlightRow = db.prepare(`
    SELECT arena_id as arenaId, tank_name as tankName, map_name as mapName,
           damage, kills as frags, result, played_at as playedAt
    FROM battles
    WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
    ORDER BY damage DESC LIMIT 1
  `).get(accountId, thisWeekStart, endMs) as { arenaId: string; tankName: string; mapName: string; damage: number; frags: number; result: string; playedAt: number } | undefined;

  const highlightBattle: HighlightBattle | null = highlightRow
    ? { arenaId: highlightRow.arenaId, tankName: highlightRow.tankName, mapName: highlightRow.mapName, damage: highlightRow.damage, frags: highlightRow.frags, result: highlightRow.result, playedAt: highlightRow.playedAt }
    : null;

  const baselineRow = db.prepare(`
    SELECT COUNT(*) as battles,
           ROUND(AVG(damage), 0) as avgDmg,
           ROUND(AVG(CASE WHEN result='win' THEN 100.0 ELSE 0 END), 1) as winRate
    FROM battles
    WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
  `).get(accountId, endMs - 30 * DAY, thisWeekStart) as Record<string, number> | undefined;

  const thirtyDayBaseline: ThirtyDayBaseline = {
    battles: baselineRow?.battles ?? 0,
    wn8: null, // WN8 is expensive to compute in SQL without XVM data; omit from SQL, let AI use damage/WR as proxy
    winRate: baselineRow && baselineRow.battles > 0 ? baselineRow.winRate : null,
    avgDmg: baselineRow && baselineRow.battles > 0 ? baselineRow.avgDmg : null,
  };

  return {
    thisWeek,
    priorWeek,
    progressDelta,
    topImprovers,
    topDecliners,
    bestMaps,
    worstMaps,
    highlightBattle,
    thirtyDayBaseline,
  };
}
