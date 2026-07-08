import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RendererConfig, RendererConfigUpdate } from '../../shared/types';

export const useConfigStore = defineStore('config', () => {
  const config = ref<RendererConfig | null>(null);

  async function loadConfig() {
    config.value = await window.api.getConfig();
  }

  async function saveConfig(update: RendererConfigUpdate) {
    await window.api.saveConfig(update);
    // Re-fetch so hasClaudeApiKey and any main-process normalization stay accurate
    await loadConfig();
  }

  return { config, loadConfig, saveConfig };
});
