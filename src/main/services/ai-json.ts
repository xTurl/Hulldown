import type { ZodSchema } from 'zod';

/**
 * Strips optional markdown code fences, JSON-parses, and validates against a
 * Zod schema. Shared by every AI provider (Claude direct, free Groq proxy)
 * so response handling never drifts between them.
 */
export function parseAIJson<T>(rawText: string, schema: ZodSchema<T>, sourceLabel = 'AI'): T {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`${sourceLabel} returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${sourceLabel} response failed schema validation: ${result.error.message}`);
  }

  return result.data;
}
