import { describe, it, expect } from 'vitest';
import {
  calculateWn8,
  calculateWnx,
  getWn8Color,
  getWn8Label,
  getWrColor,
  type Wn8Expected,
} from '../shared/utils/wn8';

// Sample expected values matching an average tier-8 tank
const AVG_EXP: Wn8Expected = {
  expDmg: 780,
  expFrag: 0.62,
  expSpot: 0.91,
  expDef: 0.43,
  expWinRate: 0.474,
};

// ---------------------------------------------------------------------------
// calculateWn8 — without expected values (fallback approximation)
// ---------------------------------------------------------------------------
describe('calculateWn8 (no expected values)', () => {
  it('returns 0 for 0 battles', () => {
    expect(calculateWn8({ battles: 0, wins: 0, damage_dealt: 0, frags: 0, spotted: 0, dropped_capture_points: 0 })).toBe(0);
  });

  it('is always non-negative', () => {
    expect(calculateWn8({ battles: 100, wins: 10, damage_dealt: 1000, frags: 0, spotted: 0, dropped_capture_points: 0 })).toBeGreaterThanOrEqual(0);
  });

  it('returns a round integer', () => {
    const result = calculateWn8({ battles: 100, wins: 50, damage_dealt: 150_000, frags: 50, spotted: 50, dropped_capture_points: 200 });
    expect(Number.isInteger(result)).toBe(true);
  });

  it('higher damage & winrate → higher wn8', () => {
    const low  = calculateWn8({ battles: 100, wins: 45, damage_dealt:  50_000, frags: 50, spotted: 50, dropped_capture_points: 200 });
    const high = calculateWn8({ battles: 100, wins: 65, damage_dealt: 300_000, frags: 50, spotted: 50, dropped_capture_points: 200 });
    expect(high).toBeGreaterThan(low);
  });
});

// ---------------------------------------------------------------------------
// calculateWn8 — with expected values (real formula)
// ---------------------------------------------------------------------------
describe('calculateWn8 (with expected values)', () => {
  it('returns 0 for 0 battles', () => {
    expect(calculateWn8({ battles: 0, wins: 0, damage_dealt: 0, frags: 0, spotted: 0, dropped_capture_points: 0 }, AVG_EXP)).toBe(0);
  });

  it('is always non-negative', () => {
    expect(calculateWn8({ battles: 100, wins: 5, damage_dealt: 500, frags: 0, spotted: 0, dropped_capture_points: 0 }, AVG_EXP)).toBeGreaterThanOrEqual(0);
  });

  it('returns a round integer', () => {
    const result = calculateWn8({ battles: 100, wins: 50, damage_dealt: 150_000, frags: 50, spotted: 50, dropped_capture_points: 200 }, AVG_EXP);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('player doing exactly expected values yields ~1600 WN8 (per XVM calibration)', () => {
    // Per the XVM formula, ratio=1.0 for all metrics produces ~1623:
    //   rDmgN=1.0 → 980, rFragN=1.2 → 252, rSpotN=1.1 → 170, rDefN=1.0 → 75, rWinN=1.0 → 145
    // "Average" real-world players achieve roughly 75% of expected values, giving ~900–1100 WN8.
    const stats = {
      battles: 1000,
      wins: Math.round(1000 * AVG_EXP.expWinRate),
      damage_dealt: Math.round(1000 * AVG_EXP.expDmg),
      frags: Math.round(1000 * AVG_EXP.expFrag),
      spotted: Math.round(1000 * AVG_EXP.expSpot),
      dropped_capture_points: Math.round(1000 * AVG_EXP.expDef),
    };
    const result = calculateWn8(stats, AVG_EXP);
    expect(result).toBeGreaterThan(1500);
    expect(result).toBeLessThan(1750);
  });

  it('high performer (2× expected) yields significantly above average', () => {
    const stats = {
      battles: 1000,
      wins: Math.round(1000 * AVG_EXP.expWinRate * 1.2),
      damage_dealt: Math.round(1000 * AVG_EXP.expDmg * 2),
      frags: Math.round(1000 * AVG_EXP.expFrag * 2),
      spotted: Math.round(1000 * AVG_EXP.expSpot * 2),
      dropped_capture_points: Math.round(1000 * AVG_EXP.expDef * 2),
    };
    expect(calculateWn8(stats, AVG_EXP)).toBeGreaterThan(2000);
  });

  it('very poor performer (0.3× expected) yields below average', () => {
    const stats = {
      battles: 1000,
      wins: Math.round(1000 * AVG_EXP.expWinRate * 0.7),
      damage_dealt: Math.round(1000 * AVG_EXP.expDmg * 0.3),
      frags: Math.round(1000 * AVG_EXP.expFrag * 0.3),
      spotted: Math.round(1000 * AVG_EXP.expSpot * 0.3),
      dropped_capture_points: 0,
    };
    expect(calculateWn8(stats, AVG_EXP)).toBeLessThan(600);
  });

  it('higher damage & winrate → higher wn8', () => {
    const low  = calculateWn8({ battles: 100, wins: 45, damage_dealt:  50_000, frags: 50, spotted: 50, dropped_capture_points: 200 }, AVG_EXP);
    const high = calculateWn8({ battles: 100, wins: 65, damage_dealt: 300_000, frags: 50, spotted: 50, dropped_capture_points: 200 }, AVG_EXP);
    expect(high).toBeGreaterThan(low);
  });
});

// ---------------------------------------------------------------------------
// calculateWnx
// ---------------------------------------------------------------------------
describe('calculateWnx', () => {
  it('returns 0 for 0 battles', () => {
    expect(calculateWnx({ battles: 0, wins: 0, damage_dealt: 0, frags: 0, spotted: 0, dropped_capture_points: 0 })).toBe(0);
  });

  it('is always non-negative', () => {
    expect(calculateWnx({ battles: 100, wins: 5, damage_dealt: 500, frags: 0, spotted: 0, dropped_capture_points: 0 })).toBeGreaterThanOrEqual(0);
  });

  it('equals calculateWn8 when there is no assisted damage (no exp)', () => {
    const stats = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 60, spotted: 40, dropped_capture_points: 300 };
    expect(calculateWnx(stats)).toBe(calculateWn8(stats));
  });

  it('is higher than wn8 when assisted damage is present (no exp)', () => {
    const base       = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 60, spotted: 40, dropped_capture_points: 300 };
    const withAssist = { ...base, avg_damage_assisted_radio: 500, avg_damage_assisted_track: 200 };
    expect(calculateWnx(withAssist)).toBeGreaterThan(calculateWn8(base));
  });

  it('equals calculateWn8 when there is no assisted damage (with exp)', () => {
    const stats = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 60, spotted: 40, dropped_capture_points: 300 };
    expect(calculateWnx(stats, AVG_EXP)).toBe(calculateWn8(stats, AVG_EXP));
  });

  it('is higher than wn8 when assisted damage is present (with exp)', () => {
    const base       = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 60, spotted: 40, dropped_capture_points: 300 };
    const withAssist = { ...base, avg_damage_assisted_radio: 500, avg_damage_assisted_track: 200 };
    expect(calculateWnx(withAssist, AVG_EXP)).toBeGreaterThan(calculateWn8(base, AVG_EXP));
  });

  it('uses avg_damage_assisted as fallback when avg_damage_assisted_radio is absent', () => {
    const stats      = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 0, spotted: 0, dropped_capture_points: 0, avg_damage_assisted: 400 };
    const statsRadio = { ...stats, avg_damage_assisted: undefined, avg_damage_assisted_radio: 400 };
    expect(calculateWnx(stats)).toBe(calculateWnx(statsRadio));
  });
});

