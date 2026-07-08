export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  downloadUrl: string | null;
}

export interface AppConfig {
  claudeApiKey: string;
  accountId: number;
  username: string;
  region: string;
  replaysDir: string;
  autoRefresh: boolean;
}

/**
 * Config shape exposed to the renderer. The raw Claude API key never leaves
 * the main process — the renderer only learns whether a key is stored.
 */
export interface RendererConfig {
  accountId: number;
  username: string;
  region: string;
  replaysDir: string;
  autoRefresh: boolean;
  hasClaudeApiKey: boolean;
}

/**
 * Payload accepted by config:save. `claudeApiKey` is write-only:
 * a non-empty string replaces the stored key, anything else keeps it.
 */
export interface RendererConfigUpdate {
  accountId: number;
  username: string;
  region: string;
  replaysDir: string;
  autoRefresh: boolean;
  claudeApiKey?: string;
}

export interface BattleRecord {
  id: number;
  accountId: number;
  arenaId: string;
  playedAt: number;
  tankKey: string;
  tankName: string;
  tankType?: string;
  tankIsPremium?: boolean;
  /** Pre-computed by the main process using proper WN8 formula + XVM expected values. */
  wn8?: number;
  wnx?: number;
  mapName: string;
  battleType: string;
  result: 'win' | 'loss' | 'draw' | 'incomplete';
  damage: number;
  assist: number;
  kills: number;
  shots: number;
  hits: number;
  pens: number;
  spotted: number;
  xp: number;
  credits: number;
  survived: boolean;
  duration: number;
  droppedCapture: number;
  damageReceived: number;
  damageBlocked: number;
  repairCost: number;
  netCredits: number;
  markOfMastery: number;
  marksOnGun: number;
  lifeTime: number;
  achievements: number[];
  /** True when the player left before the battle ended locally (no block1 in the replay). */
  abandoned: boolean;
  /**
   * True when damage/frags/spotted/xp/etc. were reconstructed by diffing WG API
   * cumulative tank stats across two snapshots, rather than read directly from
   * a replay file. Only ever set on `abandoned` battles.
   */
  statsEstimated: boolean;
}

export interface PlayerStats {
  battles: number;
  wins: number;
  damage_dealt: number;
  frags: number;
  survived_battles: number;
  spotted: number;
  xp: number;
  dropped_capture_points: number;
}

export interface PlayerInfo {
  accountId: number;
  username: string;
  createdAt: number;
  lastBattle: number;
  statistics: PlayerStats;
  wn8?: number;
}

export interface Tank {
  tankId: number;
  name: string;
  tier: number;
  type: string;
  nation: string;
  isPremium: boolean;
  battles: number;
  wins: number;
  winRate: number;
  wn8: number;
  wnx: number;
  /** True when XVM expected values exist for this tank — WN8/WNX used real formula, not fallback approximation. */
  hasExpectedValues: boolean;
  avgDamage: number;
  avgDamageAssisted: number;
  avgDamageAssistedTrack: number;
  avgDamageBlocked: number;
  avgFrags: number;
  avgSpots: number;
  survivalRate: number;
  avgXp: number;
}

export interface MapStat {
  mapId: string;
  mapName: string;
  battles: number;
  wins: number;
  winRate: number;
  avgDamage: number;
}

