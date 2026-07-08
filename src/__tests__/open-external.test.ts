/**
 * shell:openExternal IPC handler tests — protocol allowlist enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// All mocks — declared before any imports
// ---------------------------------------------------------------------------

const handlerMap = new Map<string, (...args: unknown[]) => Promise<unknown>>();
const openExternalMock = vi.fn(async () => undefined);

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => '1.0.0') },
  ipcMain: {
    handle: (channel: string, fn: (_event: unknown, ...args: unknown[]) => unknown) => {
      handlerMap.set(channel, async (...args) => fn(null, ...args));
    },
  },
  // Lazy reference — vi.mock factories are hoisted above const initialization
  shell: { openExternal: (...args: unknown[]) => openExternalMock(...(args as [])) },
  dialog: { showOpenDialog: vi.fn() },
}));

vi.mock('../main/services/config', () => ({
  getConfig: vi.fn(() => ({
    claudeApiKey: '', accountId: 1000, username: 'TestPlayer',
    region: 'EU', replaysDir: '', autoRefresh: true,
  })),
  saveConfig: vi.fn(),
}));

vi.mock('../main/services/wargaming', () => ({
  getPlayerTankStats: vi.fn(async () => []),
  getVehicleEncyclopedia: vi.fn(async () => ({})),
  getWn8ExpectedValues: vi.fn(async () => new Map()),
  searchPlayer: vi.fn(async () => []),
  getPlayerInfo: vi.fn(async () => null),
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
  getBattleDebrief: vi.fn(() => null),
  saveBattleDebrief: vi.fn(),
  getBattleByArenaId: vi.fn(() => null),
  getTankBaseline: vi.fn(() => null),
  getPlayerInfo: vi.fn(() => null),
  savePlayerInfo: vi.fn(),
  getLastProgressSnapshot: vi.fn(() => null),
  saveProgressSnapshot: vi.fn(),
  getWgDataCache: vi.fn(() => null),
  saveWgDataCache: vi.fn(),
  getLastScanTime: vi.fn(() => 0),
  setLastScanTime: vi.fn(),
  cleanupPartialBattles: vi.fn(() => 0),
  getPartialBattles: vi.fn(() => []),
  getBattles: vi.fn(() => []),
  getBattlesCount: vi.fn(() => 0),
  getKnownArenaIds: vi.fn(() => new Set()),
  insertBattles: vi.fn(),
  clearAll: vi.fn(),
  clearApiCaches: vi.fn(),
  clearBattles: vi.fn(),
  clearPlayerInfoCache: vi.fn(),
  clearWgDataCache: vi.fn(),
  getStats: vi.fn(() => ({ tanks: 0, lastSync: null })),
  getProgressSnapshots: vi.fn(() => []),
  getTodaySession: vi.fn(() => null),
  getReplayMapStats: vi.fn(() => []),
  getReplayTankStats: vi.fn(() => []),
  getEconomyByDay: vi.fn(() => []),
  getSessions: vi.fn(() => []),
  getReplayTankContext: vi.fn(() => null),
  getRecentBattlesByTank: vi.fn(() => []),
  backfillMissingWnx: vi.fn(),
  clearBattleDebriefs: vi.fn(),
  invalidateKnownArenaIds: vi.fn(),
  resolvePartialBattle: vi.fn(),
  getWeeklyReport: vi.fn(() => null),
  saveWeeklyReport: vi.fn(),
  listWeeklyReports: vi.fn(() => []),
}));

vi.mock('../main/services/claude', () => ({
  callClaude: vi.fn(),
  sanitizeForPrompt: vi.fn((s: string) => s),
  withAICache: vi.fn(),
}));

vi.mock('../main/ai/tank-recommendations', () => ({ generateTankRecommendations: vi.fn() }));
vi.mock('../main/ai/battle-debrief', () => ({ runBattleDebrief: vi.fn() }));
vi.mock('../main/ai/weekly-coach', () => ({ runWeeklyCoach: vi.fn() }));

// Import AFTER mocks
import { registerHandlers } from '../main/ipc/handlers';

registerHandlers();

async function invoke(channel: string, ...args: unknown[]) {
  const fn = handlerMap.get(channel);
  if (!fn) throw new Error(`No handler registered for: ${channel}`);
  return fn(...args);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shell:openExternal', () => {
  beforeEach(() => {
    openExternalMock.mockClear();
  });

  it('opens https URLs', async () => {
    await invoke('shell:openExternal', 'https://worldoftanks.eu/news');
    expect(openExternalMock).toHaveBeenCalledWith('https://worldoftanks.eu/news');
  });

  it('opens http URLs', async () => {
    await invoke('shell:openExternal', 'http://example.com');
    expect(openExternalMock).toHaveBeenCalledWith('http://example.com');
  });

  it('opens mailto URLs', async () => {
    await invoke('shell:openExternal', 'mailto:support@example.com');
    expect(openExternalMock).toHaveBeenCalledWith('mailto:support@example.com');
  });

  it('rejects javascript: URLs', async () => {
    await expect(invoke('shell:openExternal', 'javascript:alert(1)')).rejects.toThrow('Disallowed URL protocol');
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('rejects file: URLs', async () => {
    await expect(invoke('shell:openExternal', 'file:///etc/passwd')).rejects.toThrow('Disallowed URL protocol');
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('rejects custom app protocols (e.g. steam:)', async () => {
    await expect(invoke('shell:openExternal', 'steam://run/1')).rejects.toThrow('Disallowed URL protocol');
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it('rejects malformed URLs', async () => {
    await expect(invoke('shell:openExternal', 'not-a-url')).rejects.toThrow('Invalid URL');
    expect(openExternalMock).not.toHaveBeenCalled();
  });
});
