import type { ReleaseNote } from './types';
import { compareVersions } from './utils/semver';

export type { ReleaseNote };

/**
 * Curated, user-facing release notes bundled with the app. Add a new entry
 * when cutting a release; the "What's new" modal shows every note with
 * version > lastSeenVersion and version <= app.getVersion().
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.12.0',
    title: 'Free AI & smarter battle tracking',
    highlights: [
      'Coach, battle debrief, and tank tips work out of the box — no Claude API key required',
      'Abandoned battles now show damage, credits, and other stats (filled from the Wargaming API)',
      'Daily free AI counter so you always know how many debriefs and reports are left',
      'Add your own Claude key in Settings anytime for unlimited, higher-quality AI',
      'Toast notifications instead of popup alerts; battle lists refresh automatically after scans',
    ],
  },
];

export function getReleaseNotesSince(lastSeenVersion: string, currentVersion: string): ReleaseNote[] {
  const baseline = lastSeenVersion || '0.0.0';
  return RELEASE_NOTES
    .filter(
      note =>
        compareVersions(note.version, baseline) > 0
        && compareVersions(note.version, currentVersion) <= 0,
    )
    .sort((a, b) => compareVersions(a.version, b.version));
}
