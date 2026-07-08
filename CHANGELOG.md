# Changelog

## Unreleased

**Features**

- AI features (battle debrief, weekly coach, tank tips) now work out of the box for every user via a free built-in AI proxy — a Cloudflare Worker in front of Groq, rate-limited per anonymous device and globally (see `worker/README.md`). Adding a Claude API key in Settings is now optional and bypasses the proxy for unlimited, higher-quality analysis.
- Free-tier daily limits raised (50/day for debrief and tank tips, 20/day for weekly coach) now that the user base is small; the UI shows a "X free left today" counter next to each AI feature, backed by a new read-only `GET /v1/usage` Worker endpoint that doesn't consume quota
- "What's new" modal after upgrades — curated release notes on first launch of a new version; first-time setup skips it; returning users with a replays folder configured land straight in the app (no setup wizard)

**Security**

- Claude API key is now write-only: the renderer only learns whether a key is stored (`hasClaudeApiKey`), the raw key never leaves the main process
- Renderer runs with `sandbox: true`; new windows are denied and in-place navigation away from the app is blocked
- Replay parser validates declared block sizes before allocating buffers and logs parse failures with the file name
- Battle debrief payload strings (tank/map names from replays) are sanitized before being sent to Claude

**Fixes**

- `tanks:recommendations` no longer throws when called without `force` while cached recommendations exist
- Tank Detail reloads when navigating between tank pages (`/tanks/1 → /tanks/2`); sidebar highlights the Tanks item on nested routes
- `backfillMissingWnx` and battle debrief cache are now scoped per account (`battle_debriefs` migrated to a composite `(account_id, arena_id)` primary key)
- Unified win-rate color thresholds across views (single source in `shared/utils/wn8.ts`)
- Corrupted JSON rows in the SQLite cache are treated as cache misses instead of crashing IPC handlers
- Recent Battles and Analytics show visible error states with retry instead of hanging spinners

**Tooling**

- New CI workflow (lint + typecheck + tests on push/PR)
- `.vue` files are linted (`eslint-plugin-vue`); Vitest coverage via `npm run test:coverage`
- Removed dead files and parameters (duplicate Vite config, unused store/CSS, unused `quick`/`playerName` parameters)

**Architecture**

- `handlers.ts` slimmed down to validation + delegation: WG data caching/WN8 enrichment moved to `services/wg-data.ts`, replay scan orchestration to `services/replay-scan.ts`
- `cache.ts` split into repositories (`repos/battles-repo`, `repos/snapshots-repo`, `repos/api-cache-repo`) and read-only `battle-analytics.ts`; `cache.ts` remains as a facade
- Database migrations are now numbered and tracked with `PRAGMA user_version`
- Wargaming API calls retry transient failures (network errors, 5xx, 429) with exponential backoff; the vehicle encyclopedia is fetched only for owned tank IDs
- Vehicle tag parsing deduplicated into `shared/utils/vehicles.ts`; renderer-facing types live in `shared/types`
- AI system prompts moved to `shared/ai/prompts.ts` so the Electron app and the Cloudflare Worker proxy share one source of truth; JSON response parsing extracted to `services/ai-json.ts`; new `services/ai-gateway.ts` dispatches each AI call to Claude (own key) or the free proxy (`services/free-ai.ts` + `services/device-id.ts`)

**UI/UX**

- Central battle-data invalidation: Dashboard, Analytics and Recent Battles reload automatically after scans, battle resets and player switches
- Player switching no longer reloads the whole window
- Auto-scan runs only while the Dashboard is the active view; only data-heavy views are kept alive
- Toast notifications replace `alert()` dialogs
- Battle debrief modal is accessible (dialog role, focus trap, Escape to close); sidebar navigation exposes `aria-current`
- Routes are lazy-loaded and unknown paths show a 404 page
- Shared tank display constants (class icons, nation flags, mastery badges) and a common async-list composable for News/Patches

## v1.11.1

- fix(ai): enforce authoritative performance labels and prevent contradictory advice
- refactor(ai): group AI features in `src/main/ai/`, keep `claude.ts` as pure infrastructure

## v1.11.0

**New Features**

- **AI weekly coach** — actionable 7-day performance analysis (focus/rest tanks, map playbook, common mistakes)
- **AI post-battle debrief** — on-demand tactical analysis of a single battle with a generic Claude helper

**Technical**

- Extracted `db.ts` (connection + schema + migrations) and `analytics.ts` from `cache.ts`
- Extracted `withAICache` helper; prompts moved out of handlers

## v1.10.7

- fix: correct WN8/WNX calculation for versioned tanks (`_v<N>` suffix) and improve scan buffer

## v1.10.6

- feat: persistent scan state and WG data caching for faster startup

## v1.10.5

- fix: partial battle resolution and auto-refresh setting persistence

## v1.10.4

- feat: quick-scan replay mode and replay library performance improvements

## v1.10.3

- perf: optimize database queries and async replay scanning

## v1.10.2

- fix(replay-parser): calculate netCredits with ammo and consumable costs

## v1.10.1

- fix: handle WoT temp replay files on Windows

## v1.10.0

- Remove manual battle stats entry; automatic cleanup of partial replays

## v1.9.1

- feat: show application version in Settings

## v1.9.0

- feat(dashboard): metric selector and session refresh integration
- feat(analytics): improved Maps tab timeframe labeling and empty states
- fix(services): correct timezone handling for session date comparisons
- fix(ipc): deduplicate in-flight WG API requests
- build: app icon for packaged builds

## v1.8.3

- fix: correct `Promise.all()` destructuring in `player:info` IPC handler
- ci: fix changelog generation in release workflow

## v1.8.2

- ci: release workflow fixes

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
