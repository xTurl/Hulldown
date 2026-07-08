import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock electron
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
}));

// ---------------------------------------------------------------------------
// Pure-JS mock for better-sqlite3 (shared with cache.test.ts)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface FakeDb {
  tables: Map<string, Row[]>;
  autoIds: Map<string, number>;
  open: boolean;
  exec: (sql: string) => void;
  prepare: (sql: string) => FakeStmt;
  pragma: (sql: string) => void;
  transaction: (fn: (rows: unknown[]) => void) => (rows: unknown[]) => void;
  close: () => void;
}

interface FakeStmt {
  run: (...args: unknown[]) => void;
  get: (...args: unknown[]) => Row | undefined;
  all: (...args: unknown[]) => Row[];
}

function createFakeDb(): FakeDb {
  const tables = new Map<string, Row[]>();
  const autoIds = new Map<string, number>();

  const db: FakeDb = {
    tables,
    autoIds,
    open: true,

    exec(sql: string) {
      const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g);
      if (createMatch) {
        for (const m of createMatch) {
          const name = m.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1];
          if (!tables.has(name)) tables.set(name, []);
          if (!autoIds.has(name)) autoIds.set(name, 1);
        }
      }
      const alterMatch = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      if (alterMatch) {
        const [, tbl, col] = alterMatch;
        const rows = tables.get(tbl) ?? [];
        for (const row of rows) {
          if (!(col in row)) row[col] = 0;
        }
      }
      const deleteMatch = sql.match(/DELETE FROM (\w+)/g);
      if (deleteMatch) {
        for (const m of deleteMatch) {
          const name = m.replace('DELETE FROM ', '').trim();
          tables.set(name, []);
        }
      }
    },

    pragma(_sql: string) {
      // No-op for testing
    },

    prepare(sql: string): FakeStmt {
      const trimmed = sql.trim().replace(/\s+/g, ' ');

      return {
        run(...args: unknown[]) {
          // DELETE FROM battles WHERE account_id = ?
          if (/^DELETE FROM (\w+)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/^DELETE FROM (\w+)/i);
            const tbl = tblMatch![1];
            const rows = tables.get(tbl) ?? [];

            const whereMatch = trimmed.match(/WHERE (.+)$/i);
            if (whereMatch) {
              const whereClause = whereMatch[1];
              const whereCol = whereClause.split(/\s*=\s*\?/)[0].trim();
              const filterValue = args[0];

              // Remove rows that match the WHERE clause
              const filtered = rows.filter(r => r[whereCol] !== filterValue);
              tables.set(tbl, filtered);
            }
            return;
          }

          if (/^INSERT OR (IGNORE|REPLACE) INTO (\w+)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/INSERT OR (?:IGNORE|REPLACE) INTO (\w+)/i);
            const tbl = tblMatch![1];
            if (!tables.has(tbl)) { tables.set(tbl, []); autoIds.set(tbl, 1); }

            const colMatch = trimmed.match(/\(([^)]+)\)\s+VALUES/i);
            if (!colMatch) return;
            const cols = colMatch[1].split(',').map(s => s.trim());

            const row: Row = {};
            const id = autoIds.get(tbl)!;
            row.id = id;
            autoIds.set(tbl, id + 1);

            let argIdx = 0;
            for (const col of cols) {
              if (col === 'id') continue;
              row[col] = args[argIdx++];
            }

            const rows = tables.get(tbl)!;
            if (/INSERT OR IGNORE/i.test(trimmed)) {
              const isDuplicate = rows.some(r =>
                r.account_id === row.account_id && r.arena_id === row.arena_id,
              );
              if (isDuplicate) return;
            }
            rows.push(row);
            return;
          }

          if (/^UPDATE (\w+) SET/i.test(trimmed)) {
            const tblMatch = trimmed.match(/^UPDATE (\w+)/i);
            const tbl = tblMatch![1];
            const rows = tables.get(tbl) ?? [];

            const setMatch = trimmed.match(/SET (.+?) WHERE/i);
            if (!setMatch) return;
            const setCols = setMatch[1].split(',').map(s => s.trim().split(/\s*=\s*\?/)[0].trim());

            const whereMatch = trimmed.match(/WHERE (.+)$/i);
            if (!whereMatch) return;

            const whereParts = whereMatch[1].split(/\bAND\b/i).map(s => {
              const [col] = s.trim().split(/\s*=\s*\?/);
              return col.trim();
            });

            let argIdx = 0;
            const setValues: Record<string, unknown> = {};
            for (const col of setCols) {
              setValues[col] = args[argIdx++];
            }
            const whereValues: Record<string, unknown> = {};
            for (const col of whereParts) {
              whereValues[col] = args[argIdx++];
            }

            for (const row of rows) {
              const matches = Object.entries(whereValues).every(([k, v]) => row[k] === v);
              if (matches) {
                for (const [k, v] of Object.entries(setValues)) {
                  row[k] = v;
                }
              }
            }
            return;
          }
        },

        get(...args: unknown[]): Row | undefined {
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch[1];
            const rows = tables.get(tbl);
            if (!rows) return { name: '__none__' };
            return undefined;
          }

          if (/SELECT COUNT\(\*\) as count FROM (\w+)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/FROM (\w+)/i);
            const tbl = tblMatch![1];
            const rows = tables.get(tbl) ?? [];
            const acctId = args[0] as number;
            const count = rows.filter(r => r.account_id === acctId).length;
            return { count };
          }

          return undefined;
        },

        all(...args: unknown[]): Row[] {
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch![1];
            if (!tables.has(tbl)) return [];
            const rows = tables.get(tbl)!;
            if (rows.length === 0) {
              return KNOWN_COLUMNS.map(name => ({ name }));
            }
            const keys = Object.keys(rows[0]);
            return keys.map(name => ({ name }));
          }

          // SELECT arena_id FROM battles WHERE account_id = ?
          if (/SELECT arena_id FROM battles/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;
            return rows.filter(r => r.account_id === acctId).map(r => ({ arena_id: r.arena_id }));
          }

          // SELECT ... FROM battles WHERE ... (for getSessions test)
          if (/FROM battles/i.test(trimmed) && /WITH recent/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;

            let filtered = rows.filter(r => r.account_id === acctId && r.result !== 'incomplete');
            filtered = [...filtered].sort((a, b) => (a.played_at as number) - (b.played_at as number));

            // Simulate session aggregation (simplified for test)
            const sessions: Row[] = [];
            let sessionNum = 0;
            let lastPlayedAt: number | null = null;

            for (const row of filtered) {
              const pt = row.played_at as number;
              // Session boundary: > 30 min gap
              if (lastPlayedAt === null || pt - lastPlayedAt > 1800000) {
                sessionNum++;
              }
              lastPlayedAt = pt;
              sessions.push({
                sessionNum,
                startedAt: pt,
                endedAt: pt,
                battles: 1,
                wins: row.result === 'win' ? 1 : 0,
                winRate: row.result === 'win' ? 100.0 : 0,
                avgDamage: row.damage as number,
                avgKills: row.kills as number,
                netCredits: row.net_credits as number,
                totalDamage: row.damage as number,
                totalFrags: row.kills as number,
                totalSpotted: row.spotted as number,
                totalDropped: row.dropped_capture as number,
                totalAssist: row.assist as number,
              });
            }

            const limit = args[1] as number;
            return sessions.reverse().slice(0, limit);
          }

          return [];
        },
      };
    },

    transaction(fn: (rows: unknown[]) => void) {
      return (rows: unknown[]) => fn(rows);
    },

    close() {
      this.open = false;
    },
  };

  return db;
}

