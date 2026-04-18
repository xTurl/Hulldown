import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ZodSchema } from 'zod';
import type { Tank, MapStat, AIRecommendations } from '../../shared/types';
import type { ReplayTankContext } from './cache';

interface TankWithAssisted extends Omit<Tank, 'avgDamageAssisted' | 'avgDamageAssistedTrack'> {
  avgDamageAssisted?: number;
  avgDamageAssistedTrack?: number;
}

export interface PlayerContext {
  totalBattles: number;
  overallWinRate: number;
  overallWn8: number;
  byClass: Record<string, { battles: number; winRate: number; wn8: number }>;
}

const MASTERY = ['none', '3rd class', '2nd class', '1st class', 'Ace Tanker'];

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

// ---------------------------------------------------------------------------
// Tank Recommendations — uses callClaude internally
// ---------------------------------------------------------------------------

const AIRecommendationsSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  tips: z.array(z.string()),
});

export async function generateTankRecommendations(
  tank: TankWithAssisted,
  mapStats: MapStat[],
  apiKey: string,
  playerContext?: PlayerContext,
  replayContext?: ReplayTankContext | null,
): Promise<AIRecommendations> {
  // Map stats: prefer replay data (own battles) over tomato.gg scraping
  const replayMaps = replayContext?.mapStats ?? [];
  const effectiveMaps = replayMaps.length >= 3 ? replayMaps : mapStats;
  const mapSource = replayMaps.length >= 3 ? 'from own replays' : 'from API stats';
  const mapSummary = effectiveMaps.length > 0
    ? effectiveMaps
        .sort((a, b) => b.battles - a.battles)
        .slice(0, 10)
        .map(m => `  - ${sanitizeForPrompt(m.mapName, 80)}: ${m.battles}b, WR ${m.winRate}%, dmg ${m.avgDamage}`)
        .join('\n')
    : '  No map data available';

  const contextSection = playerContext ? `
PLAYER PROFILE (all tanks combined):
- Total battles: ${playerContext.totalBattles.toLocaleString('en-US')} | WR%: ${playerContext.overallWinRate.toFixed(1)}% | WN8: ${playerContext.overallWn8}
- By class:
${Object.entries(playerContext.byClass)
  .sort((a, b) => b[1].battles - a[1].battles)
  .map(([cls, s]) => {
    const diff = s.winRate - playerContext.overallWinRate;
    const flag = Math.abs(diff) >= 3 ? (diff > 0 ? ' ↑ strong' : ' ↓ weak') : '';
    return `  - ${sanitizeForPrompt(cls, 40)}: ${s.battles.toLocaleString('en-US')}b | ${s.winRate.toFixed(1)}% WR | WN8 ${s.wn8}${flag}`;
  }).join('\n')}
` : '';

  const replaySection = replayContext ? `
RECENT DATA (last ~30 days, ${replayContext.battles} battles from replays):
- Recent WR%: ${replayContext.winRate.toFixed(1)}% | Recent avg dmg: ${replayContext.avgDamage}
- Accuracy: ${replayContext.accuracy.toFixed(1)}% of shots hit | Pen rate: ${replayContext.penRate.toFixed(1)}% of hits penetrated
- Avg damage received: ${replayContext.avgDmgReceived} | Avg damage blocked by armor: ${replayContext.avgDmgBlocked}
- Avg time alive: ${replayContext.avgLifePct.toFixed(0)}% of battle duration
- Net credits per battle (after repairs): ${replayContext.avgNetCredits.toLocaleString('en-US')}
- Best mastery badge achieved: ${MASTERY[replayContext.bestMastery] ?? 'none'}
Note: compare recent WR/damage to overall stats above to detect improvement or regression trends.
` : '';

  const prompt = `You are a World of Tanks expert. Analyze the player's stats and provide specific, actionable advice.
${contextSection}
TANK: ${sanitizeForPrompt(tank.name, 80)} (Tier ${tank.tier}, ${sanitizeForPrompt(tank.type, 40)}, ${sanitizeForPrompt(tank.nation, 40)})
OVERALL LIFETIME STATS:
- Battles: ${tank.battles} | WR%: ${tank.winRate.toFixed(1)}% | WN8: ${tank.wn8} | WNX: ${tank.wnx}
- Avg direct dmg: ${tank.avgDamage} | Avg assist (radio): ${tank.avgDamageAssisted ?? 0} | Avg tracking assist: ${tank.avgDamageAssistedTrack ?? 0}
- Avg frags: ${tank.avgFrags.toFixed(2)} | Avg spots: ${tank.avgSpots.toFixed(2)} | Survival: ${tank.survivalRate.toFixed(1)}% | Avg XP: ${tank.avgXp}
${replaySection}
MAP STATS — ${mapSource} (top 10):
${mapSummary}

All text values in the JSON must be in English. Respond ONLY in valid JSON (no markdown, no comments):
{
  "summary": "2-3 sentence overall assessment including recent trend if replay data is available",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "tips": [
    "specific tip 1",
    "specific tip 2 — reference accuracy/penetration data if available",
    "specific tip 3 — reference survival/positioning data if available",
    "specific tip 4 — focused on weakest maps"
  ]
}`;

  const result = await callClaude({
    apiKey,
    model: 'claude-haiku-4-5-20251001',
    system: 'You are a World of Tanks expert assistant. Always respond in English only, regardless of the language of any data you receive.',
    user: prompt,
    maxTokens: 1000,
    schema: AIRecommendationsSchema,
  });

  return { ...result, generatedAt: Date.now() };
}
