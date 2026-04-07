import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PlayerInfo } from '../../shared/types';

export const usePlayerStore = defineStore('player', () => {
  const playerInfo = ref<PlayerInfo | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  function reset() {
    playerInfo.value = null;
    error.value = null;
  }

  return { playerInfo, loading, error, fetchPlayerInfo, reset };
});
