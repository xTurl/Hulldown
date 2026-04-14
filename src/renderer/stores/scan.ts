import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useScanStore = defineStore('scan', () => {
  const scanning = ref(false);
  // Set to true when battles are cleared+rescanned from Settings so that
  // RecentBattles reloads its list the next time it becomes active.
  const dirty = ref(false);

  function start()      { scanning.value = true; }
  function stop()       { scanning.value = false; }
  function markDirty()  { dirty.value = true; }
  function clearDirty() { dirty.value = false; }

  return { scanning, dirty, start, stop, markDirty, clearDirty };
});
