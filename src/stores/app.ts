import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppConfig, PlayerInfo, Tank } from '../types';

export const useAppStore = defineStore('app', () => {
  const config = ref<AppConfig | null>(null);
  const playerInfo = ref<PlayerInfo | null>(null);
  const tankList = ref<Tank[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadConfig() {
    config.value = await window.api.getConfig();
  }

  async function saveConfig(newConfig: AppConfig) {
    await window.api.saveConfig(newConfig);
    config.value = newConfig;
  }

  async function fetchPlayerInfo() {
    loading.value = true;
    error.value = null;
    try {
      playerInfo.value = await window.api.getPlayerInfo();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch player data';
    } finally {
      loading.value = false;
    }
  }

  async function fetchTankList() {
    loading.value = true;
    error.value = null;
    try {
      tankList.value = await window.api.getTankList();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch tank list';
    } finally {
      loading.value = false;
    }
  }

  return { config, playerInfo, tankList, loading, error, loadConfig, saveConfig, fetchPlayerInfo, fetchTankList };
});
