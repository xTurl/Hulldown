/**
 * Tank stat snapshots repository: timestamped cumulative per-tank WG API
 * stats, used solely to reconstruct real stats for abandoned battles by
 * diffing two consecutive snapshots (see abandoned-backfill.ts).
 */
import { getDb } from '../db';
import type { WgTankStat } from '../wargaming';

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

const SNAPSHOT_SELECT = `
  captured_at as capturedAt, battles, wins, losses, draws,
  survived_battles as survivedBattles, damage_dealt as damageDealt,
  frags, spotted, dropped_capture_points as droppedCapturePoints,
  xp, assisted_damage as assistedDamage
`;

/** Returns the most recently stored snapshot strictly before `beforeMs`, or null if none exists yet. */
export function getPreviousSnapshot(accountId: number, tankId: number, beforeMs: number): TankStatSnapshot | null {
  const row = getDb().prepare(`
    SELECT ${SNAPSHOT_SELECT}
    FROM tank_stat_snapshots
    WHERE account_id = ? AND tank_id = ? AND captured_at < ?
    ORDER BY captured_at DESC LIMIT 1
  `).get(accountId, tankId, beforeMs) as TankStatSnapshot | undefined;
  return row ?? null;
}

/**
 * Returns the latest snapshot with an exact cumulative battle count, strictly
 * before `beforeMs`. Used to find the pre-battle baseline even when many
 * identical post-battle snapshots were recorded since.
 */
export function getSnapshotWithBattleCount(
  accountId: number,
  tankId: number,
  battleCount: number,
  beforeMs: number,
): TankStatSnapshot | null {
  const row = getDb().prepare(`
    SELECT ${SNAPSHOT_SELECT}
    FROM tank_stat_snapshots
    WHERE account_id = ? AND tank_id = ? AND captured_at < ? AND battles = ?
    ORDER BY captured_at DESC LIMIT 1
  `).get(accountId, tankId, beforeMs, battleCount) as TankStatSnapshot | undefined;
  return row ?? null;
}

/**
 * Picks the best "before" snapshot for abandoned-battle delta resolution.
 * Prefers the latest row exactly one battle behind `curr`; falls back to the
 * chronologically previous snapshot (which may still be tied on battle count).
 */
export function findBaselineSnapshot(
  accountId: number,
  tankId: number,
  curr: TankStatSnapshot,
  beforeMs: number,
): TankStatSnapshot | null {
  if (curr.battles > 0) {
    const oneBehind = getSnapshotWithBattleCount(accountId, tankId, curr.battles - 1, beforeMs);
    if (oneBehind) return oneBehind;
  }
  return getPreviousSnapshot(accountId, tankId, beforeMs);
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

export function snapshotFromWgAll(capturedAt: number, all: WgTankStat['all']): TankStatSnapshot {
  return {
    capturedAt,
    battles: all.battles,
    wins: all.wins,
    losses: all.losses ?? 0,
    draws: all.draws ?? 0,
    survivedBattles: all.survived_battles,
    damageDealt: all.damage_dealt,
    frags: all.frags,
    spotted: all.spotted,
    droppedCapturePoints: all.dropped_capture_points,
    xp: all.xp,
    assistedDamage: (all.radio_assisted_damage ?? 0) + (all.track_assisted_damage ?? 0),
  };
}

/** Skips insert when the latest snapshot already has identical cumulative stats. */
export function saveSnapshotIfDistinct(accountId: number, tankId: number, snapshot: TankStatSnapshot): void {
  const prev = getPreviousSnapshot(accountId, tankId, snapshot.capturedAt);
  if (
    prev
    && prev.battles === snapshot.battles
    && prev.wins === snapshot.wins
    && prev.losses === snapshot.losses
    && prev.draws === snapshot.draws
    && prev.damageDealt === snapshot.damageDealt
    && prev.frags === snapshot.frags
    && prev.spotted === snapshot.spotted
    && prev.xp === snapshot.xp
    && prev.assistedDamage === snapshot.assistedDamage
  ) {
    return;
  }
  saveSnapshot(accountId, tankId, snapshot);
}

/** Records one snapshot per tank from a WG `tanks/stats/` response. */
export function recordTankStatSnapshots(
  accountId: number,
  tankStats: WgTankStat[],
  capturedAt: number,
): void {
  for (const stat of tankStats) {
    if (stat.all.battles > 0) {
      saveSnapshotIfDistinct(accountId, stat.tank_id, snapshotFromWgAll(capturedAt, stat.all));
    }
  }
}
