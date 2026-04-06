<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useConfigStore } from '../stores/config';
import { usePlayerStore } from '../stores/player';
import { useTanksStore } from '../stores/tanks';
import type { AppConfig, CacheStats } from '../types';

const configStore = useConfigStore();
const playerStore = usePlayerStore();
const tanksStore = useTanksStore();
const form = ref<AppConfig>({
  claudeApiKey: '', accountId: 0, username: '', region: 'EU', replaysDir: '',
});
const saved = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);
const cacheStats = ref<CacheStats>({ tanks: 0, lastSync: null });
const clearing = ref(false);
const clearingBattles = ref(false);
const battlesCleared = ref(false);
const redetecting = ref(false);
const redetectError = ref<string | null>(null);
const redetectSuccess = ref(false);

async function redetectPlayer() {
  redetecting.value = true;
  redetectError.value = null;
  redetectSuccess.value = false;
  try {
    const player = await window.api.detectPlayer();
    if (!player) {
      redetectError.value = 'No complete replay files found. Check your replays directory path.';
      return;
    }
    form.value.username = player.playerName;
    form.value.accountId = player.accountId;
    form.value.region = player.region;
    redetectSuccess.value = true;
    setTimeout(() => redetectSuccess.value = false, 4000);
  } catch (e) {
    redetectError.value = e instanceof Error ? e.message : 'Detection failed';
  } finally {
    redetecting.value = false;
  }
}

async function save() {
  saving.value = true;
  saveError.value = null;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Save timed out')), 5000)
    );
    await Promise.race([window.api.saveConfig({ ...form.value }), timeout]);
    await window.api.clearCache();
    configStore.config = form.value;
    playerStore.reset();
    tanksStore.reset();
    await playerStore.fetchPlayerInfo();
    cacheStats.value = await window.api.getCacheStats();
    saved.value = true;
    setTimeout(() => saved.value = false, 3500);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save settings';
  } finally {
    saving.value = false;
  }
}

async function clearCache() {
  clearing.value = true;
  await window.api.clearCache();
  cacheStats.value = await window.api.getCacheStats();
  clearing.value = false;
}

async function clearAndRescanBattles() {
  clearingBattles.value = true;
  battlesCleared.value = false;
  await window.api.clearBattles();
  await window.api.scanReplays();
  battlesCleared.value = true;
  clearingBattles.value = false;
  setTimeout(() => battlesCleared.value = false, 4000);
}

onMounted(async () => {
  if (configStore.config) {
    form.value = { ...configStore.config };
  } else {
    const cfg = await window.api.getConfig();
    form.value = { ...cfg };
  }
  cacheStats.value = await window.api.getCacheStats();
});
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto w-full">
    <h2 class="text-2xl font-bold text-gray-100 mb-6">Settings</h2>

    <!-- Player section — read-only, populated from replays -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-gray-300">Player account</h3>
        <button
          @click="redetectPlayer"
          :disabled="redetecting || !form.replaysDir"
          class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 border border-gray-600 rounded-lg transition-colors"
        >
          {{ redetecting ? 'Detecting...' : 'Re-detect from replays' }}
        </button>
      </div>
      <div class="space-y-1 text-sm">
        <div class="flex items-center gap-3">
          <span class="text-gray-500 w-24">Username</span>
          <span class="text-gray-100 font-medium">{{ form.username || '—' }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-gray-500 w-24">Account ID</span>
          <span class="text-gray-400 font-mono text-xs">{{ form.accountId || '—' }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-gray-500 w-24">Region</span>
          <span class="text-gray-400">{{ form.region || '—' }}</span>
        </div>
      </div>
      <p v-if="redetectError" class="text-xs text-red-400 mt-3">{{ redetectError }}</p>
      <p v-if="redetectSuccess" class="text-xs text-green-400 mt-3">✓ Player re-detected. Save settings to apply.</p>
    </div>

    <!-- API Keys section -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-4">API Keys</h3>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Claude API Key</label>
        <input v-model="form.claudeApiKey" type="password" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 font-mono" />
        <p class="text-xs text-gray-600 mt-1">Get yours at console.anthropic.com</p>
      </div>
    </div>

    <!-- Replays section -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-4">Replays</h3>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Replays directory</label>
        <input
          v-model="form.replaysDir"
          placeholder="/home/user/.steam/.../World of Tanks/eu/replays"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 font-mono"
        />
        <p class="text-xs text-gray-600 mt-1">Path to the folder where WoT saves replay files (.wotreplay)</p>
      </div>
    </div>

    <!-- Save button -->
    <button
      @click="save"
      :disabled="saving"
      class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors mb-3"
    >
      {{ saving ? 'Saving...' : 'Save settings' }}
    </button>

    <!-- Success banner -->
    <div
      v-if="saved"
      class="flex items-center gap-2 px-4 py-3 mb-4 bg-green-900/40 border border-green-700 rounded-lg text-green-300 text-sm"
    >
      <span class="text-green-400 font-bold">✓</span>
      Settings saved.
    </div>

    <!-- Error banner -->
    <div
      v-else-if="saveError"
      class="flex items-center gap-2 px-4 py-3 mb-4 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm"
    >
      <span class="text-red-400 font-bold">✕</span>
      {{ saveError }}
    </div>

    <div v-else class="mb-4"></div>

    <!-- Cache section -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-gray-300 mb-3">Cache</h3>
      <div class="flex items-center justify-between mb-3">
        <div>
          <p class="text-sm text-gray-400">Tanks cached: <span class="text-gray-100">{{ cacheStats.tanks }}</span></p>
          <p class="text-xs text-gray-500 mt-0.5">Last sync: {{ cacheStats.lastSync || 'never' }}</p>
        </div>
        <button
          @click="clearCache"
          :disabled="clearing"
          class="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 rounded-lg transition-colors"
        >
          {{ clearing ? 'Clearing...' : 'Clear cache' }}
        </button>
      </div>
      <div class="border-t border-gray-800 pt-3 flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-400">Replay database</p>
          <p class="text-xs text-gray-600 mt-0.5">Delete all parsed battles and re-import from replay files</p>
        </div>
        <button
          @click="clearAndRescanBattles"
          :disabled="clearingBattles"
          class="px-3 py-1.5 text-xs bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 border border-amber-800 rounded-lg transition-colors whitespace-nowrap"
        >
          {{ clearingBattles ? 'Rescanning...' : 'Reset & rescan' }}
        </button>
      </div>
      <p v-if="battlesCleared" class="text-xs text-green-400 mt-2">Done — battles re-imported successfully.</p>
    </div>
  </div>
</template>
