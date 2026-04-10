import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock electron
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
}));

// ---------------------------------------------------------------------------
// Pure-JS mock for better-sqlite3
// ---------------------------------------------------------------------------
// better-sqlite3 is compiled against Electron's Node and can't run in Vitest.
// We replace it with a minimal in-memory store that implements only the subset
// of the API that cache.ts uses: exec, prepare (→ run/get/all), transaction,
// PRAGMA table_info, and the `.open` property.
//
// SQL is NOT parsed — we intercept each SQL string and route it to the correct
// handler below.

type Row = Record<string, unknown>;

interface FakeDb {
  tables:  Map<string, Row[]>;  // tableName → rows
  autoIds: Map<string, number>; // tableName → next AUTOINCREMENT id
  open:    boolean;
  exec:    (sql: string) => void;
  prepare: (sql: string) => FakeStmt;
  transaction: (fn: (rows: unknown[]) => void) => (rows: unknown[]) => void;
  close:   () => void;
}

interface FakeStmt {
  run:  (...args: unknown[]) => void;
  get:  (...args: unknown[]) => Row | undefined;
  all:  (...args: unknown[]) => Row[];
}

function createFakeDb(): FakeDb {
  const tables  = new Map<string, Row[]>();
  const autoIds = new Map<string, number>();

  const db: FakeDb = {
    tables,
    autoIds,
    open: true,

    exec(sql: string) {
      // CREATE TABLE IF NOT EXISTS tableName (...)
      const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g);
      if (createMatch) {
        for (const m of createMatch) {
          const name = m.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1];
          if (!tables.has(name)) tables.set(name, []);
          if (!autoIds.has(name)) autoIds.set(name, 1);
        }
      }
      // ALTER TABLE tableName ADD COLUMN colDef
      const alterMatch = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      if (alterMatch) {
        const [, tbl, col] = alterMatch;
        const rows = tables.get(tbl) ?? [];
        for (const row of rows) {
          if (!(col in row)) row[col] = 0;
        }
      }
      // DELETE FROM tableName
      const deleteMatch = sql.match(/DELETE FROM (\w+)/g);
      if (deleteMatch) {
        for (const m of deleteMatch) {
          const name = m.replace('DELETE FROM ', '').trim();
          tables.set(name, []);
        }
      }
      // CREATE INDEX — ignore
    },

    prepare(sql: string): FakeStmt {
      const trimmed = sql.trim().replace(/\s+/g, ' ');

      return {
        run(...args: unknown[]) {
          // INSERT OR IGNORE INTO battles (cols...) VALUES (...)
          if (/^INSERT OR (IGNORE|REPLACE) INTO (\w+)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/INSERT OR (?:IGNORE|REPLACE) INTO (\w+)/i);
            const tbl = tblMatch![1];
            if (!tables.has(tbl)) { tables.set(tbl, []); autoIds.set(tbl, 1); }

            const colMatch = trimmed.match(/\(([^)]+)\)\s+VALUES/i);
            if (!colMatch) return;
            const cols = colMatch[1].split(',').map(s => s.trim());

            // Build the row
            const row: Row = {};
            const id = autoIds.get(tbl)!;
            row.id = id;
            autoIds.set(tbl, id + 1);

            let argIdx = 0;
            for (const col of cols) {
              if (col === 'id') continue; // skip explicit id cols
              row[col] = args[argIdx++];
            }

            // UNIQUE(account_id, arena_id) — for INSERT OR IGNORE skip duplicates
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

          // UPDATE battles SET ... WHERE id = ? AND account_id = ?
          if (/^UPDATE (\w+) SET/i.test(trimmed)) {
            const tblMatch = trimmed.match(/^UPDATE (\w+)/i);
            const tbl = tblMatch![1];
            const rows = tables.get(tbl) ?? [];

            // Extract SET clause: "damage = ?, assist = ?, kills = ?, result = ?"
            const setMatch = trimmed.match(/SET (.+?) WHERE/i);
            if (!setMatch) return;
            const setCols = setMatch[1].split(',').map(s => s.trim().split(/\s*=\s*\?/)[0].trim());

            // Extract WHERE clause bindings
            // Pattern: WHERE id = ? AND account_id = ?
            const whereMatch = trimmed.match(/WHERE (.+)$/i);
            if (!whereMatch) return;

            // Assign positional args to SET cols, then WHERE cols
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

          // UPDATE progress_snapshots SET wnx = ? WHERE wnx = 0
          if (/^UPDATE progress_snapshots/i.test(trimmed)) {
            // handled above; fallthrough is fine
          }
        },

        get(...args: unknown[]): Row | undefined {
          // PRAGMA table_info(tableName)
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch[1];
            const rows = tables.get(tbl);
            if (!rows) return { name: '__none__' };
            // Return column names derived from first row's keys, or standard schema columns
            // We simulate by returning a stub — callers iterate `all()` not `get()` for PRAGMA
            return undefined;
          }

          // SELECT COUNT(*) as count FROM battles WHERE account_id = ?
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
          // PRAGMA table_info(tableName)
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch[1];
            if (!tables.has(tbl)) return [];
            // Return column descriptors based on keys of first row, or empty for fresh table
            const rows = tables.get(tbl)!;
            if (rows.length === 0) {
              // Return minimal schema info — just enough so migrations don't re-add columns
              // We simulate that all expected columns already exist by returning them all.
              return KNOWN_COLUMNS.map(name => ({ name }));
            }
            const keys = Object.keys(rows[0]);
            return keys.map(name => ({ name }));
          }

          // SELECT ... FROM battles WHERE account_id = ? ORDER BY played_at DESC LIMIT ? OFFSET ?
          if (/FROM battles/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;

            let filtered = rows.filter(r => r.account_id === acctId);

            // Apply LIMIT / OFFSET if present
            const limitMatch = trimmed.match(/LIMIT \?/i);
            const offsetMatch = trimmed.match(/OFFSET \?/i);
            // args[1] = limit, args[2] = offset (when both present)
            if (limitMatch && offsetMatch) {
              const limit  = args[1] as number;
              const offset = args[2] as number;
              // Sort by played_at DESC
              filtered = [...filtered].sort((a, b) => (b.played_at as number) - (a.played_at as number));
              filtered = filtered.slice(offset, offset + limit);
            } else if (limitMatch) {
              const limit = args[1] as number;
              filtered = [...filtered].sort((a, b) => (b.played_at as number) - (a.played_at as number));
              filtered = filtered.slice(0, limit);
            }

            // Map snake_case → camelCase as the real cache.ts BATTLE_SELECT alias does
            return filtered.map(r => ({
              ...r,
              accountId:      r.account_id,
              arenaId:        r.arena_id,
              playedAt:       r.played_at,
              tankKey:        r.tank_key,
              tankName:       r.tank_name,
              mapName:        r.map_name,
              battleType:     r.battle_type,
              result:         r.result,
              damage:         r.damage ?? 0,
              assist:         r.assist ?? 0,
              kills:          r.kills ?? 0,
              shots:          r.shots ?? 0,
              hits:           r.hits ?? 0,
              pens:           r.pens ?? 0,
              spotted:        r.spotted ?? 0,
              xp:             r.xp ?? 0,
              credits:        r.credits ?? 0,
              survived:       r.survived === 1,
              duration:       r.duration ?? 0,
              droppedCapture: r.dropped_capture ?? 0,
              damageReceived: r.damage_received ?? 0,
              damageBlocked:  r.damage_blocked ?? 0,
              repairCost:     r.repair_cost ?? 0,
              netCredits:     r.net_credits ?? 0,
              markOfMastery:  r.mark_of_mastery ?? 0,
              marksOnGun:     r.marks_on_gun ?? 0,
              lifeTime:       r.life_time ?? 0,
              achievements:   typeof r.achievements === 'string' ? JSON.parse(r.achievements as string) : [],
            }));
          }

          // SELECT arena_id FROM battles WHERE account_id = ?
          if (/SELECT arena_id FROM battles/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;
            return rows.filter(r => r.account_id === acctId).map(r => ({ arena_id: r.arena_id }));
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

// All columns that might be checked by migration PRAGMA calls — we report them
// as existing so migrations don't try to ALTER TABLE.
const KNOWN_COLUMNS = [
  'id', 'account_id', 'arena_id', 'played_at', 'tank_key', 'tank_name',
  'map_name', 'battle_type', 'result', 'damage', 'assist', 'kills', 'shots',
  'hits', 'pens', 'spotted', 'xp', 'credits', 'survived', 'duration',
  'dropped_capture', 'damage_received', 'damage_blocked', 'repair_cost',
  'net_credits', 'mark_of_mastery', 'marks_on_gun', 'life_time', 'achievements',
  // progress_snapshots
  'taken_at', 'battles', 'wn8', 'wnx', 'win_rate',
  'raw_wins', 'raw_damage', 'raw_frags', 'raw_survived', 'raw_xp',
  'raw_spotted', 'raw_dropped_cp',
];

// Shared fake DB instance — reset per test
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
  updateBattleStats,
  insertBattles,
  getBattles,
  closeDb,
} from '../main/services/cache';
import type { BattleRecord } from '../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 1;

function makeBattle(overrides: Partial<BattleRecord> = {}): BattleRecord {
  return {
    id:             _idCounter++,
    accountId:      1000,
    arenaId:        `arena-${_idCounter}`,
    playedAt:       Date.now(),
    tankKey:        'germany-G123_E100',
    tankName:       'E 100',
    mapName:        'Prokhorovka',
    battleType:     'Standard',
    result:         'win',
    damage:         2000,
    assist:         300,
    kills:          2,
    shots:          10,
    hits:           8,
    pens:           7,
    spotted:        1,
    xp:             850,
    credits:        30000,
    survived:       true,
    duration:       600,
    droppedCapture: 0,
    damageReceived: 800,
    damageBlocked:  400,
    repairCost:     1500,
    netCredits:     28500,
    markOfMastery:  2,
    marksOnGun:     0,
    lifeTime:       590,
    achievements:   [],
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
// updateBattleStats
// ---------------------------------------------------------------------------

describe('updateBattleStats', () => {
  it('should update damage, assist, kills, and result for the given battle', () => {
    const battle = makeBattle({ accountId: 1000, result: 'loss', damage: 500, assist: 0, kills: 0 });
    insertBattles([battle]);

    const rows = getBattles(1000, 1, 0);
    expect(rows).toHaveLength(1);
    const dbId = rows[0].id as number;

    updateBattleStats(dbId, 1000, { damage: 3000, assist: 500, kills: 3, result: 'win' });

    const updated = getBattles(1000, 1, 0)[0];
    expect(updated.damage).toBe(3000);
    expect(updated.assist).toBe(500);
    expect(updated.kills).toBe(3);
    expect(updated.result).toBe('win');
  });

  it('should NOT update a battle belonging to a different accountId', () => {
    const battle = makeBattle({ accountId: 1000, damage: 1000, result: 'loss' });
    insertBattles([battle]);

    const rows = getBattles(1000, 1, 0);
    const dbId = rows[0].id as number;

    // Attempt update with wrong accountId
    updateBattleStats(dbId, 9999, { damage: 9999, assist: 0, kills: 0, result: 'win' });

    const unchanged = getBattles(1000, 1, 0)[0];
    expect(unchanged.damage).toBe(1000);
    expect(unchanged.result).toBe('loss');
  });

  it('should accept result: win', () => {
    const battle = makeBattle({ accountId: 1000, result: 'loss' });
    insertBattles([battle]);
    const dbId = getBattles(1000, 1, 0)[0].id as number;

    updateBattleStats(dbId, 1000, { damage: 1000, assist: 0, kills: 1, result: 'win' });

    expect(getBattles(1000, 1, 0)[0].result).toBe('win');
  });

  it('should accept result: loss', () => {
    const battle = makeBattle({ accountId: 1000, result: 'win' });
    insertBattles([battle]);
    const dbId = getBattles(1000, 1, 0)[0].id as number;

    updateBattleStats(dbId, 1000, { damage: 500, assist: 0, kills: 0, result: 'loss' });

    expect(getBattles(1000, 1, 0)[0].result).toBe('loss');
  });

  it('should accept result: draw', () => {
    const battle = makeBattle({ accountId: 1000, result: 'win' });
    insertBattles([battle]);
    const dbId = getBattles(1000, 1, 0)[0].id as number;

    updateBattleStats(dbId, 1000, { damage: 750, assist: 100, kills: 1, result: 'draw' });

    expect(getBattles(1000, 1, 0)[0].result).toBe('draw');
  });

  it('should not throw when the given id does not exist', () => {
    expect(() =>
      updateBattleStats(99999, 1000, { damage: 0, assist: 0, kills: 0, result: 'win' }),
    ).not.toThrow();
  });

  it('should not affect other battles in the same account', () => {
    const battle1 = makeBattle({ accountId: 1000, arenaId: 'arena-A', damage: 1000, result: 'loss' });
    const battle2 = makeBattle({ accountId: 1000, arenaId: 'arena-B', damage: 2000, result: 'win' });
    insertBattles([battle1, battle2]);

    const rows = getBattles(1000, 10, 0);
    const dbId1 = rows.find(r => r.arenaId === 'arena-A')!.id as number;

    updateBattleStats(dbId1, 1000, { damage: 9999, assist: 0, kills: 0, result: 'draw' });

    const afterUpdate = getBattles(1000, 10, 0);
    const b1 = afterUpdate.find(r => r.arenaId === 'arena-A')!;
    const b2 = afterUpdate.find(r => r.arenaId === 'arena-B')!;

    expect(b1.damage).toBe(9999);
    expect(b1.result).toBe('draw');
    expect(b2.damage).toBe(2000);   // untouched
    expect(b2.result).toBe('win');  // untouched
  });

  it('should not affect battles of another accountId when multiple accounts exist', () => {
    const battleA = makeBattle({ accountId: 1000, arenaId: 'arena-X', damage: 1000, result: 'loss' });
    const battleB = makeBattle({ accountId: 2000, arenaId: 'arena-Y', damage: 2000, result: 'win' });
    insertBattles([battleA, battleB]);

    const dbIdA = getBattles(1000, 1, 0)[0].id as number;

    updateBattleStats(dbIdA, 1000, { damage: 5000, assist: 0, kills: 0, result: 'win' });

    const rowsB = getBattles(2000, 1, 0);
    expect(rowsB[0].damage).toBe(2000);
    expect(rowsB[0].result).toBe('win');
  });
});
