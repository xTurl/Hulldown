import { describe, it, expect } from 'vitest';
import { compareVersions } from '../shared/utils/semver';
import { getReleaseNotesSince } from '../shared/release-notes';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.12.0', '1.12.0')).toBe(0);
  });

  it('returns 1 when first version is greater', () => {
    expect(compareVersions('1.12.0', '1.11.1')).toBe(1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('returns -1 when first version is smaller', () => {
    expect(compareVersions('1.10.0', '1.11.0')).toBe(-1);
  });

  it('handles different segment counts', () => {
    expect(compareVersions('1.12', '1.12.0')).toBe(0);
    expect(compareVersions('1.12.1', '1.12')).toBe(1);
  });
});

describe('getReleaseNotesSince', () => {
  it('returns notes newer than lastSeen and not above current', () => {
    const notes = getReleaseNotesSince('1.11.0', '1.12.0');
    expect(notes.some(n => n.version === '1.12.0')).toBe(true);
    expect(notes.every(n => compareVersions(n.version, '1.12.0') <= 0)).toBe(true);
  });

  it('returns nothing when already on current version', () => {
    expect(getReleaseNotesSince('1.12.0', '1.12.0')).toEqual([]);
  });

  it('treats empty lastSeen as a fresh baseline', () => {
    const notes = getReleaseNotesSince('', '1.12.0');
    expect(notes.length).toBeGreaterThan(0);
  });
});
