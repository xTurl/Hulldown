# Changelog

## v1.8.1

**New Features**

- **Automatic Account ID Lookup** — When switching to players whose replay files use the old format (missing playerID field), Hulldown now automatically looks up their account ID from the Wargaming API using their player name. Includes intelligent region fallback (tries detected region first, then EU, NA, RU, ASIA) to find the right account.

**Improvements**

- **Extended Replay File Scanning** — Removed 200-file limit on replay scanning. Hulldown now scans all replay files in your folder, ensuring all unique players with replays are detected—including older replay files. No more missed players from large collections.
- **Smarter Player Switching** — Player switching logic now handles edge cases like null account IDs and provides detailed error messages when API lookups fail. Console logging added for easier debugging.
- **Player Cache Invalidation** — Player data is now cleared from cache when switching players, ensuring fresh stats are fetched from the WG API instead of showing stale data from the previous player.

**Technical**

- Added `clearPlayerInfoCache()` function in cache service
- Updated `config:save` handler to clear player info cache
- Enhanced `detectAllPlayersFromReplays()` to scan unlimited replay files
- Improved `switchPlayer()` in Sidebar.vue with WG API fallback and error handling

**Files Modified**

- `src/main/services/replay-parser.ts` — Unlimited replay scanning
- `src/main/services/cache.ts` — Added clearPlayerInfoCache()
- `src/main/ipc/handlers.ts` — Call clearPlayerInfoCache() on config save
- `src/renderer/components/Sidebar.vue` — Smart player switching with API lookup

---

## v1.8.0

**New Features**

- **Multi-player switcher** — If Hulldown detects multiple players in your replays folder, your name in the sidebar now shows a dropdown. Switch between players instantly — no manual reconfiguration needed.
- **Updates / Patches view** — New "Updates" page in the sidebar. Shows recent WoT patch notes, hotfixes, and micropatches pulled from the official feed, with filter tabs so you can find what you need fast.
- **Manual stats entry for incomplete battles** — Abandoned or bugged replays no longer have to sit as blank entries. Hit the pencil button on any incomplete battle to enter damage, frags, assist, and result manually — WN8/WNX recalculates immediately.

**Improvements**

- **Theme-aware error messages** — Error banners in the dashboard now correctly follow your light/dark theme instead of being stuck in dark mode styling.

**Fixes**

- **Replay filtering by player** — Hulldown now skips replays that belong to other players who shared the same folder. Only your battles are imported. Fully backwards-compatible with older replays.

---

## v1.7.0

- Dashboard two-column layout
- WNX promoted to primary stat row in SessionCard
- Net credits in SessionCard (replay-based sessions)
- Recent battles wrap responsively on narrow windows

## v1.6.0

- Tank type icons (WoT-style PNG) and nation flag emojis in Tanks tab, Recent Battles, and Tank Detail
- Tank Detail Maps tab auto-loads on switch
- Analytics: tooltip clarifying abandoned battles are excluded

## v1.5.1

- Fix: incomplete replay handling edge cases

## v1.5.0

- Track abandoned battles, filter from all analytics queries

## v1.4.4

- Analytics Maps tab period filter + Avg spotted column

## v1.4.3

- Fix: rebuild better-sqlite3 against Electron headers

## v1.4.2

- Fix: folder picker in Setup + force rebuild of better-sqlite3

## v1.4.1

- Fix: updater pointing to correct Hulldown-releases repo

## v1.4.0

- Auto-updater (checks GitHub releases)
- Multi-player detection from replays folder
- Economy chart in Analytics (ECharts)
- Net credits column in Recent Battles
