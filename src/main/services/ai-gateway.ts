import type { ZodSchema } from 'zod';
import { callClaude } from './claude';
import { callFreeAI, type FreeAIFeature } from './free-ai';

export type { FreeAIFeature } from './free-ai';
export { FreeAILimitError } from './free-ai';

/**
 * Single entry point every AI feature calls through. Routes to the user's
 * own Claude API key when one is configured (unlimited, higher quality), or
 * to Hulldown's free built-in AI proxy otherwise (rate-limited, works out
 * of the box). Callers never need to know which provider actually served
 * the request.
 */
export async function callAI<T>(opts: {
  apiKey: string;
  feature: FreeAIFeature;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  schema: ZodSchema<T>;
  timeoutMs?: number;
}): Promise<T> {
  if (opts.apiKey) {
    return callClaude({
      apiKey: opts.apiKey,
      model: opts.model,
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      schema: opts.schema,
      timeoutMs: opts.timeoutMs,
    });
  }

  return callFreeAI({
    feature: opts.feature,
    user: opts.user,
    schema: opts.schema,
    timeoutMs: opts.timeoutMs,
  });
}
