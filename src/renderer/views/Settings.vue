<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useConfigStore } from '../stores/config';
import { usePlayerStore } from '../stores/player';
import { useTanksStore } from '../stores/tanks';
import { useThemeStore, type ThemeMode } from '../stores/theme';
import { useScanStore } from '../stores/scan';
import type { RendererConfig, CacheStats } from '../../shared/types';

const configStore = useConfigStore();
const playerStore = usePlayerStore();
const tanksStore = useTanksStore();
const themeStore = useThemeStore();
const scanStore = useScanStore();

const form = ref<Omit<RendererConfig, 'hasClaudeApiKey'>>({
  accountId: 0, username: '', region: 'EU', replaysDir: '', autoRefresh: true,
});
// Write-only key handling: the raw key never comes back from the main process.
// The input stays empty; a non-empty value on save replaces the stored key.
const apiKeyInput = ref('');
const hasApiKey = ref(false);
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
const appVersion = ref<string>('');

const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'auto',  label: 'Auto',  icon: 'M12 3v1M12 20v1M4.22 4.22l.7.7M18.36 18.36l.7.7M3 12h1M20 12h1M4.92 19.08l.7-.7M18.36 5.64l.7-.7M12 7a5 5 0 100 10 5 5 0 000-10z' },
  { value: 'dark',  label: 'Dark',  icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' },
  { value: 'light', label: 'Light', icon: 'M12 3v1M12 20v1M4.22 4.22l.7.7M18.36 18.36l.7.7M3 12h1M20 12h1M4.92 19.08l.7-.7M18.36 5.64l.7-.7M12 7a5 5 0 100 10 5 5 0 000-10z' },
];

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
    const newKey = apiKeyInput.value.trim();
    await Promise.race([
      window.api.saveConfig({ ...form.value, ...(newKey ? { claudeApiKey: newKey } : {}) }),
      timeout,
    ]);
    await window.api.clearCache();
    await configStore.loadConfig();
    hasApiKey.value = configStore.config?.hasClaudeApiKey ?? false;
    if (newKey) apiKeyInput.value = '';
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
  scanStore.start();
  try {
    await window.api.clearBattles();
    await window.api.scanReplays();
    battlesCleared.value = true;
    scanStore.invalidateBattles();
    setTimeout(() => battlesCleared.value = false, 4000);
  } finally {
    clearingBattles.value = false;
    scanStore.stop();
  }
}

