import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Tank } from '../types';

export const useTanksStore = defineStore('tanks', () => {
  const tankList = ref<Tank[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  function reset() {
    tankList.value = [];
    error.value = null;
    loading.value = false;
  }

  return { tankList, loading, error, fetchTankList, reset };
});
