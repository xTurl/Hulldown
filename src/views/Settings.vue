<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAppStore } from '../stores/app';
import type { AppConfig, CacheStats } from '../types';

const store = useAppStore();
const form = ref<AppConfig>({
  wgApiKey: '', claudeApiKey: '', accountId: 0, username: '', region: 'EU', replaysDir: '',
});
const saved = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);
const cacheStats = ref<CacheStats>({ tanks: 0, lastSync: null });
const clearing = ref(false);
const clearingBattles = ref(false);
const battlesCleared = ref(false);
const searching = ref(false);
const searchError = ref<string | null>(null);
const foundPlayer = ref<{ account_id: number; nickname: string } | null>(null);

async function searchPlayer() {
  if (!form.value.username.trim()) return;
  searching.value = true;
  searchError.value = null;
  foundPlayer.value = null;
  try {
    const results = await window.api.searchPlayer(form.value.username.trim(), form.value.region);
    const exact = results.find(r => r.nickname.toLowerCase() === form.value.username.trim().toLowerCase());
    const match = exact ?? results[0] ?? null;
    if (!match) {
      searchError.value = 'Player not found.';
    } else {
      foundPlayer.value = match;
      form.value.username = match.nickname;
      form.value.accountId = match.account_id;
    }
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : 'Search failed';
  } finally {
    searching.value = false;
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
    store.config = form.value;
    store.playerInfo = null;
    store.tankList = [];
    await store.fetchPlayerInfo();
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
  if (store.config) {
    form.value = { ...store.config };
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

    <!-- Player section -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-4">Player account</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Region</label>
          <select v-model="form.region" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
            <option value="EU">EU (Europe)</option>
            <option value="NA">NA (North America)</option>
            <option value="ASIA">ASIA (Asia)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Username</label>
          <div class="flex gap-2">
            <input
              v-model="form.username"
              @keyup.enter="searchPlayer"
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            />
            <button
              @click="searchPlayer"
              :disabled="searching || !form.username.trim()"
              class="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded-lg transition-colors whitespace-nowrap"
            >
              {{ searching ? '...' : 'Find' }}
            </button>
          </div>
          <p v-if="searchError" class="text-xs text-red-400 mt-1">{{ searchError }}</p>
          <p v-if="foundPlayer" class="text-xs text-green-400 mt-1">
            ✓ Found: {{ foundPlayer.nickname }} (ID: {{ foundPlayer.account_id }})
          </p>
          <p v-else-if="form.accountId" class="text-xs text-gray-500 mt-1">Account ID: {{ form.accountId }}</p>
        </div>
      </div>
    </div>

    <!-- API Keys section -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-4">API Keys</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Wargaming API Key</label>
          <input v-model="form.wgApiKey" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 font-mono" />
          <p class="text-xs text-gray-600 mt-1">Get yours at developers.wargaming.net (free)</p>
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Claude API Key</label>
          <input v-model="form.claudeApiKey" type="password" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 font-mono" />
          <p class="text-xs text-gray-600 mt-1">Get yours at console.anthropic.com</p>
        </div>
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
      Settings saved. Data reloaded for the new player.
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
