/**
 * Replay scan orchestration: incremental scanning of the replay directory,
 * persistence of scan state, and resolution of partial battles (battles the
 * player left before the end, later rewritten by WoT with full stats).
 */
import path from 'path';
import * as cacheService from './cache';
import * as replayParser from './replay-parser';
import * as wgData from './wg-data';
import { backfillAbandonedBattles } from './abandoned-backfill';
import { MINUTE } from '../../shared/utils/time';
import type { BattleRecord, AppConfig } from '../../shared/types';

export interface ScanResult {
  added: number;
  skipped: number;
  errors: number;
}

// Timestamp of the last successful replay scan — used to limit incremental scans
let lastScanTime = 0;

export function resetScanState(accountId: number): void {
  lastScanTime = 0;
  cacheService.setLastScanTime(accountId, 0);
}

export async function scanReplayDirectory(config: AppConfig): Promise<ScanResult> {
  if (!config.replaysDir) return { added: 0, skipped: 0, errors: 0 };

  // Restore persisted scan time on first call after startup so that restarts
  // don't force a full re-parse of every replay file in the library.
  if (lastScanTime === 0) {
    lastScanTime = cacheService.getLastScanTime(config.accountId);
  }

  // Incremental scan: only parse replay files whose filename date is within a
  // 30-minute safety buffer of the last scan. The buffer must cover the maximum
  // WoT battle length (~15 min) because replay filenames encode the battle START
  // time, not the file write time — a battle that started 14 min before the last
  // scan and ended after it would be permanently missed with a shorter buffer.
  // INSERT OR IGNORE handles any re-processed duplicates.
  const sinceMs = lastScanTime > 0 ? lastScanTime - 30 * MINUTE : undefined;

  // For incremental scans, skip loading all arena IDs from SQLite — the filename-date
  // filter already limits parsing to recent files, and INSERT OR IGNORE handles any
  // accidental duplicates. Loading 100k+ IDs on every restart is what caused the
  // 5-second startup delay. Only do the full load for genuine full scans (first run
  // ever, or after the user clears the replay cache).
  const knownIds = sinceMs !== undefined
    ? new Set<string>()
    : cacheService.getKnownArenaIds(config.accountId);

  const result = await replayParser.scanReplays(
    config.replaysDir,
    config.accountId,
    knownIds,
    (batch) => cacheService.insertBattles(batch as BattleRecord[]),
    sinceMs,
  );
  lastScanTime = Date.now();
  cacheService.setLastScanTime(config.accountId, lastScanTime);

  // WoT rewrites replay files with full stats after battle end, even for
  // battles the player left early. The scan inserts the complete version
  // under its real arenaUniqueID; clean up the stale partial_ counterparts.
  cacheService.cleanupPartialBattles(config.accountId);

  result.added += resolvePendingPartials(config);

  // Only worth the extra WG API round-trip when this scan actually turned up
  // something new — an idle library has nothing new to reconcile.
  if (result.added > 0) {
    await tryBackfillAbandoned(config);
  }

  return result;
}

/**
 * Attempts to reconstruct real stats for battles still stuck at `incomplete`
 * (player left before the replay's result block was written) by diffing WG
 * API cumulative tank stats across snapshots. Best-effort: network failures
 * or ambiguous windows are logged and skipped, never surfaced to the caller.
 */
async function tryBackfillAbandoned(config: AppConfig): Promise<void> {
  const pending = cacheService.getUnresolvedAbandonedBattles(config.accountId);
  if (pending.length === 0) return;

  try {
    // Ensures wgData's tag/name → tankId lookups are warm before resolveTankId is used.
    await wgData.getWgData(config);
    const tankIds = new Set<number>();
    for (const b of pending) {
      const tankId = wgData.resolveTankId(b.tankKey, b.tankName);
      if (tankId !== undefined) tankIds.add(tankId);
    }
    if (tankIds.size > 0) await backfillAbandonedBattles(config, [...tankIds]);
  } catch (e) {
    console.warn('[replay-scan] Abandoned battle backfill failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * Re-parses any remaining partial battles by reading their original .wotreplay files.
 * The incremental scan's filename-date filter skips files whose name timestamp has moved
 * outside the safety window, even if WoT has since appended block1 to them.
 * Reading them directly here costs one stat+read per pending partial — negligible.
 * Returns the number of partials successfully resolved.
 */
function resolvePendingPartials(config: AppConfig): number {
  const partials = cacheService.getPartialBattles(config.accountId);
  if (partials.length === 0) return 0;

  let resolved = 0;
  for (const partial of partials) {
    const filename = partial.arenaId.slice('partial_'.length);
    const filePath = path.join(config.replaysDir, `${filename}.wotreplay`);
    const reParsed = replayParser.parseReplay(filePath);
    if (reParsed && reParsed.result !== 'incomplete') {
      cacheService.resolvePartialBattle(config.accountId, partial.arenaId, {
        ...reParsed,
        id: 0,
        accountId: config.accountId,
      } as BattleRecord);
      resolved++;
    }
  }

  // Fallback: if WoT did not rewrite the dated file (observed on some Windows setups),
  // check temp.wotreplay — WoT appends block1 there when the server battle ends.
  const stillPartials = cacheService.getPartialBattles(config.accountId);
  if (stillPartials.length > 0) {
    const tempPath = path.join(config.replaysDir, 'temp.wotreplay');
    const tempParsed = replayParser.parseReplay(tempPath);
    if (tempParsed && tempParsed.result !== 'incomplete') {
      for (const partial of stillPartials) {
        if (partial.tankKey === tempParsed.tankKey && partial.playedAt === tempParsed.playedAt) {
          cacheService.resolvePartialBattle(config.accountId, partial.arenaId, {
            ...tempParsed,
            id: 0,
            accountId: config.accountId,
          } as BattleRecord);
          resolved++;
          break;
        }
      }
    }
  }

  return resolved;
}
