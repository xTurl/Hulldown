/**
 * cache.ts tests — getBattleDebrief / saveBattleDebrief / clearBattleDebriefs / getTankBaseline
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
}));

type Row = Record<string, unknown>;

interface FakeDb {
  tables: Map<string, Row[]>;
  autoIds: Map<string, number>;
  open: boolean;
  exec: (sql: string) => void;
  prepare: (sql: string) => FakeStmt;
  pragma: (sql: string) => void;
  transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;
  close: () => void;
}

interface FakeStmt {
  run: (...args: unknown[]) => { changes: number };
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
      const createMatches = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g);
      if (createMatches) {
        for (const m of createMatches) {
          const name = m.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1];
          if (!tables.has(name)) { tables.set(name, []); autoIds.set(name, 1); }
        }
      }
      const deleteMatches = sql.match(/DELETE FROM (\w+)/g);
      if (deleteMatches) {
        for (const m of deleteMatches) {
          const name = m.replace('DELETE FROM ', '').trim();
          tables.set(name, []);
        }
      }
      const alterMatch = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      if (alterMatch) {
        const [, tbl, col] = alterMatch;
        for (const row of (tables.get(tbl) ?? [])) {
          if (!(col in row)) row[col] = 0;
        }
      }
    },

    pragma() { /* no-op */ },

    prepare(sql: string): FakeStmt {
      const trimmed = sql.trim().replace(/\s+/g, ' ');

      return {
        run(...args: unknown[]) {
          // DELETE FROM <tbl> [WHERE col = ?]
          if (/^DELETE FROM (\w+)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/^DELETE FROM (\w+)/i)!;
            const tbl = tblMatch[1];
            const rows = tables.get(tbl) ?? [];
            const whereMatch = trimmed.match(/WHERE (.+)$/i);
            if (whereMatch) {
              const parts = whereMatch[1].split(/\s+AND\s+/i);
              let argIdx = 0;
              let filtered = [...rows];
              for (const part of parts) {
                const colMatch = part.match(/^([\w.]+)\s*=\s*\?/i);
                if (colMatch) {
                  const col = colMatch[1];
                  const val = args[argIdx++];
                  filtered = filtered.filter(r => r[col] !== val);
                }
              }
              const changes = rows.length - filtered.length;
              tables.set(tbl, filtered);
              return { changes };
            }
            tables.set(tbl, []);
            return { changes: rows.length };
          }

          // INSERT OR REPLACE / IGNORE
          if (/^INSERT OR (IGNORE|REPLACE) INTO (\w+)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/INSERT OR (?:IGNORE|REPLACE) INTO (\w+)/i)!;
            const tbl = tblMatch[1];
            if (!tables.has(tbl)) { tables.set(tbl, []); autoIds.set(tbl, 1); }
            const colMatch = trimmed.match(/\(([^)]+)\)\s+VALUES/i);
            if (!colMatch) return { changes: 0 };
            const cols = colMatch[1].split(',').map(s => s.trim());
            const row: Row = {};
            let argIdx = 0;
            for (const col of cols) {
              if (col === 'id') {
                row[col] = autoIds.get(tbl)!;
                autoIds.set(tbl, autoIds.get(tbl)! + 1);
                continue;
              }
              row[col] = args[argIdx++];
            }
            const rows = tables.get(tbl)!;
            if (/INSERT OR REPLACE/i.test(trimmed)) {
              const pkCol = cols.find(c => c !== 'id') ?? cols[0];
              const pkVal = row[pkCol];
              const idx = rows.findIndex(r => r[pkCol] === pkVal);
              if (idx >= 0) rows.splice(idx, 1);
            }
            if (/INSERT OR IGNORE/i.test(trimmed)) {
              // battles table: UNIQUE(account_id, arena_id)
              if (tbl === 'battles') {
                const isDuplicate = rows.some(r => r.account_id === row.account_id && r.arena_id === row.arena_id);
                if (isDuplicate) return { changes: 0 };
              } else {
                // single-column pk: first non-id column
                const pkCol = cols.find(c => c !== 'id') ?? cols[0];
                if (rows.some(r => r[pkCol] === row[pkCol])) return { changes: 0 };
              }
            }
            rows.push(row);
            return { changes: 1 };
          }

          return { changes: 0 };
        },

        get(...args: unknown[]): Row | undefined {
          // PRAGMA table_info
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch[1];
            if (!tables.has(tbl)) return undefined;
            const rows = tables.get(tbl)!;
            if (rows.length === 0) return { name: '__none__' };
            return undefined;
          }

          // SELECT json FROM battle_debriefs WHERE arena_id = ?
          if (/FROM battle_debriefs/i.test(trimmed) && /WHERE arena_id/i.test(trimmed)) {
            const rows = tables.get('battle_debriefs') ?? [];
            const arenaId = args[0] as string;
            return rows.find(r => r.arena_id === arenaId);
          }

          // getTankBaseline: SELECT ... FROM battles WHERE account_id=? AND tank_key=? AND ... AND played_at >= ?
          if (/FROM battles/i.test(trimmed) && /tank_key\s*=\s*\?/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;
            const tankKey = args[1] as string;
            const cutoff = args[2] as number;
            const filtered = rows.filter(r =>
              r.account_id === acctId &&
              r.tank_key === tankKey &&
              r.result !== 'incomplete' &&
              (r.played_at as number) >= cutoff,
            );
            if (filtered.length === 0) return { battles: 0, avgDamage: 0, avgFrags: 0, avgAssist: 0, winRate: 0 };
            const battles = filtered.length;
            const avgDamage = Math.round(filtered.reduce((s, r) => s + (r.damage as number), 0) / battles);
            const avgFrags = Math.round((filtered.reduce((s, r) => s + (r.kills as number), 0) / battles) * 100) / 100;
            const avgAssist = Math.round(filtered.reduce((s, r) => s + (r.assist as number), 0) / battles);
            const wins = filtered.filter(r => r.result === 'win').length;
            const winRate = Math.round((wins / battles) * 1000) / 10;
            return { battles, avgDamage, avgFrags, avgAssist, winRate };
          }

          // COUNT(*)
          if (/SELECT COUNT\(\*\)/i.test(trimmed)) {
            const tblMatch = trimmed.match(/FROM (\w+)/i);
            const tbl = tblMatch?.[1] ?? '';
            const rows = tables.get(tbl) ?? [];
            const acctId = args[0] as number | undefined;
            return { count: rows.filter(r => acctId === undefined || r.account_id === acctId).length };
          }

          return undefined;
        },

        all(...args: unknown[]): Row[] {
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch![1];
            if (!tables.has(tbl)) return [];
            const rows = tables.get(tbl)!;
            if (rows.length === 0) return KNOWN_COLUMNS.map(name => ({ name }));
            return Object.keys(rows[0]).map(name => ({ name }));
          }

          // SELECT arena_id FROM battles
          if (/SELECT arena_id FROM battles/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;
            return rows.filter(r => r.account_id === acctId).map(r => ({ arena_id: r.arena_id }));
          }

          return [];
        },
      };
    },

    transaction(fn: (...args: unknown[]) => unknown) {
      return (...args: unknown[]) => fn(...args);
    },

    close() { this.open = false; },
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
    if (!fakeDb || !fakeDb.open) fakeDb = createFakeDb();
    return fakeDb;
  };
  return { default: MockDatabase };
});

