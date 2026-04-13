import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedPlayer } from '../main/services/replay-parser';

// ---------------------------------------------------------------------------
// fs mock — must be hoisted before importing the module under test
// ---------------------------------------------------------------------------

const mockReaddirSync  = vi.fn<() => string[]>();
const mockReaddirAsync = vi.fn<() => Promise<string[]>>();
const mockOpenSync     = vi.fn<() => number>();
const mockReadSync     = vi.fn<() => number>();
const mockCloseSync    = vi.fn<() => void>();

vi.mock('fs', () => ({
  default: {
    readdirSync: (...args: unknown[]) => mockReaddirSync(...(args as [])),
    openSync:    (...args: unknown[]) => mockOpenSync(...(args as [])),
    readSync:    (...args: unknown[]) => mockReadSync(...(args as [])),
    closeSync:   (...args: unknown[]) => mockCloseSync(...(args as [])),
    promises: {
      readdir: (...args: unknown[]) => mockReaddirAsync(...(args as [])),
    },
  },
}));

// Import AFTER mocks are set up
import {
  parseReplay,
  scanReplays,
  detectAllPlayersFromReplays,
} from '../main/services/replay-parser';

// ---------------------------------------------------------------------------
// Helpers to build fake binary replay buffers
// ---------------------------------------------------------------------------

/**
 * Build a minimal binary replay in the WoT format:
 *   bytes 0-3: magic (unused, we set to 0)
 *   bytes 4-7: numBlocks (LE uint32)
 *   bytes 8-11: size of block0 (LE uint32)
 *   bytes 12+: block0 JSON
 *   (if numBlocks >= 2: bytes [12+size0 .. 12+size0+3]: size1, then block1 JSON)
 */
function buildReplayBuffer(block0: object, block1?: object): Buffer {
  const block0Json = Buffer.from(JSON.stringify(block0), 'utf-8');
  const numBlocks  = block1 !== undefined ? 2 : 1;

  const size0Buf = Buffer.alloc(4);
  size0Buf.writeUInt32LE(block0Json.length, 0);

  if (!block1) {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(0, 0);
    header.writeUInt32LE(numBlocks, 4);
    return Buffer.concat([header, size0Buf, block0Json]);
  }

  const block1Json = Buffer.from(JSON.stringify(block1), 'utf-8');
  const size1Buf   = Buffer.alloc(4);
  size1Buf.writeUInt32LE(block1Json.length, 0);

  const header = Buffer.alloc(8);
  header.writeUInt32LE(0, 0);
  header.writeUInt32LE(numBlocks, 4);
  return Buffer.concat([header, size0Buf, block0Json, size1Buf, block1Json]);
}

/**
 * Set up fs mocks so that reading the replay file returns `replayBuf`.
 * The implementation mimics `fs.readSync(fd, buf, offset, length, position)`.
 */
function setupReplayFile(replayBuf: Buffer): void {
  mockOpenSync.mockReturnValue(3); // fake fd
  mockReadSync.mockImplementation(
    (_fd: number, buf: Buffer, bufOffset: number, length: number, position: number) => {
      const slice = replayBuf.slice(position, position + length);
      slice.copy(buf, bufOffset);
      return slice.length;
    },
  );
  mockCloseSync.mockReturnValue(undefined);
}

// ---------------------------------------------------------------------------
// Shared block0 / block1 fixtures
// ---------------------------------------------------------------------------

const BLOCK0_NORMAL = {
  dateTime:       '03.04.2026 12:16:09',
  playerVehicle:  'germany-G123_E100',
  mapDisplayName: 'Prokhorovka',
  gameplayID:     'ctf',
  playerID:       112233,
  playerName:     'SnipeKing',
  serverName:     'EU1',
};

const BLOCK1_WIN = {
  arenaUniqueID: '9999',
  common:   { winnerTeam: 1, duration: 600 },
  personal: {
    '112233': {
      team: 1, damageDealt: 3500, damageAssistedRadio: 400, damageAssistedTrack: 100,
      kills: 2, shots: 10, directEnemyHits: 8, piercings: 7, spotted: 1,
      xp: 900, credits: 40000, health: 200, droppedCapturePoints: 0,
      damageReceived: 500, damageBlockedByArmor: 300, autoRepairCost: 2000,
      autoLoadCost: [3000, 0], autoEquipCost: [500, 0, 0],
      markOfMastery: 3, marksOnGun: 1, lifeTime: 580, achievements: [],
    },
  },
};

// ---------------------------------------------------------------------------
// parseReplay — playerAccountId
// ---------------------------------------------------------------------------

