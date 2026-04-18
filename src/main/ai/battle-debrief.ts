import { z } from 'zod';
import { callClaude } from '../services/claude';
import { BATTLE_DEBRIEF_SYSTEM } from './prompts';
import type { BattleRecord, BattleDebrief } from '../../shared/types';
import type { WgVehicle, Wn8ExpEntry } from '../services/wargaming';
import type { TankBaseline } from '../services/cache';

export const DEBRIEF_MODEL = 'claude-haiku-4-5-20251001';
export const DEBRIEF_MAX_TOKENS = 800;

const BattleDebriefResponseSchema = z.object({
  summary: z.string(),
  wentWell: z.array(z.string()),
  wentWrong: z.array(z.string()),
  tips: z.array(z.string()),
});

export interface BattleDebriefContext {
  battle: BattleRecord;
  vehicle: WgVehicle | undefined;
  expEntry: Wn8ExpEntry | undefined;
  baseline: TankBaseline | null;
}

export async function runBattleDebrief(
  ctx: BattleDebriefContext,
  apiKey: string,
): Promise<BattleDebrief> {
  const { battle, vehicle, expEntry, baseline } = ctx;

  const expDmg = expEntry?.expDmg;
  const dmgVsExpected = expDmg ? Math.round(((battle.damage - expDmg) / expDmg) * 100) : null;
  const dmgVsBaseline = baseline && baseline.avgDamage > 0
    ? Math.round(((battle.damage - baseline.avgDamage) / baseline.avgDamage) * 100)
    : null;

  const userPayload = {
    tank: {
      name: battle.tankName.replace(/ v\d+$/, ''),
      tier: vehicle?.tier ?? null,
      type: vehicle?.type ?? null,
      nation: vehicle?.nation ?? null,
      isPremium: vehicle?.is_premium ?? null,
    },
    battle: {
      damage: battle.damage,
      assist: battle.assist,
      blocked: battle.damageBlocked,
      kills: battle.kills,
      spotted: battle.spotted,
      shots: battle.shots,
      hits: battle.hits,
      pens: battle.pens,
      xp: battle.xp,
      credits: battle.credits,
      survived: battle.survived,
      lifeTime: battle.lifeTime,
      result: battle.result,
      mapName: battle.mapName,
      battleType: battle.battleType,
      duration: battle.duration,
      damageReceived: battle.damageReceived,
      droppedCapture: battle.droppedCapture,
      wn8: battle.wn8 ?? null,
      wnx: battle.wnx ?? null,
    },
    expectedValues: expEntry
      ? { expDmg: expEntry.expDmg, expFrag: expEntry.expFrag, expSpot: expEntry.expSpot, expDef: expEntry.expDef, expWinRate: Math.round(expEntry.expWinRate * 1000) / 10 }
      : null,
    playerBaseline30d: baseline,
    deltas: {
      dmgVsExpectedPct: dmgVsExpected,
      dmgVsBaselinePct: dmgVsBaseline,
      fragsVsBaseline: baseline ? Math.round((battle.kills - baseline.avgFrags) * 100) / 100 : null,
      assistVsBaseline: baseline ? battle.assist - baseline.avgAssist : null,
    },
  };

  const debriefResponse = await callClaude({
    apiKey,
    model: DEBRIEF_MODEL,
    system: BATTLE_DEBRIEF_SYSTEM,
    user: JSON.stringify(userPayload),
    maxTokens: DEBRIEF_MAX_TOKENS,
    schema: BattleDebriefResponseSchema,
  });

  return {
    ...debriefResponse,
    generatedAt: Date.now(),
    model: DEBRIEF_MODEL,
  };
}
