/**
 * getIsoWeek() unit tests — edge cases, year boundaries, week 53
 */
import { describe, it, expect } from 'vitest';
import { getIsoWeek } from '../shared/utils/dates';

/** Parse 'YYYY-MM-DD' as local midnight ms. */
function d(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
}

describe('getIsoWeek', () => {

  // Normal mid-year cases
  it('returns correct week for a typical Monday', () => {
    // 2026-04-13 is a Monday — W16
    expect(getIsoWeek(d('2026-04-13'))).toBe('2026-W16');
  });

  it('returns correct week for a Thursday', () => {
    // 2026-04-16 is a Thursday — W16
    expect(getIsoWeek(d('2026-04-16'))).toBe('2026-W16');
  });

  it('returns correct week for a Sunday', () => {
    // 2026-04-19 is a Sunday — still W16 (ISO week ends Sunday)
    expect(getIsoWeek(d('2026-04-19'))).toBe('2026-W16');
  });

  it('advances week correctly on Monday after Sunday', () => {
    // 2026-04-20 is a Monday — W17
    expect(getIsoWeek(d('2026-04-20'))).toBe('2026-W17');
  });

  // Year-boundary: Jan 1 may belong to previous year's last week
  it('Jan 1 2016 (Friday) belongs to 2015-W53', () => {
    // 2015 has 53 ISO weeks; Jan 1 2016 is a Friday → still W53 of 2015
    expect(getIsoWeek(d('2016-01-01'))).toBe('2015-W53');
  });

  it('Jan 4 2016 (Monday) belongs to 2016-W01', () => {
    // Jan 4 is always in W01 of the ISO year
    expect(getIsoWeek(d('2016-01-04'))).toBe('2016-W01');
  });

  it('Dec 28 2015 (Monday) belongs to 2015-W53', () => {
    expect(getIsoWeek(d('2015-12-28'))).toBe('2015-W53');
  });

  it('Jan 1 2018 (Monday) belongs to 2018-W01', () => {
    expect(getIsoWeek(d('2018-01-01'))).toBe('2018-W01');
  });

  // Dec 31 may belong to next year's W01
  it('Dec 31 2018 (Monday) belongs to 2019-W01', () => {
    // Dec 31 2018 is a Monday, and its Thursday is Jan 3 2019 → 2019-W01
    expect(getIsoWeek(d('2018-12-31'))).toBe('2019-W01');
  });

  // Week 53 in a year that has it
  it('Dec 31 2015 (Thursday) belongs to 2015-W53', () => {
    expect(getIsoWeek(d('2015-12-31'))).toBe('2015-W53');
  });

  it('Dec 28 2020 (Monday) belongs to 2020-W53', () => {
    // 2020 has 53 ISO weeks
    expect(getIsoWeek(d('2020-12-28'))).toBe('2020-W53');
  });

  it('Jan 3 2021 (Sunday) belongs to 2020-W53', () => {
    expect(getIsoWeek(d('2021-01-03'))).toBe('2020-W53');
  });

  it('Jan 4 2021 (Monday) belongs to 2021-W01', () => {
    expect(getIsoWeek(d('2021-01-04'))).toBe('2021-W01');
  });

  // Pads week number to 2 digits
  it('pads week number to 2 digits for single-digit weeks', () => {
    // 2026-01-05 is a Monday in W02
    expect(getIsoWeek(d('2026-01-05'))).toBe('2026-W02');
  });

  it('W01 is padded correctly', () => {
    expect(getIsoWeek(d('2026-01-01'))).toBe('2026-W01');
  });

  // Specific known dates cross-checked with ISO 8601
  it('2023-01-02 (Monday) is 2023-W01', () => {
    expect(getIsoWeek(d('2023-01-02'))).toBe('2023-W01');
  });

  it('2023-01-01 (Sunday) is 2022-W52', () => {
    // Jan 1 2023 is Sunday → week belongs to 2022 (its Thursday is in 2022)
    expect(getIsoWeek(d('2023-01-01'))).toBe('2022-W52');
  });

  it('2022-01-01 (Saturday) is 2021-W52', () => {
    expect(getIsoWeek(d('2022-01-01'))).toBe('2021-W52');
  });

  it('2022-01-03 (Monday) is 2022-W01', () => {
    expect(getIsoWeek(d('2022-01-03'))).toBe('2022-W01');
  });
});
