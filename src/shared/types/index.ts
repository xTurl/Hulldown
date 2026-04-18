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
