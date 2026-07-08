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
import * as cacheService from './cache';
import * as battlesRepo from './repos/battles-repo';
import type { AbandonedBackfillPatch } from './repos/battles-repo';
import * as tankSnapshotsRepo from './repos/tank-snapshots-repo';
import type { TankStatSnapshot } from './repos/tank-snapshots-repo';
import type { AppConfig, BattleRecord } from '../../shared/types';

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
 * Fallback when snapshot deltas are unavailable (e.g. the first WG snapshot was
 * taken after the abandoned battle already landed in cumulative stats). Works when
 * our replay DB has every WG battle on the tank except the one still incomplete:
 * WG lifetime totals minus the sum of known complete rows = abandoned battle stats.
 */
export function resolveFromLifetimeRemainder(
  wg: TankStatSnapshot,
  dbBattles: BattleRecord[],
): AbandonedBackfillPatch | null {
  const incomplete = dbBattles.filter(b => b.result === 'incomplete');
  if (incomplete.length !== 1) return null;

  const known = dbBattles.filter(b => b.result !== 'incomplete');
  if (known.length + 1 !== wg.battles) return null;

  const sum = (f: (b: BattleRecord) => number) => known.reduce((s, b) => s + f(b), 0);

  const damage  = wg.damageDealt - sum(b => b.damage);
  const frags   = wg.frags - sum(b => b.kills);
  const spotted = wg.spotted - sum(b => b.spotted);
  const dropped = wg.droppedCapturePoints - sum(b => b.droppedCapture);
  const xp      = wg.xp - sum(b => b.xp);
  const assist  = wg.assistedDamage - sum(b => b.assist);

  const winsD     = wg.wins - known.filter(b => b.result === 'win').length;
  const lossesD   = wg.losses - known.filter(b => b.result === 'loss').length;
  const drawsD    = wg.draws - known.filter(b => b.result === 'draw').length;
  const survivedD = wg.survivedBattles - known.filter(b => b.survived).length;

  if ([damage, frags, spotted, dropped, xp, assist].some(v => v < 0)) return null;
  if (winsD + lossesD + drawsD !== 1 || winsD < 0 || lossesD < 0 || drawsD < 0) return null;

  const result: 'win' | 'loss' | 'draw' = winsD === 1 ? 'win' : lossesD === 1 ? 'loss' : 'draw';

  return { result, damage, kills: frags, spotted, droppedCapture: dropped, xp, assist, survived: survivedD > 0 };
}

/**
 * Uses the last cached WG tank-stats blob as a pre-battle baseline when no
 * dedicated snapshot exists yet (e.g. the player opened the app before the battle).
 */
export function prevFromWgDataCache(
  accountId: number,
  tankId: number,
  beforeMs: number,
): TankStatSnapshot | null {
  const cache = cacheService.getWgDataCache(accountId);
  if (!cache || cache.updatedAt >= beforeMs) return null;

  const stat = (cache.tankStats as wgService.WgTankStat[]).find(t => t.tank_id === tankId);
  if (!stat) return null;

  return tankSnapshotsRepo.snapshotFromWgAll(cache.updatedAt, stat.all);
}

function battlesInWindowForTank(
  accountId: number,
  tankId: number,
  tankKey: string | undefined,
  prevCapturedAt: number,
  currCapturedAt: number,
): BattleRecord[] {
  const battlesInWindow = battlesRepo
    .getBattlesInWindow(accountId, prevCapturedAt, currCapturedAt)
    .filter(b => wgData.resolveTankId(b.tankKey, b.tankName) === tankId);

  // Incomplete battles often have played_at before the first snapshot was taken
  // (snapshots use fetch time, not battle start). Always include them.
  if (tankKey) {
    for (const b of battlesRepo.getBattlesForTankKey(accountId, tankKey)) {
      if (b.result === 'incomplete' && !battlesInWindow.some(w => w.arenaId === b.arenaId)) {
        battlesInWindow.push(b);
      }
    }
  }

  return battlesInWindow;
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
  const unresolved = battlesRepo.getUnresolvedAbandonedBattles(config.accountId);

  for (const stat of stats) {
    const curr = tankSnapshotsRepo.snapshotFromWgAll(now, stat.all);
    const tankKey = unresolved.find(
      b => wgData.resolveTankId(b.tankKey, b.tankName) === stat.tank_id,
    )?.tankKey;
    const abandonedBattle = tankKey
      ? unresolved.find(b => b.tankKey === tankKey)
      : undefined;

    let prev = tankSnapshotsRepo.findBaselineSnapshot(config.accountId, stat.tank_id, curr, now);
    if (!prev && abandonedBattle) {
      prev = prevFromWgDataCache(config.accountId, stat.tank_id, abandonedBattle.playedAt);
    }

    let patch: AbandonedBackfillPatch | null = null;

    if (prev) {
      const window = battlesInWindowForTank(
        config.accountId,
        stat.tank_id,
        tankKey,
        prev.capturedAt,
        curr.capturedAt,
      );
      patch = resolveAbandonedDelta(prev, curr, window);
    }

    // First snapshot, or delta window ambiguous — try lifetime remainder when our
    // DB has one incomplete row and otherwise matches WG's battle count.
    if (!patch && tankKey) {
      const dbBattles = battlesRepo.getBattlesForTankKey(config.accountId, tankKey);
      patch = resolveFromLifetimeRemainder(curr, dbBattles);
    }

    if (patch && abandonedBattle) {
      battlesRepo.applyAbandonedBackfill(config.accountId, abandonedBattle.arenaId, patch);
      resolved++;
    }

    // Always persist the fresh fetch so the next scan has a baseline to diff against.
    tankSnapshotsRepo.saveSnapshotIfDistinct(config.accountId, stat.tank_id, curr);
  }

  return resolved;
}
