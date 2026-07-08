import fs from 'fs';
import path from 'path';
import type { BattleRecord, DetectedPlayer } from '../../shared/types';
import { normalizeMapName } from '../../shared/utils/mapNames';
import { formatTankName } from '../../shared/utils/vehicles';

export { formatTankName };

export type ParsedBattle = Omit<BattleRecord, 'id' | 'accountId'> & {
  playerAccountId?: number;
};

const BATTLE_TYPE_LABELS: Record<string, string> = {
  ctf:        'Standard',
  assault:    'Assault',
  encounter:  'Encounter',
  domination: 'Frontline',
  fallout:    'Steel Hunter',
  ranked:     'Ranked',
  epic:       'Grand Battle',
};

/** WoT replay cost fields (autoLoadCost, autoEquipCost) can be either a number
 *  or an array of numbers. Sum all elements to get the total cost. */
function sumCost(value: unknown): number {
  if (Array.isArray(value)) return (value as number[]).reduce((acc, v) => acc + (Number(v) || 0), 0);
  return Number(value) || 0;
}

// Hard ceiling for a single replay JSON block. Real block0/block1 payloads are
// well under 5 MB — a larger declared size means a corrupted (or malicious)
// header, and blindly Buffer.alloc'ing it could exhaust memory.
const MAX_BLOCK_SIZE = 32 * 1024 * 1024;

/**
 * Reads a length-prefixed data block (4-byte LE size followed by payload).
 * Returns null when the declared size is implausible or the file is shorter
 * than the header claims, instead of allocating an attacker-controlled buffer.
 */
function readSizedBlock(fd: number, sizeOffset: number): Buffer | null {
  const sizeBuf = Buffer.alloc(4);
  if (fs.readSync(fd, sizeBuf, 0, 4, sizeOffset) !== 4) return null;
  const size = sizeBuf.readUInt32LE(0);
  if (size === 0 || size > MAX_BLOCK_SIZE) return null;
  const buf = Buffer.alloc(size);
  if (fs.readSync(fd, buf, 0, size, sizeOffset + 4) !== size) return null;
  return buf;
}

