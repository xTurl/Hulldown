import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, PlayerInfo, Tank, TankDetails, CacheStats, ProgressSnapshot, NewsItem, BattleRecord } from './types';

contextBridge.exposeInMainWorld('api', {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),
  searchPlayer: (username: string, region: string): Promise<{ account_id: number; nickname: string }[]> =>
    ipcRenderer.invoke('player:search', username, region),
  getPlayerInfo: (): Promise<PlayerInfo> => ipcRenderer.invoke('player:info'),
  getTankList: (): Promise<Tank[]> => ipcRenderer.invoke('tanks:list'),
  getTankDetails: (tankId: number): Promise<TankDetails> => ipcRenderer.invoke('tanks:details', tankId),
  getTankRecommendations: (tankId: number, force?: boolean): Promise<TankDetails> => ipcRenderer.invoke('tanks:recommendations', tankId, force),
  clearCache: (): Promise<void> => ipcRenderer.invoke('cache:clear'),
  getCacheStats: (): Promise<CacheStats> => ipcRenderer.invoke('cache:stats'),
  getProgress: (): Promise<ProgressSnapshot[]> => ipcRenderer.invoke('progress:list'),
  getNews: (): Promise<NewsItem[]> => ipcRenderer.invoke('news:fetch'),
  getTodaySession: (): Promise<import('./services/cache').TodaySession | null> => ipcRenderer.invoke('session:today'),
  detectPlayer: (): Promise<import('./services/replay-parser').DetectedPlayer | null> => ipcRenderer.invoke('player:detect'),
  getTankMapStats: (tankName: string): Promise<{ mapName: string; battles: number; winRate: number; avgDamage: number }[]> => ipcRenderer.invoke('replays:tank-maps', tankName),
  clearBattles: (): Promise<void> => ipcRenderer.invoke('replays:clear'),
  scanReplays: (): Promise<{ added: number; skipped: number; errors: number }> => ipcRenderer.invoke('replays:scan'),

  getBattles: (limit?: number, offset?: number): Promise<BattleRecord[]> => ipcRenderer.invoke('replays:list', limit, offset),
  getBattlesCount: (): Promise<number> => ipcRenderer.invoke('replays:count'),
  getMapStats: (): Promise<import('./services/cache').ReplayMapStat[]> => ipcRenderer.invoke('replays:map-stats'),
  getTankRecentStats: (sinceMs?: number): Promise<import('./services/cache').ReplayTankStat[]> => ipcRenderer.invoke('replays:tank-stats', sinceMs),
  getEconomy: (days?: number): Promise<import('./services/cache').EconomyDay[]> => ipcRenderer.invoke('replays:economy', days),
  getSessions: (limit?: number): Promise<import('./services/cache').SessionSummary[]> => ipcRenderer.invoke('replays:sessions', limit),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
});
