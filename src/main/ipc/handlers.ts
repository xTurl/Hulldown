import { app, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import * as configService from '../services/config';
import * as cacheService from '../services/cache';
import * as wgService from '../services/wargaming';
import * as newsService from '../services/news';
import * as patchesService from '../services/patches';
import * as claudeService from '../services/claude';
import * as replayParser from '../services/replay-parser';
import * as updaterService from '../services/updater';
import { calculateWn8, calculateWnx } from '../../shared/utils/wn8';
import { assertString, assertNumber, assertOptionalNumber, assertBoolean, assertConfig } from './validators';
import type { Tank, TankDetails, BattleRecord, BattleDebrief, WeeklyCoachReport } from '../../shared/types';
import { z } from 'zod';
import { callClaude } from '../services/claude';
import { getIsoWeek } from '../../shared/utils/dates';

const ONE_HOUR = 60 * 60 * 1000;
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// In-memory cache for expensive WG API responses — cleared on app restart or manual cache clear
let memTankStats: wgService.WgTankStat[] | null = null;
let memEncyclopedia: Record<number, wgService.WgVehicle> | null = null;
let memFetchedAt = 0;
// In-flight deduplication: concurrent callers share one fetch instead of hammering the WG API
let pendingWgData: Promise<{ tankStats: wgService.WgTankStat[]; encyclopedia: Record<number, wgService.WgVehicle> }> | null = null;

// WN8 expected values cache (XVM) — 24 h TTL, best-effort (null = unavailable)
let memWn8Exp: Map<number, wgService.Wn8ExpEntry> | null = null;
let memWn8ExpFetchedAt = 0;
const WN8_EXP_TTL = 24 * ONE_HOUR;

// name → tankId reverse lookup built from encyclopedia
let memNameToTankId: Map<string, number> | null = null;
// vehicle tag → tankId lookup (more reliable than name matching for replay enrichment)
let memTagToTankId: Map<string, number> | null = null;

// Timestamp of the last successful replay scan — used to limit incremental scans
let lastScanTime = 0;

/**
 * Extracts the WG vehicle tag from a replay playerVehicle key.
 * "uk-GB123_GSOR_1006_v7"  → "GB123_GSOR_1006_v7"
 * "sweden:S10_Strv_107_12" → "S10_Strv_107_12"
 */
function extractVehicleTag(tankKey: string): string {
  // Strip nation prefix, then strip trailing _v<N> version suffix that WG adds
  // to vehicle keys in replay files when updating tank models. The WG encyclopedia
  // API tag field does not include this suffix, so the lookup would silently fail
  // for any versioned tank, falling back to the rough WN8 approximation.
  return tankKey.replace(/^[^:-]+-/, '').replace(/^[^:]+:/, '').replace(/_v\d+$/, '');
}

function clearMemCache() {
  memTankStats = null;
  memEncyclopedia = null;
  memFetchedAt = 0;
  memNameToTankId = null;
  memTagToTankId = null;
  pendingWgData = null;
}

/** Wraps an IPC handler so all errors are caught and logged before re-throwing. */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[IPC:${channel}]`, msg);
      throw e;
    }
  });
}

const WG_API_KEY = process.env.WG_API_KEY || '';

async function getWgData(config: ReturnType<typeof configService.getConfig>) {
  if (memTankStats && memEncyclopedia && Date.now() - memFetchedAt < ONE_HOUR) {
    return { tankStats: memTankStats, encyclopedia: memEncyclopedia };
  }

  // Check SQLite cache before hitting the network — survives app restarts.
  // This eliminates the 2-5s WG API wait on every launch after the first.
  if (!memTankStats || !memEncyclopedia) {
    const sqliteCache = cacheService.getWgDataCache(config.accountId);
    if (sqliteCache && Date.now() - sqliteCache.updatedAt < ONE_HOUR) {
      memTankStats    = sqliteCache.tankStats as wgService.WgTankStat[];
      memEncyclopedia = sqliteCache.encyclopedia as Record<number, wgService.WgVehicle>;
      memFetchedAt    = sqliteCache.updatedAt;
      memNameToTankId = new Map(Object.values(memEncyclopedia).map(v => [v.name, v.tank_id]));
      memTagToTankId  = new Map(Object.values(memEncyclopedia).map(v => [v.tag,  v.tank_id]));
      return { tankStats: memTankStats, encyclopedia: memEncyclopedia };
    }
  }

  // Return the in-flight promise if a fetch is already running — prevents duplicate WG API
  // requests when multiple IPC handlers call getWgData concurrently on a cold cache.
  if (pendingWgData) return pendingWgData;

  pendingWgData = (async () => {
    try {
      const [tankStats, encyclopedia] = await Promise.all([
        wgService.getPlayerTankStats(config.accountId, WG_API_KEY, config.region),
        wgService.getVehicleEncyclopedia(WG_API_KEY, config.region),
      ]);
      memTankStats = tankStats;
      memEncyclopedia = encyclopedia;
      memFetchedAt = Date.now();
      // Build reverse lookups for battle enrichment
      memNameToTankId = new Map(Object.values(encyclopedia).map(v => [v.name, v.tank_id]));
      memTagToTankId  = new Map(Object.values(encyclopedia).map(v => [v.tag,  v.tank_id]));
      // Persist to SQLite so the next startup skips the network call
      cacheService.saveWgDataCache(config.accountId, tankStats, encyclopedia);
      return { tankStats, encyclopedia };
    } catch (e) {
      // Don't cache failed requests
      clearMemCache();
      throw e;
    } finally {
      pendingWgData = null;
    }
  })();

  return pendingWgData;
}

async function getWn8Exp(): Promise<Map<number, wgService.Wn8ExpEntry> | null> {
  if (memWn8Exp && Date.now() - memWn8ExpFetchedAt < WN8_EXP_TTL) return memWn8Exp;
  try {
    memWn8Exp = await wgService.getWn8ExpectedValues();
    memWn8ExpFetchedAt = Date.now();
  } catch (e) {
    console.warn('[WN8] Failed to fetch expected values, falling back to approximation:', e instanceof Error ? e.message : e);
    memWn8Exp = null;
  }
  return memWn8Exp;
}

function expForTank(tankId: number): import('../../shared/utils/wn8').Wn8Expected | undefined {
  return memWn8Exp?.get(tankId);
}

function buildTank(t: wgService.WgTankStat, vehicle: wgService.WgVehicle | undefined): Tank {
  const stats = t.all;
  const battles = stats.battles;
  const exp = expForTank(t.tank_id);
  return {
    tankId: t.tank_id,
    name: vehicle?.name || `Tank #${t.tank_id}`,
    tier: vehicle?.tier || 0,
    type: vehicle?.type || 'unknown',
    nation: vehicle?.nation || 'unknown',
    isPremium: vehicle?.is_premium || false,
    battles,
    wins: stats.wins,
    winRate: battles > 0 ? Math.round((stats.wins / battles) * 1000) / 10 : 0,
    wn8: calculateWn8(stats, exp),
    wnx: calculateWnx(stats, exp),
    hasExpectedValues: !!exp,
    avgDamage: battles > 0 ? Math.round(stats.damage_dealt / battles) : 0,
    avgDamageAssisted: Math.round(stats.avg_damage_assisted_radio ?? stats.avg_damage_assisted ?? 0),
    avgDamageAssistedTrack: Math.round(stats.avg_damage_assisted_track ?? 0),
    avgDamageBlocked: Math.round(stats.avg_damage_blocked ?? 0),
    avgFrags: battles > 0 ? Math.round((stats.frags / battles) * 100) / 100 : 0,
    avgSpots: battles > 0 ? Math.round((stats.spotted / battles) * 100) / 100 : 0,
    survivalRate: battles > 0 ? Math.round((stats.survived_battles / battles) * 1000) / 10 : 0,
    avgXp: battles > 0 ? Math.round(stats.xp / battles) : 0,
  };
}

