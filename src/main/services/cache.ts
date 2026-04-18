import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import type { ProgressSnapshot, BattleDebrief, WeeklyCoachReport, BattleRecord } from '../../shared/types';
import { DAY, WEEK } from '../../shared/utils/time';

let db: Database.Database | undefined;

const RAW_COLUMNS = [
  'raw_wins INTEGER NOT NULL DEFAULT 0',
  'raw_damage INTEGER NOT NULL DEFAULT 0',
  'raw_frags INTEGER NOT NULL DEFAULT 0',
  'raw_survived INTEGER NOT NULL DEFAULT 0',
  'raw_xp INTEGER NOT NULL DEFAULT 0',
  'raw_spotted INTEGER NOT NULL DEFAULT 0',
  'raw_dropped_cp INTEGER NOT NULL DEFAULT 0',
];

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'cache.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tank_details (
        tank_id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_info (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS progress_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taken_at INTEGER NOT NULL,
        battles INTEGER NOT NULL,
        wn8 INTEGER NOT NULL,
        wnx INTEGER NOT NULL DEFAULT 0,
        win_rate REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS battles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        arena_id TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        tank_key TEXT NOT NULL,
        tank_name TEXT NOT NULL DEFAULT '',
        map_name TEXT NOT NULL,
        battle_type TEXT NOT NULL,
        result TEXT NOT NULL,
        damage INTEGER NOT NULL DEFAULT 0,
        assist INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        shots INTEGER NOT NULL DEFAULT 0,
        hits INTEGER NOT NULL DEFAULT 0,
        pens INTEGER NOT NULL DEFAULT 0,
        spotted INTEGER NOT NULL DEFAULT 0,
        xp INTEGER NOT NULL DEFAULT 0,
        credits INTEGER NOT NULL DEFAULT 0,
        survived INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        dropped_capture INTEGER NOT NULL DEFAULT 0,
        damage_received INTEGER NOT NULL DEFAULT 0,
        damage_blocked INTEGER NOT NULL DEFAULT 0,
        repair_cost INTEGER NOT NULL DEFAULT 0,
        net_credits INTEGER NOT NULL DEFAULT 0,
        mark_of_mastery INTEGER NOT NULL DEFAULT 0,
        marks_on_gun INTEGER NOT NULL DEFAULT 0,
        life_time INTEGER NOT NULL DEFAULT 0,
        achievements TEXT NOT NULL DEFAULT '[]',
        UNIQUE(account_id, arena_id)
      );
      CREATE TABLE IF NOT EXISTS scan_state (
        account_id INTEGER PRIMARY KEY,
        last_scan_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS wg_data_cache (
        account_id INTEGER PRIMARY KEY,
        tank_stats TEXT NOT NULL,
        encyclopedia TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS battle_debriefs (
        arena_id TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weekly_reports (
        account_id INTEGER NOT NULL,
        iso_week TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, iso_week)
      );
      CREATE INDEX IF NOT EXISTS idx_battle_debriefs_account ON battle_debriefs(account_id);
      CREATE INDEX IF NOT EXISTS idx_battles_account_played   ON battles(account_id, played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_battles_account_tank     ON battles(account_id, tank_key);
      CREATE INDEX IF NOT EXISTS idx_battles_account_map      ON battles(account_id, map_name);
      CREATE INDEX IF NOT EXISTS idx_battles_account_arena_id ON battles(account_id, arena_id);
    `);
    // Migrations — safe to run every startup
    const psColumns = (db.prepare('PRAGMA table_info(progress_snapshots)').all() as { name: string }[]).map(c => c.name);
    for (const colDef of ['wnx INTEGER NOT NULL DEFAULT 0', 'account_id INTEGER NOT NULL DEFAULT 0', ...RAW_COLUMNS]) {
      const colName = colDef.split(' ')[0];
      if (!psColumns.includes(colName)) {
        db.exec(`ALTER TABLE progress_snapshots ADD COLUMN ${colDef}`);
      }
    }
    const battlesColumns = (db.prepare('PRAGMA table_info(battles)').all() as { name: string }[]).map(c => c.name);
    for (const colDef of [
      'dropped_capture INTEGER NOT NULL DEFAULT 0',
      'damage_received INTEGER NOT NULL DEFAULT 0',
      'damage_blocked INTEGER NOT NULL DEFAULT 0',
      'repair_cost INTEGER NOT NULL DEFAULT 0',
      'net_credits INTEGER NOT NULL DEFAULT 0',
      'mark_of_mastery INTEGER NOT NULL DEFAULT 0',
      'marks_on_gun INTEGER NOT NULL DEFAULT 0',
      'life_time INTEGER NOT NULL DEFAULT 0',
      "achievements TEXT NOT NULL DEFAULT '[]'",
    ]) {
      const colName = colDef.split(' ')[0];
      if (!battlesColumns.includes(colName)) {
        db.exec(`ALTER TABLE battles ADD COLUMN ${colDef}`);
      }
    }
  }
  return db;
}

const SNAPSHOT_SELECT = `
  id, taken_at as takenAt, battles, wn8, wnx, win_rate as winRate,
  raw_wins as rawWins, raw_damage as rawDamage, raw_frags as rawFrags,
  raw_survived as rawSurvived, raw_xp as rawXp,
  raw_spotted as rawSpotted, raw_dropped_cp as rawDroppedCp
`;

export function getTankDetails(tankId: number): { data: unknown; updatedAt: number } | null {
  const row = getDb().prepare('SELECT data, updated_at FROM tank_details WHERE tank_id = ?').get(tankId) as { data: string; updated_at: number } | undefined;
  if (!row) return null;
  return { data: JSON.parse(row.data), updatedAt: row.updated_at };
}

export function saveTankDetails(tankId: number, data: unknown): void {
  getDb().prepare('INSERT OR REPLACE INTO tank_details (tank_id, data, updated_at) VALUES (?, ?, ?)').run(tankId, JSON.stringify(data), Date.now());
}

export function getPlayerInfo(): { data: unknown; updatedAt: number } | null {
  const row = getDb().prepare('SELECT data, updated_at FROM player_info WHERE id = 1').get() as { data: string; updated_at: number } | undefined;
  if (!row) return null;
  return { data: JSON.parse(row.data), updatedAt: row.updated_at };
}

export function savePlayerInfo(data: unknown): void {
  getDb().prepare('INSERT OR REPLACE INTO player_info (id, data, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(data), Date.now());
}

export function clearPlayerInfoCache(): void {
  getDb().prepare('DELETE FROM player_info').run();
}

export function clearAll(): void {
  getDb().exec('DELETE FROM tank_details; DELETE FROM player_info; DELETE FROM progress_snapshots; DELETE FROM wg_data_cache; DELETE FROM battle_debriefs; DELETE FROM weekly_reports;');
}

export function clearBattles(accountId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM battles WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM battle_debriefs WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM weekly_reports WHERE account_id = ?').run(accountId);
  knownArenaIdsCache.delete(accountId);
}

export function getProgressSnapshots(accountId: number): ProgressSnapshot[] {
  return getDb()
    .prepare(`SELECT ${SNAPSHOT_SELECT} FROM progress_snapshots WHERE account_id = ? ORDER BY taken_at ASC`)
    .all(accountId) as ProgressSnapshot[];
}

export function getLastProgressSnapshot(accountId: number): ProgressSnapshot | null {
  const row = getDb()
    .prepare(`SELECT ${SNAPSHOT_SELECT} FROM progress_snapshots WHERE account_id = ? ORDER BY taken_at DESC LIMIT 1`)
    .get(accountId) as ProgressSnapshot | undefined;
  return row ?? null;
}

export function saveProgressSnapshot(snapshot: Omit<ProgressSnapshot, 'id'> & { accountId: number }): void {
  getDb()
    .prepare(`
      INSERT INTO progress_snapshots
        (account_id, taken_at, battles, wn8, wnx, win_rate,
         raw_wins, raw_damage, raw_frags, raw_survived, raw_xp, raw_spotted, raw_dropped_cp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      snapshot.accountId, snapshot.takenAt, snapshot.battles, snapshot.wn8, snapshot.wnx, snapshot.winRate,
      snapshot.rawWins, snapshot.rawDamage, snapshot.rawFrags,
      snapshot.rawSurvived, snapshot.rawXp, snapshot.rawSpotted, snapshot.rawDroppedCp,
    );
}

// In-memory cache: avoids re-fetching all 16k arena IDs from DB on every scan cycle.
// Populated lazily on first call per account; updated incrementally after each insertBattles.
const knownArenaIdsCache = new Map<number, Set<string>>();

export function getKnownArenaIds(accountId: number): Set<string> {
  const cached = knownArenaIdsCache.get(accountId);
  if (cached) return cached;
  const rows = getDb()
    .prepare('SELECT arena_id FROM battles WHERE account_id = ?')
    .all(accountId) as { arena_id: string }[];
  const set = new Set(rows.map(r => r.arena_id));
  knownArenaIdsCache.set(accountId, set);
  return set;
}

/** Force a full DB reload for an account on the next getKnownArenaIds call. */
export function invalidateKnownArenaIds(accountId: number): void {
  knownArenaIdsCache.delete(accountId);
}

/**
 * Removes partial battles that now have a complete counterpart.
 *
 * WoT writes a 1-block replay when a player joins, then rewrites the same
 * file with block 2 (full stats) once the battle ends — even if the player
 * left early. The scan inserts the complete version under its real arenaUniqueID
 * while the original partial_<filename> record stays, causing duplicates.
 *
 * Matching key: same account + tank + played_at (both parsed from block0.dateTime
 * so they are always identical for the same file).
 *
 * Returns the number of stale partial records deleted.
 */
export function cleanupPartialBattles(accountId: number): number {
  const result = getDb().prepare(`
    DELETE FROM battles
    WHERE account_id = ? AND arena_id LIKE 'partial_%'
    AND EXISTS (
      SELECT 1 FROM battles b2
      WHERE b2.account_id = battles.account_id
        AND b2.tank_key   = battles.tank_key
        AND b2.played_at  = battles.played_at
        AND b2.arena_id   NOT LIKE 'partial_%'
    )
  `).run(accountId);
  return result.changes;
}

/**
 * Returns all partial (incomplete) battle records for an account.
 * Used to match against temp.wotreplay on Windows where WoT doesn't
 * rewrite the dated replay file with full results for early-exit battles.
 */
export function getPartialBattles(accountId: number): Array<{ arenaId: string; playedAt: number; tankKey: string }> {
  return (getDb().prepare(`
    SELECT arena_id as arenaId, played_at as playedAt, tank_key as tankKey
    FROM battles WHERE account_id = ? AND arena_id LIKE 'partial_%'
  `).all(accountId)) as Array<{ arenaId: string; playedAt: number; tankKey: string }>;
}

/**
 * Replaces a partial battle record with complete data from temp.wotreplay.
 * The partial record is deleted and the full record is inserted under the real arenaUniqueID.
 */
export function resolvePartialBattle(
  accountId: number,
  partialArenaId: string,
  fullBattle: BattleRecord,
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM battles WHERE account_id = ? AND arena_id = ?').run(accountId, partialArenaId);
    insertBattles([fullBattle]);
  })();
}

