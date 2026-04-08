import fs from 'fs';
import path from 'path';
import type { BattleRecord } from '../../shared/types';

export type ParsedBattle = Omit<BattleRecord, 'id' | 'accountId'>;

const BATTLE_TYPE_LABELS: Record<string, string> = {
  ctf:        'Standard',
  assault:    'Assault',
  encounter:  'Encounter',
  domination: 'Frontline',
  fallout:    'Steel Hunter',
  ranked:     'Ranked',
  epic:       'Grand Battle',
};

export function formatTankName(vehicleKey: string): string {
  // "uk-GB123_GSOR_1006_v7" or "sweden:S10_Strv_103_0_Series"
  const withoutNation = vehicleKey.replace(/^[^:-]+-/, '').replace(/^[^:]+:/, '');
  const underscoreIdx = withoutNation.indexOf('_');
  if (underscoreIdx === -1) return withoutNation;
  return withoutNation.slice(underscoreIdx + 1).replace(/_/g, ' ');
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
    const size0Buf = Buffer.alloc(4);
    fs.readSync(fd, size0Buf, 0, 4, 8);
    const size0 = size0Buf.readUInt32LE(0);
    const block0Buf = Buffer.alloc(size0);
    fs.readSync(fd, block0Buf, 0, size0, 12);
    const block0 = JSON.parse(block0Buf.toString('utf-8'));

    if (numBlocks < 2) {
      // Battle was abandoned before it ended — only setup block exists.
      // Return partial record with what we know; stats will be all zeros.
      if (!block0.dateTime || !block0.playerVehicle) return null;
      const [datePart, timePart] = (block0.dateTime as string).split(' ');
      const [day, month, year] = datePart.split('.');
      const playedAt = new Date(`${year}-${month}-${day}T${timePart}`).getTime();
      const gameplayID: string = block0.gameplayID ?? 'ctf';
      fs.closeSync(fd); fd = -1;
      return {
        arenaId:        `partial_${path.basename(filePath, '.wotreplay')}`,
        playedAt,
        tankKey:        block0.playerVehicle as string,
        tankName:       formatTankName(block0.playerVehicle as string),
        mapName:        (block0.mapDisplayName as string) ?? '',
        battleType:     BATTLE_TYPE_LABELS[gameplayID] ?? gameplayID,
        result:         'incomplete',
        damage: 0, assist: 0, kills: 0, shots: 0, hits: 0, pens: 0,
        spotted: 0, xp: 0, credits: 0, survived: false, duration: 0,
        droppedCapture: 0, damageReceived: 0, damageBlocked: 0,
        repairCost: 0, netCredits: 0, markOfMastery: 0, marksOnGun: 0,
        lifeTime: 0, achievements: [],
      };
    }

    // Read block 1 (battle results)
    const size1Buf = Buffer.alloc(4);
    fs.readSync(fd, size1Buf, 0, 4, 12 + size0);
    const size1 = size1Buf.readUInt32LE(0);
    const block1Buf = Buffer.alloc(size1);
    fs.readSync(fd, block1Buf, 0, size1, 16 + size0);
    const block1 = JSON.parse(block1Buf.toString('utf-8'));

    fs.closeSync(fd);
    fd = -1;

    const result = Array.isArray(block1) ? block1[0] : block1;
    if (!result?.personal || !result?.common) return null;

    const personalKey = Object.keys(result.personal)[0];
    const personal = result.personal[personalKey];
    const common = result.common;

    // Parse "03.04.2026 12:16:09"
    const [datePart, timePart] = (block0.dateTime as string).split(' ');
    const [day, month, year] = datePart.split('.');
    const playedAt = new Date(`${year}-${month}-${day}T${timePart}`).getTime();

    const playerTeam: number = personal.team;
    const winnerTeam: number = common.winnerTeam ?? 0;
    const battleResult: 'win' | 'loss' | 'draw' =
      winnerTeam === 0 ? 'draw' : winnerTeam === playerTeam ? 'win' : 'loss';

    const gameplayID: string = block0.gameplayID ?? 'ctf';

    return {
      arenaId:     String(result.arenaUniqueID),
      playedAt,
      tankKey:     block0.playerVehicle as string,
      tankName:    formatTankName(block0.playerVehicle as string),
      mapName:     block0.mapDisplayName as string,
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
      netCredits:     (personal.credits ?? 0) - (personal.autoRepairCost ?? 0),
      markOfMastery:  personal.markOfMastery           ?? 0,
      marksOnGun:     personal.marksOnGun              ?? 0,
      lifeTime:       personal.lifeTime                ?? 0,
      achievements:   Array.isArray(personal.achievements) ? personal.achievements : [],
    };
  } catch {
    return null;
  } finally {
    if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

export interface DetectedPlayer {
  playerName: string;
  accountId: number;
  region: string;
}

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
      const sz0 = Buffer.alloc(4);
      fs.readSync(fd, sz0, 0, 4, 8);
      const size0 = sz0.readUInt32LE(0);
      const buf0 = Buffer.alloc(size0);
      fs.readSync(fd, buf0, 0, size0, 12);
      fs.closeSync(fd); fd = -1;
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

export interface ScanResult {
  added: number;
  skipped: number;
  errors: number;
}

export function scanReplays(
  replayDir: string,
  accountId: number,
  playerName: string,
  knownArenaIds: Set<string>,
  onBatch: (battles: (ParsedBattle & { accountId: number })[]) => void,
): ScanResult {
  const result: ScanResult = { added: 0, skipped: 0, errors: 0 };
  let files: string[];
  try {
    files = fs.readdirSync(replayDir)
      .filter(f => f.endsWith('.wotreplay') && f !== 'temp.wotreplay' && f !== 'replay_last_battle.wotreplay');
  } catch {
    return result;
  }

  const batch: (ParsedBattle & { accountId: number })[] = [];

  for (const file of files) {
    const parsed = parseReplay(path.join(replayDir, file));
    if (!parsed) { result.errors++; continue; }
    if (knownArenaIds.has(parsed.arenaId)) { result.skipped++; continue; }

    // Filter to current player only
    // (replays directory is shared but we only want this account's battles)
    knownArenaIds.add(parsed.arenaId);
    batch.push({ ...parsed, accountId });
    result.added++;

    if (batch.length >= 100) {
      onBatch([...batch]);
      batch.length = 0;
    }
  }

  if (batch.length > 0) onBatch(batch);

  return result;
}