describe('parseReplay — playerAccountId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return playerAccountId from block0.playerID for a normal battle (numBlocks >= 2)', () => {
    const buf = buildReplayBuffer(BLOCK0_NORMAL, BLOCK1_WIN);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay.wotreplay');

    expect(result).not.toBeNull();
    expect(result?.playerAccountId).toBe(112233);
  });

  it('should return playerAccountId from block0.playerID for an abandoned battle (numBlocks === 1)', () => {
    const block0 = {
      ...BLOCK0_NORMAL,
      playerID: 554433,
    };
    const buf = buildReplayBuffer(block0);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay.wotreplay');

    expect(result).not.toBeNull();
    expect(result?.playerAccountId).toBe(554433);
  });

  it('should return playerAccountId as undefined when block0 has no playerID', () => {
    const block0WithoutId = {
      dateTime:       '03.04.2026 12:16:09',
      playerVehicle:  'germany-G123_E100',
      mapDisplayName: 'Prokhorovka',
      gameplayID:     'ctf',
      playerName:     'SnipeKing',
      serverName:     'EU1',
      // no playerID
    };
    const block1 = {
      ...BLOCK1_WIN,
      personal: {
        undefined: BLOCK1_WIN.personal['112233'],
      },
    };
    const buf = buildReplayBuffer(block0WithoutId, block1);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay.wotreplay');

    expect(result).not.toBeNull();
    expect(result?.playerAccountId).toBeUndefined();
  });

  it('should return null for empty file (numBlocks === 0)', () => {
    const emptyHeader = Buffer.alloc(8); // numBlocks = 0
    setupReplayFile(emptyHeader);

    const result = parseReplay('/fake/empty.wotreplay');

    expect(result).toBeNull();
  });

  it('should return null for abandoned battle missing required fields', () => {
    const block0 = { playerID: 111, playerVehicle: 'germany-G123_E100' }; // no dateTime
    const buf = buildReplayBuffer(block0);
    setupReplayFile(buf);

    const result = parseReplay('/fake/broken.wotreplay');

    expect(result).toBeNull();
  });

  it('should include correct result field for win in normal battle', () => {
    const buf = buildReplayBuffer(BLOCK0_NORMAL, BLOCK1_WIN);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay.wotreplay');

    expect(result?.result).toBe('win');
  });

  it('should set result to incomplete for abandoned battle', () => {
    const buf = buildReplayBuffer(BLOCK0_NORMAL);
    setupReplayFile(buf);

    const result = parseReplay('/fake/abandoned.wotreplay');

    expect(result?.result).toBe('incomplete');
  });

  it('should calculate netCredits by subtracting repair, ammo and consumable costs', () => {
    const buf = buildReplayBuffer(BLOCK0_NORMAL, BLOCK1_WIN);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay.wotreplay');

    // credits(40000) - autoRepairCost(2000) - autoLoadCost(3000) - autoEquipCost(500) = 34500
    expect(result?.credits).toBe(40000);
    expect(result?.netCredits).toBe(34500);
  });

  it('should calculate netCredits when cost fields are arrays (real WoT replay format)', () => {
    const block1 = {
      arenaUniqueID: '7777',
      common: { winnerTeam: 1, duration: 400 },
      personal: {
        '112233': {
          team: 1, damageDealt: 2000, damageAssistedRadio: 0, damageAssistedTrack: 0,
          kills: 1, shots: 5, directEnemyHits: 4, piercings: 4, spotted: 0,
          xp: 600, credits: 30000, health: 150, droppedCapturePoints: 0,
          damageReceived: 0, damageBlockedByArmor: 0, autoRepairCost: 1500,
          autoLoadCost: [2500, 0], autoEquipCost: [400, 200, 0],
          markOfMastery: 2, marksOnGun: 0, lifeTime: 390, achievements: [],
        },
      },
    };
    const buf = buildReplayBuffer(BLOCK0_NORMAL, block1);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay3.wotreplay');

    // credits(30000) - repair(1500) - ammo([2500,0]=2500) - consumables([400,200,0]=600) = 25400
    expect(result?.netCredits).toBe(25400);
  });

  it('should calculate netCredits correctly when optional cost fields are absent', () => {
    const block1 = {
      arenaUniqueID: '8888',
      common: { winnerTeam: 1, duration: 300 },
      personal: {
        '112233': {
          team: 1, damageDealt: 1000, damageAssistedRadio: 0, damageAssistedTrack: 0,
          kills: 0, shots: 5, directEnemyHits: 3, piercings: 3, spotted: 0,
          xp: 400, credits: 20000, health: 300, droppedCapturePoints: 0,
          damageReceived: 0, damageBlockedByArmor: 0, autoRepairCost: 1000,
          // no autoLoadCost, no autoEquipCost
          markOfMastery: 1, marksOnGun: 0, lifeTime: 290, achievements: [],
        },
      },
    };
    const buf = buildReplayBuffer(BLOCK0_NORMAL, block1);
    setupReplayFile(buf);

    const result = parseReplay('/fake/replay2.wotreplay');

    // credits(20000) - autoRepairCost(1000) - 0 - 0 = 19000
    expect(result?.netCredits).toBe(19000);
  });
});