// Import AFTER mocks
import {
  getBattleDebrief,
  saveBattleDebrief,
  clearBattleDebriefs,
  getTankBaseline,
  insertBattles,
  closeDb,
} from '../main/services/cache';
import type { BattleRecord, BattleDebrief } from '../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 1;

function makeBattle(overrides: Partial<BattleRecord> = {}): BattleRecord {
  const id = _idCounter++;
  return {
    id,
    accountId: 1000,
    arenaId: `arena-${id}`,
    playedAt: Date.now() - 1000 * id,
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
    ...overrides,
  };
}

function makeDebrief(overrides: Partial<BattleDebrief> = {}): BattleDebrief {
  return {
    summary: 'Good game overall.',
    wentWell: ['High damage'],
    wentWrong: ['Died early'],
    tips: ['Use hull-down more'],
    generatedAt: Date.now(),
    model: 'claude-haiku-4-5-20251001',
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  if (fakeDb) fakeDb.open = false;
  fakeDb = undefined;
  _idCounter = 1;
});

afterEach(() => {
  closeDb();
});

// ===========================================================================
// getBattleDebrief / saveBattleDebrief
// ===========================================================================

describe('getBattleDebrief', () => {
  it('returns null when no debrief exists', () => {
    expect(getBattleDebrief('nonexistent-arena')).toBeNull();
  });

  it('returns stored debrief after save', () => {
    const debrief = makeDebrief();
    saveBattleDebrief('arena-42', 1000, debrief);
    const result = getBattleDebrief('arena-42');
    expect(result).not.toBeNull();
    expect(result!.summary).toBe(debrief.summary);
    expect(result!.wentWell).toEqual(debrief.wentWell);
    expect(result!.wentWrong).toEqual(debrief.wentWrong);
    expect(result!.tips).toEqual(debrief.tips);
    expect(result!.model).toBe(debrief.model);
  });

  it('replaces existing debrief on second save (REPLACE semantic)', () => {
    saveBattleDebrief('arena-42', 1000, makeDebrief({ summary: 'First' }));
    saveBattleDebrief('arena-42', 1000, makeDebrief({ summary: 'Second' }));
    const result = getBattleDebrief('arena-42');
    expect(result!.summary).toBe('Second');
  });
});

