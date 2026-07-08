# Hulldown AI proxy

A small Cloudflare Worker that gives every Hulldown user working AI features
(battle debrief, weekly coach, tank tips) **without needing their own API
key**. It sits in front of [Groq](https://groq.com)'s free-tier API, so:

- The real Groq API key never ships inside the Electron app (it would get
  extracted from the bundle in minutes — client apps can't hold secrets).
- Each install gets a fair daily quota (tracked by an anonymous, random
  device id — never tied to a WoT account) so no single user can exhaust the
  shared free budget for everyone else.
- A global daily cap per model keeps total usage safely under Groq's own
  free-tier request limits.
- Users who want unlimited, higher-quality AI can still add their own Claude
  API key in Settings — that path bypasses this proxy entirely and talks to
  Anthropic directly from the app.

The Worker is intentionally "dumb" on purpose: it only accepts a `feature`
name (`debrief` | `weekly-coach` | `tank-tips`), a device id, and the
pre-built user message content. The **system prompt, model, and token limit
are hardcoded per feature inside the Worker** (imported straight from
[`src/shared/ai/prompts.ts`](../src/shared/ai/prompts.ts), the same file the
Electron app uses for the BYO-key path) — this stops anyone who rebuilds the
app from pointing it at your Worker to run arbitrary prompts on your quota.

## One-time setup

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
and a free [Groq API key](https://console.groq.com/keys) (no credit card
required for either).

```bash
cd worker
npm install

# Log in to Cloudflare (opens a browser window)
npx wrangler login

# Create the D1 database used for rate-limit tracking
npm run db:create
# → copy the printed database_id into wrangler.toml (database_id = "...")

# Apply the schema to the database you just created
npm run db:migrate:remote

# Store your Groq API key as a Worker secret (never committed to git)
npx wrangler secret put GROQ_API_KEY
# → paste your key when prompted

# Deploy
npm run deploy
```

Wrangler prints the deployed URL, e.g. `https://hulldown-ai-proxy.<your-subdomain>.workers.dev`.

## Wire it up to the app

In the repo root `.env` (see `.env.example`):

```
AI_PROXY_URL=https://hulldown-ai-proxy.<your-subdomain>.workers.dev
```

Rebuild/restart the app — battle debrief, weekly coach, and tank tips now
work for every user by default, with no key required. Leaving `AI_PROXY_URL`
empty disables the free tier entirely (users will see a message asking them
to add their own Claude API key).

## Tuning the free tier

Per-device and global daily caps live in `FEATURE_CONFIG` in
[`src/index.ts`](./src/index.ts). Current defaults (generous while the user
base is small):

| Feature       | Per-device/day | Global/day (shared) |
|---------------|----------------|----------------------|
| `debrief`     | 50             | 13,000 (shared with `tank-tips`, same model) |
| `tank-tips`   | 50             | 13,000 (shared with `debrief`, same model) |
| `weekly-coach`| 20             | 900                  |

These stay safely under Groq's published free-tier limits (as of mid-2026:
`llama-3.1-8b-instant` — 14,400 requests/day account-wide; `llama-3.3-70b-versatile`
— 1,000/day). Check your actual limits at
[console.groq.com/settings/limits](https://console.groq.com/settings/limits)
and lower `globalDailyCap` if the user base grows and you're running close to
the edge, or raise it if Groq raises your limits.

## Checking usage without consuming quota

`GET /v1/usage?deviceId=<id>` returns today's per-feature usage for a device
(used/limit/remaining) plus whether the shared global budget for each
feature's model is still available — without calling Groq or incrementing
any counter. The Electron app uses this to show "X free left today" in the
UI (`ai:usage` IPC channel → `getFreeAIUsage()` in
[`src/main/services/free-ai.ts`](../src/main/services/free-ai.ts)).

## Local development

```bash
npm run db:migrate:local   # apply schema to a local D1 instance
npm run dev                # wrangler dev, with GROQ_API_KEY read from .dev.vars
```

Create `worker/.dev.vars` (already gitignored) with:

```
GROQ_API_KEY=your_groq_key_here
```

## Monitoring

```bash
npm run tail   # live-stream logs from the deployed Worker
```

Cloudflare's dashboard (Workers & Pages → hulldown-ai-proxy) shows request
counts, errors, and CPU time against the free plan's daily limits.