export function parseReplay(filePath: string): ParsedBattle | null {
  let fd = -1;
  try {
    fd = fs.openSync(filePath, 'r');

    const headerBuf = Buffer.alloc(8);
    fs.readSync(fd, headerBuf, 0, 8, 0);
    const numBlocks = headerBuf.readUInt32LE(4);
    if (numBlocks === 0) return null; // empty file

    // Read block 0 (battle setup)
    const block0Buf = readSizedBlock(fd, 8);
    if (!block0Buf) return null;
    const block0 = JSON.parse(block0Buf.toString('utf-8'));

    if (numBlocks < 2) {
      // Battle was abandoned before it ended — only setup block exists.
      // Return partial record with what we know; stats will be all zeros.
      if (!block0.dateTime || !block0.playerVehicle) return null;
      const [datePart, timePart] = (block0.dateTime as string).split(' ');
      const [day, month, year] = datePart.split('.');
      const [h, m, s] = timePart.split(':');
      const playedAt = new Date(+year, +month - 1, +day, +h, +m, +s).getTime();
      const gameplayID: string = block0.gameplayID ?? 'ctf';
      fs.closeSync(fd); fd = -1;
      return {
        playerAccountId: block0.playerID as number | undefined,
        arenaId:        `partial_${path.basename(filePath, '.wotreplay')}`,
        playedAt,
        tankKey:        block0.playerVehicle as string,
        tankName:       formatTankName(block0.playerVehicle as string),
        mapName:        normalizeMapName((block0.mapDisplayName as string) ?? ''),
        battleType:     BATTLE_TYPE_LABELS[gameplayID] ?? gameplayID,
        result:         'incomplete',
        damage: 0, assist: 0, kills: 0, shots: 0, hits: 0, pens: 0,
        spotted: 0, xp: 0, credits: 0, survived: false, duration: 0,
        droppedCapture: 0, damageReceived: 0, damageBlocked: 0,
        repairCost: 0, netCredits: 0, markOfMastery: 0, marksOnGun: 0,
        lifeTime: 0, achievements: [],
        abandoned: true, statsEstimated: false,
      };
    }

    // Read block 1 (battle results)
    const block1Buf = readSizedBlock(fd, 12 + block0Buf.length);
    if (!block1Buf) return null;
    const block1 = JSON.parse(block1Buf.toString('utf-8'));

    fs.closeSync(fd);
    fd = -1;

    const result = Array.isArray(block1) ? block1[0] : block1;
    if (!result?.personal || !result?.common) return null;

    const personalKey = Object.keys(result.personal)[0];
    const personal = result.personal[personalKey];
    const common = result.common;

    // Parse "03.04.2026 12:16:09" as local time
    const [datePart, timePart] = (block0.dateTime as string).split(' ');
    const [day, month, year] = datePart.split('.');
    const [h, m, s] = timePart.split(':');
    const playedAt = new Date(+year, +month - 1, +day, +h, +m, +s).getTime();

    const playerTeam: number = personal.team;
    const winnerTeam: number = common.winnerTeam ?? 0;
    const battleResult: 'win' | 'loss' | 'draw' =
      winnerTeam === 0 ? 'draw' : winnerTeam === playerTeam ? 'win' : 'loss';

    const gameplayID: string = block0.gameplayID ?? 'ctf';

    return {
      playerAccountId: block0.playerID as number | undefined,
      arenaId:     String(result.arenaUniqueID),
      playedAt,
      tankKey:     block0.playerVehicle as string,
      tankName:    formatTankName(block0.playerVehicle as string),
      mapName:     normalizeMapName(block0.mapDisplayName as string),
      battleType:  BATTLE_TYPE_LABELS[gameplayID] ?? gameplayID,
      result:      battleResult,
      damage:      personal.damageDealt               ?? 0,
      assist:      (personal.damageAssistedRadio ?? 0) + (personal.damageAssistedTrack ?? 0),
      kills:       personal.kills                      ?? 0,
      shots:       personal.shots                      ?? 0,
      hits:        personal.directEnemyHits            ?? 0,
      pens:        personal.piercings                  ?? 0,
      spotted:     personal.spotted                    ?? 0,
      xp:          personal.xp                         ?? 0,
      credits:     personal.credits                    ?? 0,
      survived:       (personal.health ?? -1) > 0,
      duration:       common.duration                  ?? 0,
      droppedCapture: personal.droppedCapturePoints    ?? 0,
      damageReceived: personal.damageReceived          ?? 0,
      damageBlocked:  personal.damageBlockedByArmor    ?? 0,
      repairCost:     personal.autoRepairCost          ?? 0,
      netCredits:     (personal.credits ?? 0) - (personal.autoRepairCost ?? 0) - sumCost(personal.autoLoadCost) - sumCost(personal.autoEquipCost),
      markOfMastery:  personal.markOfMastery           ?? 0,
      marksOnGun:     personal.marksOnGun              ?? 0,
      lifeTime:       personal.lifeTime                ?? 0,
      achievements:   Array.isArray(personal.achievements) ? personal.achievements : [],
      abandoned: false, statsEstimated: false,
    };
  } catch (e) {
    // Keep the log low-noise but actionable: one line with file name + reason.
    console.warn(
      `[replay-parser] Failed to parse ${path.basename(filePath)}:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  } finally {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

// Canonical definition lives in shared/types (renderer-facing via IPC)
export type { DetectedPlayer } from '../../shared/types';

function regionFromServer(serverName: string): string {
  const s = (serverName ?? '').toUpperCase();
  if (s.includes('EU')) return 'EU';
  if (s.includes('NA')) return 'NA';
  if (s.includes('ASIA') || s.includes('SG')) return 'ASIA';
  return 'EU';
}

export function detectPlayerFromReplays(replayDir: string): DetectedPlayer | null {
  let files: string[];
  try {
    files = fs.readdirSync(replayDir)
      .filter(f => f.endsWith('.wotreplay') && f !== 'temp.wotreplay')
      .sort()
      .reverse();
  } catch { return null; }

  for (const file of files.slice(0, 20)) {
    let fd = -1;
    try {
      fd = fs.openSync(path.join(replayDir, file), 'r');
      const header = Buffer.alloc(8);
      fs.readSync(fd, header, 0, 8, 0);
      if (header.readUInt32LE(4) < 1) { fs.closeSync(fd); fd = -1; continue; }
      const buf0 = readSizedBlock(fd, 8);
      fs.closeSync(fd); fd = -1;
      if (!buf0) continue;
      const block0 = JSON.parse(buf0.toString('utf-8'));
      if (block0.playerID && block0.playerName && block0.serverName) {
        return {
          playerName: block0.playerName as string,
          accountId:  block0.playerID as number,
          region:     regionFromServer(block0.serverName as string),
        };
      }
    } catch { /* try next */ }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
  return null;
}

export function detectAllPlayersFromReplays(replayDir: string): DetectedPlayer[] {
  let files: string[];
  try {
    files = fs.readdirSync(replayDir)
      .filter(f => f.endsWith('.wotreplay') && f !== 'temp.wotreplay')
      .sort()
      .reverse();
  } catch { return []; }

  const seen = new Map<string, DetectedPlayer>();

  // Cap to the 2000 most recent files — enough to cover all realistic multi-account
  // setups while avoiding a blocking scan of 100k+ files on large replay libraries.
  for (const file of files.slice(0, 2000)) {
    let fd = -1;
    try {
      fd = fs.openSync(path.join(replayDir, file), 'r');
      const header = Buffer.alloc(8);
      fs.readSync(fd, header, 0, 8, 0);
      if (header.readUInt32LE(4) < 1) { fs.closeSync(fd); fd = -1; continue; }
      const buf0 = readSizedBlock(fd, 8);
      fs.closeSync(fd); fd = -1;
      if (!buf0) continue;
      const block0 = JSON.parse(buf0.toString('utf-8'));

      // playerID is optional; use it if available, otherwise use playerName+serverName
      if (block0.playerName && block0.serverName) {
        const uniqueKey = block0.playerID
          ? String(block0.playerID as number)
          : `${block0.playerName as string}|${block0.serverName as string}`;

        // Most recent file wins (files sorted newest-first); skip if already seen
        if (!seen.has(uniqueKey)) {
          seen.set(uniqueKey, {
            playerName: block0.playerName as string,
            accountId:  block0.playerID ? (block0.playerID as number) : null,
            region:     regionFromServer(block0.serverName as string),
          });
        }
      }
    } catch { /* try next */ }
    finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
  }

  return Array.from(seen.values());
}

export interface ScanResult {
  added: number;
  skipped: number;
  errors: number;
}

/**
 * WoT names replays like "20250120_1543_usa-M48A5_42_karelia.wotreplay".
 * Returns the timestamp encoded in the filename, or 0 if the pattern doesn't match.
 */
function extractFilenameDate(filename: string): number {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})_/);
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

export async function scanReplays(
  replayDir: string,
  accountId: number,
  knownArenaIds: Set<string>,
  onBatch: (battles: (ParsedBattle & { accountId: number })[]) => void,
  sinceMs?: number,
): Promise<ScanResult> {
  const result: ScanResult = { added: 0, skipped: 0, errors: 0 };
  let files: string[];
  try {
    const allFiles = await fs.promises.readdir(replayDir);
    files = allFiles
      .filter(f => f.endsWith('.wotreplay') && f !== 'temp.wotreplay' && f !== 'replay_last_battle.wotreplay');
  } catch {
    return result;
  }

  // Incremental scan: sort newest-first by the date in the filename and stop
  // once we reach files older than sinceMs. This avoids parsing thousands of
  // already-known replay files on every auto-refresh tick.
  if (sinceMs !== undefined) {
    files.sort((a, b) => extractFilenameDate(b) - extractFilenameDate(a));
  }

  const batch: (ParsedBattle & { accountId: number })[] = [];

  for (const file of files) {
    if (sinceMs !== undefined) {
      const fileDate = extractFilenameDate(file);
      // fileDate === 0 means we couldn't parse the name — skip the date check for that file
      if (fileDate !== 0 && fileDate < sinceMs) break;
    }

    const parsed = parseReplay(path.join(replayDir, file));
    if (!parsed) { result.errors++; continue; }
    if (knownArenaIds.has(parsed.arenaId)) { result.skipped++; continue; }

    // Filter to current player only — skip replays belonging to other players
    if (parsed.playerAccountId !== undefined && parsed.playerAccountId !== accountId) {
      result.skipped++;
      continue;
    }

    knownArenaIds.add(parsed.arenaId);
    batch.push({ ...parsed, accountId });
    result.added++;

    if (batch.length >= 100) {
      onBatch([...batch]);
      batch.length = 0;
      // Yield the event loop so the Electron main thread stays responsive
      // during large initial scans (100k+ files would freeze the UI otherwise).
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  if (batch.length > 0) onBatch(batch);

  return result;
}
