import { watch, onActivated, onDeactivated } from 'vue';
import { useScanStore } from '../stores/scan';

/**
 * Reloads a view's battle-derived data when the central battle database
 * version changes (new battles scanned, battles cleared, player switched).
 *
 * Active views reload immediately; kept-alive (deactivated) views defer the
 * reload until they are activated again, so no work happens in the background.
 *
 * Returns `markSeen` for views that update the version themselves (e.g.
 * RecentBattles after its own scan) so they don't reload twice.
 */
export function useBattlesInvalidation(reload: () => void) {
  const scanStore = useScanStore();
  let seenVersion = scanStore.battlesVersion;
  let active = true;

  function checkAndReload() {
    if (seenVersion === scanStore.battlesVersion) return;
    seenVersion = scanStore.battlesVersion;
    reload();
  }

  watch(() => scanStore.battlesVersion, () => {
    if (active) checkAndReload();
  });

  onActivated(() => {
    active = true;
    checkAndReload();
  });

  onDeactivated(() => {
    active = false;
  });

  function markSeen() {
    seenVersion = scanStore.battlesVersion;
  }

  return { markSeen };
}
