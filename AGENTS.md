# Hulldown — project map (for AI agents)

Quick navigation for this repository. User-facing docs: [`README.md`](README.md).

## What this project is

Desktop **Electron + Vue 3** app for World of Tanks: scans replay files (`.wotreplay`), stores stats in **SQLite**, fetches data from the **Wargaming API**, and provides **AI** analysis (user's own Claude key or a free proxy via Cloudflare Worker).

## Tech stack

| Layer | Technologies |
|-------|--------------|
| Shell | Electron 41, Electron Forge 7, Vite 8 |
| UI | Vue 3, Pinia, Vue Router, Tailwind 4 |
| Main | TypeScript, better-sqlite3, Zod (IPC validation) |
| AI | `@anthropic-ai/sdk`, Groq via Worker |
| Tests | Vitest |
| Worker | Cloudflare Workers + D1 (`worker/`) |

## Directory structure

```
Hulldown/
├── src/
│   ├── main/                    # Electron main process (Node)
│   │   ├── index.ts             # Window, sandbox, navigation, IPC registration
│   │   ├── ipc/
│   │   │   ├── handlers.ts      # ★ All IPC channels (single file)
│   │   │   └── validators.ts    # IPC input validation (Zod)
│   │   ├── ai/                  # Per-feature AI logic (prompts → gateway)
│   │   │   ├── battle-debrief.ts
│   │   │   ├── tank-recommendations.ts
│   │   │   └── weekly-coach.ts
│   │   └── services/
│   │       ├── db.ts            # ★ SQLite schema, migrations, getDb()
│   │       ├── cache.ts         # API + AI cache (memory and DB)
│   │       ├── config.ts        # User config (replaysDir, account, Claude key)
│   │       ├── replay-parser.ts # Binary .wotreplay parser
│   │       ├── replay-scan.ts   # Incremental replay folder scan
│   │       ├── abandoned-backfill.ts  # Fill abandoned battle stats from WG API
│   │       ├── wargaming.ts     # WG API client (player, stats)
│   │       ├── wg-data.ts       # Encyclopedia / expected values (WN8/WNX)
│   │       ├── ai-gateway.ts    # ★ Routes: Claude vs free AI
│   │       ├── free-ai.ts       # Proxy client + usage counter
│   │       ├── claude.ts        # Anthropic client (infra only)
│   │       ├── device-id.ts     # Per-device ID (free AI rate limits)
│   │       ├── app-state.ts     # lastSeenVersion ("What's new" modal)
│   │       ├── analytics.ts     # Aggregates: maps, tanks, economy, sessions
│   │       ├── battle-analytics.ts
│   │       ├── news.ts / patches.ts / updater.ts
│   │       └── repos/           # SQL layer (battles, snapshots, api-cache)
│   ├── preload/
│   │   └── index.ts             # ★ contextBridge → window.api (types in global.d.ts)
│   ├── renderer/                # UI (sandboxed, no Node)
│   │   ├── App.vue              # Setup vs app, What's new modal, update banner
│   │   ├── router/index.ts      # SPA routes
│   │   ├── stores/              # Pinia: config, player, scan, tanks, theme, toast
│   │   ├── views/               # Pages (Dashboard, TankDetail, Coach, …)
│   │   ├── components/          # Modals, Sidebar, RecentBattles, toasts, …
│   │   └── composables/         # useAsyncData, useBattlesInvalidation
│   ├── shared/                  # Code shared main ↔ renderer (imported both sides)
│   │   ├── types/index.ts       # ★ Domain types (Battle, Tank, WhatsNewInfo, …)
│   │   ├── types/global.d.ts    # window.api typing
│   │   ├── ai/prompts.ts        # ★ AI system prompts (shared with Worker)
│   │   ├── release-notes.ts     # "What's new" modal copy
│   │   └── utils/               # WN8, semver, mapNames, vehicles, wgErrors, …
│   └── __tests__/               # Vitest (flat layout, name = feature)
├── worker/                      # Cloudflare Worker — AI proxy + D1 rate limits
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── README.md
├── scripts/
│   └── patch-packager-unzip.mjs # Postinstall: fix extract-zip on Node 26
├── forge.config.ts              # Forge: Vite, Fuses, makers (ZIP linux, Squirrel win)
├── vite.main.config.ts          # Main build; define WG_API_KEY, AI_PROXY_URL
├── vite.preload.config.ts
├── vite.renderer.config.mts     # Vue + Tailwind
├── assets/                      # App icons
├── .env / .env.example          # WG_API_KEY, AI_PROXY_URL (build-time)
└── .nvmrc                       # Node 22 recommended; Node 26 needs the patch
```

## Data flows (short)

```
.wotreplay folder
    → replay-scan.ts → replay-parser.ts → battles-repo → SQLite
    → abandoned-backfill.ts (WG API when stats are missing)

WG API ← wargaming.ts / wg-data.ts ← cache (memory + api-cache-repo)

UI (Vue) ──window.api──► preload ──IPC──► handlers.ts ──► services/
AI request → ai/*.ts → ai-gateway.ts → claude.ts OR free-ai.ts → Worker → Groq
```

## IPC — where to look

Everything in `src/main/ipc/handlers.ts`, exposed in `src/preload/index.ts`, typed in `src/shared/types/global.d.ts`.

| Prefix | Examples | Service |
|--------|----------|---------|
| `config:` | get, save | config.ts |
| `player:` | search, info, detect | wargaming, replay-scan |
| `replays:` | scan, list, map-stats, economy | replay-scan, analytics |
| `tanks:` | list, details, recommendations | cache, ai/tank-recommendations |
| `battle:` | debrief | ai/battle-debrief |
| `coach:` | weekly-report, report-history | ai/weekly-coach |
| `ai:` | usage | free-ai.ts |
| `cache:` | clear, clearMem, stats | cache.ts |
| `app:` | version, whats-new, mark-version-seen | app-state, release-notes |
| `shell:` | openExternal | URL validation in handlers |

New IPC channel: handler → preload → `global.d.ts` → (optional) test in `src/__tests__/`.

## On-disk user files (Linux)

| Path | Contents |
|------|----------|
| `~/.config/hulldown/config.json` | replaysDir, accountId, region, hasClaudeApiKey |
| `~/.config/hulldown/app-state.json` | `lastSeenVersion` (What's new modal) |
| `~/.config/hulldown/hulldown.db` | SQLite (battles, cache, AI) |
| Claude API key | Electron `safeStorage` (OS keychain), not a plain file |

## Build and run

```bash
npm install          # postinstall: packager patch + electron-rebuild better-sqlite3
npm start            # dev (Forge + Vite HMR)
npm test             # vitest
npm run package      # → out/hulldown-linux-x64/hulldown
npm run start:packaged
npm run make         # requires `zip` on Arch: sudo pacman -S zip
```

**Known gotchas:**

- **Node 26** — `extract-zip` hangs at "Copying files"; fixed by `scripts/patch-packager-unzip.mjs` (postinstall).
- **`npm run make` on Arch** — missing `zip` → `spawn zip ENOENT`; install `zip` or use `npm run package`.
- **Artifacts** — `out/`, `out-test/`, `out-test-raw/`, `.vite/` are in `.gitignore`.
- **MakerDeb** — disabled by default (needs `dpkg`/`fakeroot`); use `npm run make:deb` separately.

## Where to change things (cheat sheet)

| Task | Files |
|------|-------|
| New UI page | `src/renderer/views/`, route in `router/index.ts`, link in `Sidebar.vue` |
| New IPC channel | `handlers.ts`, `preload/index.ts`, `global.d.ts` |
| DB schema / migration | `src/main/services/db.ts` |
| AI prompt | `src/shared/ai/prompts.ts` (+ `worker/src/index.ts` if same prompt) |
| Free AI limits | `worker/src/index.ts`, deploy Worker |
| What's new modal | `release-notes.ts`, `WhatsNewModal.vue`, `app-state.ts`, `handlers.ts` (app:whats-new) |
| New release version | `package.json` version, entry in `release-notes.ts`, `CHANGELOG.md` |
| Styling / theme | Tailwind in components; `stores/theme.ts` |
| WG API | `wargaming.ts`, `wg-data.ts`; key in `.env` → `vite.main.config.ts` define |

## Code conventions

- **Security:** renderer runs sandboxed; no `nodeIntegration`; Claude key never reaches the renderer.
- **Multi-account:** most SQL queries filter by `account_id` from config.
- **Cache:** `cache:clear` clears API/AI cache, **not** battles; full replay reset → `replays:clear`.
- **Tests:** colocated by feature (`*-handler.test.ts`, `free-ai.test.ts`); fake DB in cache/debrief tests.
- **Import alias:** `@/` → `src/` (main) or `src/renderer/` (renderer vite config).

## Related docs

- [`README.md`](README.md) — setup, API keys, architecture for humans
- [`worker/README.md`](worker/README.md) — AI proxy deploy, limits, D1
- [`CHANGELOG.md`](CHANGELOG.md) — change history
