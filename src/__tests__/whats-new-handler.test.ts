/**
 * app:whats-new + app:mark-version-seen IPC handler tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlerMap = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/hulldown-test'),
    getVersion: vi.fn(() => '1.12.0'),
    isPackaged: false,
  },
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
    statistics: { all: { battles: 0, wins: 0, damage_dealt: 0, frags: 0, survived_battles: 0, spotted: 0, xp: 0, dropped_capture_points: 0 } },
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

const { readFileSync, writeFileSync } = vi.hoisted(() => ({
  readFileSync: vi.fn(() => JSON.stringify({ lastSeenVersion: '1.11.0' })),
  writeFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { readFileSync, writeFileSync, existsSync: vi.fn(() => true) },
  readFileSync,
  writeFileSync,
  existsSync: vi.fn(() => true),
}));

import * as configService from '../main/services/config';
import { registerHandlers } from '../main/ipc/handlers';

registerHandlers();

async function invoke(channel: string, ...args: unknown[]) {
  const fn = handlerMap.get(channel);
  if (!fn) throw new Error(`No handler registered for: ${channel}`);
  return fn(...args);
}

describe('app:whats-new handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileSync.mockReturnValue(JSON.stringify({ lastSeenVersion: '1.11.0' }));
  });

  it('shows release notes when setup is complete and version advanced', async () => {
    const result = await invoke('app:whats-new') as { show: boolean; currentVersion: string; notes: { version: string }[] };

    expect(result.show).toBe(true);
    expect(result.currentVersion).toBe('1.12.0');
    expect(result.notes.some(n => n.version === '1.12.0')).toBe(true);
  });

  it('hides release notes when replays folder is not configured yet', async () => {
    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: '', accountId: 0, username: '', region: 'EU', replaysDir: '', autoRefresh: true,
    });

    const result = await invoke('app:whats-new') as { show: boolean };

    expect(result.show).toBe(false);
  });

  it('hides release notes when user already acknowledged this version', async () => {
    readFileSync.mockReturnValue(JSON.stringify({ lastSeenVersion: '1.12.0' }));

    const result = await invoke('app:whats-new') as { show: boolean };

    expect(result.show).toBe(false);
  });
});

describe('app:mark-version-seen handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileSync.mockReturnValue(JSON.stringify({ lastSeenVersion: '' }));
  });

  it('persists the current app version', async () => {
    await invoke('app:mark-version-seen');

    expect(writeFileSync).toHaveBeenCalled();
    const written = JSON.parse(writeFileSync.mock.calls[0][1] as string);
    expect(written.lastSeenVersion).toBe('1.12.0');
  });
});
