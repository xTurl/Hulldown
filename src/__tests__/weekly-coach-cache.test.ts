/**
 * Weekly coach cache helpers + getWeeklyCoachData aggregation tests.
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

// Regex helpers used by the fakeDb for SQL parsing
function extractTable(sql: string): string {
  return (sql.match(/FROM\s+(\w+)/i) ?? [])[1] ?? '';
}

function createFakeDb(): FakeDb {
  const tables = new Map<string, Row[]>();
  const autoIds = new Map<string, number>();

  function ensureTable(name: string) {
    if (!tables.has(name)) { tables.set(name, []); autoIds.set(name, 1); }
  }

  const db: FakeDb = {
    tables, autoIds, open: true,

    exec(sql: string) {
      for (const m of (sql.match(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g) ?? [])) {
        const name = m.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1];
        ensureTable(name);
      }
      for (const m of (sql.match(/DELETE FROM (\w+)/g) ?? [])) {
        const name = m.replace('DELETE FROM ', '').trim();
        tables.set(name, []);
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
          if (/^DELETE FROM (\w+)/i.test(trimmed)) {
            const tbl = (trimmed.match(/^DELETE FROM (\w+)/i) ?? [])[1]!;
            ensureTable(tbl);
            const rows = tables.get(tbl)!;
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

          if (/^INSERT OR (IGNORE|REPLACE) INTO (\w+)/i.test(trimmed)) {
            const tbl = (trimmed.match(/INSERT OR (?:IGNORE|REPLACE) INTO (\w+)/i) ?? [])[1]!;
            ensureTable(tbl);
            const colMatch = trimmed.match(/\(([^)]+)\)\s+VALUES/i);
            if (!colMatch) return { changes: 0 };
            const cols = colMatch[1].split(',').map(s => s.trim());
            const row: Row = {};
            let argIdx = 0;
            for (const col of cols) {
              if (col === 'id') { row[col] = autoIds.get(tbl)!; autoIds.set(tbl, autoIds.get(tbl)! + 1); continue; }
              row[col] = args[argIdx++];
            }
            const rows = tables.get(tbl)!;
            if (/INSERT OR REPLACE/i.test(trimmed)) {
              // For weekly_reports, PK is (account_id, iso_week)
              if (tbl === 'weekly_reports') {
                const idx = rows.findIndex(r => r.account_id === row.account_id && r.iso_week === row.iso_week);
                if (idx >= 0) rows.splice(idx, 1);
              } else {
                const pkCol = cols.find(c => c !== 'id') ?? cols[0];
                const idx = rows.findIndex(r => r[pkCol] === row[pkCol]);
                if (idx >= 0) rows.splice(idx, 1);
              }
            }
            if (/INSERT OR IGNORE/i.test(trimmed)) {
              if (tbl === 'battles') {
                if (rows.some(r => r.account_id === row.account_id && r.arena_id === row.arena_id)) return { changes: 0 };
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

          // weekly_reports lookup: WHERE account_id = ? AND iso_week = ?
          if (/FROM weekly_reports/i.test(trimmed) && /iso_week/i.test(trimmed)) {
            const rows = tables.get('weekly_reports') ?? [];
            const [accountId, isoWeek] = args as [number, string];
            return rows.find(r => r.account_id === accountId && r.iso_week === isoWeek);
          }

          // battles aggregate for computeWeekTotals
          if (/FROM battles/i.test(trimmed) && /SUM\(duration\)/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const [accountId, startMs, endMs] = args as [number, number, number];
            const filtered = rows.filter(r =>
              r.account_id === accountId &&
              r.result !== 'incomplete' &&
              (r.played_at as number) >= startMs &&
              (r.played_at as number) < endMs,
            );
            if (filtered.length === 0) return { battles: 0, wins: 0, losses: 0, totalDuration: 0, totalDamage: 0, totalFrags: 0, totalSpotted: 0, avgDamage: 0, winRate: 0, avgNetCredits: 0, survivalRate: 0, avgLifeTimeSec: 0, avgDmgReceived: 0, avgDmgBlocked: 0, earlyDeaths: 0, totalDeaths: 0 };
            const battles = filtered.length;
            const wins = filtered.filter(r => r.result === 'win').length;
            const losses = filtered.filter(r => r.result === 'loss').length;
            const totalDuration = filtered.reduce((s, r) => s + (r.duration as number), 0);
            const totalDamage = filtered.reduce((s, r) => s + (r.damage as number), 0);
            const totalFrags = filtered.reduce((s, r) => s + (r.kills as number), 0);
            const totalSpotted = filtered.reduce((s, r) => s + (r.spotted as number), 0);
            const avgDamage = Math.round(totalDamage / battles);
            const winRate = Math.round((wins / battles) * 1000) / 10;
            const avgNetCredits = Math.round(filtered.reduce((s, r) => s + (r.net_credits as number), 0) / battles);
            const survived = filtered.filter(r => r.survived === 1).length;
            const survivalRate = Math.round((survived / battles) * 1000) / 10;
            const avgLifeTimeSec = Math.round(filtered.reduce((s, r) => s + ((r.life_time as number) ?? 0), 0) / battles);
            const avgDmgReceived = Math.round(filtered.reduce((s, r) => s + ((r.damage_received as number) ?? 0), 0) / battles);
            const avgDmgBlocked = Math.round(filtered.reduce((s, r) => s + ((r.damage_blocked as number) ?? 0), 0) / battles);
            const totalDeaths = battles - survived;
            const earlyDeaths = filtered.filter(r => r.survived === 0 && (r.life_time as number) > 0 && (r.life_time as number) < 180).length;
            return { battles, wins, losses, totalDuration, totalDamage, totalFrags, totalSpotted, avgDamage, winRate, avgNetCredits, survivalRate, avgLifeTimeSec, avgDmgReceived, avgDmgBlocked, earlyDeaths, totalDeaths };
          }

          // highlight battle: ORDER BY damage DESC LIMIT 1
          if (/FROM battles/i.test(trimmed) && /ORDER BY damage DESC LIMIT 1/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const [accountId, startMs, endMs] = args as [number, number, number];
            const filtered = rows.filter(r =>
              r.account_id === accountId &&
              r.result !== 'incomplete' &&
              (r.played_at as number) >= startMs &&
              (r.played_at as number) < endMs,
            );
            if (filtered.length === 0) return undefined;
            const best = [...filtered].sort((a, b) => (b.damage as number) - (a.damage as number))[0];
            // Return with SQL aliases matching the SELECT in getWeeklyCoachData
            return { arenaId: best.arena_id, tankName: best.tank_name, mapName: best.map_name, damage: best.damage, frags: best.kills, result: best.result, playedAt: best.played_at };
          }

          // 30-day baseline (no SUM(duration), no tank_key, no GROUP BY, no ORDER BY)
          if (/FROM battles/i.test(trimmed) && /ROUND\(AVG\(damage\)/i.test(trimmed) && !/SUM\(duration\)/i.test(trimmed) && !/tank_key/i.test(trimmed) && !/ORDER BY/i.test(trimmed) && !/GROUP BY/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const [accountId, startMs, endMs] = args as [number, number, number];
            const filtered = rows.filter(r =>
              r.account_id === accountId &&
              r.result !== 'incomplete' &&
              (r.played_at as number) >= startMs &&
              (r.played_at as number) < endMs,
            );
            if (filtered.length === 0) return { battles: 0, avgDmg: 0, winRate: 0 };
            const battles = filtered.length;
            const wins = filtered.filter(r => r.result === 'win').length;
            return {
              battles,
              avgDmg: Math.round(filtered.reduce((s, r) => s + (r.damage as number), 0) / battles),
              winRate: Math.round((wins / battles) * 1000) / 10,
            };
          }

          // COUNT(*)
          if (/SELECT COUNT\(\*\)/i.test(trimmed)) {
            const tbl = extractTable(trimmed);
            const rows = tables.get(tbl) ?? [];
            const acctId = args[0] as number | undefined;
            return { count: rows.filter(r => acctId === undefined || r.account_id === acctId).length };
          }

          return undefined;
        },

        all(...args: unknown[]): Row[] {
          const pragmaMatch = trimmed.match(/PRAGMA table_info\((\w+)\)/i);
          if (pragmaMatch) {
            const tbl = pragmaMatch[1];
            if (!tables.has(tbl)) return [];
            const rows = tables.get(tbl)!;
            if (rows.length === 0) return KNOWN_COLUMNS.map(name => ({ name }));
            return Object.keys(rows[0]).map(name => ({ name }));
          }

          // arena_id lookup
          if (/SELECT arena_id FROM battles/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const acctId = args[0] as number;
            return rows.filter(r => r.account_id === acctId).map(r => ({ arena_id: r.arena_id }));
          }

          // progress_snapshots in window
          if (/FROM progress_snapshots/i.test(trimmed) && /taken_at/i.test(trimmed)) {
            const rows = tables.get('progress_snapshots') ?? [];
            const [accountId, start, end] = args as [number, number, number];
            return rows
              .filter(r => r.account_id === accountId && (r.taken_at as number) >= start && (r.taken_at as number) <= end)
              .sort((a, b) => (a.taken_at as number) - (b.taken_at as number));
          }

          // listWeeklyReports
          if (/FROM weekly_reports/i.test(trimmed) && /ORDER BY iso_week DESC/i.test(trimmed)) {
            const rows = tables.get('weekly_reports') ?? [];
            const [accountId, limit] = args as [number, number];
            return rows
              .filter(r => r.account_id === accountId)
              .sort((a, b) => String(b.iso_week).localeCompare(String(a.iso_week)))
              .slice(0, limit)
              .map(r => ({ isoWeek: r.iso_week, createdAt: r.created_at }));
          }

          // tanks this week (≥5 battles) — HAVING COUNT(*) >= 5
          if (/FROM battles/i.test(trimmed) && /HAVING COUNT\(\*\) >= 5/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const [accountId, startMs, endMs] = args as [number, number, number];
            const filtered = rows.filter(r =>
              r.account_id === accountId &&
              r.result !== 'incomplete' &&
              (r.played_at as number) >= startMs &&
              (r.played_at as number) < endMs,
            );
            const byTank = new Map<string, Row[]>();
            for (const r of filtered) {
              const k = r.tank_key as string;
              if (!byTank.has(k)) byTank.set(k, []);
              byTank.get(k)!.push(r);
            }
            const result: Row[] = [];
            for (const [tankKey, battleRows] of byTank) {
              if (battleRows.length < 5) continue;
              result.push({
                tankKey,
                tankName: battleRows[0].tank_name as string,
                battles: battleRows.length,
                avgDmg: Math.round(battleRows.reduce((s, r) => s + (r.damage as number), 0) / battleRows.length),
              });
            }
            return result;
          }

          // prior month per-tank avg (IN clause)
          if (/FROM battles/i.test(trimmed) && /tank_key IN/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            // args: accountId, priorMonthStart, thisWeekStart, ...tankKeys
            const [accountId, startMs, endMs, ...tankKeys] = args as [number, number, number, ...string[]];
            const byTank = new Map<string, number[]>();
            for (const r of rows) {
              if (
                r.account_id === accountId &&
                r.result !== 'incomplete' &&
                (r.played_at as number) >= startMs &&
                (r.played_at as number) < endMs &&
                tankKeys.includes(r.tank_key as string)
              ) {
                const k = r.tank_key as string;
                if (!byTank.has(k)) byTank.set(k, []);
                byTank.get(k)!.push(r.damage as number);
              }
            }
            return [...byTank.entries()].map(([tankKey, dmgs]) => ({
              tankKey,
              avgDmg: Math.round(dmgs.reduce((s, d) => s + d, 0) / dmgs.length),
            }));
          }

          // maps this week — HAVING COUNT(*) >= 3, ORDER BY winRate DESC
          if (/FROM battles/i.test(trimmed) && /HAVING COUNT\(\*\) >= 3/i.test(trimmed)) {
            const rows = tables.get('battles') ?? [];
            const [accountId, startMs, endMs] = args as [number, number, number];
            const filtered = rows.filter(r =>
              r.account_id === accountId &&
              r.result !== 'incomplete' &&
              (r.played_at as number) >= startMs &&
              (r.played_at as number) < endMs,
            );
            const byMap = new Map<string, Row[]>();
            for (const r of filtered) {
              const k = r.map_name as string;
              if (!byMap.has(k)) byMap.set(k, []);
              byMap.get(k)!.push(r);
            }
            const result: Row[] = [];
            for (const [mapName, mapRows] of byMap) {
              if (mapRows.length < 3) continue;
              const wins = mapRows.filter(r => r.result === 'win').length;
              result.push({
                mapName,
                battles: mapRows.length,
                winRate: Math.round((wins / mapRows.length) * 1000) / 10,
                avgDmg: Math.round(mapRows.reduce((s, r) => s + (r.damage as number), 0) / mapRows.length),
              });
            }
            return result.sort((a, b) => (b.winRate as number) - (a.winRate as number));
          }

          return [];
        },
      };
    },

    transaction(fn) { return (...args) => fn(...args); },
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
  getWeeklyReport,
  saveWeeklyReport,
  clearWeeklyReports,
  listWeeklyReports,
  getWeeklyCoachData,
  closeDb,
  insertBattles,
} from '../main/services/cache';
import type { BattleRecord, WeeklyCoachReport } from '../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 1;
const NOW = new Date('2026-04-17T12:00:00.000Z').getTime();
const WEEK_MS = 7 * 24 * 3600 * 1000;
const THIS_WEEK_START = NOW - WEEK_MS;

function makeBattle(overrides: Partial<BattleRecord & { played_at?: number }> = {}): BattleRecord {
  const id = _idCounter++;
  return {
    id,
    accountId: 1000,
    arenaId: `arena-${id}`,
    playedAt: overrides.playedAt ?? (NOW - 1000 * id),
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

function makeReport(overrides: Partial<WeeklyCoachReport> = {}): WeeklyCoachReport {
  return {
    summary: 'Good week overall.',
    focusTanks: [{ tankName: 'T-54', delta: '+450 dmg', reason: 'Strong trend' }],
    restTanks: [{ tankName: 'Bat.-Châtillon 25 t', delta: '-220 dmg', reason: 'Down vs baseline' }],
    mapPlaybook: [{ mapName: 'Prokhorovka', winRate: 65, tip: 'Push 1-line with mediums' }],
    mapsToAvoid: [{ mapName: 'Paris', winRate: 30, reason: '3 battles, 33% WR' }],
    commonMistakes: [{ pattern: 'Dying too early', evidence: 'Early deaths at 45%', fix: 'Play safer for the first 3 minutes' }],
    oneThingToFix: 'Survive past the 3-minute mark.',
    highlightBattle: {
      arenaId: 'arena-1',
      tankName: 'T-54',
      mapName: 'Prokhorovka',
      damage: 4200,
      frags: 3,
      result: 'win',
    },
    generatedAt: Date.now(),
    model: 'claude-sonnet-4-6',
    periodStartMs: THIS_WEEK_START,
    periodEndMs: NOW,
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
// getWeeklyReport / saveWeeklyReport
// ===========================================================================

describe('getWeeklyReport', () => {
  it('returns null when no report exists', () => {
    expect(getWeeklyReport(1000, '2026-W16')).toBeNull();
  });

  it('returns stored report after save', () => {
    const report = makeReport();
    saveWeeklyReport(1000, '2026-W16', report);
    const result = getWeeklyReport(1000, '2026-W16');
    expect(result).not.toBeNull();
    expect(result!.summary).toBe(report.summary);
    expect(result!.model).toBe('claude-sonnet-4-6');
  });

  it('returns null for different account', () => {
    saveWeeklyReport(1000, '2026-W16', makeReport());
    expect(getWeeklyReport(2000, '2026-W16')).toBeNull();
  });

  it('returns null for different week', () => {
    saveWeeklyReport(1000, '2026-W16', makeReport());
    expect(getWeeklyReport(1000, '2026-W15')).toBeNull();
  });

  it('replaces existing report on second save (REPLACE semantic)', () => {
    saveWeeklyReport(1000, '2026-W16', makeReport({ summary: 'First' }));
    saveWeeklyReport(1000, '2026-W16', makeReport({ summary: 'Second' }));
    expect(getWeeklyReport(1000, '2026-W16')!.summary).toBe('Second');
  });
});

// ===========================================================================
// clearWeeklyReports
// ===========================================================================

describe('clearWeeklyReports', () => {
  it('clears all reports when no accountId passed', () => {
    saveWeeklyReport(1000, '2026-W16', makeReport());
    saveWeeklyReport(2000, '2026-W16', makeReport());
    clearWeeklyReports();
    expect(getWeeklyReport(1000, '2026-W16')).toBeNull();
    expect(getWeeklyReport(2000, '2026-W16')).toBeNull();
  });

  it('clears only the specified account when accountId passed', () => {
    saveWeeklyReport(1000, '2026-W16', makeReport());
    saveWeeklyReport(2000, '2026-W16', makeReport());
    clearWeeklyReports(1000);
    expect(getWeeklyReport(1000, '2026-W16')).toBeNull();
    expect(getWeeklyReport(2000, '2026-W16')).not.toBeNull();
  });
});

// ===========================================================================
// listWeeklyReports
// ===========================================================================

describe('listWeeklyReports', () => {
  it('returns empty array when no reports exist', () => {
    expect(listWeeklyReports(1000)).toEqual([]);
  });

  it('returns reports ordered by iso_week desc', () => {
    saveWeeklyReport(1000, '2026-W14', makeReport());
    saveWeeklyReport(1000, '2026-W16', makeReport());
    saveWeeklyReport(1000, '2026-W15', makeReport());
    const result = listWeeklyReports(1000);
    expect(result.map(r => r.isoWeek)).toEqual(['2026-W16', '2026-W15', '2026-W14']);
  });

  it('respects limit parameter', () => {
    saveWeeklyReport(1000, '2026-W14', makeReport());
    saveWeeklyReport(1000, '2026-W15', makeReport());
    saveWeeklyReport(1000, '2026-W16', makeReport());
    const result = listWeeklyReports(1000, 2);
    expect(result).toHaveLength(2);
    expect(result[0].isoWeek).toBe('2026-W16');
  });
});

// ===========================================================================
// getWeeklyCoachData
// ===========================================================================

describe('getWeeklyCoachData', () => {
  it('returns zero-battles this week when no battles exist', () => {
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.thisWeek.battles).toBe(0);
    expect(data.highlightBattle).toBeNull();
    expect(data.topImprovers).toHaveLength(0);
    expect(data.topDecliners).toHaveLength(0);
  });

  it('computes this-week totals correctly', () => {
    insertBattles([
      makeBattle({ playedAt: THIS_WEEK_START + 1000, damage: 1000, kills: 1, result: 'win', duration: 600, netCredits: 20000, spotted: 0 }),
      makeBattle({ playedAt: THIS_WEEK_START + 2000, damage: 3000, kills: 3, result: 'loss', duration: 400, netCredits: 10000, spotted: 2 }),
    ]);
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.thisWeek.battles).toBe(2);
    expect(data.thisWeek.wins).toBe(1);
    expect(data.thisWeek.losses).toBe(1);
    expect(data.thisWeek.totalDamage).toBe(4000);
    expect(data.thisWeek.avgDamage).toBe(2000);
    expect(data.thisWeek.winRate).toBe(50);
    expect(data.thisWeek.hoursPlayed).toBeGreaterThan(0);
    expect(data.thisWeek.avgNetCredits).toBe(15000);
  });

  it('excludes incomplete battles from this-week totals', () => {
    insertBattles([
      makeBattle({ playedAt: THIS_WEEK_START + 1000, result: 'win', damage: 2000 }),
      makeBattle({ playedAt: THIS_WEEK_START + 2000, result: 'incomplete', damage: 0 }),
    ]);
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.thisWeek.battles).toBe(1);
  });

  it('excludes battles outside the window', () => {
    // Battle well before the window
    insertBattles([
      makeBattle({ playedAt: THIS_WEEK_START - 1000, result: 'win', damage: 5000 }),
      makeBattle({ playedAt: THIS_WEEK_START + 1000, result: 'win', damage: 1000 }),
    ]);
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.thisWeek.battles).toBe(1);
    expect(data.thisWeek.avgDamage).toBe(1000);
  });

  it('sets highlight battle to the highest damage battle this week', () => {
    insertBattles([
      makeBattle({ playedAt: THIS_WEEK_START + 1000, arenaId: 'low', damage: 500, tankName: 'T-34' }),
      makeBattle({ playedAt: THIS_WEEK_START + 2000, arenaId: 'high', damage: 5000, tankName: 'E 100' }),
    ]);
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.highlightBattle).not.toBeNull();
    expect(data.highlightBattle!.arenaId).toBe('high');
    expect(data.highlightBattle!.damage).toBe(5000);
  });

  it('highlight battle is null when no battles this week', () => {
    // Insert only prior-week battles
    insertBattles([
      makeBattle({ playedAt: THIS_WEEK_START - 1000, result: 'win' }),
    ]);
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.highlightBattle).toBeNull();
  });

  it('computes prior-week totals separately from this-week', () => {
    const PRIOR_WEEK_START = NOW - 2 * WEEK_MS;
    insertBattles([
      makeBattle({ playedAt: THIS_WEEK_START + 1000, damage: 2000, result: 'win' }),
      makeBattle({ playedAt: PRIOR_WEEK_START + 1000, damage: 1000, result: 'loss' }),
    ]);
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.thisWeek.battles).toBe(1);
    expect(data.thisWeek.avgDamage).toBe(2000);
    expect(data.priorWeek.battles).toBe(1);
    expect(data.priorWeek.avgDamage).toBe(1000);
  });

  it('identifies top improvers when tank has ≥5 battles this week and prior month data', () => {
    // 6 battles this week with high damage
    for (let i = 0; i < 6; i++) {
      insertBattles([makeBattle({ playedAt: THIS_WEEK_START + 1000 * (i + 1), tankKey: 'ussr-R48_IS_7', tankName: 'IS-7', damage: 3000, result: 'win' })]);
    }
    // 3 battles from prior month with low damage
    const PRIOR_MONTH_START = NOW - 37 * 24 * 3600 * 1000;
    for (let i = 0; i < 3; i++) {
      insertBattles([makeBattle({ playedAt: PRIOR_MONTH_START + 1000 * (i + 1), tankKey: 'ussr-R48_IS_7', tankName: 'IS-7', damage: 1000, result: 'loss' })]);
    }
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.topImprovers.length).toBeGreaterThan(0);
    const improver = data.topImprovers[0];
    expect(improver.tankKey).toBe('ussr-R48_IS_7');
    expect(improver.avgDmgThisWeek).toBe(3000);
    expect(improver.avgDmgPriorMonth).toBe(1000);
    expect(improver.delta).toBe(2000);
  });

  it('does not include tanks with fewer than 5 battles this week as improvers', () => {
    // Only 4 battles this week — below threshold
    for (let i = 0; i < 4; i++) {
      insertBattles([makeBattle({ playedAt: THIS_WEEK_START + 1000 * (i + 1), damage: 3000, result: 'win' })]);
    }
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.topImprovers).toHaveLength(0);
  });

  it('best maps sorted by win rate descending', () => {
    // Map A: 4 battles, 4 wins (100% WR)
    for (let i = 0; i < 4; i++) {
      insertBattles([makeBattle({ playedAt: THIS_WEEK_START + 1000 * (i + 1), mapName: 'MapA', result: 'win', damage: 2000 })]);
    }
    // Map B: 3 battles, 0 wins (0% WR)
    for (let i = 0; i < 3; i++) {
      insertBattles([makeBattle({ playedAt: THIS_WEEK_START + 10000 + 1000 * (i + 1), mapName: 'MapB', result: 'loss', damage: 1000 })]);
    }
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.bestMaps.length).toBeGreaterThan(0);
    expect(data.bestMaps[0].mapName).toBe('MapA');
    expect(data.bestMaps[0].winRate).toBe(100);
    expect(data.worstMaps[0].mapName).toBe('MapB');
    expect(data.worstMaps[0].winRate).toBe(0);
  });

  it('excludes maps with fewer than 3 battles from map stats', () => {
    // Only 2 battles on a map — below threshold
    for (let i = 0; i < 2; i++) {
      insertBattles([makeBattle({ playedAt: THIS_WEEK_START + 1000 * (i + 1), mapName: 'TinyMap', result: 'win' })]);
    }
    const data = getWeeklyCoachData(1000, NOW);
    expect(data.bestMaps.some(m => m.mapName === 'TinyMap')).toBe(false);
    expect(data.worstMaps.some(m => m.mapName === 'TinyMap')).toBe(false);
  });
});
