/**
 * battle:debrief IPC handler tests
 * Paths: cache hit, cache miss, missing battle, incomplete battle, no API key, bad arenaId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// All mocks — declared before any imports
// ---------------------------------------------------------------------------

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
    claudeApiKey: 'test-api-key',
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

// Cache mock — all functions inlined as vi.fn() so hoisting works
vi.mock('../main/services/cache', () => ({
  getBattleDebrief: vi.fn(),
  saveBattleDebrief: vi.fn(),
  getBattleByArenaId: vi.fn(),
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
}));

// Claude mock — callClaude inlined so hoisting works
vi.mock('../main/services/claude', () => ({
  callClaude: vi.fn(),
  generateTankRecommendations: vi.fn(),
  sanitizeForPrompt: vi.fn((s: string) => s),
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import * as cacheService from '../main/services/cache';
import * as configService from '../main/services/config';
import * as claudeService from '../main/services/claude';
import { registerHandlers } from '../main/ipc/handlers';
import type { BattleRecord, BattleDebrief } from '../shared/types';

// Register handlers once
registerHandlers();

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockBattle: BattleRecord = {
  id: 1, accountId: 1000, arenaId: 'arena-test', playedAt: Date.now() - 60000,
  tankKey: 'germany-G123_E100', tankName: 'E 100', mapName: 'Prokhorovka',
  battleType: 'Standard', result: 'win', damage: 3000, assist: 400, kills: 2,
  shots: 12, hits: 9, pens: 8, spotted: 1, xp: 900, credits: 35000,
  survived: true, duration: 600, droppedCapture: 0, damageReceived: 600,
  damageBlocked: 500, repairCost: 1500, netCredits: 33500,
  markOfMastery: 3, marksOnGun: 1, lifeTime: 590, achievements: [],
};

const mockDebrief: BattleDebrief = {
  summary: 'Good game.', wentWell: ['High damage'], wentWrong: ['Died early'],
  tips: ['Use hull-down'], generatedAt: Date.now(), model: 'claude-haiku-4-5-20251001',
};

// Convenience: invoke a registered handler
async function invoke(channel: string, ...args: unknown[]) {
  const fn = handlerMap.get(channel);
  if (!fn) throw new Error(`No handler registered for: ${channel}`);
  return fn(...args);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('battle:debrief handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(cacheService.getBattleDebrief).mockReturnValue(null);
    vi.mocked(cacheService.getBattleByArenaId).mockReturnValue(mockBattle);
    vi.mocked(cacheService.getTankBaseline).mockReturnValue(null);

    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: 'test-api-key',
      accountId: 1000,
      username: 'TestPlayer',
      region: 'EU',
      replaysDir: '/replays',
      autoRefresh: true,
    });

    vi.mocked(claudeService.callClaude).mockResolvedValue({
      summary: 'Good game.',
      wentWell: ['High damage'],
      wentWrong: ['Died early'],
      tips: ['Use hull-down'],
    });
  });

  it('returns cached debrief without calling Claude (cache hit)', async () => {
    vi.mocked(cacheService.getBattleDebrief).mockReturnValue(mockDebrief);
    const result = await invoke('battle:debrief', 'arena-test');
    expect(result).toEqual(mockDebrief);
    expect(claudeService.callClaude).not.toHaveBeenCalled();
  });

  it('calls Claude and saves debrief on cache miss', async () => {
    const result = await invoke('battle:debrief', 'arena-test') as BattleDebrief;
    expect(claudeService.callClaude).toHaveBeenCalledOnce();
    expect(result.summary).toBe('Good game.');
    expect(result.model).toBe('claude-haiku-4-5-20251001');
    expect(typeof result.generatedAt).toBe('number');
    expect(cacheService.saveBattleDebrief).toHaveBeenCalledWith(
      'arena-test', 1000, expect.objectContaining({ summary: 'Good game.' }),
    );
  });

  it('bypasses cache and calls Claude when force=true', async () => {
    vi.mocked(cacheService.getBattleDebrief).mockReturnValue(mockDebrief); // cache populated
    await invoke('battle:debrief', 'arena-test', true);
    expect(claudeService.callClaude).toHaveBeenCalledOnce();
  });

  it('throws "Battle not found" when battle is missing from DB', async () => {
    vi.mocked(cacheService.getBattleByArenaId).mockReturnValue(null);
    await expect(invoke('battle:debrief', 'nonexistent')).rejects.toThrow('Battle not found');
  });

  it('throws when battle result is incomplete', async () => {
    vi.mocked(cacheService.getBattleByArenaId).mockReturnValue({ ...mockBattle, result: 'incomplete' });
    await expect(invoke('battle:debrief', 'arena-test')).rejects.toThrow('incomplete');
  });

  it('throws "AI not configured" when claudeApiKey is empty', async () => {
    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: '',
      accountId: 1000,
      username: 'TestPlayer',
      region: 'EU',
      replaysDir: '/replays',
      autoRefresh: true,
    });
    await expect(invoke('battle:debrief', 'arena-test')).rejects.toThrow('AI not configured');
  });

  it('throws when arenaId is not a string (validator)', async () => {
    await expect(invoke('battle:debrief', 123)).rejects.toThrow('arenaId');
  });
});
