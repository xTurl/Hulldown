import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let cached: string | null = null;

function getDeviceIdPath(): string {
  return path.join(app.getPath('userData'), 'device_id');
}

/**
 * A random, anonymous identifier persisted per-install — never tied to the
 * player's WoT account or any personal data. Used only to apply a fair-use
 * daily limit on the free built-in AI proxy so a single install can't
 * exhaust the shared quota for everyone else.
 */
export function getDeviceId(): string {
  if (cached) return cached;

  try {
    const existing = fs.readFileSync(getDeviceIdPath(), 'utf-8').trim();
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // File doesn't exist yet or is unreadable — generate a new one below.
  }

  const id = crypto.randomUUID();
  try {
    fs.writeFileSync(getDeviceIdPath(), id, 'utf-8');
  } catch (e) {
    console.warn('[device-id] Failed to persist device id (a new one will be generated next launch):', e instanceof Error ? e.message : e);
  }
  cached = id;
  return id;
}
