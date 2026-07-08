import type { ZodSchema } from 'zod';
import type { FreeAIUsageInfo } from '../../shared/types';
import { parseAIJson } from './ai-json';
import { getDeviceId } from './device-id';

export type FreeAIFeature = 'debrief' | 'weekly-coach' | 'tank-tips';

/**
 * Thrown when the free built-in AI proxy rejects a request because a
 * fair-use limit was hit (per-device or the shared daily budget across all
 * users). Callers can catch this specifically to show a "try again later /
 * add your own key" message instead of a generic failure.
 */
export class FreeAILimitError extends Error {}

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Calls Hulldown's free AI proxy (a small Cloudflare Worker in front of
 * Groq) so most users get working AI features without needing their own
 * API key. The proxy owns the actual model/system-prompt/token-limit
 * choices per feature — this client only sends the feature name, an
 * anonymous device id (for fair-use rate limiting), and the pre-built user
 * message content.
 */
export async function callFreeAI<T>(opts: {
  feature: FreeAIFeature;
  user: string;
  schema: ZodSchema<T>;
  timeoutMs?: number;
}): Promise<T> {
  const proxyUrl = process.env.AI_PROXY_URL;
  if (!proxyUrl) {
    throw new Error('AI is not available in this build. Add your own Claude API key in Settings to enable AI features.');
  }

  const response = await fetch(`${proxyUrl}/v1/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: opts.feature, deviceId: getDeviceId(), user: opts.user }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (response.status === 429 || response.status === 503) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new FreeAILimitError(
      body.message ?? 'Free AI limit reached. Try again later, or add your own Claude API key in Settings for unlimited use.',
    );
  }
  if (!response.ok) {
    throw new Error(`Free AI request failed (HTTP ${response.status})`);
  }

  const body = await response.json() as { text?: string };
  if (!body.text) throw new Error('Free AI returned an empty response');

  return parseAIJson(body.text, opts.schema, 'Free AI');
}

/**
 * Read-only lookup of today's remaining free-tier usage, so the UI can show
 * "X free debriefs left today" up front. Returns `null` when the proxy isn't
 * configured for this build — callers should just hide the counter in that
 * case rather than surfacing an error.
 */
export async function getFreeAIUsage(timeoutMs = 10_000): Promise<FreeAIUsageInfo | null> {
  const proxyUrl = process.env.AI_PROXY_URL;
  if (!proxyUrl) return null;

  const response = await fetch(`${proxyUrl}/v1/usage?deviceId=${encodeURIComponent(getDeviceId())}`, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Free AI usage request failed (HTTP ${response.status})`);

  return response.json() as Promise<FreeAIUsageInfo>;
}
