<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useConfigStore } from './stores/config';
import { usePlayerStore } from './stores/player';
import { useThemeStore } from './stores/theme';
import Sidebar from './components/Sidebar.vue';
import Setup from './views/Setup.vue';
import type { UpdateInfo } from '../../shared/types';

// Initialize theme as early as possible
useThemeStore();

const configStore = useConfigStore();
const playerStore = usePlayerStore();
const needsSetup = ref(false);
const updateInfo = ref<UpdateInfo | null>(null);

onMounted(async () => {
  await configStore.loadConfig();
  if (!configStore.config?.username || !configStore.config?.accountId) {
    needsSetup.value = true;
    return;
  }
  await playerStore.fetchPlayerInfo();
  // Check for updates in background — don't block app startup
  window.api.checkForUpdates().then(info => { updateInfo.value = info; }).catch(() => {});
});

async function onSetupComplete() {
  needsSetup.value = false;
  await configStore.loadConfig();
  await playerStore.fetchPlayerInfo();
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

    <div class="flex flex-1 overflow-hidden">
      <Setup v-if="needsSetup" @complete="onSetupComplete" />
      <template v-else>
        <Sidebar />
        <main class="flex-1 overflow-y-auto">
          <router-view v-slot="{ Component }">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </router-view>
        </main>
      </template>
    </div>
  </div>
</template>
