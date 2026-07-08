/**
 * Battles repository: CRUD for the parsed-replay battle database and
 * the per-account replay scan state. Pure persistence — analytical
 * aggregations live in battle-analytics.ts.
 */
import type { BattleRecord } from '../../../shared/types';
import { getDb } from '../db';
import { safeJsonParse } from './json';

const BATTLE_SELECT = `
  id, account_id as accountId, arena_id as arenaId, played_at as playedAt,
  tank_key as tankKey, tank_name as tankName, map_name as mapName,
  battle_type as battleType, result, damage, assist, kills, shots, hits, pens,
  spotted, xp, credits, survived, duration, dropped_capture as droppedCapture,
  damage_received as damageReceived, damage_blocked as damageBlocked,
  repair_cost as repairCost, net_credits as netCredits,
  mark_of_mastery as markOfMastery, marks_on_gun as marksOnGun,
  life_time as lifeTime, achievements, abandoned, stats_estimated as statsEstimated
`;

function mapBattle(r: Record<string, unknown>): BattleRecord {
  return {
    ...r,
    survived: r.survived === 1,
    abandoned: r.abandoned === 1,
    statsEstimated: r.statsEstimated === 1,
    achievements: typeof r.achievements === 'string'
      ? safeJsonParse<number[]>(r.achievements, `battles #${r.id} achievements`) ?? []
      : [],
  } as BattleRecord;
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

/** Drop the in-memory arena-ID cache for all accounts (used by full cache wipe). */
export function clearKnownArenaIdsCache(): void {
  knownArenaIdsCache.clear();
}

export function insertBattles(battles: BattleRecord[]): void {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO battles
      (account_id, arena_id, played_at, tank_key, tank_name, map_name, battle_type,
       result, damage, assist, kills, shots, hits, pens, spotted, xp, credits,
       survived, duration, dropped_capture, damage_received, damage_blocked,
       repair_cost, net_credits, mark_of_mastery, marks_on_gun, life_time, achievements,
       abandoned, stats_estimated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        b.abandoned ? 1 : 0, b.statsEstimated ? 1 : 0,
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

export function deleteBattlesForAccount(accountId: number): void {
  getDb().prepare('DELETE FROM battles WHERE account_id = ?').run(accountId);
  knownArenaIdsCache.delete(accountId);
}

// ---------------------------------------------------------------------------
// Abandoned battle backfill (see abandoned-backfill.ts)
// ---------------------------------------------------------------------------

/**
 * Returns every battle (resolved or still abandoned) played in (fromMs, toMs] —
 * the window bracketed by two WG tank-stat snapshots. Used to reconcile the
 * cumulative stat delta against battles we already know about, isolating the
 * contribution of any battle(s) still stuck at `result = 'incomplete'`.
 */
export function getBattlesInWindow(accountId: number, fromMs: number, toMs: number): BattleRecord[] {
  return (getDb()
    .prepare(`SELECT ${BATTLE_SELECT} FROM battles WHERE account_id = ? AND played_at > ? AND played_at <= ? ORDER BY played_at ASC`)
    .all(accountId, fromMs, toMs) as Record<string, unknown>[])
    .map(mapBattle);
}

/** All parsed battles on a given tank (matched by replay vehicle key). */
export function getBattlesForTankKey(accountId: number, tankKey: string): BattleRecord[] {
  return (getDb()
    .prepare(`SELECT ${BATTLE_SELECT} FROM battles WHERE account_id = ? AND tank_key = ? ORDER BY played_at ASC`)
    .all(accountId, tankKey) as Record<string, unknown>[])
    .map(mapBattle);
}

/** Returns all battles still stuck at `result = 'incomplete'` for an account (candidates for backfill). */
export function getUnresolvedAbandonedBattles(accountId: number): BattleRecord[] {
  return (getDb()
    .prepare(`SELECT ${BATTLE_SELECT} FROM battles WHERE account_id = ? AND result = 'incomplete'`)
    .all(accountId) as Record<string, unknown>[])
    .map(mapBattle);
}

export interface AbandonedBackfillPatch {
  result: 'win' | 'loss' | 'draw';
  damage: number;
  assist: number;
  kills: number;
  spotted: number;
  droppedCapture: number;
  xp: number;
  survived: boolean;
}

/** Fills in reconstructed stats for a battle that never got a replay result block. */
export function applyAbandonedBackfill(accountId: number, arenaId: string, patch: AbandonedBackfillPatch): void {
  getDb().prepare(`
    UPDATE battles SET
      result = ?, damage = ?, assist = ?, kills = ?, spotted = ?,
      dropped_capture = ?, xp = ?, survived = ?, stats_estimated = 1
    WHERE account_id = ? AND arena_id = ?
  `).run(
    patch.result, patch.damage, patch.assist, patch.kills, patch.spotted,
    patch.droppedCapture, patch.xp, patch.survived ? 1 : 0,
    accountId, arenaId,
  );
}

// ---------------------------------------------------------------------------
// Scan state
// ---------------------------------------------------------------------------

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
