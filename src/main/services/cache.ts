/**
 * Cache facade: single import point for the persistence layer.
 *
 * Implementation is split by concern:
 * - repos/api-cache-repo.ts   — cached WG API responses + AI artifacts
 * - repos/battles-repo.ts     — parsed battle CRUD + scan state
 * - repos/snapshots-repo.ts   — progress snapshot history
 * - battle-analytics.ts       — aggregate read-only queries over battles
 */
import { getDb } from './db';
import * as battlesRepo from './repos/battles-repo';

export { closeDb } from './db';

export {
  getTankDetails, saveTankDetails,
  getPlayerInfo, savePlayerInfo, clearPlayerInfoCache,
  getWgDataCache, saveWgDataCache, clearWgDataCache,
  getStats,
  getBattleDebrief, saveBattleDebrief, clearBattleDebriefs,
  getWeeklyReport, saveWeeklyReport, clearWeeklyReports, listWeeklyReports,
} from './repos/api-cache-repo';

export {
  getKnownArenaIds, invalidateKnownArenaIds, insertBattles,
  getBattleByArenaId, getBattles, getBattlesCount,
  cleanupPartialBattles, getPartialBattles, resolvePartialBattle,
  getLastScanTime, setLastScanTime,
  getUnresolvedAbandonedBattles,
} from './repos/battles-repo';

export {
  getProgressSnapshots, getLastProgressSnapshot, saveProgressSnapshot,
  backfillMissingWnx,
} from './repos/snapshots-repo';

export {
  getRecentBattlesByTank, getReplayMapStats, getReplayTankStats,
  getEconomyByDay, getTodaySession, getReplayTankContext,
  getSessions, getTankBaseline,
} from './battle-analytics';

export type { RecentTankGroup, ReplayTankContext, TankBaseline } from './battle-analytics';

// Re-export for main-process consumers; canonical definitions live in shared/types
export type {
  ReplayMapStat, ReplayTankStat, EconomyDay, SessionSummary, TodaySession,
} from '../../shared/types';

/** Clears cached API responses and AI results, but keeps parsed battles (user data). */
export function clearApiCaches(): void {
  getDb().exec('DELETE FROM tank_details; DELETE FROM player_info; DELETE FROM progress_snapshots; DELETE FROM wg_data_cache; DELETE FROM battle_debriefs; DELETE FROM weekly_reports;');
}

/** Full wipe: API caches AND the parsed battle database + scan state. */
export function clearAll(): void {
  clearApiCaches();
  getDb().exec('DELETE FROM battles; DELETE FROM scan_state; DELETE FROM tank_stat_snapshots;');
  battlesRepo.clearKnownArenaIdsCache();
}

/** Removes all battles and AI artifacts for one account (user-initiated reset). */
export function clearBattles(accountId: number): void {
  const db = getDb();
  battlesRepo.deleteBattlesForAccount(accountId);
  db.prepare('DELETE FROM battle_debriefs WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM weekly_reports WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM tank_stat_snapshots WHERE account_id = ?').run(accountId);
}
