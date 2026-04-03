<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAppStore } from './stores/app';
import Sidebar from './components/Sidebar.vue';
import Setup from './views/Setup.vue';

const store = useAppStore();
const needsSetup = ref(false);

onMounted(async () => {
  await store.loadConfig();
  if (!store.config?.username || !store.config?.accountId) {
    needsSetup.value = true;
    return;
  }
  await store.fetchPlayerInfo();
});

async function onSetupComplete() {
  needsSetup.value = false;
  await store.loadConfig();
  await store.fetchPlayerInfo();
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