// ===========================================================================
// clearBattleDebriefs
// ===========================================================================

describe('clearBattleDebriefs', () => {
  it('clears all debriefs when no accountId passed', () => {
    saveBattleDebrief('arena-1', 1000, makeDebrief());
    saveBattleDebrief('arena-2', 1000, makeDebrief());
    saveBattleDebrief('arena-3', 2000, makeDebrief());
    clearBattleDebriefs();
    expect(getBattleDebrief('arena-1')).toBeNull();
    expect(getBattleDebrief('arena-2')).toBeNull();
    expect(getBattleDebrief('arena-3')).toBeNull();
  });

  it('clears only the specified account debriefs when accountId passed', () => {
    saveBattleDebrief('arena-1', 1000, makeDebrief());
    saveBattleDebrief('arena-2', 1000, makeDebrief());
    saveBattleDebrief('arena-3', 2000, makeDebrief());
    clearBattleDebriefs(1000);
    expect(getBattleDebrief('arena-1')).toBeNull();
    expect(getBattleDebrief('arena-2')).toBeNull();
    expect(getBattleDebrief('arena-3')).not.toBeNull(); // account 2000 unaffected
  });
});

// ===========================================================================
// getTankBaseline
// ===========================================================================

describe('getTankBaseline', () => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  it('returns null when no battles exist for that tank', () => {
    expect(getTankBaseline(1000, 'germany-G123_E100', THIRTY_DAYS_MS)).toBeNull();
  });

  it('returns null when only incomplete battles exist', () => {
    insertBattles([makeBattle({ result: 'incomplete', damage: 0, playedAt: now - 1000 })]);
    expect(getTankBaseline(1000, 'germany-G123_E100', THIRTY_DAYS_MS)).toBeNull();
  });

  it('computes correct averages from a set of battles', () => {
    insertBattles([
      makeBattle({ damage: 1000, kills: 1, assist: 200, result: 'win',  playedAt: now - 1000 }),
      makeBattle({ damage: 3000, kills: 3, assist: 400, result: 'loss', playedAt: now - 2000 }),
      makeBattle({ damage: 2000, kills: 2, assist: 300, result: 'win',  playedAt: now - 3000 }),
    ]);
    const baseline = getTankBaseline(1000, 'germany-G123_E100', THIRTY_DAYS_MS);
    expect(baseline).not.toBeNull();
    expect(baseline!.battles).toBe(3);
    expect(baseline!.avgDamage).toBe(2000);
    expect(baseline!.avgFrags).toBe(2);
    expect(baseline!.avgAssist).toBe(300);
    expect(baseline!.winRate).toBeCloseTo(66.7, 0);
  });

  it('excludes battles older than sinceMs', () => {
    const old = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago
    insertBattles([
      makeBattle({ damage: 5000, playedAt: old }),
      makeBattle({ damage: 1000, playedAt: now - 1000 }),
    ]);
    const baseline = getTankBaseline(1000, 'germany-G123_E100', THIRTY_DAYS_MS);
    expect(baseline!.battles).toBe(1);
    expect(baseline!.avgDamage).toBe(1000);
  });

  it('excludes battles from a different tank key', () => {
    insertBattles([
      makeBattle({ tankKey: 'ussr-R48_KV_1',      damage: 800,  playedAt: now - 1000 }),
      makeBattle({ tankKey: 'germany-G123_E100',   damage: 2000, playedAt: now - 2000 }),
    ]);
    const baseline = getTankBaseline(1000, 'germany-G123_E100', THIRTY_DAYS_MS);
    expect(baseline!.battles).toBe(1);
    expect(baseline!.avgDamage).toBe(2000);
  });
});
