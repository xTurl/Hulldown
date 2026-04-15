import type { AppConfig, PlayerInfo, Tank, TankDetails, CacheStats, ProgressSnapshot, NewsItem, BattleRecord, UpdateInfo } from './index';
import type { ReplayMapStat, ReplayTankStat, EconomyDay, SessionSummary, TodaySession } from '../../main/services/cache';
import type { DetectedPlayer } from '../../main/services/replay-parser';

declare global {
  interface Window {
    api: {
      getConfig(): Promise<AppConfig>;
      saveConfig(config: AppConfig): Promise<void>;
      searchPlayer(username: string, region: string): Promise<{ account_id: number; nickname: string }[]>;
      getPlayerInfo(): Promise<PlayerInfo>;
      getTankList(): Promise<Tank[]>;
      getTankDetails(tankId: number): Promise<TankDetails>;
      getTankRecommendations(tankId: number, force?: boolean): Promise<TankDetails>;
      clearCache(): Promise<void>;
      clearPlayerInfoCache(): Promise<void>;
      getCacheStats(): Promise<CacheStats>;
      getProgress(): Promise<ProgressSnapshot[]>;
      getNews(): Promise<NewsItem[]>;
      clearBattles(): Promise<void>;
      scanReplays(): Promise<{ added: number; skipped: number; errors: number }>;
      getTodaySession(): Promise<TodaySession | null>;
      detectPlayer(): Promise<DetectedPlayer | null>;
      detectAllPlayers(): Promise<DetectedPlayer[]>;
      updateBattle(id: number, damage: number, assist: number, kills: number, result: 'win' | 'loss' | 'draw'): Promise<void>;
      getTankMapStats(tankName: string): Promise<{ mapName: string; battles: number; winRate: number; avgDamage: number }[]>;
      getBattles(limit?: number, offset?: number): Promise<BattleRecord[]>;
      getBattlesCount(): Promise<number>;
      getRecentStats(limit?: number): Promise<{ wn8: number; wnx: number; battles: number }>;
      getMapStats(sinceMs?: number): Promise<ReplayMapStat[]>;
      getTankRecentStats(sinceMs?: number): Promise<ReplayTankStat[]>;
      getEconomy(days?: number): Promise<EconomyDay[]>;
      getSessions(limit?: number): Promise<SessionSummary[]>;
      selectFolder(): Promise<string | null>;
      openExternal(url: string): Promise<void>;
      checkForUpdates(): Promise<UpdateInfo | null>;
      clearMemCache(): Promise<void>;
    };
  }
}