// ---------------------------------------------------------------------------
// getWn8Color
// ---------------------------------------------------------------------------
describe('getWn8Color', () => {
  const cases: Array<[number, string]> = [
    [0,    '#dd2222'],
    [100,  '#dd2222'],
    [101,  '#dd5533'],
    [200,  '#dd5533'],
    [201,  '#dd7700'],
    [400,  '#dd7700'],
    [401,  '#ddaa00'],
    [600,  '#ddaa00'],
    [601,  '#ddcc00'],
    [800,  '#ddcc00'],
    [801,  '#aacc00'],
    [1000, '#aacc00'],
    [1001, '#66cc22'],
    [1300, '#66cc22'],
    [1301, '#33aa33'],
    [1600, '#33aa33'],
    [1601, '#228844'],
    [1800, '#228844'],
    [1801, '#22bbdd'],
    [2000, '#22bbdd'],
    [2001, '#2299ee'],
    [2200, '#2299ee'],
    [2201, '#1166cc'],
    [2300, '#1166cc'],
    [2301, '#aa77ff'],
    [2400, '#aa77ff'],
    [2401, '#9955ff'],
    [2600, '#9955ff'],
    [2601, '#7733ee'],
    [3100, '#7733ee'],
    [3101, '#6622cc'],
    [4000, '#6622cc'],
    [4001, '#bb44ff'],
    [9999, '#bb44ff'],
  ];

  it.each(cases)('wn8=%i → %s', (wn8, expected) => {
    expect(getWn8Color(wn8)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getWn8Label
// ---------------------------------------------------------------------------
describe('getWn8Label', () => {
  it('returns "Very Bad" for 0',           () => expect(getWn8Label(0)).toBe('Very Bad'));
  it('returns "Bad" for 300',              () => expect(getWn8Label(300)).toBe('Bad'));
  it('returns "Below Average" for 450',    () => expect(getWn8Label(450)).toBe('Below Average'));
  it('returns "Average" for 650',          () => expect(getWn8Label(650)).toBe('Average'));
  it('returns "Above Average" for 900',    () => expect(getWn8Label(900)).toBe('Above Average'));
  it('returns "Good" for 1200',            () => expect(getWn8Label(1200)).toBe('Good'));
  it('returns "Very Good" for 1600',       () => expect(getWn8Label(1600)).toBe('Very Good'));
  it('returns "Great" for 1900',           () => expect(getWn8Label(1900)).toBe('Great'));
  it('returns "Unicum" for 2350',          () => expect(getWn8Label(2350)).toBe('Unicum'));
  it('returns "Super Unicum" for 2900',    () => expect(getWn8Label(2900)).toBe('Super Unicum'));
});

// ---------------------------------------------------------------------------
// getWrColor
// ---------------------------------------------------------------------------
describe('getWrColor', () => {
  it('below 46 → red',    () => expect(getWrColor(45)).toBe('#cd3333'));
  it('46 → orange',       () => expect(getWrColor(46)).toBe('#d77900'));
  it('49 → yellow',       () => expect(getWrColor(49)).toBe('#d7b600'));
  it('52 → green',        () => expect(getWrColor(52)).toBe('#4d7326'));
  it('56 → teal',         () => expect(getWrColor(56)).toBe('#4099b4'));
  it('60 → purple',       () => expect(getWrColor(60)).toBe('#793db6'));
});
