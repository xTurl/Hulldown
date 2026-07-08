import { z } from 'zod';
import { sanitizeForPrompt } from '../services/claude';
import { callAI } from '../services/ai-gateway';
import { TANK_TIPS_SYSTEM } from '../../shared/ai/prompts';
import type { Tank, MapStat, AIRecommendations } from '../../shared/types';
import type { ReplayTankContext } from '../services/cache';

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

const TANK_RECOMMENDATIONS_MODEL = 'claude-haiku-4-5-20251001';
const TANK_RECOMMENDATIONS_MAX_TOKENS = 1000;

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

  const user = `${contextSection}
TANK: ${sanitizeForPrompt(tank.name, 80)} (Tier ${tank.tier}, ${sanitizeForPrompt(tank.type, 40)}, ${sanitizeForPrompt(tank.nation, 40)})
OVERALL LIFETIME STATS:
- Battles: ${tank.battles} | WR%: ${tank.winRate.toFixed(1)}% | WN8: ${tank.wn8} | WNX: ${tank.wnx}
- Avg direct dmg: ${tank.avgDamage} | Avg assist (radio): ${tank.avgDamageAssisted ?? 0} | Avg tracking assist: ${tank.avgDamageAssistedTrack ?? 0}
- Avg frags: ${tank.avgFrags.toFixed(2)} | Avg spots: ${tank.avgSpots.toFixed(2)} | Survival: ${tank.survivalRate.toFixed(1)}% | Avg XP: ${tank.avgXp}
${replaySection}
MAP STATS — ${mapSource} (top 10):
${mapSummary}`;

  const result = await callAI({
    apiKey,
    feature: 'tank-tips',
    model: TANK_RECOMMENDATIONS_MODEL,
    system: TANK_TIPS_SYSTEM,
    user,
    maxTokens: TANK_RECOMMENDATIONS_MAX_TOKENS,
    schema: AIRecommendationsSchema,
  });

  return { ...result, generatedAt: Date.now() };
}
