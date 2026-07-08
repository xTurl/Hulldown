<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useConfigStore } from './stores/config';
import { usePlayerStore } from './stores/player';
import { useThemeStore } from './stores/theme';
import Sidebar from './components/Sidebar.vue';
import Setup from './views/Setup.vue';
import ScanToast from './components/ScanToast.vue';
import ToastContainer from './components/ToastContainer.vue';
import WhatsNewModal from './components/WhatsNewModal.vue';
import type { UpdateInfo, WhatsNewInfo } from '../shared/types';

// Initialize theme as early as possible
useThemeStore();

const configStore = useConfigStore();
const playerStore = usePlayerStore();
const needsSetup = ref(false);
const updateInfo = ref<UpdateInfo | null>(null);
const whatsNew = ref<WhatsNewInfo | null>(null);

async function tryRecoverPlayerFromReplays() {
  const cfg = configStore.config;
  if (!cfg?.replaysDir?.trim() || (cfg.username && cfg.accountId)) return;

  try {
    const player = await window.api.detectPlayer();
    if (player?.accountId && player.playerName) {
      await configStore.saveConfig({
        ...cfg,
        username: player.playerName,
        accountId: player.accountId,
        region: player.region || cfg.region,
      });
    }
  } catch (e) {
    console.warn('[startup] Failed to auto-detect player from replays:', e);
  }
}

async function maybeShowWhatsNew() {
  try {
    const info = await window.api.getWhatsNew();
    if (info.show) whatsNew.value = info;
  } catch {
    // Non-critical — never block startup on release notes
  }
}

onMounted(async () => {
  await configStore.loadConfig();

  // Setup is only for users who haven't picked a replays folder yet. Returning
  // users keep their folder across updates and should land straight in the app.
  if (!configStore.config?.replaysDir?.trim()) {
    needsSetup.value = true;
    return;
  }

  await tryRecoverPlayerFromReplays();
  await playerStore.fetchPlayerInfo();
  await maybeShowWhatsNew();

  window.api.checkForUpdates().then(info => { updateInfo.value = info; }).catch(() => {});
});

async function onSetupComplete() {
  needsSetup.value = false;
  await configStore.loadConfig();
  // First-time users shouldn't see a changelog on day one — just mark current.
  await window.api.markVersionSeen();
  await playerStore.fetchPlayerInfo();
}

function closeWhatsNew() {
  whatsNew.value = null;
}

async function openUpdate() {
  const url = updateInfo.value?.downloadUrl ?? updateInfo.value?.releaseUrl;
  if (url) await window.api.openExternal(url);
}
</script>

<template>
  <div class="flex flex-col h-screen bg-surface text-fg overflow-hidden">
    <!-- Update banner -->
    <div v-if="updateInfo" class="flex items-center justify-between gap-4 px-4 py-2 bg-gold-bg border-b border-gold/30 text-sm shrink-0">
      <span class="text-gold font-medium">
        Version {{ updateInfo.version }} is available.
        <span class="text-muted font-normal">Run the new installer over the existing one — no uninstall needed.</span>
      </span>
      <div class="flex items-center gap-2">
        <button
          @click="openUpdate"
          class="px-3 py-1 bg-gold text-surface text-xs font-semibold rounded-lg hover:opacity-80 transition-opacity"
        >
          Download {{ updateInfo.downloadUrl ? '(.exe)' : 'release' }}
        </button>
        <button @click="updateInfo = null" class="text-muted hover:text-fg transition-colors px-1">✕</button>
      </div>
    </div>

    <ScanToast />
    <ToastContainer />
    <WhatsNewModal :info="whatsNew" @close="closeWhatsNew" />
    <div class="flex flex-1 overflow-hidden">
      <Setup v-if="needsSetup" @complete="onSetupComplete" />
      <template v-else>
        <Sidebar />
        <main class="flex-1 overflow-y-auto">
          <!-- Cache only the data-heavy list views. TankDetail (per-id data)
               and Settings (fresh form state) remount on each visit. -->
          <router-view v-slot="{ Component }">
            <keep-alive :include="['Dashboard', 'TankList', 'TankCompare', 'Analytics', 'Coach', 'News', 'Patches', 'Tutorials']">
              <component :is="Component" />
            </keep-alive>
          </router-view>
        </main>
      </template>
    </div>
  </div>
</template>
