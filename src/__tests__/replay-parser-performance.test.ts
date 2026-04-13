import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedPlayer } from '../main/services/replay-parser';

// ---------------------------------------------------------------------------
// fs mock — must be hoisted before importing the module under test
// ---------------------------------------------------------------------------

const mockReaddirSync = vi.fn<() => string[]>();
const mockReaddirAsync = vi.fn<() => Promise<string[]>>();
const mockOpenSync = vi.fn<() => number>();
const mockReadSync = vi.fn<() => number>();
const mockCloseSync = vi.fn<() => void>();

vi.mock('fs', () => ({
  default: {
    readdirSync: (...args: unknown[]) => mockReaddirSync(...(args as [])),
    openSync: (...args: unknown[]) => mockOpenSync(...(args as [])),
    readSync: (...args: unknown[]) => mockReadSync(...(args as [])),
    closeSync: (...args: unknown[]) => mockCloseSync(...(args as [])),
    promises: {
      readdir: (...args: unknown[]) => mockReaddirAsync(...(args as [])),
    },
  },
}));

// Import AFTER mocks are set up
import { scanReplays } from '../main/services/replay-parser';

// ---------------------------------------------------------------------------
// Helpers to build fake binary replay buffers
// ---------------------------------------------------------------------------

function buildReplayBuffer(block0: object, block1?: object): Buffer {
  const block0Json = Buffer.from(JSON.stringify(block0), 'utf-8');
  const numBlocks = block1 !== undefined ? 2 : 1;

  const size0Buf = Buffer.alloc(4);
  size0Buf.writeUInt32LE(block0Json.length, 0);

  if (!block1) {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(0, 0);
    header.writeUInt32LE(numBlocks, 4);
    return Buffer.concat([header, size0Buf, block0Json]);
  }

  const block1Json = Buffer.from(JSON.stringify(block1), 'utf-8');
  const size1Buf = Buffer.alloc(4);
  size1Buf.writeUInt32LE(block1Json.length, 0);

  const header = Buffer.alloc(8);
  header.writeUInt32LE(0, 0);
  header.writeUInt32LE(numBlocks, 4);
  return Buffer.concat([header, size0Buf, block0Json, size1Buf, block1Json]);
}

// Shared block0 / block1 fixtures
const BLOCK0_NORMAL = {
  dateTime: '03.04.2026 12:16:09',
  playerVehicle: 'germany-G123_E100',
  mapDisplayName: 'Prokhorovka',
  gameplayID: 'ctf',
  playerID: 112233,
  playerName: 'SnipeKing',
  serverName: 'EU1',
};