onMounted(async () => {
  if (!configStore.config) await configStore.loadConfig();
  const cfg = configStore.config;
  if (cfg) {
    const { hasClaudeApiKey, ...fields } = cfg;
    form.value = { ...fields };
    hasApiKey.value = hasClaudeApiKey;
  }
  cacheStats.value = await window.api.getCacheStats();
  appVersion.value = await window.api.getAppVersion();
});
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto w-full">
    <h2 class="text-2xl font-bold text-fg mb-6">Settings</h2>

    <!-- Appearance -->
    <div class="bg-card border border-line rounded-xl p-5 mb-4" style="box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
      <h3 class="text-sm font-semibold text-fg mb-4">Appearance</h3>
      <div>
        <label class="block text-xs text-muted mb-2">Theme</label>
        <div class="flex gap-2">
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            @click="themeStore.setTheme(opt.value)"
            :class="[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors',
              themeStore.theme === opt.value
                ? 'border-gold text-gold bg-gold-bg'
                : 'border-line text-muted hover:text-fg hover:bg-sub',
            ]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-4 h-4 shrink-0"
            >
              <path :d="opt.icon" />
            </svg>
            {{ opt.label }}
          </button>
        </div>
        <p class="text-xs text-faint mt-2">
          <template v-if="themeStore.theme === 'auto'">Follows your system preference automatically.</template>
          <template v-else-if="themeStore.theme === 'dark'">Dark mode always on.</template>
          <template v-else>Light mode always on.</template>
        </p>
      </div>
    </div>

    <!-- Player section -->
    <div class="bg-card border border-line rounded-xl p-5 mb-4" style="box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-fg">Player account</h3>
        <button
          @click="redetectPlayer"
          :disabled="redetecting || !form.replaysDir"
          class="px-3 py-1.5 text-xs bg-sub hover:bg-card-hover disabled:opacity-50 text-muted border border-line rounded-lg transition-colors"
        >
          {{ redetecting ? 'Detecting...' : 'Re-detect from replays' }}
        </button>
      </div>
      <div class="space-y-1.5 text-sm">
        <div class="flex items-center gap-3">
          <span class="text-faint w-24">Username</span>
          <span class="text-fg font-medium">{{ form.username || '—' }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-faint w-24">Account ID</span>
          <span class="text-muted font-mono text-xs">{{ form.accountId || '—' }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-faint w-24">Region</span>
          <span class="text-muted">{{ form.region || '—' }}</span>
        </div>
      </div>
      <p v-if="redetectError" class="text-xs text-red-400 mt-3">{{ redetectError }}</p>
      <p v-if="redetectSuccess" class="text-xs text-green-400 mt-3">✓ Player re-detected. Save settings to apply.</p>
    </div>

    <!-- AI -->
    <div class="bg-card border border-line rounded-xl p-5 mb-4" style="box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
      <h3 class="text-sm font-semibold text-fg mb-1">AI (Coach, Debrief, Tank tips)</h3>
      <p class="text-xs text-faint mb-4">
        AI features work out of the box using Hulldown's free built-in AI (rate-limited, shared across all users).
        Add your own Claude API key below for unlimited use and higher-quality analysis.
      </p>
      <div>
        <label class="block text-xs text-muted mb-1.5">Claude API Key (optional)</label>
        <input
          v-model="apiKeyInput"
          type="password"
          :placeholder="hasApiKey ? '••••••••  (key saved — enter a new one to replace it)' : 'sk-ant-... (leave empty to use free AI)'"
          class="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors"
          style="background: var(--sub); border-color: var(--line); color: var(--fg);"
          onfocus="this.style.borderColor='var(--gold)'"
          onblur="this.style.borderColor='var(--line)'"
        />
        <p class="text-xs text-faint mt-1">
          Don't have a key?
          <button
            @click="() => window.api.openExternal('https://console.anthropic.com/settings/keys')"
            class="text-gold hover:opacity-80 transition-opacity"
          >Get one at console.anthropic.com →</button>
        </p>
      </div>
    </div>

    <!-- Replays -->
    <div class="bg-card border border-line rounded-xl p-5 mb-4" style="box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
      <h3 class="text-sm font-semibold text-fg mb-4">Replays</h3>
      <div>
        <label class="block text-xs text-muted mb-1.5">Replays directory</label>
        <input
          v-model="form.replaysDir"
          placeholder="/home/user/.steam/.../World of Tanks/eu/replays"
          class="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none transition-colors"
          style="background: var(--sub); border-color: var(--line); color: var(--fg);"
          onfocus="this.style.borderColor='var(--gold)'"
          onblur="this.style.borderColor='var(--line)'"
        />
        <p class="text-xs text-faint mt-1">Path to the folder where WoT saves replay files (.wotreplay)</p>
      </div>
      <div class="mt-4 pt-4 border-t border-line flex items-center justify-between">
        <div>
          <p class="text-sm text-muted">Auto-refresh</p>
          <p class="text-xs text-faint mt-0.5">Scan for new replays automatically every 30 seconds</p>
        </div>
        <button
          @click="form.autoRefresh = !form.autoRefresh"
          :class="[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
            form.autoRefresh ? 'bg-gold/80' : 'bg-line',
          ]"
          role="switch"
          :aria-checked="form.autoRefresh"
        >
          <span
            :class="[
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              form.autoRefresh ? 'translate-x-6' : 'translate-x-1',
            ]"
          />
        </button>
      </div>
    </div>

    <!-- Save button -->
    <button
      @click="save"
      :disabled="saving"
      class="w-full py-2.5 text-sm font-medium rounded-lg transition-colors mb-3 disabled:opacity-50"
      style="background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold)55"
    >
      {{ saving ? 'Saving...' : 'Save settings' }}
    </button>

    <!-- Feedback banners -->
    <div v-if="saved" class="flex items-center gap-2 px-4 py-3 mb-4 bg-green-900/30 border border-green-700/50 rounded-lg text-green-400 text-sm">
      <span class="font-bold">✓</span> Settings saved.
    </div>
    <div v-else-if="saveError" class="flex items-center gap-2 px-4 py-3 mb-4 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
      <span class="font-bold">✕</span> {{ saveError }}
    </div>
    <div v-else class="mb-4" />

    <!-- Cache -->
    <div class="bg-card border border-line rounded-xl p-5" style="box-shadow: 0 4px 20px rgba(0,0,0,0.2)">
      <h3 class="text-sm font-semibold text-fg mb-3">Cache</h3>
      <div class="flex items-center justify-between mb-3">
        <div>
          <p class="text-sm text-muted">Tanks cached: <span class="text-fg">{{ cacheStats.tanks }}</span></p>
          <p class="text-xs text-faint mt-0.5">Last sync: {{ cacheStats.lastSync || 'never' }}</p>
        </div>
        <button
          @click="clearCache"
          :disabled="clearing"
          class="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/50 rounded-lg transition-colors"
        >
          {{ clearing ? 'Clearing...' : 'Clear cache' }}
        </button>
      </div>
      <div class="border-t border-line pt-3 flex items-center justify-between">
        <div>
          <p class="text-sm text-muted">Replay database</p>
          <p class="text-xs text-faint mt-0.5">Delete all parsed battles and re-import from replay files</p>
        </div>
        <button
          @click="clearAndRescanBattles"
          :disabled="clearingBattles"
          class="px-3 py-1.5 text-xs bg-amber-900/20 hover:bg-amber-900/40 text-amber-400 border border-amber-800/50 rounded-lg transition-colors whitespace-nowrap"
        >
          {{ clearingBattles ? 'Rescanning...' : 'Reset & rescan' }}
        </button>
      </div>
      <p v-if="battlesCleared" class="text-xs text-green-400 mt-2">Done — battles re-imported successfully.</p>
    </div>

    <!-- About -->
    <div class="mt-4 flex items-center justify-center">
      <span class="text-xs text-faint">Hulldown v{{ appVersion }}</span>
    </div>
  </div>
</template>
