/**
 * ai:usage IPC handler tests
 * Paths: own Claude key configured (unlimited, no counter), free tier usage
 * returned, proxy failure handled gracefully (never throws to the renderer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlerMap = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => '1.0.0') },
  ipcMain: {
    handle: (channel: string, fn: (_event: unknown, ...args: unknown[]) => unknown) => {
      handlerMap.set(channel, async (...args) => fn(null, ...args));
    },
  },
  shell: { openExternal: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}));

vi.mock('../main/services/config', () => ({
  getConfig: vi.fn(() => ({
    claudeApiKey: '',
    accountId: 1000,
    username: 'TestPlayer',
    region: 'EU',
    replaysDir: '/replays',
    autoRefresh: true,
  })),
  saveConfig: vi.fn(),
}));

vi.mock('../main/services/wargaming', () => ({
  getPlayerTankStats: vi.fn(async () => []),
  getVehicleEncyclopedia: vi.fn(async () => ({})),
  getWn8ExpectedValues: vi.fn(async () => new Map()),
  searchPlayer: vi.fn(async () => []),
  getPlayerInfo: vi.fn(async () => ({
    account_id: 1000, nickname: 'P', created_at: 0, last_battle_time: 0,
    statistics: {
      all: {
        battles: 0, wins: 0, damage_dealt: 0, frags: 0,
        survived_battles: 0, spotted: 0, xp: 0, dropped_capture_points: 0,
      },
    },
  })),
}));

vi.mock('../main/services/news', () => ({ fetchNews: vi.fn(async () => []) }));
vi.mock('../main/services/patches', () => ({ fetchPatches: vi.fn(async () => []) }));
vi.mock('../main/services/replay-parser', () => ({
  scanReplays: vi.fn(async () => ({ added: 0, skipped: 0, errors: 0 })),
  detectPlayerFromReplays: vi.fn(() => null),
  detectAllPlayersFromReplays: vi.fn(() => []),
  parseReplay: vi.fn(() => null),
}));
vi.mock('../main/services/updater', () => ({ checkForUpdates: vi.fn(async () => null) }));
vi.mock('../main/services/analytics', () => ({ getWeeklyCoachData: vi.fn() }));

vi.mock('../main/services/cache', () => ({
  getWeeklyReport: vi.fn(), saveWeeklyReport: vi.fn(), listWeeklyReports: vi.fn(() => []),
  getBattleDebrief: vi.fn(() => null), saveBattleDebrief: vi.fn(),
  getBattleByArenaId: vi.fn(() => null), getTankBaseline: vi.fn(() => null),
  getPlayerInfo: vi.fn(() => null), savePlayerInfo: vi.fn(),
  getLastProgressSnapshot: vi.fn(() => null), saveProgressSnapshot: vi.fn(),
  getWgDataCache: vi.fn(() => null), saveWgDataCache: vi.fn(),
  getLastScanTime: vi.fn(() => 0), setLastScanTime: vi.fn(),
  cleanupPartialBattles: vi.fn(() => 0), getPartialBattles: vi.fn(() => []),
  getBattles: vi.fn(() => []), getBattlesCount: vi.fn(() => 0),
  getKnownArenaIds: vi.fn(() => new Set()), insertBattles: vi.fn(),
  clearAll: vi.fn(), clearApiCaches: vi.fn(), clearBattles: vi.fn(),
  clearPlayerInfoCache: vi.fn(), clearWgDataCache: vi.fn(),
  getStats: vi.fn(() => ({ tanks: 0, lastSync: null })), getProgressSnapshots: vi.fn(() => []),
  getTodaySession: vi.fn(() => null), getReplayMapStats: vi.fn(() => []),
  getReplayTankStats: vi.fn(() => []), getEconomyByDay: vi.fn(() => []),
  getSessions: vi.fn(() => []), getReplayTankContext: vi.fn(() => null),
  getRecentBattlesByTank: vi.fn(() => []), backfillMissingWnx: vi.fn(),
  clearBattleDebriefs: vi.fn(), invalidateKnownArenaIds: vi.fn(), resolvePartialBattle: vi.fn(),
}));

vi.mock('../main/services/claude', async () => {
  const actual = await vi.importActual<typeof import('../main/services/claude')>('../main/services/claude');
  return { callClaude: vi.fn(), sanitizeForPrompt: vi.fn((s: string) => s), withAICache: actual.withAICache };
});

vi.mock('../main/services/free-ai', () => ({
  callFreeAI: vi.fn(),
  getFreeAIUsage: vi.fn(),
  FreeAILimitError: class FreeAILimitError extends Error {},
}));

vi.mock('../main/ai/tank-recommendations', () => ({ generateTankRecommendations: vi.fn() }));

// ---------------------------------------------------------------------------

import * as configService from '../main/services/config';
import * as freeAiService from '../main/services/free-ai';
import { registerHandlers } from '../main/ipc/handlers';
import type { FreeAIUsageInfo } from '../shared/types';

registerHandlers();

async function invoke(channel: string, ...args: unknown[]) {
  const fn = handlerMap.get(channel);
  if (!fn) throw new Error(`No handler registered for: ${channel}`);
  return fn(...args);
}

const mockUsage: FreeAIUsageInfo = {
  day: '2026-07-08',
  features: {
    debrief: { used: 3, limit: 50, remaining: 47, globalAvailable: true },
    'tank-tips': { used: 0, limit: 50, remaining: 50, globalAvailable: true },
    'weekly-coach': { used: 1, limit: 20, remaining: 19, globalAvailable: true },
  },
};

describe('ai:usage handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the user has their own Claude API key (unlimited)', async () => {
    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: 'own-key', accountId: 1000, username: 'TestPlayer',
      region: 'EU', replaysDir: '/replays', autoRefresh: true,
    });

    const result = await invoke('ai:usage');

    expect(result).toBeNull();
    expect(freeAiService.getFreeAIUsage).not.toHaveBeenCalled();
  });

  it('returns free-tier usage when no Claude API key is configured', async () => {
    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: '', accountId: 1000, username: 'TestPlayer',
      region: 'EU', replaysDir: '/replays', autoRefresh: true,
    });
    vi.mocked(freeAiService.getFreeAIUsage).mockResolvedValue(mockUsage);

    const result = await invoke('ai:usage');

    expect(result).toEqual(mockUsage);
  });

  it('returns null (never throws) when the proxy is unreachable', async () => {
    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: '', accountId: 1000, username: 'TestPlayer',
      region: 'EU', replaysDir: '/replays', autoRefresh: true,
    });
    vi.mocked(freeAiService.getFreeAIUsage).mockRejectedValue(new Error('network error'));

    const result = await invoke('ai:usage');

    expect(result).toBeNull();
  });
});