const BLOCK1_WIN = {
  arenaUniqueID: '9999',
  common: { winnerTeam: 1, duration: 600 },
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
// scanReplays — async fs.promises.readdir usage
// ---------------------------------------------------------------------------

describe('scanReplays — async filesystem operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use fs.promises.readdir (not readdirSync) to list replays', async () => {
    const MY_ID = 112233;
    const buf = buildReplayBuffer(BLOCK0_NORMAL, BLOCK1_WIN);

    // Setup async mock
    mockReaddirAsync.mockResolvedValue(['2026-01-01_battle.wotreplay']);

    let openCallCount = 0;
    mockOpenSync.mockImplementation(() => openCallCount++);
    mockReadSync.mockImplementation(
      (_fd: number, outBuf: Buffer, bufOffset: number, length: number, position: number) => {
        const slice = buf.slice(position, position + length);
        slice.copy(outBuf, bufOffset);
        return slice.length;
      },
    );
    mockCloseSync.mockReturnValue(undefined);

    // Call scanReplays which should use fs.promises.readdir
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), () => {});

    // Verify that async readdir was called, not sync readdirSync
    expect(mockReaddirAsync).toHaveBeenCalledWith('/replays');
    // readdirSync should NOT have been called
    expect(mockReaddirSync).not.toHaveBeenCalled();
    expect(result.added).toBe(1);
  });

  it('should handle fs.promises.readdir rejection gracefully (directory does not exist)', async () => {
    mockReaddirAsync.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const result = await scanReplays('/nonexistent', 112233, 'Player', new Set(), () => {});

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should handle fs.promises.readdir rejection gracefully (permission denied)', async () => {
    mockReaddirAsync.mockRejectedValue(new Error('EACCES: permission denied'));

    const result = await scanReplays('/protected', 112233, 'Player', new Set(), () => {});

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scanReplays — arena_id filtering with knownArenaIds Set
// ---------------------------------------------------------------------------

describe('scanReplays — arena_id deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeReplay(playerID: number | undefined, arenaId = '1234'): Buffer {
    const block0 = {
      ...BLOCK0_NORMAL,
      ...(playerID !== undefined ? { playerID } : {}),
    };
    const block1 = {
      arenaUniqueID: arenaId,
      common: { winnerTeam: 1, duration: 600 },
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
    return buildReplayBuffer(block0, block1);
  }

  function setupDir(entries: Array<{ name: string; buf: Buffer }>): void {
    mockReaddirAsync.mockResolvedValue(entries.map(e => e.name));
    const allBufs = entries.map(e => e.buf);

    let fileIdx = 0;
    mockOpenSync.mockImplementation(() => {
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

  it('should skip replay whose arenaId is already in knownArenaIds Set', async () => {
    const MY_ID = 112233;
    const buf = makeReplay(MY_ID, 'known-arena-123');
    setupDir([{ name: '2026-01-01_known.wotreplay', buf }]);

    const knownArenaIds = new Set<string>(['known-arena-123']);
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', knownArenaIds, () => {});

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('should add replay whose arenaId is NOT in knownArenaIds Set', async () => {
    const MY_ID = 112233;
    const buf = makeReplay(MY_ID, 'new-arena-456');
    setupDir([{ name: '2026-01-01_new.wotreplay', buf }]);

    const knownArenaIds = new Set<string>();
    const batches: unknown[] = [];
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', knownArenaIds, b => batches.push(b));

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(batches.length).toBe(1);
  });

  it('should add scanned arena_ids to the knownArenaIds Set during scan', async () => {
    const MY_ID = 112233;
    const buf1 = makeReplay(MY_ID, 'arena-X');
    const buf2 = makeReplay(MY_ID, 'arena-Y');
    setupDir([
      { name: '2026-01-01_x.wotreplay', buf: buf1 },
      { name: '2026-01-01_y.wotreplay', buf: buf2 },
    ]);

    const knownArenaIds = new Set<string>();
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', knownArenaIds, () => {});

    expect(result.added).toBe(2);
    expect(knownArenaIds.has('arena-X')).toBe(true);
    expect(knownArenaIds.has('arena-Y')).toBe(true);
  });

  it('should not count the same arena_id twice in a single scan', async () => {
    const MY_ID = 112233;
    // Both replays have the same arena_id (shouldn't happen in practice, but test the logic)
    const buf = makeReplay(MY_ID, 'arena-same');
    setupDir([
      { name: '2026-01-01_a.wotreplay', buf },
      { name: '2026-01-01_b.wotreplay', buf },
    ]);

    const knownArenaIds = new Set<string>();
    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', knownArenaIds, () => {});

    // First replay added, second skipped (because arena_id was added to Set after first)
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scanReplays — batch size and callback invocation
// ---------------------------------------------------------------------------

describe('scanReplays — batch callback behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeReplay(arenaId: string): Buffer {
    const block0 = { ...BLOCK0_NORMAL, playerID: 112233 };
    const block1 = {
      arenaUniqueID: arenaId,
      common: { winnerTeam: 1, duration: 600 },
      personal: {
        '112233': {
          team: 1, damageDealt: 1000, damageAssistedRadio: 0, damageAssistedTrack: 0,
          kills: 0, shots: 0, directEnemyHits: 0, piercings: 0, spotted: 0,
          xp: 0, credits: 0, health: 100, droppedCapturePoints: 0,
          damageReceived: 0, damageBlockedByArmor: 0, autoRepairCost: 0,
          markOfMastery: 0, marksOnGun: 0, lifeTime: 0, achievements: [],
        },
      },
    };
    return buildReplayBuffer(block0, block1);
  }

  function setupDirWithCount(count: number): void {
    const entries = Array.from({ length: count }, (_, i) => ({
      name: `2026-01-01_${i}.wotreplay`,
      buf: makeReplay(`arena-${i}`),
    }));

    mockReaddirAsync.mockResolvedValue(entries.map(e => e.name));
    const allBufs = entries.map(e => e.buf);

    let fileIdx = 0;
    mockOpenSync.mockImplementation(() => {
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

  it('should invoke onBatch when batch reaches 100 replays', async () => {
    setupDirWithCount(100);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', 112233, 'SnipeKing', new Set(), b => batches.push(b));

    expect(result.added).toBe(100);
    expect(batches.length).toBe(1);  // One full batch of 100
    expect(Array.isArray(batches[0])).toBe(true);
    if (Array.isArray(batches[0])) {
      expect((batches[0] as any[]).length).toBe(100);
    }
  });

  it('should invoke onBatch with remaining replays when count < 100', async () => {
    setupDirWithCount(50);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', 112233, 'SnipeKing', new Set(), b => batches.push(b));

    expect(result.added).toBe(50);
    expect(batches.length).toBe(1);
    if (Array.isArray(batches[0])) {
      expect((batches[0] as any[]).length).toBe(50);
    }
  });

  it('should invoke onBatch twice when count is 150 (batch of 100 + batch of 50)', async () => {
    setupDirWithCount(150);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', 112233, 'SnipeKing', new Set(), b => batches.push(b));

    expect(result.added).toBe(150);
    expect(batches.length).toBe(2);
    if (Array.isArray(batches[0])) {
      expect((batches[0] as any[]).length).toBe(100);
    }
    if (Array.isArray(batches[1])) {
      expect((batches[1] as any[]).length).toBe(50);
    }
  });

  it('should not invoke onBatch if no replays are added', async () => {
    const buf = makeReplay('arena-1');
    mockReaddirAsync.mockResolvedValue(['2026-01-01_1.wotreplay']);

    let openCallCount = 0;
    mockOpenSync.mockImplementation(() => openCallCount++);
    mockReadSync.mockImplementation(
      (_fd: number, outBuf: Buffer, bufOffset: number, length: number, position: number) => {
        const slice = buf.slice(position, position + length);
        slice.copy(outBuf, bufOffset);
        return slice.length;
      },
    );
    mockCloseSync.mockReturnValue(undefined);

    const knownArenaIds = new Set<string>(['arena-1']);
    const batches: unknown[] = [];
    const result = await scanReplays('/replays', 112233, 'SnipeKing', knownArenaIds, b => batches.push(b));

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(batches.length).toBe(0);  // No batches since nothing was added
  });
});

// ---------------------------------------------------------------------------
// scanReplays — returns correct ScanResult
// ---------------------------------------------------------------------------

describe('scanReplays — ScanResult accuracy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeReplay(playerID: number, arenaId: string): Buffer {
    const block0 = { ...BLOCK0_NORMAL, playerID };
    const block1 = {
      arenaUniqueID: arenaId,
      common: { winnerTeam: 1, duration: 600 },
      personal: {
        [String(playerID)]: {
          team: 1, damageDealt: 1000, damageAssistedRadio: 0, damageAssistedTrack: 0,
          kills: 0, shots: 0, directEnemyHits: 0, piercings: 0, spotted: 0,
          xp: 0, credits: 0, health: 100, droppedCapturePoints: 0,
          damageReceived: 0, damageBlockedByArmor: 0, autoRepairCost: 0,
          markOfMastery: 0, marksOnGun: 0, lifeTime: 0, achievements: [],
        },
      },
    };
    return buildReplayBuffer(block0, block1);
  }

  it('should return added, skipped, and errors correctly', async () => {
    const MY_ID = 112233;
    const OTHER_ID = 999999;

    const buf1 = makeReplay(MY_ID, 'arena-1');
    const buf2 = makeReplay(MY_ID, 'arena-2');
    const buf3 = makeReplay(OTHER_ID, 'arena-3');

    mockReaddirAsync.mockResolvedValue([
      '2026-01-01_1.wotreplay',
      '2026-01-01_2.wotreplay',
      '2026-01-01_3.wotreplay',
    ]);

    const allBufs = [buf1, buf2, buf3];
    let fileIdx = 0;
    mockOpenSync.mockImplementation(() => {
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

    const result = await scanReplays('/replays', MY_ID, 'SnipeKing', new Set(), () => {});

    expect(result.added).toBe(2);     // arena-1 and arena-2
    expect(result.skipped).toBe(1);   // arena-3 (wrong player)
    expect(result.errors).toBe(0);
  });
});
