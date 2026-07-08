import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useScanStore = defineStore('scan', () => {
  const scanning = ref(false);
  // Central invalidation counter: bumped whenever the battle database changes
  // (scan found new battles, battles cleared from Settings, player switched).
  // Views record the version they last rendered and reload when it moves —
  // see useBattlesInvalidation.
  const battlesVersion = ref(1);

  function start() { scanning.value = true; }
  function stop()  { scanning.value = false; }
  function invalidateBattles() { battlesVersion.value++; }

  return { scanning, battlesVersion, start, stop, invalidateBattles };
});
