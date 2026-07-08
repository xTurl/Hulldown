/**
 * Tank stat snapshots repository: timestamped cumulative per-tank WG API
 * stats, used solely to reconstruct real stats for abandoned battles by
 * diffing two consecutive snapshots (see abandoned-backfill.ts).
 */
import { getDb } from '../db';

export interface TankStatSnapshot {
  capturedAt: number;
  battles: number;
  wins: number;
  losses: number;
  draws: number;
  survivedBattles: number;
  damageDealt: number;
  frags: number;
  spotted: number;
  droppedCapturePoints: number;
  xp: number;
  assistedDamage: number;
}

/** Returns the most recently stored snapshot strictly before `beforeMs`, or null if none exists yet. */
export function getPreviousSnapshot(accountId: number, tankId: number, beforeMs: number): TankStatSnapshot | null {
  const row = getDb().prepare(`
    SELECT captured_at as capturedAt, battles, wins, losses, draws,
           survived_battles as survivedBattles, damage_dealt as damageDealt,
           frags, spotted, dropped_capture_points as droppedCapturePoints,
           xp, assisted_damage as assistedDamage
    FROM tank_stat_snapshots
    WHERE account_id = ? AND tank_id = ? AND captured_at < ?
    ORDER BY captured_at DESC LIMIT 1
  `).get(accountId, tankId, beforeMs) as TankStatSnapshot | undefined;
  return row ?? null;
}

export function saveSnapshot(accountId: number, tankId: number, snapshot: TankStatSnapshot): void {
  getDb().prepare(`
    INSERT INTO tank_stat_snapshots
      (account_id, tank_id, captured_at, battles, wins, losses, draws,
       survived_battles, damage_dealt, frags, spotted, dropped_capture_points, xp, assisted_damage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    accountId, tankId, snapshot.capturedAt, snapshot.battles, snapshot.wins, snapshot.losses, snapshot.draws,
    snapshot.survivedBattles, snapshot.damageDealt, snapshot.frags, snapshot.spotted,
    snapshot.droppedCapturePoints, snapshot.xp, snapshot.assistedDamage,
  );
}