const BATTLE_SELECT = `
  id, account_id as accountId, arena_id as arenaId, played_at as playedAt,
  tank_key as tankKey, tank_name as tankName, map_name as mapName,
  battle_type as battleType, result, damage, assist, kills, shots, hits, pens,
  spotted, xp, credits, survived, duration, dropped_capture as droppedCapture,
  damage_received as damageReceived, damage_blocked as damageBlocked,
  repair_cost as repairCost, net_credits as netCredits,
  mark_of_mastery as markOfMastery, marks_on_gun as marksOnGun,
  life_time as lifeTime, achievements
`;

function mapBattle(r: Record<string, unknown>): BattleRecord {
  return {
    ...r,
    survived: r.survived === 1,
    achievements: typeof r.achievements === 'string' ? JSON.parse(r.achievements) : [],
  } as BattleRecord;
}

export function insertBattles(battles: BattleRecord[]): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO battles
      (account_id, arena_id, played_at, tank_key, tank_name, map_name, battle_type,
       result, damage, assist, kills, shots, hits, pens, spotted, xp, credits,
       survived, duration, dropped_capture, damage_received, damage_blocked,
       repair_cost, net_credits, mark_of_mastery, marks_on_gun, life_time, achievements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = getDb().transaction((rows: BattleRecord[]) => {
    for (const b of rows) {
      stmt.run(
        b.accountId, b.arenaId, b.playedAt, b.tankKey, b.tankName, b.mapName, b.battleType,
        b.result, b.damage, b.assist, b.kills, b.shots, b.hits, b.pens, b.spotted,
        b.xp, b.credits, b.survived ? 1 : 0, b.duration, b.droppedCapture ?? 0,
        b.damageReceived ?? 0, b.damageBlocked ?? 0, b.repairCost ?? 0, b.netCredits ?? 0,
        b.markOfMastery ?? 0, b.marksOnGun ?? 0, b.lifeTime ?? 0,
        JSON.stringify(b.achievements ?? []),
      );
    }
  });
  insertMany(battles);
  // Update the in-memory knownIds cache so the next scan doesn't re-query the DB.
  // INSERT OR IGNORE means duplicates are silently dropped; adding to a Set is idempotent.
  for (const b of battles) {
    const cached = knownArenaIdsCache.get(b.accountId);
    if (cached) cached.add(b.arenaId);
  }
}

