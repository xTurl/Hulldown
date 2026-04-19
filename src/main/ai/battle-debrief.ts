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

type DamageLabel = 'excellent' | 'solid' | 'average' | 'poor' | 'unknown';
type SpottingLabel = 'excellent' | 'solid' | 'average' | 'low';
type SurvivalLabel = 'survived' | 'earlyDeath' | 'midDeath' | 'lateDeath';
type ArmorLabel = 'goodAngling' | 'decent' | 'poor' | 'notEngaged';
type OverallLabel = 'excellent' | 'solid' | 'average' | 'poor';

function computePerformanceLabels(
  battle: BattleRecord,
  expEntry: Wn8ExpEntry | undefined,
  baseline: TankBaseline | null,
): {
  overallLabel: OverallLabel;
  damageLabel: DamageLabel;
  spottingLabel: SpottingLabel;
  survivalLabel: SurvivalLabel;
  armorLabel: ArmorLabel;
} {
  let damageLabel: DamageLabel;
  if (expEntry?.expDmg && expEntry.expDmg > 0) {
    const r = battle.damage / expEntry.expDmg;
    damageLabel = r >= 1.5 ? 'excellent' : r >= 1.2 ? 'solid' : r >= 0.8 ? 'average' : 'poor';
  } else if (baseline && baseline.avgDamage > 0) {
    const r = battle.damage / baseline.avgDamage;
    damageLabel = r >= 1.5 ? 'excellent' : r >= 1.2 ? 'solid' : r >= 0.8 ? 'average' : 'poor';
  } else {
    damageLabel = 'unknown';
  }

  const spottingLabel: SpottingLabel =
    battle.assist >= 2500 || battle.spotted >= 6 ? 'excellent' :
    battle.assist >= 1500 || battle.spotted >= 4 ? 'solid' :
    battle.assist >= 500 || battle.spotted >= 2 ? 'average' :
    'low';

  const survivalLabel: SurvivalLabel = battle.survived
    ? 'survived'
    : battle.lifeTime < 120 ? 'earlyDeath'
    : battle.lifeTime < 300 ? 'midDeath'
    : 'lateDeath';

  let armorLabel: ArmorLabel;
  if (battle.damageReceived === 0) {
    armorLabel = 'notEngaged';
  } else {
    const r = battle.damageBlocked / battle.damageReceived;
    armorLabel = r >= 1.0 ? 'goodAngling' : r >= 0.5 ? 'decent' : 'poor';
  }

  let overallLabel: OverallLabel;
  if (damageLabel === 'excellent' || spottingLabel === 'excellent') {
    overallLabel = 'excellent';
  } else if (damageLabel === 'solid' || (damageLabel === 'average' && spottingLabel === 'solid')) {
    overallLabel = 'solid';
  } else if (damageLabel === 'poor' && (spottingLabel === 'low' || spottingLabel === 'average') && !battle.survived) {
    overallLabel = 'poor';
  } else {
    overallLabel = 'average';
  }

  return { overallLabel, damageLabel, spottingLabel, survivalLabel, armorLabel };
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

  const performance = computePerformanceLabels(battle, expEntry, baseline);

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
    performance,
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
