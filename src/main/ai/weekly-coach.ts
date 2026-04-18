import { z } from 'zod';
import { callClaude } from '../services/claude';
import { WEEKLY_COACH_SYSTEM } from './prompts';
import type { WeeklyCoachReport } from '../../shared/types';
import type { WeeklyCoachData } from '../services/analytics';

export const WEEKLY_COACH_MODEL = 'claude-sonnet-4-6';
export const WEEKLY_COACH_MAX_TOKENS = 2000;

const TankCallSchema = z.object({
  tankName: z.string(),
  delta: z.string(),
  reason: z.string(),
});

const WeeklyCoachResponseSchema = z.object({
  summary: z.string(),
  focusTanks: z.array(TankCallSchema),
  restTanks: z.array(TankCallSchema),
  mapPlaybook: z.array(z.object({ mapName: z.string(), winRate: z.number(), tip: z.string() })),
  mapsToAvoid: z.array(z.object({ mapName: z.string(), winRate: z.number(), reason: z.string() })),
  commonMistakes: z.array(z.object({ pattern: z.string(), evidence: z.string(), fix: z.string() })),
  oneThingToFix: z.string(),
  highlightArenaId: z.string().nullable(),
});

export async function runWeeklyCoach(
  data: WeeklyCoachData,
  apiKey: string,
  periodStartMs: number,
  periodEndMs: number,
): Promise<WeeklyCoachReport> {
  const userPayload = {
    thisWeek: data.thisWeek,
    priorWeek: data.priorWeek,
    progressDelta: data.progressDelta,
    thirtyDayBaseline: data.thirtyDayBaseline,
    topImprovers: data.topImprovers,
    topDecliners: data.topDecliners,
    bestMaps: data.bestMaps,
    worstMaps: data.worstMaps,
    highlightBattleCandidate: data.highlightBattle,
  };

  const coachResponse = await callClaude({
    apiKey,
    model: WEEKLY_COACH_MODEL,
    system: WEEKLY_COACH_SYSTEM,
    user: JSON.stringify(userPayload, null, 2),
    maxTokens: WEEKLY_COACH_MAX_TOKENS,
    schema: WeeklyCoachResponseSchema,
  });

  // Reconstruct highlight battle from candidate + AI's arenaId pick (avoids Claude hallucinating stats)
  const highlightBattle =
    coachResponse.highlightArenaId && data.highlightBattle && coachResponse.highlightArenaId === data.highlightBattle.arenaId
      ? {
          arenaId: data.highlightBattle.arenaId,
          tankName: data.highlightBattle.tankName,
          mapName: data.highlightBattle.mapName,
          damage: data.highlightBattle.damage,
          frags: data.highlightBattle.frags,
          result: data.highlightBattle.result as 'win' | 'loss' | 'draw',
        }
      : null;

  return {
    summary: coachResponse.summary,
    focusTanks: coachResponse.focusTanks,
    restTanks: coachResponse.restTanks,
    mapPlaybook: coachResponse.mapPlaybook,
    mapsToAvoid: coachResponse.mapsToAvoid,
    commonMistakes: coachResponse.commonMistakes,
    oneThingToFix: coachResponse.oneThingToFix,
    highlightBattle,
    generatedAt: Date.now(),
    model: WEEKLY_COACH_MODEL,
    periodStartMs,
    periodEndMs,
  };
}
