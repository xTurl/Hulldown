import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AppConfig } from '../types';

const DEFAULT_CONFIG: AppConfig = {
  wgApiKey: '2657ca7fc65c427a1adcf0f8712b8e03',
  claudeApiKey: '',
  accountId: 0,
  username: '',
  region: 'EU',
  replaysDir: '',
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export function getConfig(): AppConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to read config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: AppConfig): void {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
    throw e;
  }
}
