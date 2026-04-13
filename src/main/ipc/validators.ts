import type { AppConfig } from '../../shared/types';

export function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`IPC param "${name}" must be a string, got ${typeof value}`);
  }
  return value;
}

export function assertNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(`IPC param "${name}" must be a finite number, got ${typeof value}`);
  }
  return value;
}

export function assertOptionalNumber(value: unknown, name: string, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  return assertNumber(value, name);
}

export function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`IPC param "${name}" must be a boolean, got ${typeof value}`);
  }
  return value;
}

/** Validates that unknown IPC data conforms to AppConfig shape, returns a safe object. */
export function assertConfig(data: unknown): AppConfig {
  if (!data || typeof data !== 'object') {
    throw new Error('IPC param "config" must be an object');
  }
  const d = data as Record<string, unknown>;
  return {
    claudeApiKey: typeof d.claudeApiKey === 'string' ? d.claudeApiKey : '',
    accountId: typeof d.accountId === 'number' && isFinite(d.accountId) ? d.accountId : 0,
    username: typeof d.username === 'string' ? d.username : '',
    region: typeof d.region === 'string' ? d.region : 'EU',
    replaysDir: typeof d.replaysDir === 'string' ? d.replaysDir : '',
    autoRefresh: typeof d.autoRefresh === 'boolean' ? d.autoRefresh : true,
  };
}
