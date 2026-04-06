import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AppConfig } from '../types';

const DEFAULT_CONFIG: AppConfig = {
  claudeApiKey: '',
  accountId: 0,
  username: '',
  region: 'EU',
  replaysDir: '',
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function encrypt(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return value;
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    // Legacy plain-text value — return as-is
    return value;
  }
}

export function getConfig(): AppConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const stored = JSON.parse(raw) as Partial<AppConfig>;
      const config: AppConfig = { ...DEFAULT_CONFIG, ...stored };
      config.claudeApiKey = decrypt(config.claudeApiKey);
      return config;
    }
  } catch (e) {
    console.error('Failed to read config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: AppConfig): void {
  try {
    const configPath = getConfigPath();
    const toStore = {
      ...config,
      claudeApiKey: encrypt(config.claudeApiKey),
    };
    fs.writeFileSync(configPath, JSON.stringify(toStore, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
    throw e;
  }
}
