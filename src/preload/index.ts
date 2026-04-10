import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, PlayerInfo, Tank, TankDetails, CacheStats, ProgressSnapshot, NewsItem, PatchItem, BattleRecord, UpdateInfo } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),
  searchPlayer: (username: string, region: string): Promise<{ account_id: number; nickname: string }[]> =>
    ipcRenderer.invoke('player:search', username, region),
  getPlayerInfo: (): Promise<PlayerInfo> => ipcRenderer.invoke('player:info'),
  getTankList: (): Promise<Tank[]> => ipcRenderer.invoke('tanks:list'),
  getTankDetails: (tankId: number): Promise<TankDetails> => ipcRenderer.invoke('tanks:details', tankId),
  getTankRecommendations: (tankId: number, force?: boolean): Promise<TankDetails> => ipcRenderer.invoke('tanks:recommendations', tankId, force),
  clearMemCache: (): Promise<void> => ipcRenderer.invoke('cache:clearMem'),
  clearCache: (): Promise<void> => ipcRenderer.invoke('cache:clear'),
  getCacheStats: (): Promise<CacheStats> => ipcRenderer.invoke('cache:stats'),
  getProgress: (): Promise<ProgressSnapshot[]> => ipcRenderer.invoke('progress:list'),
  getNews: (): Promise<NewsItem[]> => ipcRenderer.invoke('news:fetch'),
  getPatches: (): Promise<PatchItem[]> => ipcRenderer.invoke('patches:fetch'),
  getTodaySession: (): Promise<import('../main/services/cache').TodaySession | null> => ipcRenderer.invoke('session:today'),
  detectPlayer: (): Promise<import('../main/services/replay-parser').DetectedPlayer | null> => ipcRenderer.invoke('player:detect'),
  detectAllPlayers: (): Promise<import('../main/services/replay-parser').DetectedPlayer[]> => ipcRenderer.invoke('player:detect-all'),
  getTankMapStats: (tankName: string): Promise<{ mapName: string; battles: number; winRate: number; avgDamage: number }[]> => ipcRenderer.invoke('replays:tank-maps', tankName),
  clearBattles: (): Promise<void> => ipcRenderer.invoke('replays:clear'),
  scanReplays: (): Promise<{ added: number; skipped: number; errors: number }> => ipcRenderer.invoke('replays:scan'),
  updateBattle: (id: number, damage: number, assist: number, kills: number, result: 'win' | 'loss' | 'draw'): Promise<void> =>
    ipcRenderer.invoke('replays:update-battle', id, damage, assist, kills, result),

  getBattles: (limit?: number, offset?: number): Promise<BattleRecord[]> => ipcRenderer.invoke('replays:list', limit, offset),
  getBattlesCount: (): Promise<number> => ipcRenderer.invoke('replays:count'),
  getMapStats: (sinceMs?: number): Promise<import('../main/services/cache').ReplayMapStat[]> => ipcRenderer.invoke('replays:map-stats', sinceMs),
  getTankRecentStats: (sinceMs?: number): Promise<import('../main/services/cache').ReplayTankStat[]> => ipcRenderer.invoke('replays:tank-stats', sinceMs),
  getEconomy: (days?: number): Promise<import('../main/services/cache').EconomyDay[]> => ipcRenderer.invoke('replays:economy', days),
  getSessions: (limit?: number): Promise<import('../main/services/cache').SessionSummary[]> => ipcRenderer.invoke('replays:sessions', limit),
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  checkForUpdates: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('update:check'),
});
