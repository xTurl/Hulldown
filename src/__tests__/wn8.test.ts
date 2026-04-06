import { describe, it, expect } from 'vitest';
import {
  calculateWn8,
  calculateWnx,
  getWn8Color,
  getWn8Label,
  getWrColor,
} from '../utils/wn8';

// ---------------------------------------------------------------------------
// calculateWn8
// ---------------------------------------------------------------------------
describe('calculateWn8', () => {
  it('returns 0 for 0 battles', () => {
    expect(calculateWn8({ battles: 0, wins: 0, damage_dealt: 0, frags: 0, spotted: 0, dropped_capture_points: 0 })).toBe(0);
  });

  it('is always non-negative', () => {
    // Very bad player — formula could go negative; should clamp to 0
    expect(calculateWn8({ battles: 100, wins: 10, damage_dealt: 1000, frags: 0, spotted: 0, dropped_capture_points: 0 })).toBeGreaterThanOrEqual(0);
  });

  it('returns a round integer', () => {
    const result = calculateWn8({ battles: 100, wins: 50, damage_dealt: 150_000, frags: 50, spotted: 50, dropped_capture_points: 200 });
    expect(Number.isInteger(result)).toBe(true);
  });

  it('higher damage & winrate → higher wn8', () => {
    const low = calculateWn8({ battles: 100, wins: 45, damage_dealt: 50_000, frags: 50, spotted: 50, dropped_capture_points: 200 });
    const high = calculateWn8({ battles: 100, wins: 65, damage_dealt: 300_000, frags: 50, spotted: 50, dropped_capture_points: 200 });
    expect(high).toBeGreaterThan(low);
  });

  it('matches the formula: max(0, round(dmg/battles * 0.8 + wr * 2000 - 1000))', () => {
    const stats = { battles: 200, wins: 110, damage_dealt: 400_000, frags: 100, spotted: 80, dropped_capture_points: 500 };
    const expected = Math.max(0, Math.round((400_000 / 200) * 0.8 + (110 / 200) * 2000 - 1000));
    expect(calculateWn8(stats)).toBe(expected);
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

  it('equals calculateWn8 when there is no assisted damage', () => {
    const stats = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 60, spotted: 40, dropped_capture_points: 300 };
    expect(calculateWnx(stats)).toBe(calculateWn8(stats));
  });

  it('is higher than wn8 when assisted damage is present', () => {
    const base = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 60, spotted: 40, dropped_capture_points: 300 };
    const withAssist = { ...base, avg_damage_assisted_radio: 500, avg_damage_assisted_track: 200 };
    expect(calculateWnx(withAssist)).toBeGreaterThan(calculateWn8(base));
  });

  it('uses avg_damage_assisted as fallback when avg_damage_assisted_radio is absent', () => {
    const stats = { battles: 100, wins: 55, damage_dealt: 200_000, frags: 0, spotted: 0, dropped_capture_points: 0, avg_damage_assisted: 400 };
    const statsRadio = { ...stats, avg_damage_assisted: undefined, avg_damage_assisted_radio: 400 };
    expect(calculateWnx(stats)).toBe(calculateWnx(statsRadio));
  });

  it('track assist and radio assist both contribute to effectiveDmg at 0.5 weight', () => {
    const base = { battles: 100, wins: 50, damage_dealt: 100_000, frags: 0, spotted: 0, dropped_capture_points: 0 };
    const withTrack = { ...base, avg_damage_assisted_track: 200 };
    const withRadio = { ...base, avg_damage_assisted_radio: 200 };
    expect(calculateWnx(withTrack)).toBe(calculateWnx(withRadio));
  });
});

// ---------------------------------------------------------------------------
// getWn8Color
// ---------------------------------------------------------------------------
describe('getWn8Color', () => {
  const cases: Array<[number, string]> = [
    [0, '#f05555'],
    [299, '#f05555'],
    [300, '#e88a00'],
    [449, '#e88a00'],
    [450, '#d4b800'],
    [649, '#d4b800'],
    [650, '#96b82c'],
    [899, '#96b82c'],
    [900, '#52a84a'],
    [1199, '#52a84a'],
    [1200, '#38b8d4'],
    [1599, '#38b8d4'],
    [1600, '#5590e8'],
    [1899, '#5590e8'],
    [1900, '#a05de8'],
    [2349, '#a05de8'],
    [2350, '#c264f0'],
    [2899, '#c264f0'],
    [2900, '#e040fb'],
    [9999, '#e040fb'],
  ];

  it.each(cases)('wn8=%i → %s', (wn8, expected) => {
    expect(getWn8Color(wn8)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getWn8Label
// ---------------------------------------------------------------------------
describe('getWn8Label', () => {
  it('returns "Very Bad" for 0', () => expect(getWn8Label(0)).toBe('Very Bad'));
  it('returns "Bad" for 300', () => expect(getWn8Label(300)).toBe('Bad'));
  it('returns "Below Average" for 450', () => expect(getWn8Label(450)).toBe('Below Average'));
  it('returns "Average" for 650', () => expect(getWn8Label(650)).toBe('Average'));
  it('returns "Above Average" for 900', () => expect(getWn8Label(900)).toBe('Above Average'));
  it('returns "Good" for 1200', () => expect(getWn8Label(1200)).toBe('Good'));
  it('returns "Very Good" for 1600', () => expect(getWn8Label(1600)).toBe('Very Good'));
  it('returns "Great" for 1900', () => expect(getWn8Label(1900)).toBe('Great'));
  it('returns "Unicum" for 2350', () => expect(getWn8Label(2350)).toBe('Unicum'));
  it('returns "Super Unicum" for 2900', () => expect(getWn8Label(2900)).toBe('Super Unicum'));
});

// ---------------------------------------------------------------------------
// getWrColor
// ---------------------------------------------------------------------------
describe('getWrColor', () => {
  it('below 46 → red', () => expect(getWrColor(45)).toBe('#cd3333'));
  it('46 → orange', () => expect(getWrColor(46)).toBe('#d77900'));
  it('49 → yellow', () => expect(getWrColor(49)).toBe('#d7b600'));
  it('52 → green', () => expect(getWrColor(52)).toBe('#4d7326'));
  it('56 → teal', () => expect(getWrColor(56)).toBe('#4099b4'));
  it('60 → purple', () => expect(getWrColor(60)).toBe('#793db6'));
});
