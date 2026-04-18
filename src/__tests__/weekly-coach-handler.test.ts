/**
 * coach:weekly-report + coach:report-history IPC handler tests
 * Paths: cache hit, cache miss, no API key, zero battles, force refresh
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

// Cache mock
vi.mock('../main/services/cache', () => ({
  getWeeklyReport: vi.fn(),
  saveWeeklyReport: vi.fn(),
  listWeeklyReports: vi.fn(() => []),
  getWeeklyCoachData: vi.fn(),
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

// Claude mock
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
import type { WeeklyCoachReport } from '../shared/types';

// Register handlers once
registerHandlers();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-04-17T12:00:00.000Z').getTime();
const WEEK_MS = 7 * 24 * 3600 * 1000;

const mockCoachData = {
  thisWeek: { battles: 10, wins: 6, losses: 4, hoursPlayed: 2.5, totalDamage: 25000, totalFrags: 20, totalSpotted: 8, avgDamage: 2500, winRate: 60, avgNetCredits: 25000, survivalRate: 30, avgLifeTimeSec: 240, avgDmgReceived: 1800, avgDmgBlocked: 900, earlyDeathRate: 22 },
  priorWeek: { battles: 8, wins: 4, losses: 4, hoursPlayed: 2, totalDamage: 18000, totalFrags: 14, totalSpotted: 6, avgDamage: 2250, winRate: 50, avgNetCredits: 20000, survivalRate: 35, avgLifeTimeSec: 260, avgDmgReceived: 1500, avgDmgBlocked: 700, earlyDeathRate: 18 },
  progressDelta: { wn8Start: 1500, wn8End: 1650, wn8Delta: 150, wnxStart: 1600, wnxEnd: 1750, wnxDelta: 150, wrStart: 52, wrEnd: 55, wrDelta: 3 },
  thirtyDayBaseline: { battles: 40, wn8: null, winRate: 51, avgDmg: 2100 },
  topImprovers: [],
  topDecliners: [],
  bestMaps: [],
  worstMaps: [],
  highlightBattle: { arenaId: 'arena-best', tankName: 'E 100', mapName: 'Prokhorovka', damage: 5000, frags: 3, result: 'win', playedAt: NOW - 50000 },
};

const mockClaudeResponse = {
  summary: 'WN8 up +150 on 10 battles — your mediums carried the week.',
  focusTanks: [
    { tankName: 'T-54', delta: '+450 dmg', reason: 'Highest-delta tank vs 30d baseline over 6 battles.' },
  ],
  restTanks: [
    { tankName: 'IS-7', delta: '-220 dmg', reason: 'Dropped 220 avg dmg on 5 battles this week.' },
  ],
  mapPlaybook: [
    { mapName: 'Prokhorovka', winRate: 68, tip: 'Push the 1-line with your mediums; use rail embankment for gun depression.' },
  ],
  mapsToAvoid: [
    { mapName: 'Mines', winRate: 35, reason: '3 battles, 35% WR, avg 1100 dmg.' },
  ],
  commonMistakes: [
    { pattern: 'Taking too much damage', evidence: 'avgDmgReceived 1800 vs 1500 on priorWeek — +20% taken', fix: 'Angle hull before peeking, use hard cover.' },
  ],
  oneThingToFix: 'Stop playing IS-7 on open maps — rotate to T-54 instead.',
  highlightArenaId: 'arena-best',
};

const mockCachedReport: WeeklyCoachReport = {
  summary: mockClaudeResponse.summary,
  focusTanks: mockClaudeResponse.focusTanks,
  restTanks: mockClaudeResponse.restTanks,
  mapPlaybook: mockClaudeResponse.mapPlaybook,
  mapsToAvoid: mockClaudeResponse.mapsToAvoid,
  commonMistakes: mockClaudeResponse.commonMistakes,
  oneThingToFix: mockClaudeResponse.oneThingToFix,
  highlightBattle: {
    arenaId: 'arena-best',
    tankName: 'E 100',
    mapName: 'Prokhorovka',
    damage: 5000,
    frags: 3,
    result: 'win',
  },
  generatedAt: NOW - 3600000,
  model: 'claude-sonnet-4-6',
  periodStartMs: NOW - 7 * 24 * 3600 * 1000,
  periodEndMs: NOW,
};

// ---------------------------------------------------------------------------
// Convenience invoke
// ---------------------------------------------------------------------------

async function invoke(channel: string, ...args: unknown[]) {
  const fn = handlerMap.get(channel);
  if (!fn) throw new Error(`No handler registered for: ${channel}`);
  return fn(...args);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('coach:weekly-report handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: 'test-api-key',
      accountId: 1000,
      username: 'TestPlayer',
      region: 'EU',
      replaysDir: '/replays',
      autoRefresh: true,
    });

    vi.mocked(cacheService.getWeeklyReport).mockReturnValue(null);
    vi.mocked(cacheService.getWeeklyCoachData).mockReturnValue(mockCoachData);
    vi.mocked(claudeService.callClaude).mockResolvedValue(mockClaudeResponse);
  });

  it('returns cached report without calling Claude (cache hit)', async () => {
    vi.mocked(cacheService.getWeeklyReport).mockReturnValue(mockCachedReport);
    const result = await invoke('coach:weekly-report');
    expect(result).toEqual(mockCachedReport);
    expect(claudeService.callClaude).not.toHaveBeenCalled();
  });

  it('calls Claude and saves report on cache miss', async () => {
    const result = await invoke('coach:weekly-report') as WeeklyCoachReport;
    expect(claudeService.callClaude).toHaveBeenCalledOnce();
    expect(result.summary).toBe(mockClaudeResponse.summary);
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(typeof result.generatedAt).toBe('number');
    expect(typeof result.periodStartMs).toBe('number');
    expect(typeof result.periodEndMs).toBe('number');
    expect(result.focusTanks).toHaveLength(1);
    expect(result.commonMistakes).toHaveLength(1);
    expect(result.commonMistakes[0].pattern).toBe('Taking too much damage');
    expect(result.oneThingToFix).toBe(mockClaudeResponse.oneThingToFix);
    // Highlight battle reconstructed from candidate data (not trusted from Claude)
    expect(result.highlightBattle).toEqual({
      arenaId: 'arena-best',
      tankName: 'E 100',
      mapName: 'Prokhorovka',
      damage: 5000,
      frags: 3,
      result: 'win',
    });
    expect(cacheService.saveWeeklyReport).toHaveBeenCalledWith(
      1000,
      expect.stringMatching(/^\d{4}-W\d{2}$/),
      expect.objectContaining({ summary: mockClaudeResponse.summary }),
    );
  });

  it('bypasses cache and calls Claude when force=true', async () => {
    vi.mocked(cacheService.getWeeklyReport).mockReturnValue(mockCachedReport); // cache populated
    await invoke('coach:weekly-report', true);
    expect(claudeService.callClaude).toHaveBeenCalledOnce();
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
    await expect(invoke('coach:weekly-report')).rejects.toThrow('AI not configured');
  });

  it('throws "No battles this week" when battles === 0', async () => {
    vi.mocked(cacheService.getWeeklyCoachData).mockReturnValue({
      ...mockCoachData,
      thisWeek: { ...mockCoachData.thisWeek, battles: 0 },
    });
    await expect(invoke('coach:weekly-report')).rejects.toThrow('No battles this week');
  });

  it('attaches correct metadata fields to the report', async () => {
    const result = await invoke('coach:weekly-report') as WeeklyCoachReport;
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.periodEndMs).toBeGreaterThan(result.periodStartMs);
    expect(result.periodEndMs - result.periodStartMs).toBeCloseTo(WEEK_MS, -3);
  });

  it('returns null highlightBattle when Claude picks a mismatched arenaId', async () => {
    vi.mocked(claudeService.callClaude).mockResolvedValue({
      ...mockClaudeResponse,
      highlightArenaId: 'not-the-candidate',
    });
    const result = await invoke('coach:weekly-report') as WeeklyCoachReport;
    expect(result.highlightBattle).toBeNull();
  });

  it('returns null highlightBattle when Claude picks null', async () => {
    vi.mocked(claudeService.callClaude).mockResolvedValue({
      ...mockClaudeResponse,
      highlightArenaId: null,
    });
    const result = await invoke('coach:weekly-report') as WeeklyCoachReport;
    expect(result.highlightBattle).toBeNull();
  });

  it('passes pretty-printed JSON user payload to callClaude', async () => {
    await invoke('coach:weekly-report');
    const callArgs = vi.mocked(claudeService.callClaude).mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
    expect(callArgs.maxTokens).toBe(2000);
    // user payload should be a valid pretty-printed JSON string
    expect(() => JSON.parse(callArgs.user)).not.toThrow();
    const payload = JSON.parse(callArgs.user);
    expect(payload.thisWeek).toBeDefined();
    expect(payload.highlightBattleCandidate).toBeDefined();
  });
});

describe('coach:report-history handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configService.getConfig).mockReturnValue({
      claudeApiKey: 'test-api-key',
      accountId: 1000,
      username: 'TestPlayer',
      region: 'EU',
      replaysDir: '/replays',
      autoRefresh: true,
    });
  });

  it('returns empty array when no reports exist', async () => {
    vi.mocked(cacheService.listWeeklyReports).mockReturnValue([]);
    const result = await invoke('coach:report-history');
    expect(result).toEqual([]);
  });

  it('delegates to listWeeklyReports with account and limit', async () => {
    const mockList = [{ isoWeek: '2026-W16', createdAt: NOW }];
    vi.mocked(cacheService.listWeeklyReports).mockReturnValue(mockList);
    const result = await invoke('coach:report-history', 5);
    expect(cacheService.listWeeklyReports).toHaveBeenCalledWith(1000, 5);
    expect(result).toEqual(mockList);
  });

  it('uses default limit 10 when no limit provided', async () => {
    vi.mocked(cacheService.listWeeklyReports).mockReturnValue([]);
    await invoke('coach:report-history');
    expect(cacheService.listWeeklyReports).toHaveBeenCalledWith(1000, 10);
  });
});
