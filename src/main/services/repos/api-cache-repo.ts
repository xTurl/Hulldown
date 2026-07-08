/**
 * API/AI cache repository: cached Wargaming API responses (tank details,
 * player info, WG data blobs) and AI-generated artifacts (battle debriefs,
 * weekly coach reports).
 */
import type { BattleDebrief, WeeklyCoachReport } from '../../../shared/types';
import { getDb } from '../db';
import { safeJsonParse } from './json';

// ---------------------------------------------------------------------------
// Tank details
// ---------------------------------------------------------------------------

export function getTankDetails(tankId: number): { data: unknown; updatedAt: number } | null {
  const row = getDb().prepare('SELECT data, updated_at FROM tank_details WHERE tank_id = ?').get(tankId) as { data: string; updated_at: number } | undefined;
  if (!row) return null;
  const data = safeJsonParse(row.data, `tank_details #${tankId}`);
  if (data === null) return null;
  return { data, updatedAt: row.updated_at };
}

export function saveTankDetails(tankId: number, data: unknown): void {
  getDb().prepare('INSERT OR REPLACE INTO tank_details (tank_id, data, updated_at) VALUES (?, ?, ?)').run(tankId, JSON.stringify(data), Date.now());
}

// ---------------------------------------------------------------------------
// Player info
// ---------------------------------------------------------------------------

export function getPlayerInfo(): { data: unknown; updatedAt: number } | null {
  const row = getDb().prepare('SELECT data, updated_at FROM player_info WHERE id = 1').get() as { data: string; updated_at: number } | undefined;
  if (!row) return null;
  const data = safeJsonParse(row.data, 'player_info');
  if (data === null) return null;
  return { data, updatedAt: row.updated_at };
}

export function savePlayerInfo(data: unknown): void {
  getDb().prepare('INSERT OR REPLACE INTO player_info (id, data, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(data), Date.now());
}

export function clearPlayerInfoCache(): void {
  getDb().prepare('DELETE FROM player_info').run();
}

// ---------------------------------------------------------------------------
// WG data blobs (tank stats + encyclopedia)
// ---------------------------------------------------------------------------

export function getWgDataCache(accountId: number): { tankStats: unknown; encyclopedia: unknown; updatedAt: number } | null {
  const row = getDb()
    .prepare('SELECT tank_stats, encyclopedia, updated_at FROM wg_data_cache WHERE account_id = ?')
    .get(accountId) as { tank_stats: string; encyclopedia: string; updated_at: number } | undefined;
  if (!row) return null;
  const tankStats = safeJsonParse(row.tank_stats, 'wg_data_cache.tank_stats');
  const encyclopedia = safeJsonParse(row.encyclopedia, 'wg_data_cache.encyclopedia');
  if (tankStats === null || encyclopedia === null) return null;
  return {
    tankStats,
    encyclopedia,
    updatedAt: row.updated_at,
  };
}

export function saveWgDataCache(accountId: number, tankStats: unknown, encyclopedia: unknown): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO wg_data_cache (account_id, tank_stats, encyclopedia, updated_at) VALUES (?, ?, ?, ?)')
    .run(accountId, JSON.stringify(tankStats), JSON.stringify(encyclopedia), Date.now());
}

export function clearWgDataCache(accountId: number): void {
  getDb().prepare('DELETE FROM wg_data_cache WHERE account_id = ?').run(accountId);
}

export function getStats(): { tanks: number; lastSync: string | null } {
  const tanksRow = getDb().prepare('SELECT COUNT(*) as count FROM tank_details').get() as { count: number };
  const syncRow = getDb().prepare('SELECT MAX(updated_at) as last FROM tank_details').get() as { last: number | null };
  return {
    tanks: tanksRow.count,
    lastSync: syncRow.last ? new Date(syncRow.last).toLocaleString('en-US') : null,
  };
}

// ---------------------------------------------------------------------------
// Battle Debriefs
// ---------------------------------------------------------------------------

export function getBattleDebrief(accountId: number, arenaId: string): BattleDebrief | null {
  const row = getDb()
    .prepare('SELECT json FROM battle_debriefs WHERE account_id = ? AND arena_id = ?')
    .get(accountId, arenaId) as { json: string } | undefined;
  if (!row) return null;
  return safeJsonParse<BattleDebrief>(row.json, `battle_debriefs ${arenaId}`);
}

export function saveBattleDebrief(arenaId: string, accountId: number, debrief: BattleDebrief): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO battle_debriefs (arena_id, account_id, json, created_at) VALUES (?, ?, ?, ?)')
    .run(arenaId, accountId, JSON.stringify(debrief), Date.now());
}

/** Clear debriefs. Passing accountId clears only that player's debriefs; omit to clear all. */
export function clearBattleDebriefs(accountId?: number): void {
  if (accountId !== undefined) {
    getDb().prepare('DELETE FROM battle_debriefs WHERE account_id = ?').run(accountId);
  } else {
    getDb().prepare('DELETE FROM battle_debriefs').run();
  }
}

// ---------------------------------------------------------------------------
// Weekly Reports
// ---------------------------------------------------------------------------

export function getWeeklyReport(accountId: number, isoWeek: string): WeeklyCoachReport | null {
  const row = getDb()
    .prepare('SELECT json FROM weekly_reports WHERE account_id = ? AND iso_week = ?')
    .get(accountId, isoWeek) as { json: string } | undefined;
  if (!row) return null;
  return safeJsonParse<WeeklyCoachReport>(row.json, `weekly_reports ${isoWeek}`);
}

export function saveWeeklyReport(accountId: number, isoWeek: string, report: WeeklyCoachReport): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO weekly_reports (account_id, iso_week, json, created_at) VALUES (?, ?, ?, ?)')
    .run(accountId, isoWeek, JSON.stringify(report), Date.now());
}

/** Clear weekly reports. Passing accountId clears only that player's reports; omit to clear all. */
export function clearWeeklyReports(accountId?: number): void {
  if (accountId !== undefined) {
    getDb().prepare('DELETE FROM weekly_reports WHERE account_id = ?').run(accountId);
  } else {
    getDb().prepare('DELETE FROM weekly_reports').run();
  }
}

export function listWeeklyReports(accountId: number, limit = 10): { isoWeek: string; createdAt: number }[] {
  return getDb()
    .prepare('SELECT iso_week as isoWeek, created_at as createdAt FROM weekly_reports WHERE account_id = ? ORDER BY iso_week DESC LIMIT ?')
    .all(accountId, limit) as { isoWeek: string; createdAt: number }[];
}
