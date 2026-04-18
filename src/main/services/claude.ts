import Anthropic from '@anthropic-ai/sdk';
import type { ZodSchema } from 'zod';

/**
 * Strips control characters (including newlines) and limits length of strings
 * interpolated into AI prompts — prevents prompt injection via API data.
 */
export function sanitizeForPrompt(value: string, maxLength = 200): string {
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ') // control characters (incl. \n, \r) → space
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Generic Claude API caller. Instantiates the client, sends a single
 * user message, extracts the first text block, JSON-parses it, and
 * validates the result against the provided Zod schema.
 *
 * This is the shared foundation for all AI features in Hulldown.
 * Do NOT add retry logic, streaming, or prompt caching here yet —
 * those concerns belong in the callers once we understand real usage.
 */
export async function callClaude<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  schema: ZodSchema<T>;
  timeoutMs?: number;
}): Promise<T> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const message = await client.messages.create(
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    },
    { timeout: timeoutMs },
  );

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  // Strip optional markdown code fences that some Claude responses include
  const rawText = content.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result = opts.schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Claude response failed schema validation: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Cache-aware wrapper for expensive AI calls. Encapsulates the common pattern:
 * read cache (unless forced) → validate → compute fresh → persist.
 *
 * `isCachedValid` is optional — use it to reject cached values that were
 * produced before a schema bump, e.g. `(r) => Array.isArray(r.newField)`.
 */
export async function withAICache<R>(opts: {
  force: boolean;
  getCached: () => R | null;
  isCachedValid?: (cached: R) => boolean;
  compute: () => Promise<R>;
  saveCached: (value: R) => void;
}): Promise<R> {
  if (!opts.force) {
    const cached = opts.getCached();
    if (cached && (!opts.isCachedValid || opts.isCachedValid(cached))) {
      return cached;
    }
  }
  const fresh = await opts.compute();
  opts.saveCached(fresh);
  return fresh;
}
