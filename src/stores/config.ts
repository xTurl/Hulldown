import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppConfig } from '../types';

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig | null>(null);

  async function loadConfig() {
    config.value = await window.api.getConfig();
  }

  async function saveConfig(newConfig: AppConfig) {
    await window.api.saveConfig(newConfig);
    config.value = newConfig;
  }

  return { config, loadConfig, saveConfig };
});
