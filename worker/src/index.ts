import { BATTLE_DEBRIEF_SYSTEM, WEEKLY_COACH_SYSTEM, TANK_TIPS_SYSTEM } from '../../src/shared/ai/prompts';

export interface Env {
  DB: D1Database;
  GROQ_API_KEY: string;
}

type Feature = 'debrief' | 'weekly-coach' | 'tank-tips';

interface FeatureConfig {
  model: string;
  system: string;
  maxTokens: number;
  /** Per-device-per-day cap. Generous enough for normal use, tight enough to stop runaway loops/abuse. */
  deviceDailyCap: number;
  /** Account-wide-per-day cap, kept safely under Groq's own free-tier daily request budget for the model. */
  globalDailyCap: number;
}

// Fast, high-daily-quota model for frequent, low-stakes calls; a stronger
// model (tighter quota) for the once-a-week coach report that needs to
// synthesize a lot more data.
//
// Per-device caps are generous while the user base is small — there's a lot
// of headroom under the global caps right now. Global caps stay safely under
// Groq's actual free-tier daily request budget (as of mid-2026:
// llama-3.1-8b-instant ~14,400/day, llama-3.3-70b-versatile ~1,000/day,
// both account-wide) so they can be tightened later without code changes if
// the user base grows a lot — just lower the numbers below.
const FEATURE_CONFIG: Record<Feature, FeatureConfig> = {
  debrief: {
    model: 'llama-3.1-8b-instant',
    system: BATTLE_DEBRIEF_SYSTEM,
    maxTokens: 800,
    deviceDailyCap: 50,
    globalDailyCap: 13_000,
  },
  'tank-tips': {
    model: 'llama-3.1-8b-instant',
    system: TANK_TIPS_SYSTEM,
    maxTokens: 1000,
    deviceDailyCap: 50,
    globalDailyCap: 13_000,
  },
  'weekly-coach': {
    model: 'llama-3.3-70b-versatile',
    system: WEEKLY_COACH_SYSTEM,
    maxTokens: 2000,
    deviceDailyCap: 20,
    globalDailyCap: 900,
  },
};

const FREE_KEY_UPSELL = 'Add your own Claude API key in Settings for unlimited use.';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

async function callGroq(apiKey: string, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no content');
  return content;
}