export function getBattleByArenaId(accountId: number, arenaId: string): BattleRecord | null {
  const row = getDb()
    .prepare(`SELECT ${BATTLE_SELECT} FROM battles WHERE account_id = ? AND arena_id = ?`)
    .get(accountId, arenaId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapBattle(row);
}

export function getBattles(accountId: number, limit = 10, offset = 0): BattleRecord[] {
  return (getDb()
    .prepare(`SELECT ${BATTLE_SELECT} FROM battles WHERE account_id = ? ORDER BY played_at DESC LIMIT ? OFFSET ?`)
    .all(accountId, limit, offset) as Record<string, unknown>[])
    .map(mapBattle);
}

export function getBattlesCount(accountId: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as count FROM battles WHERE account_id = ?')
    .get(accountId) as { count: number };
  return row.count;
}

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

export interface ReplayMapStat {
  mapName: string; battles: number; wins: number; winRate: number;
  avgDamage: number; avgKills: number; avgAssist: number; avgSpotted: number;
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

export interface ReplayTankStat {
  tankName: string; tankKey: string; battles: number; wins: number; winRate: number;
  avgDamage: number; avgKills: number; avgAssist: number; avgBlocked: number;
  netCredits: number; bestMastery: number;
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

export interface EconomyDay {
  day: string; battles: number; wins: number;
  netCredits: number; grossCredits: number; totalRepairs: number;
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

export interface SessionSummary {
  sessionNum: number; startedAt: number; endedAt: number;
  battles: number; wins: number; winRate: number;
  avgDamage: number; avgKills: number; netCredits: number;
  totalDamage: number; totalFrags: number; totalSpotted: number;
  totalDropped: number; totalAssist: number;
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

export interface TodaySession {
  battles: number; wins: number; losses: number; winRate: number;
  avgDamage: number; avgAssist: number; avgFrags: number; avgSpots: number;
  survivalRate: number; tankCount: number;
  totalDamage: number; totalWins: number; totalFrags: number;
  totalSpotted: number; totalDropped: number; totalNetCredits: number;
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

export function getWgDataCache(accountId: number): { tankStats: unknown; encyclopedia: unknown; updatedAt: number } | null {
  const row = getDb()
    .prepare('SELECT tank_stats, encyclopedia, updated_at FROM wg_data_cache WHERE account_id = ?')
    .get(accountId) as { tank_stats: string; encyclopedia: string; updated_at: number } | undefined;
  if (!row) return null;
  return {
    tankStats:   JSON.parse(row.tank_stats),
    encyclopedia: JSON.parse(row.encyclopedia),
    updatedAt:   row.updated_at,
  };
}

export function saveWgDataCache(accountId: number, tankStats: unknown, encyclopedia: unknown): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO wg_data_cache (account_id, tank_stats, encyclopedia, updated_at) VALUES (?, ?, ?, ?)')
    .run(accountId, JSON.stringify(tankStats), JSON.stringify(encyclopedia), Date.now());
}

export function clearWgDataCache(accountId: number): void {
  getDb().prepare('DELETE FROM wg_data_cache WHERE account_id = ?').run(accountId);
}

export function getLastScanTime(accountId: number): number {
  const row = getDb()
    .prepare('SELECT last_scan_at FROM scan_state WHERE account_id = ?')
    .get(accountId) as { last_scan_at: number } | undefined;
  return row?.last_scan_at ?? 0;
}

export function setLastScanTime(accountId: number, time: number): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO scan_state (account_id, last_scan_at) VALUES (?, ?)')
    .run(accountId, time);
}

export function backfillMissingWnx(wnx: number): void {
  getDb()
    .prepare('UPDATE progress_snapshots SET wnx = ? WHERE wnx = 0')
    .run(wnx);
}

export function getStats(): { tanks: number; lastSync: string | null } {
  const tanksRow = getDb().prepare('SELECT COUNT(*) as count FROM tank_details').get() as { count: number };
  const syncRow = getDb().prepare('SELECT MAX(updated_at) as last FROM tank_details').get() as { last: number | null };
  return {
    tanks: tanksRow.count,
    lastSync: syncRow.last ? new Date(syncRow.last).toLocaleString('en-US') : null,
  };
}

// ---------------------------------------------------------------------------
// Battle Debriefs
// ---------------------------------------------------------------------------

export function getBattleDebrief(arenaId: string): BattleDebrief | null {
  const row = getDb()
    .prepare('SELECT json FROM battle_debriefs WHERE arena_id = ?')
    .get(arenaId) as { json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.json) as BattleDebrief;
}

export function saveBattleDebrief(arenaId: string, accountId: number, debrief: BattleDebrief): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO battle_debriefs (arena_id, account_id, json, created_at) VALUES (?, ?, ?, ?)')
    .run(arenaId, accountId, JSON.stringify(debrief), Date.now());
}

/** Clear debriefs. Passing accountId clears only that player's debriefs; omit to clear all. */
export function clearBattleDebriefs(accountId?: number): void {
  if (accountId !== undefined) {
    getDb().prepare('DELETE FROM battle_debriefs WHERE account_id = ?').run(accountId);
  } else {
    getDb().prepare('DELETE FROM battle_debriefs').run();
  }
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

// ---------------------------------------------------------------------------
// Weekly Reports — cache helpers
// ---------------------------------------------------------------------------

export function getWeeklyReport(accountId: number, isoWeek: string): WeeklyCoachReport | null {
  const row = getDb()
    .prepare('SELECT json FROM weekly_reports WHERE account_id = ? AND iso_week = ?')
    .get(accountId, isoWeek) as { json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.json) as WeeklyCoachReport;
}

export function saveWeeklyReport(accountId: number, isoWeek: string, report: WeeklyCoachReport): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO weekly_reports (account_id, iso_week, json, created_at) VALUES (?, ?, ?, ?)')
    .run(accountId, isoWeek, JSON.stringify(report), Date.now());
}

/** Clear weekly reports. Passing accountId clears only that player's reports; omit to clear all. */
export function clearWeeklyReports(accountId?: number): void {
  if (accountId !== undefined) {
    getDb().prepare('DELETE FROM weekly_reports WHERE account_id = ?').run(accountId);
  } else {
    getDb().prepare('DELETE FROM weekly_reports').run();
  }
}

export function listWeeklyReports(accountId: number, limit = 10): { isoWeek: string; createdAt: number }[] {
  return getDb()
    .prepare('SELECT iso_week as isoWeek, created_at as createdAt FROM weekly_reports WHERE account_id = ? ORDER BY iso_week DESC LIMIT ?')
    .all(accountId, limit) as { isoWeek: string; createdAt: number }[];
}

// ---------------------------------------------------------------------------
// Weekly Coach Data — aggregation for the weekly coach AI prompt
// ---------------------------------------------------------------------------

/** Totals for one week window. */
interface WeekTotals {
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

interface TankImprover {
  tankKey: string;
  tankName: string;
  battlesThisWeek: number;
  avgDmgThisWeek: number;
  avgDmgPriorMonth: number;
  delta: number;
}

interface MapPerf {
  mapName: string;
  battles: number;
  winRate: number;
  avgDmg: number;
}

interface HighlightBattle {
  arenaId: string;
  tankName: string;
  mapName: string;
  damage: number;
  frags: number;
  result: string;
  playedAt: number;
}

interface ProgressDelta {
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

interface ThirtyDayBaseline {
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
  const db = getDb();
  const row = db.prepare(`
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

  // --- This week & prior week totals ---
  const thisWeek = computeWeekTotals(accountId, thisWeekStart, endMs);
  const priorWeek = computeWeekTotals(accountId, priorWeekStart, thisWeekStart);

  // --- Progress snapshot delta ---
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

  // --- Per-tank this week (≥5 battles) ---
  const tanksThisWeek = db.prepare(`
    SELECT tank_key as tankKey, tank_name as tankName,
           COUNT(*) as battles,
           ROUND(AVG(damage), 0) as avgDmg
    FROM battles
    WHERE account_id = ? AND result != 'incomplete' AND played_at >= ? AND played_at < ?
    GROUP BY tank_key HAVING COUNT(*) >= 5
  `).all(accountId, thisWeekStart, endMs) as { tankKey: string; tankName: string; battles: number; avgDmg: number }[];

  // For each qualifying tank, get prior month avg damage
  const topImprovers: TankImprover[] = [];
  const topDecliners: TankImprover[] = [];

  if (tanksThisWeek.length > 0) {
    // Batch query prior month stats for all qualifying tanks
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

  // --- Best & worst maps this week (≥3 battles) ---
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

  // --- Highlight battle: highest damage this week (proxy for WN8 - documented choice) ---
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

  // --- 30-day baseline (excluding this week) ---
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
