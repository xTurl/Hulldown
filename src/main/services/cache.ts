import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import type { ProgressSnapshot } from '../../shared/types';

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
      CREATE INDEX IF NOT EXISTS idx_battles_account_played ON battles(account_id, played_at DESC);
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
  getDb().exec('DELETE FROM tank_details; DELETE FROM player_info; DELETE FROM progress_snapshots;');
}

export function clearBattles(accountId: number): void {
  getDb().prepare('DELETE FROM battles WHERE account_id = ?').run(accountId);
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

export function getKnownArenaIds(accountId: number): Set<string> {
  const rows = getDb()
    .prepare('SELECT arena_id FROM battles WHERE account_id = ?')
    .all(accountId) as { arena_id: string }[];
  return new Set(rows.map(r => r.arena_id));
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
  fullBattle: import('../types').BattleRecord,
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

function mapBattle(r: Record<string, unknown>): import('../types').BattleRecord {
  return {
    ...r,
    survived: r.survived === 1,
    achievements: typeof r.achievements === 'string' ? JSON.parse(r.achievements) : [],
  } as import('../types').BattleRecord;
}

export function insertBattles(battles: import('../types').BattleRecord[]): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO battles
      (account_id, arena_id, played_at, tank_key, tank_name, map_name, battle_type,
       result, damage, assist, kills, shots, hits, pens, spotted, xp, credits,
       survived, duration, dropped_capture, damage_received, damage_blocked,
       repair_cost, net_credits, mark_of_mastery, marks_on_gun, life_time, achievements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = getDb().transaction((rows: import('../types').BattleRecord[]) => {
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
}

export function getBattles(accountId: number, limit = 10, offset = 0): import('../types').BattleRecord[] {
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

export function getSessions(accountId: number, limit = 20): SessionSummary[] {
  return getDb().prepare(`
    WITH ordered AS (
      SELECT played_at, result, damage, kills, net_credits,
             spotted, dropped_capture, assist,
             LAG(played_at) OVER (ORDER BY played_at) as prev_at
      FROM battles WHERE account_id = ? AND result != 'incomplete'
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