async function recordUsage(db: D1Database, deviceId: string, day: string, feature: string, model: string): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO usage_daily (device_id, day, feature, count) VALUES (?, ?, ?, 1)
       ON CONFLICT(device_id, day, feature) DO UPDATE SET count = count + 1`,
    ).bind(deviceId, day, feature),
    db.prepare(
      `INSERT INTO usage_global (day, model, count) VALUES (?, ?, 1)
       ON CONFLICT(day, model) DO UPDATE SET count = count + 1`,
    ).bind(day, model),
  ]);
}

async function handleAIRequest(request: Request, env: Env): Promise<Response> {
  let body: { feature?: string; deviceId?: string; user?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400);
  }

  const feature = body.feature as Feature;
  if (!feature || !(feature in FEATURE_CONFIG)) {
    return json({ error: 'BAD_REQUEST', message: 'Unknown or missing feature' }, 400);
  }
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 128) : '';
  if (!deviceId) return json({ error: 'BAD_REQUEST', message: 'Missing deviceId' }, 400);
  if (typeof body.user !== 'string' || body.user.length === 0) {
    return json({ error: 'BAD_REQUEST', message: 'Missing user content' }, 400);
  }
  // Groq's own request-size limits are generous, but reject absurdly large
  // payloads outright rather than paying for a guaranteed-to-fail call.
  if (body.user.length > 20_000) {
    return json({ error: 'BAD_REQUEST', message: 'Payload too large' }, 400);
  }

  const cfg = FEATURE_CONFIG[feature];
  const day = utcDay();

  const deviceRow = await env.DB
    .prepare('SELECT count FROM usage_daily WHERE device_id = ? AND day = ? AND feature = ?')
    .bind(deviceId, day, feature)
    .first<{ count: number }>();
  if (deviceRow && deviceRow.count >= cfg.deviceDailyCap) {
    return json({
      error: 'DEVICE_LIMIT',
      message: `Free AI limit reached for today (${cfg.deviceDailyCap} ${feature.replace('-', ' ')} requests/day). Try again tomorrow, or ${FREE_KEY_UPSELL}`,
    }, 429);
  }

  const globalRow = await env.DB
    .prepare('SELECT count FROM usage_global WHERE day = ? AND model = ?')
    .bind(day, cfg.model)
    .first<{ count: number }>();
  if (globalRow && globalRow.count >= cfg.globalDailyCap) {
    return json({
      error: 'GLOBAL_LIMIT',
      message: `Free AI is at capacity for today (shared limit across all Hulldown users). Try again tomorrow, or ${FREE_KEY_UPSELL}`,
    }, 503);
  }

  let text: string;
  try {
    text = await callGroq(env.GROQ_API_KEY, cfg.model, cfg.system, body.user, cfg.maxTokens);
  } catch (e) {
    console.error('[hulldown-ai-proxy] Groq call failed:', e instanceof Error ? e.message : e);
    return json({ error: 'UPSTREAM_ERROR', message: 'AI request failed upstream. Please retry.' }, 502);
  }

  // Only count usage after a successful call — failed/rejected requests never
  // consume the shared quota.
  await recordUsage(env.DB, deviceId, day, feature, cfg.model);

  return json({ text });
}

interface FeatureUsage {
  used: number;
  limit: number;
  remaining: number;
  /** False when the shared global budget for this feature's model is exhausted for today, regardless of this device's own remaining count. */
  globalAvailable: boolean;
}

/**
 * Read-only usage lookup — never touches Groq or increments any counter, so
 * the app can show "X free debriefs left today" before the user even clicks
 * generate.
 */
async function handleUsageRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = (url.searchParams.get('deviceId') ?? '').slice(0, 128);
  if (!deviceId) return json({ error: 'BAD_REQUEST', message: 'Missing deviceId' }, 400);

  const day = utcDay();
  const features = Object.keys(FEATURE_CONFIG) as Feature[];

  const [deviceRows, globalRows] = await Promise.all([
    env.DB.prepare('SELECT feature, count FROM usage_daily WHERE device_id = ? AND day = ?')
      .bind(deviceId, day).all<{ feature: string; count: number }>(),
    env.DB.prepare('SELECT model, count FROM usage_global WHERE day = ?')
      .bind(day).all<{ model: string; count: number }>(),
  ]);

  const usedByFeature = new Map(deviceRows.results.map(r => [r.feature, r.count]));
  const usedByModel = new Map(globalRows.results.map(r => [r.model, r.count]));

  const result: Record<string, FeatureUsage> = {};
  for (const feature of features) {
    const cfg = FEATURE_CONFIG[feature];
    const used = usedByFeature.get(feature) ?? 0;
    const globalUsed = usedByModel.get(cfg.model) ?? 0;
    result[feature] = {
      used,
      limit: cfg.deviceDailyCap,
      remaining: Math.max(0, cfg.deviceDailyCap - used),
      globalAvailable: globalUsed < cfg.globalDailyCap,
    };
  }

  return json({ day, features: result });
}

async function purgeOldUsage(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await db.batch([
    db.prepare('DELETE FROM usage_daily WHERE day < ?').bind(cutoff),
    db.prepare('DELETE FROM usage_global WHERE day < ?').bind(cutoff),
  ]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/v1/ai' && request.method === 'POST') {
      return handleAIRequest(request, env);
    }
    if (url.pathname === '/v1/usage' && request.method === 'GET') {
      return handleUsageRequest(request, env);
    }
    if (url.pathname === '/v1/ai' || url.pathname === '/v1/usage') {
      return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    }
    return json({ error: 'NOT_FOUND' }, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeOldUsage(env.DB));
  },
};
