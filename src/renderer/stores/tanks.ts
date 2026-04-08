import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Tank } from '../../shared/types';
import { friendlyWgError } from '../../shared/utils/wgErrors';

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
      console.error('[tanks:list]', e);
      error.value = friendlyWgError(e, 'Failed to load tank list');
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
