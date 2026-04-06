export interface AppConfig {
  claudeApiKey: string;
  accountId: number;
  username: string;
  region: string;
  replaysDir: string;
}

export interface BattleRecord {
  id: number;
  accountId: number;
  arenaId: string;
  playedAt: number;
  tankKey: string;
  tankName: string;
  mapName: string;
  battleType: string;
  result: 'win' | 'loss' | 'draw';
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