const CLASS_LABELS: Record<string, string> = {
  heavyTank: 'Heavy Tank',
  mediumTank: 'Medium Tank',
  lightTank: 'Light Tank',
  'AT-SPG': 'Tank Destroyer',
  SPG: 'Artillery',
};

function computeOverallWn8AndWnx(tankStats: wgService.WgTankStat[]): { wn8: number; wnx: number } {
  let totalBattles = 0;
  let totalWn8Weighted = 0;
  let totalWnxWeighted = 0;
  for (const t of tankStats) {
    if (t.all.battles === 0) continue;
    const exp = expForTank(t.tank_id);
    // When the XVM expected-values map is loaded, skip tanks that have no entry —
    // this matches tomato.gg / noobmeter behaviour (fallback formula distorts the overall).
    if (memWn8Exp && !exp) continue;
    totalWn8Weighted += calculateWn8(t.all, exp) * t.all.battles;
    totalWnxWeighted += calculateWnx(t.all, exp) * t.all.battles;
    totalBattles += t.all.battles;
  }
  if (totalBattles === 0) return { wn8: 0, wnx: 0 };
  return {
    wn8: Math.round(totalWn8Weighted / totalBattles),
    wnx: Math.round(totalWnxWeighted / totalBattles),
  };
}

function buildPlayerContext(
  tankStats: wgService.WgTankStat[],
  encyclopedia: Record<number, wgService.WgVehicle>,
): claudeService.PlayerContext {
  const byClass: Record<string, { battles: number; wins: number; wn8Weighted: number }> = {};
  let totalBattles = 0;
  let totalWins = 0;
  let totalWn8Weighted = 0;

  for (const t of tankStats) {
    if (t.all.battles === 0) continue;
    const rawType = encyclopedia[t.tank_id]?.type || 'unknown';
    const label = CLASS_LABELS[rawType] || rawType;
    if (!byClass[label]) byClass[label] = { battles: 0, wins: 0, wn8Weighted: 0 };
    const wn8 = calculateWn8(t.all);
    byClass[label].battles += t.all.battles;
    byClass[label].wins += t.all.wins;
    byClass[label].wn8Weighted += wn8 * t.all.battles;
    totalBattles += t.all.battles;
    totalWins += t.all.wins;
    totalWn8Weighted += wn8 * t.all.battles;
  }

  const byClassResult: claudeService.PlayerContext['byClass'] = {};
  for (const [label, s] of Object.entries(byClass)) {
    byClassResult[label] = {
      battles: s.battles,
      winRate: Math.round((s.wins / s.battles) * 1000) / 10,
      wn8: Math.round(s.wn8Weighted / s.battles),
    };
  }

  return {
    totalBattles,
    overallWinRate: totalBattles > 0 ? Math.round((totalWins / totalBattles) * 1000) / 10 : 0,
    overallWn8: totalBattles > 0 ? Math.round(totalWn8Weighted / totalBattles) : 0,
    byClass: byClassResult,
  };
}