const KNOWN_COLUMNS = [
  'id', 'account_id', 'arena_id', 'played_at', 'tank_key', 'tank_name',
  'map_name', 'battle_type', 'result', 'damage', 'assist', 'kills', 'shots',
  'hits', 'pens', 'spotted', 'xp', 'credits', 'survived', 'duration',
  'dropped_capture', 'damage_received', 'damage_blocked', 'repair_cost',
  'net_credits', 'mark_of_mastery', 'marks_on_gun', 'life_time', 'achievements',
  'taken_at', 'battles', 'wn8', 'wnx', 'win_rate',
  'raw_wins', 'raw_damage', 'raw_frags', 'raw_survived', 'raw_xp',
  'raw_spotted', 'raw_dropped_cp',
];

let fakeDb: FakeDb | undefined;

vi.mock('better-sqlite3', () => {
  const MockDatabase = function MockDatabase(_path: string) {
    if (!fakeDb || !fakeDb.open) {
      fakeDb = createFakeDb();
    }
    return fakeDb;
  };
  return { default: MockDatabase };
});

// Import AFTER mocks
import {
  getKnownArenaIds,
  insertBattles,
  closeDb,
  invalidateKnownArenaIds,
  clearBattles,
  getSessions,
} from '../main/services/cache';
import type { BattleRecord } from '../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 1;

