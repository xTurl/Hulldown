# Hulldown

AI-powered desktop companion for World of Tanks. Tracks your battles from replay files, shows detailed statistics (WN8/WNX, per-tank, per-map, economy, sessions), and provides AI-driven analysis of individual battles, tanks, and weekly performance.

## Features

- **Battle tracking** — incremental scanning of your `.wotreplay` folder into a local SQLite database, including abandoned battles and multi-account setups
- **Statistics** — overall and per-tank WN8/WNX (real XVM expected values), win rates, map stats, session summaries, credit economy charts
- **AI analysis** — per-battle debriefs, per-tank recommendations, and weekly coach reports. Works out of the box for every user via a free built-in AI proxy (rate-limited); users can add their own Claude API key in Settings for unlimited, higher-quality analysis
- **News & patches** — official WoT news and update feeds in-app
- **Auto-detection** — player name, account ID, and region detected straight from your replays; instant switching between multiple detected accounts

## Requirements

- Node.js 22+
- A [Wargaming application ID](https://developers.wargaming.net/applications/) (build-time, for the WG API)
- Nothing else required for AI — it works by default via the free built-in AI proxy. Optionally, an [Anthropic API key](https://console.anthropic.com/settings/keys) (runtime, entered in app Settings) for unlimited/higher-quality AI

## Getting started

```bash
git clone <repo-url> && cd Hulldown
cp .env.example .env      # then put your Wargaming application ID in .env
npm install               # also rebuilds better-sqlite3 for Electron
npm start                 # launch in dev mode
```

On first launch, the setup wizard asks for your replays directory (e.g. `.../World of Tanks/replays`), detects your player account from replay files, and optionally accepts a Claude API key.

### API keys

- **`WG_API_KEY`** (`.env`) — Wargaming application ID, embedded at build time by Vite. Required for player/tank statistics.
- **`AI_PROXY_URL`** (`.env`) — base URL of the deployed free-AI Cloudflare Worker proxy (see [`worker/README.md`](worker/README.md)). Powers AI features for users without their own key. If you're just running the app locally without deploying your own Worker, leave it empty and add your own Claude key instead.
- **Claude API key** (optional) — entered at runtime in *Settings → AI*. Stored encrypted with Electron `safeStorage` (OS keychain); the raw key never leaves the Electron main process. Bypasses the free AI proxy entirely for unlimited use.

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Run the app in development mode (Vite + Electron Forge) |
| `npm run lint` | ESLint over all sources, including `.vue` files |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Tests with V8 coverage report |
| `npm run make` | Build platform installers (Squirrel/Windows, Deb, ZIP) |
| `npm run release` | Version bump + release via release-it |

## Architecture

Electron app with three isolated layers:

```
src/
├── main/               # Electron main process (Node)
│   ├── index.ts        # window bootstrap, security (sandbox, navigation guards)
│   ├── ipc/            # IPC handlers + input validators
│   ├── services/       # SQLite (db, cache), Wargaming API, replay parser, config
│   │                   # (safeStorage), Claude client, free-AI proxy client + gateway,
│   │                   # device id, news/patches, updater
│   └── ai/             # AI features: battle debrief, tank recommendations, weekly coach
├── preload/            # contextBridge — exposes a typed, whitelisted window.api
├── renderer/           # Vue 3 + Pinia + Tailwind UI (no Node access, sandboxed)
│   ├── views/          # routed pages (Dashboard, Tanks, Analytics, Coach, ...)
│   ├── components/     # shared components
│   └── stores/         # Pinia stores
└── shared/             # types and pure utilities used by both processes (WN8 math,
                         # map names, AI system prompts)

worker/                 # Cloudflare Worker: free built-in AI proxy (see worker/README.md)
```

Key decisions:

- **Security**: `contextIsolation` + `sandbox`, no `nodeIntegration`, CSP, Electron Fuses, protocol allowlist for external links, write-only API key channel
- **Data**: single local SQLite DB (WAL mode) in the user data dir; WG API responses cached in memory + SQLite (1 h TTL); AI results cached per battle/tank/week
- **Replays**: incremental scan driven by filename timestamps with a safety buffer; partial (abandoned) battles are resolved once WoT rewrites the replay file
- **AI**: `ai-gateway.ts` routes each request to the user's own Claude key when configured, or to the free built-in AI proxy (Cloudflare Worker → Groq) otherwise — see [`worker/README.md`](worker/README.md) for how the free tier is rate-limited and deployed

## Tests

Unit tests live in `src/__tests__/` and cover WN8/WNX math, the replay parser, cache/repository logic, IPC validators, and AI handler flows including the Claude/free-AI gateway dispatch (~290 tests). Run with `npm test`.

## CI / Releases

- `CI` workflow: lint + typecheck + tests on every push/PR to `main`
- `release.yml` / `build-windows.yml`: build and publish installers to the releases repo; the in-app updater checks GitHub releases for new versions
