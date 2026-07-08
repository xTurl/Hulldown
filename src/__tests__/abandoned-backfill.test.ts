/**
 * resolveAbandonedDelta — pure logic that reconstructs an abandoned battle's
 * stats by diffing two WG API tank-stat snapshots and subtracting whatever
 * we already know from replay-parsed battles in the same window.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveAbandonedDelta,
  resolveFromLifetimeRemainder,
  prevFromWgDataCache,
} from '../main/services/abandoned-backfill';
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
  it('resolves using a baseline from before the battle count jumped (EBR-style case)', () => {
    // Many post-battle snapshots at 829 battles; baseline must be the 828 row.
    const prev = snapshot({
      capturedAt: 1783513615882,
      battles: 828, wins: 431, losses: 390, draws: 7,
      damageDealt: 983007, frags: 518, spotted: 2775, xp: 654155,
      assistedDamage: 1279834, survivedBattles: 153,
    });
    const curr = snapshot({
      capturedAt: 1783513900000,
      battles: 829, wins: 431, losses: 391, draws: 7,
      damageDealt: 985119, frags: 520, spotted: 2779, xp: 655106,
      assistedDamage: 1280183, survivedBattles: 153,
    });
    const window = [battle({
      arenaId: 'partial_20260708_1417_france-F108_Panhard_EBR_105_95_lost_city_ctf',
      playedAt: 1783513078000,
      result: 'incomplete',
    })];

    expect(resolveAbandonedDelta(prev, curr, window)).toEqual({
      result: 'loss',
      damage: 2112,
      kills: 2,
      spotted: 4,
      droppedCapture: 0,
      xp: 951,
      assist: 349,
      survived: false,
    });
  });

  it('returns null when prev and curr share the same battle count (stale pair)', () => {
    const prev = snapshot({ capturedAt: 1000, battles: 829, wins: 431, losses: 391, damageDealt: 985119, frags: 520 });
    const curr = snapshot({ capturedAt: 2000, battles: 829, wins: 431, losses: 391, damageDealt: 985119, frags: 520 });
    const window = [battle({ arenaId: 'abandoned-1', result: 'incomplete' })];
    expect(resolveAbandonedDelta(prev, curr, window)).toBeNull();
  });

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

describe('resolveFromLifetimeRemainder', () => {
  it('resolves when DB has every WG battle except one incomplete row', () => {
    const wg = snapshot({
      battles: 3, wins: 2, losses: 1, damageDealt: 3000, frags: 3, spotted: 4, xp: 900,
      assistedDamage: 0, droppedCapturePoints: 0, survivedBattles: 0,
    });
    const dbBattles = [
      battle({ arenaId: 'k1', result: 'win', damage: 1000, kills: 1, spotted: 1, xp: 300 }),
      battle({ arenaId: 'k2', result: 'loss', damage: 500, kills: 0, spotted: 1, xp: 200 }),
      battle({ arenaId: 'abandoned-1', result: 'incomplete' }),
    ];

    expect(resolveFromLifetimeRemainder(wg, dbBattles)).toEqual({
      result: 'win',
      damage: 1500,
      kills: 2,
      spotted: 2,
      droppedCapture: 0,
      xp: 400,
      assist: 0,
      survived: false,
    });
  });

  it('returns null when DB is missing battles vs WG lifetime count', () => {
    const wg = snapshot({ battles: 50 });
    const dbBattles = [
      battle({ arenaId: 'k1', result: 'win' }),
      battle({ arenaId: 'abandoned-1', result: 'incomplete' }),
    ];
    expect(resolveFromLifetimeRemainder(wg, dbBattles)).toBeNull();
  });
});

vi.mock('../main/services/cache', () => ({
  getWgDataCache: vi.fn(),
}));

import { getWgDataCache } from '../main/services/cache';

describe('prevFromWgDataCache', () => {
  beforeEach(() => {
    vi.mocked(getWgDataCache).mockReset();
  });

  it('returns a snapshot when cache predates the abandoned battle', () => {
    vi.mocked(getWgDataCache).mockReturnValue({
      updatedAt: 1000,
      tankStats: [{
        tank_id: 42,
        all: {
          battles: 10, wins: 5, losses: 5, draws: 0, survived_battles: 3,
          damage_dealt: 10000, frags: 8, spotted: 12, dropped_capture_points: 2, xp: 5000,
          radio_assisted_damage: 1000, track_assisted_damage: 500,
        },
      }],
      encyclopedia: {},
    });

    const prev = prevFromWgDataCache(1, 42, 2000);

    expect(prev).toEqual({
      capturedAt: 1000,
      battles: 10, wins: 5, losses: 5, draws: 0, survivedBattles: 3,
      damageDealt: 10000, frags: 8, spotted: 12, droppedCapturePoints: 2, xp: 5000,
      assistedDamage: 1500,
    });
  });

  it('returns null when cache is newer than the battle start', () => {
    vi.mocked(getWgDataCache).mockReturnValue({
      updatedAt: 3000,
      tankStats: [{ tank_id: 42, all: { battles: 11, wins: 6, damage_dealt: 12000, frags: 9, spotted: 13, dropped_capture_points: 2, xp: 5400, survived_battles: 3 } }],
      encyclopedia: {},
    });

    expect(prevFromWgDataCache(1, 42, 2000)).toBeNull();
  });
});
