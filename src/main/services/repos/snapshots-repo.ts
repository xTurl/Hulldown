/**
 * Progress snapshots repository: per-account daily WN8/WNX/WR history
 * captured whenever fresh player info shows new battles.
 */
import type { ProgressSnapshot } from '../../../shared/types';
import { getDb } from '../db';

const SNAPSHOT_SELECT = `
  id, taken_at as takenAt, battles, wn8, wnx, win_rate as winRate,
  raw_wins as rawWins, raw_damage as rawDamage, raw_frags as rawFrags,
  raw_survived as rawSurvived, raw_xp as rawXp,
  raw_spotted as rawSpotted, raw_dropped_cp as rawDroppedCp
`;

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

/** Fills in wnx on legacy snapshots recorded before the WNX column existed. */
export function backfillMissingWnx(accountId: number, wnx: number): void {
  getDb()
    .prepare('UPDATE progress_snapshots SET wnx = ? WHERE account_id = ? AND wnx = 0')
    .run(wnx, accountId);
}