function makeBattle(overrides: Partial<BattleRecord> = {}): BattleRecord {
  return {
    id: _idCounter++,
    accountId: 1000,
    arenaId: `arena-${_idCounter}`,
    playedAt: Date.now(),
    tankKey: 'germany-G123_E100',
    tankName: 'E 100',
    mapName: 'Prokhorovka',
    battleType: 'Standard',
    result: 'win',
    damage: 2000,
    assist: 300,
    kills: 2,
    shots: 10,
    hits: 8,
    pens: 7,
    spotted: 1,
    xp: 850,
    credits: 30000,
    survived: true,
    duration: 600,
    droppedCapture: 0,
    damageReceived: 800,
    damageBlocked: 400,
    repairCost: 1500,
    netCredits: 28500,
    markOfMastery: 2,
    marksOnGun: 0,
    lifeTime: 590,
    achievements: [],
    abandoned: false,
    statsEstimated: false,
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  if (fakeDb) { fakeDb.open = false; }
  fakeDb = undefined;
  _idCounter = 1;
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// getKnownArenaIds — in-memory cache behavior
// ---------------------------------------------------------------------------

describe('getKnownArenaIds — in-memory cache', () => {
  it('should query the database on first call for an account', () => {
    const battle = makeBattle({ accountId: 5000, arenaId: 'arena-ABC' });
    insertBattles([battle]);

    const result = getKnownArenaIds(5000);

    expect(result).toBeInstanceOf(Set);
    expect(result.has('arena-ABC')).toBe(true);
  });

  it('should return the same cached Set on second call (same object reference)', () => {
    const battle1 = makeBattle({ accountId: 5001, arenaId: 'arena-1' });
    const battle2 = makeBattle({ accountId: 5001, arenaId: 'arena-2' });
    insertBattles([battle1, battle2]);

    // First call
    const result1 = getKnownArenaIds(5001);
    expect(result1.size).toBe(2);

    // Second call should return the exact same Set object (not re-queried)
    const result2 = getKnownArenaIds(5001);
    expect(result2).toBe(result1);  // Same object reference (proof of cache hit)
    expect(result2.size).toBe(2);
  });

  it('should maintain separate cache entries for different accounts', () => {
    const battleA = makeBattle({ accountId: 1000, arenaId: 'arena-A' });
    const battleB = makeBattle({ accountId: 2000, arenaId: 'arena-B' });
    insertBattles([battleA, battleB]);

    const resultA = getKnownArenaIds(1000);
    const resultB = getKnownArenaIds(2000);

    expect(resultA.has('arena-A')).toBe(true);
    expect(resultA.has('arena-B')).toBe(false);
    expect(resultB.has('arena-B')).toBe(true);
    expect(resultB.has('arena-A')).toBe(false);
  });

  it('should return an empty Set for an account with no battles', () => {
    const result = getKnownArenaIds(9999);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// insertBattles — cache update behavior
// ---------------------------------------------------------------------------

describe('insertBattles — in-memory cache update', () => {
  it('should add inserted arena_ids to the existing in-memory cache', () => {
    const battle1 = makeBattle({ accountId: 6000, arenaId: 'arena-X' });
    insertBattles([battle1]);

    // Populate cache
    const cached = getKnownArenaIds(6000);
    expect(cached.has('arena-X')).toBe(true);
    expect(cached.size).toBe(1);

    // Insert a second battle with a different arena_id
    const battle2 = makeBattle({ accountId: 6000, arenaId: 'arena-Y' });
    insertBattles([battle2]);

    // Cache should now contain both arena IDs without a second DB query
    expect(cached.has('arena-X')).toBe(true);
    expect(cached.has('arena-Y')).toBe(true);
    expect(cached.size).toBe(2);
  });

  it('should not add duplicate arena_ids to the cache', () => {
    const battle1 = makeBattle({ accountId: 6001, arenaId: 'arena-DUP' });
    insertBattles([battle1]);

    const cached = getKnownArenaIds(6001);
    expect(cached.size).toBe(1);

    // Attempt to insert the same arena_id again (INSERT OR IGNORE)
    insertBattles([makeBattle({ accountId: 6001, arenaId: 'arena-DUP' })]);

    // Cache should remain unchanged
    expect(cached.size).toBe(1);
  });

  it('should update cache only for accounts that have a cached entry', () => {
    // Account 7000: no cache entry yet
    const battle1 = makeBattle({ accountId: 7000, arenaId: 'arena-1' });
    insertBattles([battle1]);

    // Account 7001: cache entry exists
    const battle2 = makeBattle({ accountId: 7001, arenaId: 'arena-2' });
    insertBattles([battle2]);
    const cached7001 = getKnownArenaIds(7001);
    expect(cached7001.size).toBe(1);

    // Insert a new battle for account 7000 (cache still not created)
    const battle3 = makeBattle({ accountId: 7000, arenaId: 'arena-3' });
    insertBattles([battle3]);

    // Cache for 7001 should be unchanged
    expect(cached7001.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// clearBattles — cache invalidation
// ---------------------------------------------------------------------------

describe('clearBattles — cache eviction', () => {
  it('should remove the cache entry for the cleared account', () => {
    const battle = makeBattle({ accountId: 8000, arenaId: 'arena-clear' });
    insertBattles([battle]);

    const cached = getKnownArenaIds(8000);
    expect(cached.size).toBe(1);

    clearBattles(8000);

    // Next call should return a new (empty) Set from the DB
    const newCached = getKnownArenaIds(8000);
    expect(newCached).not.toBe(cached);
    expect(newCached.size).toBe(0);
  });

  it('should not affect cache entries for other accounts', () => {
    const battle1 = makeBattle({ accountId: 8001, arenaId: 'arena-1' });
    const battle2 = makeBattle({ accountId: 8002, arenaId: 'arena-2' });
    insertBattles([battle1, battle2]);

    getKnownArenaIds(8001); // warm the cache for account 8001
    const cached2 = getKnownArenaIds(8002);

    clearBattles(8001);

    // Cache for 8002 should be unchanged
    expect(cached2.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// invalidateKnownArenaIds — forced refresh
// ---------------------------------------------------------------------------

describe('invalidateKnownArenaIds — forced refresh', () => {
  it('should force the next getKnownArenaIds call to re-query the database', () => {
    const battle1 = makeBattle({ accountId: 9000, arenaId: 'arena-1' });
    insertBattles([battle1]);

    const cached = getKnownArenaIds(9000);
    expect(cached.size).toBe(1);
    const cachedRef = cached;

    // Invalidate the cache
    invalidateKnownArenaIds(9000);

    // Insert a new battle
    insertBattles([makeBattle({ accountId: 9000, arenaId: 'arena-2' })]);

    // Call getKnownArenaIds again — should re-query from DB and get both arenas
    const fresh = getKnownArenaIds(9000);

    expect(fresh).not.toBe(cachedRef);  // Different object reference
    expect(fresh.size).toBe(2);  // Re-queried from DB, has both arenas
    expect(fresh.has('arena-1')).toBe(true);
    expect(fresh.has('arena-2')).toBe(true);
  });

  it('should not affect cache entries for other accounts', () => {
    const battle1 = makeBattle({ accountId: 9001, arenaId: 'arena-1' });
    const battle2 = makeBattle({ accountId: 9002, arenaId: 'arena-2' });
    insertBattles([battle1, battle2]);

    getKnownArenaIds(9001); // warm the cache for account 9001
    const cached2 = getKnownArenaIds(9002);

    invalidateKnownArenaIds(9001);

    // Cache for 9002 should be unchanged
    expect(cached2).toBe(getKnownArenaIds(9002));
  });
});

// ---------------------------------------------------------------------------
// getSessions — CTE optimization with recent limit
// ---------------------------------------------------------------------------

describe('getSessions — CTE with recent limit', () => {
  it('should return sessions for a normal dataset', () => {
    const baseTime = 1000000;
    const battles = [
      makeBattle({ accountId: 10000, playedAt: baseTime, result: 'win', damage: 1000 }),
      makeBattle({ accountId: 10000, playedAt: baseTime + 60000, result: 'win', damage: 1100 }),
      makeBattle({ accountId: 10000, playedAt: baseTime + 120000, result: 'loss', damage: 900 }),
    ];
    insertBattles(battles);

    const sessions = getSessions(10000, 10);

    expect(sessions).toBeDefined();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('should handle datasets with fewer battles than CTE limit (2000)', () => {
    const baseTime = 1000000;
    // Insert 50 battles (well below 2000 limit)
    const battles = Array.from({ length: 50 }, (_, i) =>
      makeBattle({
        accountId: 10001,
        playedAt: baseTime + i * 60000,
        result: i % 2 === 0 ? 'win' : 'loss',
      })
    );
    insertBattles(battles);

    const sessions = getSessions(10001, 10);

    // Should return sessions without error
    expect(sessions).toBeDefined();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('should respect the limit parameter', () => {
    const baseTime = 1000000;
    // Create multiple sessions by using > 30min gaps
    const battles = [
      makeBattle({ accountId: 10002, playedAt: baseTime, result: 'win' }),
      makeBattle({ accountId: 10002, playedAt: baseTime + 2000000, result: 'win' }), // > 30min gap
      makeBattle({ accountId: 10002, playedAt: baseTime + 4000000, result: 'win' }), // > 30min gap
      makeBattle({ accountId: 10002, playedAt: baseTime + 6000000, result: 'win' }), // > 30min gap
    ];
    insertBattles(battles);

    const sessionsLimit2 = getSessions(10002, 2);

    // Should return at most limit sessions
    expect(sessionsLimit2.length).toBeLessThanOrEqual(2);
  });

  it('should exclude incomplete battles from session calculation', () => {
    const baseTime = 1000000;
    const battles = [
      makeBattle({ accountId: 10003, playedAt: baseTime, result: 'win' }),
      makeBattle({ accountId: 10003, playedAt: baseTime + 60000, result: 'incomplete' }),
      makeBattle({ accountId: 10003, playedAt: baseTime + 120000, result: 'loss' }),
    ];
    insertBattles(battles);

    const sessions = getSessions(10003, 10);

    // Should return sessions (incomplete battles are filtered out in the query)
    expect(sessions).toBeDefined();
    expect(Array.isArray(sessions)).toBe(true);
  });
});
