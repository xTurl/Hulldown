import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test the scanReplays async behavior directly
// ---------------------------------------------------------------------------

const mockReaddirAsync = vi.fn<() => Promise<string[]>>();

vi.mock('fs', () => ({
  default: {
    promises: {
      readdir: (...args: unknown[]) => mockReaddirAsync(...(args as [])),
    },
  },
}));

// Import AFTER mocks
import { scanReplays } from '../main/services/replay-parser';

// ---------------------------------------------------------------------------
// Tests for scanReplays async behavior
// ---------------------------------------------------------------------------

describe('replays:scan handler — scanReplays async behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReaddirAsync.mockResolvedValue([]);
  });

  it('should return a Promise from scanReplays (async function)', async () => {
    mockReaddirAsync.mockResolvedValue([]);

    const result = scanReplays('/replays', 112233, new Set(), () => {});

    // Result should be a Promise
    expect(result).toBeInstanceOf(Promise);

    // Await it
    const resolved = await result;
    expect(resolved).toBeDefined();
    expect(resolved).toHaveProperty('added');
    expect(resolved).toHaveProperty('skipped');
  });

  it('should use async readdir (fs.promises.readdir) not sync', async () => {
    mockReaddirAsync.mockResolvedValue([]);

    await scanReplays('/replays', 112233, new Set(), () => {});

    // Verify async readdir was called
    expect(mockReaddirAsync).toHaveBeenCalledWith('/replays');
  });

  it('should handle async readdir rejection gracefully', async () => {
    mockReaddirAsync.mockRejectedValue(new Error('ENOENT: no such file'));

    const result = await scanReplays('/nonexistent', 112233, new Set(), () => {});

    // Should return empty result on rejection
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should be awaitable and handle batches via callback', async () => {
    mockReaddirAsync.mockResolvedValue([]);

    const batches: unknown[] = [];
    const result = await scanReplays('/replays', 112233, new Set(), (batch) => {
      batches.push(batch);
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('added');
  });
});