export interface AIRecommendations {
  tips: string[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  generatedAt: number;
}

export interface TankDetails extends Tank {
  mapStats: MapStat[];
  recommendations: AIRecommendations | null;
  rawStats: Record<string, number>;
}

export interface CacheStats {
  tanks: number;
  lastSync: string | null;
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  pubTimestamp: number;
  description: string;
  isEvent: boolean;
  valueLevel: 'high' | 'standard' | null;
}

export interface PatchItem {
  title: string;
  link: string;
  pubDate: string;
  pubTimestamp: number;
  description: string;
  version: string | null;
  patchType: 'update' | 'hotfix' | 'micropatch';
}

export type FreeAIFeature = 'debrief' | 'weekly-coach' | 'tank-tips';

export interface FreeAIFeatureUsage {
  used: number;
  limit: number;
  remaining: number;
  /** False when the shared free-tier budget for this feature is exhausted for everyone today, regardless of this device's own remaining count. */
  globalAvailable: boolean;
}

/** Free-tier usage snapshot for the built-in AI proxy. `null` when the user has their own Claude API key (unlimited, no counter to show). */
export interface FreeAIUsageInfo {
  day: string;
  features: Record<FreeAIFeature, FreeAIFeatureUsage>;
}

export interface BattleDebrief {
  summary: string;
  wentWell: string[];
  wentWrong: string[];
  tips: string[];
  generatedAt: number;  // ms timestamp
  model: string;        // which Claude model produced it
}

export interface ProgressSnapshot {
  id: number;
  takenAt: number;
  battles: number;
  wn8: number;
  wnx: number;
  winRate: number;
  // Raw cumulative stats — used for accurate session delta computation
  rawWins: number;
  rawDamage: number;
  rawFrags: number;
  rawSurvived: number;
  rawXp: number;
  rawSpotted: number;
  rawDroppedCp: number;
}

// ---------------------------------------------------------------------------
// Replay analytics — aggregates computed in the main process and consumed by
// the renderer via IPC.
// ---------------------------------------------------------------------------

export interface ReplayMapStat {
  mapName: string; battles: number; wins: number; winRate: number;
  avgDamage: number; avgKills: number; avgAssist: number; avgSpotted: number;
}

export interface ReplayTankStat {
  tankName: string; tankKey: string; battles: number; wins: number; winRate: number;
  avgDamage: number; avgKills: number; avgAssist: number; avgBlocked: number;
  netCredits: number; bestMastery: number;
}

export interface EconomyDay {
  day: string; battles: number; wins: number;
  netCredits: number; grossCredits: number; totalRepairs: number;
}

export interface SessionSummary {
  sessionNum: number; startedAt: number; endedAt: number;
  battles: number; wins: number; winRate: number;
  avgDamage: number; avgKills: number; netCredits: number;
  totalDamage: number; totalFrags: number; totalSpotted: number;
  totalDropped: number; totalAssist: number;
}

export interface TodaySession {
  battles: number; wins: number; losses: number; winRate: number;
  avgDamage: number; avgAssist: number; avgFrags: number; avgSpots: number;
  survivalRate: number; tankCount: number;
  totalDamage: number; totalWins: number; totalFrags: number;
  totalSpotted: number; totalDropped: number; totalNetCredits: number;
}

export interface DetectedPlayer {
  playerName: string;
  accountId: number | null;
  region: string;
}

// ---------------------------------------------------------------------------
// Weekly Coach Report
// ---------------------------------------------------------------------------

export interface WeeklyCoachReport {
  summary: string;
  focusTanks: WeeklyTankCall[];
  restTanks: WeeklyTankCall[];
  mapPlaybook: WeeklyMapTip[];
  mapsToAvoid: WeeklyMapFlag[];
  commonMistakes: WeeklyMistake[];
  oneThingToFix: string;
  highlightBattle: WeeklyHighlightBattle | null;
  generatedAt: number;
  model: string;
  periodStartMs: number;
  periodEndMs: number;
}

export interface WeeklyMistake {
  pattern: string;
  evidence: string;
  fix: string;
}

export interface WeeklyTankCall {
  tankName: string;
  delta: string;
  reason: string;
}

export interface WeeklyMapTip {
  mapName: string;
  winRate: number;
  tip: string;
}

export interface WeeklyMapFlag {
  mapName: string;
  winRate: number;
  reason: string;
}

export interface WeeklyHighlightBattle {
  arenaId: string;
  tankName: string;
  mapName: string;
  damage: number;
  frags: number;
  result: 'win' | 'loss' | 'draw';
}
