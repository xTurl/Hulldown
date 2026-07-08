/**
 * Reconstructs stats for battles the player left before the replay's block1
 * (final result) was written — normally shown as blank/zero "abandoned" rows.
 *
 * WG's server finalizes a battle for every participant regardless of whether
 * their client stayed connected, so the account's cumulative per-tank stats
 * (`tanks/stats/`) already include that battle's contribution. By snapshotting
 * those cumulative stats over time and diffing two consecutive snapshots, we
 * can recover the exact damage/frags/spotted/xp/result of a single battle —
 * as long as it's the *only* unresolved battle on that tank in the window.
 *
 * Fields WG never exposes per-tank (credits, repair cost, mastery, shots/hits,
 * achievements) stay unavailable; only the subset needed for WN8/WNX and the
 * core battle-list stats is reconstructed.
 */
import * as wgService from './wargaming';
import * as wgData from './wg-data';
import * as battlesRepo from './repos/battles-repo';
import type { AbandonedBackfillPatch } from './repos/battles-repo';
import * as tankSnapshotsRepo from './repos/tank-snapshots-repo';
import type { TankStatSnapshot } from './repos/tank-snapshots-repo';
import type { AppConfig, BattleRecord } from '../../shared/types';

function toSnapshot(capturedAt: number, all: wgService.WgTankStat['all']): TankStatSnapshot {
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

/**
 * Pure delta-resolution logic (no I/O) — kept separate so it can be unit
 * tested without a database or network mocks.
 *
 * Returns null whenever the window can't be trusted: no unresolved battle,
 * more than one unresolved battle (can't tell them apart), a battle count
 * mismatch (a battle happened outside the replay folder / scan gap), or a
 * negative remainder (stat reset, tank sold and rebought, snapshot drift).
 */
export function resolveAbandonedDelta(
  prev: TankStatSnapshot,
  curr: TankStatSnapshot,
  battlesInWindow: BattleRecord[],
): AbandonedBackfillPatch | null {
  const unresolved = battlesInWindow.filter(b => b.result === 'incomplete');
  if (unresolved.length !== 1) return null;

  const known = battlesInWindow.filter(b => b.result !== 'incomplete');
  const battlesDelta = curr.battles - prev.battles;
  if (battlesDelta !== known.length + 1) return null;

  const sum = (f: (b: BattleRecord) => number) => known.reduce((s, b) => s + f(b), 0);

  const damage  = (curr.damageDealt - prev.damageDealt) - sum(b => b.damage);
  const frags   = (curr.frags - prev.frags) - sum(b => b.kills);
  const spotted = (curr.spotted - prev.spotted) - sum(b => b.spotted);
  const dropped = (curr.droppedCapturePoints - prev.droppedCapturePoints) - sum(b => b.droppedCapture);
  const xp      = (curr.xp - prev.xp) - sum(b => b.xp);
  const assist  = (curr.assistedDamage - prev.assistedDamage) - sum(b => b.assist);

  const winsD     = (curr.wins - prev.wins) - known.filter(b => b.result === 'win').length;
  const lossesD   = (curr.losses - prev.losses) - known.filter(b => b.result === 'loss').length;
  const drawsD    = (curr.draws - prev.draws) - known.filter(b => b.result === 'draw').length;
  const survivedD = (curr.survivedBattles - prev.survivedBattles) - known.filter(b => b.survived).length;

  if ([damage, frags, spotted, dropped, xp, assist].some(v => v < 0)) return null;
  // Exactly one outcome must be attributable to the single unresolved battle.
  if (winsD + lossesD + drawsD !== 1 || winsD < 0 || lossesD < 0 || drawsD < 0) return null;

  const result: 'win' | 'loss' | 'draw' = winsD === 1 ? 'win' : lossesD === 1 ? 'loss' : 'draw';

  return { result, damage, kills: frags, spotted, droppedCapture: dropped, xp, assist, survived: survivedD > 0 };
}

/**
 * Fetches fresh cumulative stats for the given tanks, stores a snapshot, and
 * tries to resolve any still-abandoned battle bracketed by the previous
 * snapshot and this one. Returns the number of battles successfully backfilled.
 */
export async function backfillAbandonedBattles(config: AppConfig, tankIds: number[]): Promise<number> {
  if (tankIds.length === 0) return 0;

  let stats: wgService.WgTankStat[];
  try {
    stats = await wgService.getPlayerTankStats(config.accountId, wgData.WG_API_KEY, config.region, tankIds);
  } catch (e) {
    console.warn('[abandoned-backfill] Failed to fetch tank stats:', e instanceof Error ? e.message : e);
    return 0;
  }

  const now = Date.now();
  let resolved = 0;

  for (const stat of stats) {
    const curr = toSnapshot(now, stat.all);
    const prev = tankSnapshotsRepo.getPreviousSnapshot(config.accountId, stat.tank_id, now);
    tankSnapshotsRepo.saveSnapshot(config.accountId, stat.tank_id, curr);
    // First time we've ever snapshotted this tank — nothing to diff against yet.
    if (!prev) continue;

    const battlesInWindow = battlesRepo
      .getBattlesInWindow(config.accountId, prev.capturedAt, curr.capturedAt)
      .filter(b => wgData.resolveTankId(b.tankKey, b.tankName) === stat.tank_id);

    const patch = resolveAbandonedDelta(prev, curr, battlesInWindow);
    if (!patch) continue;

    const abandonedBattle = battlesInWindow.find(b => b.result === 'incomplete');
    if (!abandonedBattle) continue;
    battlesRepo.applyAbandonedBackfill(config.accountId, abandonedBattle.arenaId, patch);
    resolved++;
  }

  return resolved;
}
