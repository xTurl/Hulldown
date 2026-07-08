/**
 * resolveAbandonedDelta — pure logic that reconstructs an abandoned battle's
 * stats by diffing two WG API tank-stat snapshots and subtracting whatever
 * we already know from replay-parsed battles in the same window.
 */
import { describe, it, expect } from 'vitest';
import { resolveAbandonedDelta } from '../main/services/abandoned-backfill';
import type { TankStatSnapshot } from '../main/services/repos/tank-snapshots-repo';
import type { BattleRecord } from '../shared/types';

function snapshot(overrides: Partial<TankStatSnapshot> = {}): TankStatSnapshot {
  return {
    capturedAt: 1000,
    battles: 10,
    wins: 5,
    losses: 5,
    draws: 0,
    survivedBattles: 3,
    damageDealt: 10000,
    frags: 8,
    spotted: 12,
    droppedCapturePoints: 2,
    xp: 5000,
    assistedDamage: 1500,
    ...overrides,
  };
}

function battle(overrides: Partial<BattleRecord> = {}): BattleRecord {
  return {
    id: 1, accountId: 1, arenaId: 'a1', playedAt: 1500,
    tankKey: 'uk-GB158_Executor', tankName: 'Executor',
    mapName: 'Steppes', battleType: 'Standard', result: 'incomplete',
    damage: 0, assist: 0, kills: 0, shots: 0, hits: 0, pens: 0, spotted: 0,
    xp: 0, credits: 0, survived: false, duration: 0, droppedCapture: 0,
    damageReceived: 0, damageBlocked: 0, repairCost: 0, netCredits: 0,
    markOfMastery: 0, marksOnGun: 0, lifeTime: 0, achievements: [],
    abandoned: true, statsEstimated: false,
    ...overrides,
  };
}

describe('resolveAbandonedDelta', () => {
  it('resolves a single abandoned battle with no other battles in the window', () => {
    const prev = snapshot({ capturedAt: 1000 });
    const curr = snapshot({
      capturedAt: 2000, battles: 11, wins: 6, damageDealt: 12632, frags: 9,
      spotted: 13, droppedCapturePoints: 2, xp: 5440, assistedDamage: 1626, survivedBattles: 3,
    });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];

    const patch = resolveAbandonedDelta(prev, curr, window);

    expect(patch).toEqual({
      result: 'win',
      damage: 2632,
      kills: 1,
      spotted: 1,
      droppedCapture: 0,
      xp: 440,
      assist: 126,
      survived: false,
    });
  });

  it('subtracts already-known complete battles to isolate the abandoned one', () => {
    const prev = snapshot({ capturedAt: 1000 });
    // Two known complete battles (1 win, 1 loss) plus one abandoned in between.
    const curr = snapshot({
      capturedAt: 4000, battles: 13, wins: 7, losses: 6, damageDealt: 10000 + 1000 + 800 + 2632,
      frags: 8 + 0 + 1 + 1, spotted: 12 + 1 + 1 + 1, droppedCapturePoints: 2,
      xp: 5000 + 300 + 200 + 440, assistedDamage: 1500 + 50 + 0 + 126, survivedBattles: 3 + 1,
    });
    const known1 = battle({ arenaId: 'known-1', playedAt: 1500, result: 'loss', damage: 1000, kills: 0, spotted: 1, xp: 300, assist: 50, survived: true });
    const known2 = battle({ arenaId: 'known-2', playedAt: 2000, result: 'win', damage: 800, kills: 1, spotted: 1, xp: 200, assist: 0, survived: false });
    const abandoned = battle({ arenaId: 'abandoned-1', playedAt: 2500, result: 'incomplete' });

    const patch = resolveAbandonedDelta(prev, curr, [known1, known2, abandoned]);

    expect(patch).toEqual({
      result: 'win',
      damage: 2632,
      kills: 1,
      spotted: 1,
      droppedCapture: 0,
      xp: 440,
      assist: 126,
      survived: false,
    });
  });

  it('returns null when there is no unresolved battle in the window', () => {
    const prev = snapshot();
    const curr = snapshot({ battles: 11, wins: 6 });
    expect(resolveAbandonedDelta(prev, curr, [])).toBeNull();
  });

  it('returns null when more than one battle is unresolved (ambiguous)', () => {
    const prev = snapshot();
    const curr = snapshot({ battles: 12, wins: 7 });
    const window = [
      battle({ arenaId: 'a', result: 'incomplete' }),
      battle({ arenaId: 'b', result: 'incomplete' }),
    ];
    expect(resolveAbandonedDelta(prev, curr, window)).toBeNull();
  });

  it('returns null when the battle count does not add up (battle outside the window)', () => {
    const prev = snapshot();
    // battles jumped by 2 but only one battle is known in the window
    const curr = snapshot({ battles: 12, wins: 6 });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];
    expect(resolveAbandonedDelta(prev, curr, window)).toBeNull();
  });

  it('returns null when the remainder would be negative (stat reset / drift)', () => {
    const prev = snapshot({ damageDealt: 10000 });
    // damage went backwards relative to what we'd expect — untrustworthy window
    const curr = snapshot({ battles: 11, wins: 6, damageDealt: 9000 });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];
    expect(resolveAbandonedDelta(prev, curr, window)).toBeNull();
  });

  it('returns null when win/loss/draw deltas do not sum to exactly one outcome', () => {
    const prev = snapshot();
    // battles +1 but wins/losses both unchanged — no outcome recorded, untrustworthy
    const curr = snapshot({ battles: 11, damageDealt: 10500 });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];
    expect(resolveAbandonedDelta(prev, curr, window)).toBeNull();
  });

  it('resolves a draw correctly', () => {
    const prev = snapshot({ draws: 0 });
    const curr = snapshot({ battles: 11, draws: 1, damageDealt: 10500, frags: 8, spotted: 12, xp: 5100 });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];

    const patch = resolveAbandonedDelta(prev, curr, window);

    expect(patch?.result).toBe('draw');
    expect(patch?.damage).toBe(500);
  });

  it('marks survived true when survived_battles increased', () => {
    const prev = snapshot({ survivedBattles: 3 });
    const curr = snapshot({ battles: 11, wins: 6, survivedBattles: 4, damageDealt: 10500 });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];

    const patch = resolveAbandonedDelta(prev, curr, window);

    expect(patch?.survived).toBe(true);
  });
});
