import { contextBridge, ipcRenderer } from 'electron';
import type {
  RendererConfig, RendererConfigUpdate, PlayerInfo, Tank, TankDetails, CacheStats,
  ProgressSnapshot, NewsItem, PatchItem, BattleRecord, UpdateInfo, BattleDebrief,
  WeeklyCoachReport, ReplayMapStat, ReplayTankStat, EconomyDay, SessionSummary,
  TodaySession, DetectedPlayer, FreeAIUsageInfo, WhatsNewInfo,
} from '../shared/types';

/**
 * Electron wraps every rejected `ipcRenderer.invoke()` call as
 * `Error invoking remote method 'channel': Error: <original message>`
 * (sometimes with a stack trace appended after a newline). Renderer code
 * should only ever see the original, human-readable message the main
 * process actually threw.
 */
function unwrapIpcError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(String(e));
  const firstLine = e.message.split('\n')[0];
  const match = firstLine.match(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?(.*)$/);
  return match && match[1] ? new Error(match[1]) : e;
}

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).catch((e: unknown) => { throw unwrapIpcError(e); });
}

contextBridge.exposeInMainWorld('api', {
  getConfig: (): Promise<RendererConfig> => invoke('config:get'),
  saveConfig: (config: RendererConfigUpdate): Promise<void> => invoke('config:save', config),
  searchPlayer: (username: string, region: string): Promise<{ account_id: number; nickname: string }[]> =>
    invoke('player:search', username, region),
  getPlayerInfo: (): Promise<PlayerInfo> => invoke('player:info'),
  getTankList: (): Promise<Tank[]> => invoke('tanks:list'),
  getTankDetails: (tankId: number): Promise<TankDetails> => invoke('tanks:details', tankId),
  getTankRecommendations: (tankId: number, force?: boolean): Promise<TankDetails> => invoke('tanks:recommendations', tankId, force),
  clearMemCache: (): Promise<void> => invoke('cache:clearMem'),
  clearPlayerInfoCache: (): Promise<void> => invoke('cache:clearPlayerInfo'),
  clearCache: (): Promise<void> => invoke('cache:clear'),
  getCacheStats: (): Promise<CacheStats> => invoke('cache:stats'),
  getProgress: (): Promise<ProgressSnapshot[]> => invoke('progress:list'),
  getNews: (): Promise<NewsItem[]> => invoke('news:fetch'),
  getPatches: (): Promise<PatchItem[]> => invoke('patches:fetch'),
  getTodaySession: (): Promise<TodaySession | null> => invoke('session:today'),
  detectPlayer: (): Promise<DetectedPlayer | null> => invoke('player:detect'),
  detectAllPlayers: (): Promise<DetectedPlayer[]> => invoke('player:detect-all'),
  getTankMapStats: (tankName: string): Promise<{ mapName: string; battles: number; winRate: number; avgDamage: number }[]> => invoke('replays:tank-maps', tankName),
  clearBattles: (): Promise<void> => invoke('replays:clear'),
  scanReplays: (): Promise<{ added: number; skipped: number; errors: number; backfilled: number }> => invoke('replays:scan'),
  getBattles: (limit?: number, offset?: number): Promise<BattleRecord[]> => invoke('replays:list', limit, offset),
  getBattlesCount: (): Promise<number> => invoke('replays:count'),
  getRecentStats: (limit?: number): Promise<{ wn8: number; wnx: number; battles: number }> => invoke('replays:recent-stats', limit),
  getMapStats: (sinceMs?: number): Promise<ReplayMapStat[]> => invoke('replays:map-stats', sinceMs),
  getTankRecentStats: (sinceMs?: number): Promise<ReplayTankStat[]> => invoke('replays:tank-stats', sinceMs),
  getEconomy: (days?: number): Promise<EconomyDay[]> => invoke('replays:economy', days),
  getSessions: (limit?: number): Promise<SessionSummary[]> => invoke('replays:sessions', limit),
  selectFolder: (): Promise<string | null> => invoke('dialog:openFolder'),
  openExternal: (url: string): Promise<void> => invoke('shell:openExternal', url),
  checkForUpdates: (): Promise<UpdateInfo | null> => invoke('update:check'),
  getAppVersion: (): Promise<string> => invoke('app:version'),
  getBattleDebrief: (arenaId: string, force?: boolean): Promise<BattleDebrief> => invoke('battle:debrief', arenaId, force),
  getWeeklyReport: (force?: boolean): Promise<WeeklyCoachReport> => invoke('coach:weekly-report', force),
  getReportHistory: (limit?: number): Promise<{ isoWeek: string; createdAt: number }[]> => invoke('coach:report-history', limit),
  getAIUsage: (): Promise<FreeAIUsageInfo | null> => invoke('ai:usage'),
  getWhatsNew: (): Promise<WhatsNewInfo> => invoke('app:whats-new'),
  markVersionSeen: (): Promise<void> => invoke('app:mark-version-seen'),
});
