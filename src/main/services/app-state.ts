import { app } from 'electron';
import fs from 'fs';
import path from 'path';

interface AppState {
  /** App version the user last acknowledged in the "What's new" modal. */
  lastSeenVersion: string;
}

const DEFAULT_STATE: AppState = { lastSeenVersion: '' };

function getStatePath(): string {
  return path.join(app.getPath('userData'), 'app-state.json');
}

function readState(): AppState {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function getLastSeenVersion(): string {
  return readState().lastSeenVersion;
}

export function markVersionSeen(version: string): void {
  const state = readState();
  state.lastSeenVersion = version;
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[app-state] Failed to persist lastSeenVersion:', e instanceof Error ? e.message : e);
  }
}