function isValidTankDetails(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.tankId === 'number' &&
    typeof d.wnx === 'number' &&
    typeof d.avgDamageAssisted === 'number' &&
    typeof d.avgDamageAssistedTrack === 'number' &&
    typeof d.avgDamageBlocked === 'number' &&
    typeof d.survivalRate === 'number' &&
    typeof d.avgFrags === 'number' &&
    typeof d.avgSpots === 'number' &&
    typeof d.avgXp === 'number'
  );
}

export function registerHandlers(): void {
  handle('config:get', () => configService.getConfig());

  handle('config:save', (config) => {
    const validated = assertConfig(config);
    const prev = configService.getConfig();
    clearMemCache();
    cacheService.clearPlayerInfoCache();
    // If the account changed, the cached WG data belongs to a different player
    if (prev.accountId !== validated.accountId) {
      cacheService.clearWgDataCache(prev.accountId);
    }
    configService.saveConfig(validated);
  });

  handle('player:search', (username, region) =>
    wgService.searchPlayer(assertString(username, 'username'), WG_API_KEY, assertString(region, 'region'))
  );

  handle('player:info', async () => {
    const cached = cacheService.getPlayerInfo();
    if (cached && Date.now() - cached.updatedAt < ONE_HOUR) return cached.data;

    const config = configService.getConfig();
    // Fetch all three data sources in parallel.
    // Per-tank weighted average WN8 is always more accurate than the raw aggregate formula,
    // so we ensure tank stats and XVM expected values are loaded even if tanks:list hasn't
    // been called yet this session. Both are in-memory cached so after first call this is instant.
    const [playerInfo, { tankStats }, _wn8Exp] = await Promise.all([
      wgService.getPlayerInfo(config.accountId, WG_API_KEY, config.region),
      getWgData(config),
      getWn8Exp(), // warms memWn8Exp cache for accurate per-tank WN8 calculations
    ]);
    const stats = playerInfo.statistics.all;
    const overall = computeOverallWn8AndWnx(tankStats);
    const wn8 = overall.wn8;
    const result = {
      accountId: playerInfo.account_id,
      username: playerInfo.nickname,
      createdAt: playerInfo.created_at,
      lastBattle: playerInfo.last_battle_time,
      statistics: stats,
      wn8,
    };
    cacheService.savePlayerInfo(result);

    const last = cacheService.getLastProgressSnapshot(config.accountId);
    if (!last || stats.battles > last.battles) {
      cacheService.saveProgressSnapshot({
        accountId: config.accountId,
        takenAt: Date.now(),
        battles: stats.battles,
        wn8,
        wnx: overall.wnx,
        winRate: stats.battles > 0 ? Math.round((stats.wins / stats.battles) * 1000) / 10 : 0,
        rawWins: stats.wins,
        rawDamage: stats.damage_dealt,
        rawFrags: stats.frags,
        rawSurvived: stats.survived_battles,
        rawXp: stats.xp,
        rawSpotted: stats.spotted,
        rawDroppedCp: stats.dropped_capture_points,
      });
    }

    return result;
  });

  handle('tanks:list', async () => {
    const config = configService.getConfig();
    const [{ tankStats, encyclopedia }] = await Promise.all([
      getWgData(config),
      getWn8Exp(),  // pre-warm expected values cache in parallel
    ]);

    cacheService.backfillMissingWnx(computeOverallWn8AndWnx(tankStats).wnx);

    return tankStats
      .filter(t => t.all.battles > 0)
      .map(t => buildTank(t, encyclopedia[t.tank_id]))
      .sort((a, b) => b.battles - a.battles);
  });

  handle('tanks:details', async (tankId) => {
    const id = assertNumber(tankId, 'tankId');
    const cached = cacheService.getTankDetails(id);
    if (cached && isValidTankDetails(cached.data)) return cached.data;

    const config = configService.getConfig();
    const { tankStats, encyclopedia } = await getWgData(config);
    const tankStat = tankStats.find(t => t.tank_id === id);
    if (!tankStat) throw new Error(`Tank ${id} not found`);

    const prevDetails = isValidTankDetails(cached?.data) ? (cached!.data as TankDetails) : undefined;
    const details: TankDetails = {
      ...buildTank(tankStat, encyclopedia[id]),
      mapStats: prevDetails?.mapStats ?? [],
      recommendations: prevDetails?.recommendations ?? null,
      rawStats: { ...tankStat.all } as Record<string, number>,
    };

    cacheService.saveTankDetails(id, details);
    return details;
  });

  handle('tanks:recommendations', async (tankId, force) => {
    const id = assertNumber(tankId, 'tankId');
    const cached = cacheService.getTankDetails(id);
    if (!cached) throw new Error('Tank details not loaded yet');

    if (!isValidTankDetails(cached.data)) throw new Error('Cached tank data is corrupted');
    const details = cached.data as TankDetails;
    if (details.recommendations && !assertBoolean(force, 'force')) return details;

    const config = configService.getConfig();
    const playerContext = memTankStats && memEncyclopedia
      ? buildPlayerContext(memTankStats, memEncyclopedia)
      : undefined;

    const replayContext = cacheService.getReplayTankContext(config.accountId, details.name);

    const recommendations = await claudeService.generateTankRecommendations(
      details, details.mapStats, config.claudeApiKey, playerContext, replayContext
    );

    const updated: TankDetails = { ...details, recommendations };
    cacheService.saveTankDetails(id, updated);
    return updated;
  });

  // ---------------------------------------------------------------------------
  // battle:debrief — on-demand tactical analysis of a single battle
  // ---------------------------------------------------------------------------
  const BattleDebriefResponseSchema = z.object({
    summary: z.string(),
    wentWell: z.array(z.string()),
    wentWrong: z.array(z.string()),
    tips: z.array(z.string()),
  });

  const DEBRIEF_MODEL = 'claude-haiku-4-5-20251001';
  const DEBRIEF_MAX_TOKENS = 800;
  const DEBRIEF_SYSTEM = `You are a tactical World of Tanks coach analyzing a single battle. Be specific. Reference actual numbers from the data provided. Avoid generic advice like "play better" or "do more damage". Output strict JSON matching this schema exactly: {"summary": string, "wentWell": string[], "wentWrong": string[], "tips": string[]}`;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  handle('battle:debrief', async (arenaIdRaw, forceRaw) => {
    const arenaId = assertString(arenaIdRaw, 'arenaId');
    const force = forceRaw === true;

    const config = configService.getConfig();
    if (!config.claudeApiKey) throw new Error('AI not configured. Please set your Claude API key in Settings.');

    // Cache hit (skip if forced)
    if (!force) {
      const cached = cacheService.getBattleDebrief(arenaId);
      if (cached) return cached;
    }

    // Load battle record from DB
    const battle = cacheService.getBattleByArenaId(config.accountId, arenaId);
    if (!battle) throw new Error('Battle not found');
    if (battle.result === 'incomplete') throw new Error('Cannot debrief an incomplete battle');

    // Gather expected values for this tank (same lookup chain as replays:list)
    await Promise.all([getWn8Exp(), getWgData(config)]);
    const extractedTag = extractVehicleTag(battle.tankKey);
    const tankId = memTagToTankId?.get(extractedTag) ?? memNameToTankId?.get(battle.tankName);
    const expEntry = tankId !== undefined ? memWn8Exp?.get(tankId) : undefined;
    const vehicle = tankId !== undefined ? memEncyclopedia?.[tankId] : undefined;

    // Player 30-day baseline on this tank
    const baseline = cacheService.getTankBaseline(config.accountId, battle.tankKey, THIRTY_DAYS_MS);

    // Build deltas vs expected values
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
      apiKey: config.claudeApiKey,
      model: DEBRIEF_MODEL,
      system: DEBRIEF_SYSTEM,
      user: JSON.stringify(userPayload),
      maxTokens: DEBRIEF_MAX_TOKENS,
      schema: BattleDebriefResponseSchema,
    });

    const debrief: BattleDebrief = {
      ...debriefResponse,
      generatedAt: Date.now(),
      model: DEBRIEF_MODEL,
    };

    cacheService.saveBattleDebrief(arenaId, config.accountId, debrief);
    return debrief;
  });

  // ---------------------------------------------------------------------------
  // coach:weekly-report — action-oriented 7-day performance analysis
  // ---------------------------------------------------------------------------
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

  const WEEKLY_COACH_MODEL = 'claude-sonnet-4-6';
  const WEEKLY_COACH_MAX_TOKENS = 2000;
  const WEEKLY_COACH_SYSTEM = `You are a World of Tanks performance coach. You get 7 days of the player's battle data and must output ACTIONABLE advice — what to play, where to play it, what to stop. No generic platitudes, no listing of metrics the player can read themselves.

CRITICAL OUTPUT RULE: Every string visible to the player (summary, reason, tip, pattern, evidence, fix, oneThingToFix, delta) MUST use plain, natural English. NEVER include raw data field names, camelCase identifiers, or programming-style tokens (e.g. "avgDmgReceived", "earlyDeathRate", "avgDmgBlocked", "avgLifeTimeSec", "survivalRate", "priorWeek", "thirtyDayBaseline", "winRate"). Translate them to human labels: "damage taken", "early deaths", "damage blocked", "time alive", "survival rate", "last week", "30-day average", "win rate". The player should never see internal variable names.

RULES:
- summary: ONE line, max 140 chars. A headline, not a paragraph. Mention the single most important trend with its number.
- focusTanks (1-3): tanks the player should keep grinding next week. Pick from topImprovers or tanks with strong win rate + high battle count. "delta" is a short metric like "+450 dmg" or "62% WR". "reason" is one short line explaining why to grind it (numbers-backed, max ~15 words).
- restTanks (0-2): tanks dragging stats down. Pick from topDecliners with ≥5 battles. If none, return []. "delta" is the negative number like "-220 dmg". "reason" explains the drop concretely in plain English.
- mapPlaybook (0-3): pick 1-3 maps from bestMaps where the player does well. "tip" is ONE concrete tactical line leveraging the map's known geography (e.g. "Prokhorovka: push the 1-line with your mediums, use the rail embankment for gun depression"). Use real tactical concepts from WoT map meta. Keep each tip under 25 words.
- mapsToAvoid (0-3): pick from worstMaps with win rate < 45%. "reason" must cite the numbers in plain English ("3 battles, 33% win rate, 1,100 avg damage").
- commonMistakes (1-3): derive BEHAVIORAL patterns from this week's stats compared to last week or the 30-day baseline. Each mistake has:
  * "pattern" — the behavior in plain language (e.g. "Dying too early", "Taking too much damage", "Poor armor angling", "Not scouting enough")
  * "evidence" — the concrete number in plain English that proves it. GOOD: "Early deaths at 45% — nearly half your deaths happen before the 3-minute mark", "Taking 2,400 damage per battle vs 1,800 last week — 33% more taken". BAD: "earlyDeathRate 45%", "avgDmgReceived 2400 vs priorWeek 1800".
  * "fix" — ONE imperative sentence telling them what to do differently
  Signals to watch (use these internally, translate to plain English in output): early-death rate > 35% = YOLO; survival rate < 20% = dying too much; damage blocked less than half of damage taken on heavies = bad angling; average time alive under 3 minutes = rushing in. Only flag mistakes backed by REAL numbers — don't invent.
- oneThingToFix: ONE imperative sentence in plain English. The single highest-impact change, backed by a number. DIFFERENT from commonMistakes — this is the ONE priority across all issues.
- highlightArenaId: echo the arenaId of highlightBattleCandidate if it's worth highlighting (damage clearly above the week's average), else null.

Do NOT list every metric. Do NOT pad with fluff. Do NOT leak internal field names. If data is thin (<20 battles), return shorter arrays — do not invent advice.

Output strict JSON:
{"summary","focusTanks":[{tankName,delta,reason}],"restTanks":[{tankName,delta,reason}],"mapPlaybook":[{mapName,winRate,tip}],"mapsToAvoid":[{mapName,winRate,reason}],"commonMistakes":[{pattern,evidence,fix}],"oneThingToFix","highlightArenaId"}`;

  handle('coach:weekly-report', async (forceRaw) => {
    const force = forceRaw === true;
    const config = configService.getConfig();
    if (!config.claudeApiKey) throw new Error('AI not configured. Please set your Claude API key in Settings.');

    const endMs = Date.now();
    const isoWeek = getIsoWeek(endMs);

    // Cache hit — ignore reports saved before the current schema
    // (e.g., missing commonMistakes) so they regenerate instead of crashing the UI.
    if (!force) {
      const cached = cacheService.getWeeklyReport(config.accountId, isoWeek);
      if (cached && Array.isArray(cached.commonMistakes) && Array.isArray(cached.focusTanks)) {
        return cached;
      }
    }

    const data = cacheService.getWeeklyCoachData(config.accountId, endMs);
    if (data.thisWeek.battles === 0) {
      throw new Error("No battles this week — play some tanks first!");
    }

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
      apiKey: config.claudeApiKey,
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

    const report: WeeklyCoachReport = {
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
      periodStartMs: endMs - 7 * 24 * 3600 * 1000,
      periodEndMs: endMs,
    };

    cacheService.saveWeeklyReport(config.accountId, isoWeek, report);
    return report;
  });

  handle('coach:report-history', (limitRaw) => {
    const config = configService.getConfig();
    const limit = assertOptionalNumber(limitRaw, 'limit', 10);
    return cacheService.listWeeklyReports(config.accountId, limit);
  });

  handle('cache:clearMem', () => {
    clearMemCache();
  });

  handle('cache:clearPlayerInfo', () => {
    cacheService.clearPlayerInfoCache();
  });

  handle('cache:clear', () => {
    clearMemCache();
    cacheService.clearAll();
  });

  handle('cache:stats', () => cacheService.getStats());

  handle('progress:list', () => {
    const config = configService.getConfig();
    return cacheService.getProgressSnapshots(config.accountId);
  });

  handle('news:fetch', () => {
    const config = configService.getConfig();
    return newsService.fetchNews(config.region);
  });

  handle('patches:fetch', () => {
    const config = configService.getConfig();
    return patchesService.fetchPatches(config.region);
  });

  handle('session:today', () => {
    const config = configService.getConfig();
    return cacheService.getTodaySession(config.accountId);
  });

  handle('player:detect', () => {
    const config = configService.getConfig();
    if (!config.replaysDir) return null;
    return replayParser.detectPlayerFromReplays(config.replaysDir);
  });

  handle('player:detect-all', () => {
    const config = configService.getConfig();
    if (!config.replaysDir) return [];
    return replayParser.detectAllPlayersFromReplays(config.replaysDir);
  });

  handle('replays:tank-maps', (tankName) => {
    const config = configService.getConfig();
    const ctx = cacheService.getReplayTankContext(config.accountId, assertString(tankName, 'tankName'));
    return ctx?.mapStats ?? [];
  });

  handle('replays:clear', () => {
    const config = configService.getConfig();
    cacheService.clearBattles(config.accountId);
    lastScanTime = 0;
    cacheService.setLastScanTime(config.accountId, 0);
  });

  handle('replays:scan', async (quick) => {
    const config = configService.getConfig();
    if (!config.replaysDir) return { added: 0, skipped: 0, errors: 0 };
    // Restore persisted scan time on first call after startup so that restarts
    // don't force a full re-parse of every replay file in the library.
    if (lastScanTime === 0) {
      lastScanTime = cacheService.getLastScanTime(config.accountId);
    }
    // Incremental scan: only parse replay files whose filename date is within a
    // 30-minute safety buffer of the last scan. The buffer must cover the maximum
    // WoT battle length (~15 min) because replay filenames encode the battle START
    // time, not the file write time — a battle that started 14 min before the last
    // scan and ended after it would be permanently missed with a shorter buffer.
    // INSERT OR IGNORE handles any re-processed duplicates.
    const sinceMs = lastScanTime > 0 ? lastScanTime - 30 * 60 * 1000 : undefined;
    // For incremental scans, skip loading all arena IDs from SQLite — the filename-date
    // filter already limits parsing to recent files, and INSERT OR IGNORE handles any
    // accidental duplicates. Loading 100k+ IDs on every restart is what caused the
    // 5-second startup delay. Only do the full load for genuine full scans (first run
    // ever, or after the user clears the replay cache).
    const knownIds = sinceMs !== undefined
      ? new Set<string>()
      : cacheService.getKnownArenaIds(config.accountId);
    const result = await replayParser.scanReplays(
      config.replaysDir,
      config.accountId,
      config.username,
      knownIds,
      (batch) => cacheService.insertBattles(batch as BattleRecord[]),
      sinceMs,
    );
    lastScanTime = Date.now();
    cacheService.setLastScanTime(config.accountId, lastScanTime);
    // WoT rewrites replay files with full stats after battle end, even for
    // battles the player left early. The scan inserts the complete version
    // under its real arenaUniqueID; clean up the stale partial_ counterparts.
    cacheService.cleanupPartialBattles(config.accountId);

    // Re-parse any remaining partial battles by reading their original .wotreplay files.
    // The incremental scan's filename-date filter skips files whose name timestamp has moved
    // outside the 2-minute safety window, even if WoT has since appended block1 to them.
    // Reading them directly here costs one stat+read per pending partial — negligible.
    const partials = cacheService.getPartialBattles(config.accountId);
    if (partials.length > 0) {
      for (const partial of partials) {
        const filename = partial.arenaId.slice('partial_'.length);
        const filePath = path.join(config.replaysDir, `${filename}.wotreplay`);
        const reParsed = replayParser.parseReplay(filePath);
        if (reParsed && reParsed.result !== 'incomplete') {
          cacheService.resolvePartialBattle(config.accountId, partial.arenaId, {
            ...reParsed,
            id: 0,
            accountId: config.accountId,
          } as BattleRecord);
          result.added++;
        }
      }

      // Fallback: if WoT did not rewrite the dated file (observed on some Windows setups),
      // check temp.wotreplay — WoT appends block1 there when the server battle ends.
      const stillPartials = cacheService.getPartialBattles(config.accountId);
      if (stillPartials.length > 0) {
        const tempPath = path.join(config.replaysDir, 'temp.wotreplay');
        const tempParsed = replayParser.parseReplay(tempPath);
        if (tempParsed && tempParsed.result !== 'incomplete') {
          for (const partial of stillPartials) {
            if (partial.tankKey === tempParsed.tankKey && partial.playedAt === tempParsed.playedAt) {
              cacheService.resolvePartialBattle(config.accountId, partial.arenaId, {
                ...tempParsed,
                id: 0,
                accountId: config.accountId,
              } as BattleRecord);
              result.added++;
              break;
            }
          }
        }
      }
    }

    return result;
  });

  handle('replays:list', async (limit, offset) => {
    const config = configService.getConfig();
    const battles = cacheService.getBattles(
      config.accountId,
      assertOptionalNumber(limit, 'limit', 10),
      assertOptionalNumber(offset, 'offset', 0),
    );
    // Ensure expected values and name→tankId mapping are loaded.
    // Both are in-memory cached so after first call this is instant.
    await Promise.all([getWn8Exp(), getWgData(config)]);

    return battles.map(b => {
      // Prefer tag-based lookup (exact match to WG internal vehicle tag) over name matching
      const extractedTag = extractVehicleTag(b.tankKey);
      const tankId = memTagToTankId?.get(extractedTag)
        ?? memNameToTankId?.get(b.tankName);
      const exp = tankId !== undefined ? memWn8Exp?.get(tankId) : undefined;
      const vehicle = tankId !== undefined ? memEncyclopedia?.[tankId] : undefined;
      // When the XVM expected-values map is loaded but has no entry for this tank
      // (e.g. recently added vehicles not yet covered by XVM), skip WN8/WNX rather
      // than running the rough fallback formula. The fallback produces wildly inflated
      // per-battle values (single wins at high damage can push past 3000+) because it
      // was designed for multi-battle averages, not individual games.
      // Consistent with computeOverallWn8AndWnx and replays:recent-stats which both
      // already skip tanks without expected values.
      const hasExp = exp !== undefined;
      const noExpMap = memWn8Exp !== null && !hasExp;
      const single = {
        battles: 1,
        wins: b.result === 'win' ? 1 : 0,
        damage_dealt: b.damage,
        frags: b.kills,
        spotted: b.spotted,
        dropped_capture_points: b.droppedCapture,
      };
      if (b.result === 'incomplete') return { ...b, tankType: vehicle?.type, tankIsPremium: vehicle?.is_premium, wn8: undefined, wnx: undefined };
      return {
        ...b,
        // Normalize names stored before the _v<N> stripping fix was applied.
        tankName: b.tankName.replace(/ v\d+$/, ''),
        tankType: vehicle?.type,
        tankIsPremium: vehicle?.is_premium,
        wn8: noExpMap ? undefined : calculateWn8(single, exp),
        wnx: noExpMap ? undefined : calculateWnx(
          { ...single, avg_damage_assisted_radio: b.assist },
          exp,
        ),
      };
    });
  });

  handle('replays:count', () => {
    const config = configService.getConfig();
    return cacheService.getBattlesCount(config.accountId);
  });

  handle('replays:recent-stats', async (limitRaw) => {
    const config = configService.getConfig();
    const limit = assertOptionalNumber(limitRaw, 'limit', 1000);
    await Promise.all([getWgData(config), getWn8Exp()]);
    const groups = cacheService.getRecentBattlesByTank(config.accountId, limit);
    let totalBattles = 0;
    let totalWn8Weighted = 0;
    let totalWnxWeighted = 0;
    for (const g of groups) {
      if (g.battles === 0) continue;
      const tankId = memTagToTankId?.get(extractVehicleTag(g.tankKey));
      const exp = tankId !== undefined ? memWn8Exp?.get(tankId) : undefined;
      if (memWn8Exp && !exp) continue;
      const stats = {
        battles: g.battles,
        wins: g.wins,
        damage_dealt: g.damage,
        frags: g.kills,
        spotted: g.spotted,
        dropped_capture_points: g.dropped,
      };
      totalWn8Weighted += calculateWn8(stats, exp) * g.battles;
      totalWnxWeighted += calculateWnx(
        { ...stats, avg_damage_assisted_radio: g.assist / g.battles },
        exp,
      ) * g.battles;
      totalBattles += g.battles;
    }
    if (totalBattles === 0) return { wn8: 0, wnx: 0, battles: 0 };
    return {
      wn8: Math.round(totalWn8Weighted / totalBattles),
      wnx: Math.round(totalWnxWeighted / totalBattles),
      battles: totalBattles,
    };
  });

  handle('replays:map-stats', (sinceMs) => {
    const config = configService.getConfig();
    return cacheService.getReplayMapStats(config.accountId, assertOptionalNumber(sinceMs, 'sinceMs', 0));
  });

  handle('replays:tank-stats', (sinceMs) => {
    const config = configService.getConfig();
    return cacheService.getReplayTankStats(config.accountId, assertOptionalNumber(sinceMs, 'sinceMs', 0));
  });

  handle('replays:economy', (days) => {
    const config = configService.getConfig();
    return cacheService.getEconomyByDay(config.accountId, assertOptionalNumber(days, 'days', 30));
  });

  handle('replays:sessions', (limit) => {
    const config = configService.getConfig();
    return cacheService.getSessions(config.accountId, assertOptionalNumber(limit, 'limit', 30));
  });

  handle('app:version', () => app.getVersion());

  handle('update:check', () => updaterService.checkForUpdates());

  handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle('shell:openExternal', (url) => {
    const urlStr = url as string;
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new Error(`Invalid URL: ${urlStr}`);
    }
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error(`Disallowed URL protocol: ${parsed.protocol}`);
    }
    return shell.openExternal(urlStr);
  });
}
