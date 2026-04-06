<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useConfigStore } from './stores/config';
import { usePlayerStore } from './stores/player';
import Sidebar from './components/Sidebar.vue';
import Setup from './views/Setup.vue';

const configStore = useConfigStore();
const playerStore = usePlayerStore();
const needsSetup = ref(false);

onMounted(async () => {
  await configStore.loadConfig();
  if (!configStore.config?.username || !configStore.config?.accountId) {
    needsSetup.value = true;
    return;
  }
  await playerStore.fetchPlayerInfo();
});

async function onSetupComplete() {
  needsSetup.value = false;
  await configStore.loadConfig();
  await playerStore.fetchPlayerInfo();
}
</script>

<template>
  <div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
    <Setup v-if="needsSetup" @complete="onSetupComplete" />
    <template v-else>
      <Sidebar />
      <main class="flex-1 overflow-y-auto">
        <router-view />
      </main>
    </template>
  </div>
</template>