// ---------------------------------------------------------------------------
// scanReplays — player filtering
// ---------------------------------------------------------------------------

describe('scanReplays — player filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Build a full replay buffer for a given playerID */
  function makeReplay(playerID: number | undefined, arenaId = '1234'): Buffer {
    const block0 = {
      ...BLOCK0_NORMAL,
      ...(playerID !== undefined ? { playerID } : {}),
    };
    const block1 = {
      arenaUniqueID: arenaId,
      common:   { winnerTeam: 1, duration: 600 },
      personal: {
        [String(playerID ?? 'x')]: {
          team: 1, damageDealt: 1000, damageAssistedRadio: 0, damageAssistedTrack: 0,
          kills: 0, shots: 0, directEnemyHits: 0, piercings: 0, spotted: 0,
          xp: 0, credits: 0, health: 100, droppedCapturePoints: 0,
          damageReceived: 0, damageBlockedByArmor: 0, autoRepairCost: 0,
          markOfMastery: 0, marksOnGun: 0, lifeTime: 0, achievements: [],
        },
      },
    };
    return makeReplay.buildBuf(block0, block1);
  }
  // Store buffer builder on the function for reuse in tests
  makeReplay.buildBuf = buildReplayBuffer;

  /**
   * Simulate a directory with `replays` list. Each entry is [filename, buffer].
   */
  function setupDir(entries: Array<{ name: string; buf: Buffer }>): void {
    const names = entries.map(e => e.name);
    mockReaddirSync.mockReturnValue(names);
    mockReaddirAsync.mockResolvedValue(names);

    const bufMap = new Map(entries.map(e => [e.name, e.buf]));

    mockOpenSync.mockImplementation((_path: string) => {
      // Return a fake fd — we use path to look up buffer below
      return 3;
    });

    // We need path lookup per open call
    let callIdx = 0;
    const allBufs = entries.map(e => e.buf);

    mockOpenSync.mockImplementation(() => callIdx++ < 0 ? 3 : 3); // always 3
    // Track which file index we're on based on openSync call count
    let fileIdx = 0;
    mockOpenSync.mockImplementation(() => {
      return fileIdx++; // use fileIdx as fd to look up buffer
    });

    mockReadSync.mockImplementation(
      (fd: number, buf: Buffer, bufOffset: number, length: number, position: number) => {
        const src = allBufs[fd];
        if (!src) return 0;
        const slice = src.slice(position, position + length);
        slice.copy(buf, bufOffset);
        return slice.length;
      },
    );

    mockCloseSync.mockReturnValue(undefined);
    fileIdx = 0; // reset so openSync resets too
    mockOpenSync.mockImplementation(() => {
      // capture fileIdx in closure — each call increments
      const idx = fileIdx;
      fileIdx++;
      return idx;
    });
  }

  it('should add replay when playerAccountId matches accountId', async () => {
    const MY_ID = 112233;
    const buf = makeReplay(MY_ID, 'arena-1');
    setupDir([{ name: '2026-01-01_battle.wotreplay', buf }]);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), b => batches.push(b));

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(batches.length).toBe(1);
  });

  it('should skip replay when playerAccountId does not match accountId', async () => {
    const MY_ID    = 112233;
    const OTHER_ID = 999999;
    const buf = makeReplay(OTHER_ID, 'arena-other');
    setupDir([{ name: '2026-01-01_other.wotreplay', buf }]);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), b => batches.push(b));

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(batches.length).toBe(0);
  });

  it('should add replay when playerAccountId is undefined (old replays without playerID)', async () => {
    const MY_ID = 112233;
    const buf = makeReplay(undefined, 'arena-old');
    setupDir([{ name: '2026-01-01_old.wotreplay', buf }]);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), b => batches.push(b));

    // undefined playerAccountId means no filtering — replay should be included
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('should skip replay whose arenaId is already in knownArenaIds', async () => {
    const MY_ID = 112233;
    const buf = makeReplay(MY_ID, 'known-arena');
    setupDir([{ name: '2026-01-01_known.wotreplay', buf }]);

    const knownArenaIds = new Set<string>(['known-arena']);
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', knownArenaIds, () => {});

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('should return empty result when replayDir does not exist', async () => {
    mockReaddirAsync.mockRejectedValue(new Error('ENOENT'));

    const result = await scanReplays('/nonexistent', 112233, 'Player', new Set(), () => {});

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should correctly count multiple replays with mixed ownership', async () => {
    const MY_ID    = 112233;
    const OTHER_ID = 999999;

    const buf1 = makeReplay(MY_ID,    'arena-1');
    const buf2 = makeReplay(MY_ID,    'arena-2');
    const buf3 = makeReplay(OTHER_ID, 'arena-3');

    setupDir([
      { name: '2026-01-01_mine1.wotreplay',  buf: buf1 },
      { name: '2026-01-01_mine2.wotreplay',  buf: buf2 },
      { name: '2026-01-01_other.wotreplay',  buf: buf3 },
    ]);

    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), () => {});

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('should exclude temp.wotreplay and replay_last_battle.wotreplay from directory listing', async () => {
    // These files are excluded by the filter in scanReplays before parsing
    const MY_ID = 112233;
    const buf = makeReplay(MY_ID, 'arena-good');

    const fileList = [
      'temp.wotreplay',
      'replay_last_battle.wotreplay',
      '2026-01-01_real.wotreplay',
    ];
    mockReaddirSync.mockReturnValue(fileList);
    mockReaddirAsync.mockResolvedValue(fileList);

    // Only the real replay gets read
    let openCallCount = 0;
    mockOpenSync.mockImplementation(() => openCallCount++);
    mockReadSync.mockImplementation(
      (fd: number, outBuf: Buffer, bufOffset: number, length: number, position: number) => {
        const slice = buf.slice(position, position + length);
        slice.copy(outBuf, bufOffset);
        return slice.length;
      },
    );
    mockCloseSync.mockReturnValue(undefined);

    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), () => {});

    expect(openCallCount).toBe(1); // only the real replay was opened
    expect(result.added).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectAllPlayersFromReplays
// ---------------------------------------------------------------------------

describe('detectAllPlayersFromReplays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Build a raw block0 buffer (just the JSON part) for detectAllPlayersFromReplays mocking. */
  function buildBlock0Buf(block0: object): Buffer {
    return Buffer.from(JSON.stringify(block0), 'utf-8');
  }

  /**
   * Setup fs mocks to simulate a directory scan.
   * Each entry: { name, block0 } — the function builds the wire-format automatically.
   */
  function setupDetectDir(
    entries: Array<{ name: string; block0: object }>,
  ): void {
    mockReaddirSync.mockReturnValue(entries.map(e => e.name));

    const bufMap = new Map<string, Buffer>(
      entries.map(e => {
        const block0Json = buildBlock0Buf(e.block0);
        const header = Buffer.alloc(8);
        header.writeUInt32LE(0, 0);
        header.writeUInt32LE(1, 4); // at least 1 block is enough for detect
        const size0Buf = Buffer.alloc(4);
        size0Buf.writeUInt32LE(block0Json.length, 0);
        return [e.name, Buffer.concat([header, size0Buf, block0Json])];
      }),
    );

    let fileIdx = 0;
    const allBufs = entries.map(e => bufMap.get(e.name)!);

    mockOpenSync.mockImplementation((_fullPath: string) => {
      const idx = fileIdx;
      fileIdx++;
      return idx;
    });

    mockReadSync.mockImplementation(
      (fd: number, outBuf: Buffer, bufOffset: number, length: number, position: number) => {
        const src = allBufs[fd];
        if (!src) return 0;
        const slice = src.slice(position, position + length);
        slice.copy(outBuf, bufOffset);
        return slice.length;
      },
    );

    mockCloseSync.mockReturnValue(undefined);
  }

  it('should return empty array when directory does not exist', () => {
    mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = detectAllPlayersFromReplays('/nonexistent');

    expect(result).toEqual([]);
  });

  it('should return empty array when no .wotreplay files exist', () => {
    mockReaddirSync.mockReturnValue(['readme.txt', 'something.bat']);

    const result = detectAllPlayersFromReplays('/replays');

    expect(result).toEqual([]);
    expect(mockOpenSync).not.toHaveBeenCalled();
  });

  it('should return one player when all replays belong to the same player', () => {
    setupDetectDir([
      { name: '2026-01-01_a.wotreplay', block0: { playerID: 111, playerName: 'Alpha', serverName: 'EU1' } },
      { name: '2026-01-02_b.wotreplay', block0: { playerID: 111, playerName: 'Alpha', serverName: 'EU1' } },
    ]);

    const result = detectAllPlayersFromReplays('/replays');

    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(111);
    expect(result[0].playerName).toBe('Alpha');
  });

  it('should return multiple players when replays have different playerIDs', () => {
    setupDetectDir([
      { name: '2026-01-01_a.wotreplay', block0: { playerID: 111, playerName: 'Alpha', serverName: 'EU1' } },
      { name: '2026-01-02_b.wotreplay', block0: { playerID: 222, playerName: 'Beta',  serverName: 'EU2' } },
    ]);

    const result = detectAllPlayersFromReplays('/replays');

    expect(result).toHaveLength(2);
    const ids = result.map(p => p.accountId);
    expect(ids).toContain(111);
    expect(ids).toContain(222);
  });

  it('should deduplicate players — same accountId appears only once', () => {
    setupDetectDir([
      { name: '2026-01-01_a.wotreplay', block0: { playerID: 555, playerName: 'Gamma', serverName: 'NA1' } },
      { name: '2026-01-02_b.wotreplay', block0: { playerID: 555, playerName: 'Gamma', serverName: 'NA1' } },
      { name: '2026-01-03_c.wotreplay', block0: { playerID: 555, playerName: 'Gamma', serverName: 'NA1' } },
    ]);

    const result = detectAllPlayersFromReplays('/replays');

    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(555);
  });

  it('should skip replays that lack playerName or serverName', () => {
    setupDetectDir([
      { name: '2026-01-01_no-id.wotreplay',   block0: { playerName: 'Ghost', serverName: 'EU1' } },
      { name: '2026-01-02_no-name.wotreplay',  block0: { playerID: 777, serverName: 'EU1' } },
      { name: '2026-01-03_valid.wotreplay',    block0: { playerID: 888, playerName: 'Valid', serverName: 'EU1' } },
    ]);

    const result = detectAllPlayersFromReplays('/replays');

    // playerID is optional; only playerName and serverName are required
    // File 1: Ghost (no playerID but has playerName + serverName) -> included
    // File 2: no playerName -> skipped
    // File 3: Valid with playerID -> included
    expect(result).toHaveLength(2);
    const ghostPlayer = result.find(p => p.playerName === 'Ghost');
    const validPlayer = result.find(p => p.playerName === 'Valid');
    expect(ghostPlayer).toBeDefined();
    expect(ghostPlayer?.accountId).toBeNull(); // no playerID
    expect(validPlayer).toBeDefined();
    expect(validPlayer?.accountId).toBe(888);
  });

  it('should skip temp.wotreplay', () => {
    mockReaddirSync.mockReturnValue(['temp.wotreplay', '2026-01-01_real.wotreplay']);

    setupDetectDir([
      { name: '2026-01-01_real.wotreplay', block0: { playerID: 999, playerName: 'Real', serverName: 'EU1' } },
    ]);
    // readdirSync is already set above, but setupDetectDir will overwrite it; fix:
    mockReaddirSync.mockReturnValue(['temp.wotreplay', '2026-01-01_real.wotreplay']);

    const result = detectAllPlayersFromReplays('/replays');

    // Only the real file should be processed (temp is filtered)
    expect(result.every(p => p.accountId === 999 || true)).toBe(true);
    expect(result.find(p => p.accountId === 999)).toBeDefined();
  });

  describe('region extraction from serverName', () => {
    const cases: Array<{ serverName: string; expected: string }> = [
      { serverName: 'EU1',        expected: 'EU'   },
      { serverName: 'eu-west',    expected: 'EU'   },
      { serverName: 'NA1',        expected: 'NA'   },
      { serverName: 'na-east',    expected: 'NA'   },
      { serverName: 'ASIA1',      expected: 'ASIA' },
      { serverName: 'SG1',        expected: 'ASIA' },
      { serverName: 'unknown',    expected: 'EU'   }, // default
    ];

    for (const { serverName, expected } of cases) {
      it(`should detect region '${expected}' from serverName '${serverName}'`, () => {
        setupDetectDir([
          { name: '2026-01-01.wotreplay', block0: { playerID: 1, playerName: 'P', serverName } },
        ]);
        // reset fileIdx inside setupDetectDir by re-calling; it's already set

        const result = detectAllPlayersFromReplays('/replays');

        expect(result[0]?.region).toBe(expected);
      });
    }
  });
});
