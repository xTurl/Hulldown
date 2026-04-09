<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ProgressSnapshot } from '../../shared/types';
import type { TodaySession } from '../../main/services/cache';
import { calculateWn8, calculateWnx, getWn8Color, getWrColor } from '../../shared/utils/wn8';
import { useConfigStore } from '../stores/config';

const props = defineProps<{
  snapshots: ProgressSnapshot[];
  currentWnx: number;
  syncing: boolean;
}>();

const configStore = useConfigStore();
const replaySession = ref<TodaySession | null>(null);
const loading = ref(false);

async function fetchSession() {
  loading.value = true;
  try {
    replaySession.value = await window.api.getTodaySession();
  } finally {
    loading.value = false;
  }
}

watch(() => props.syncing, (syncing) => { if (!syncing) fetchSession(); });
watch(() => configStore.config?.username, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) { replaySession.value = null; fetchSession(); }
});

fetchSession();

// --- Replay session display data ---
const replayDisplay = computed(() => {
  const s = replaySession.value;
  if (!s) return null;
  const wn8 = calculateWn8({
    battles: s.battles, wins: s.totalWins,
    damage_dealt: s.totalDamage, frags: s.totalFrags,
    spotted: s.totalSpotted, dropped_capture_points: s.totalDropped,
  });
  const wnx = calculateWnx({
    battles: s.battles, wins: s.totalWins,
    damage_dealt: s.totalDamage, frags: s.totalFrags,
    spotted: s.totalSpotted, dropped_capture_points: s.totalDropped,
    avg_damage_assisted_radio: s.avgAssist,
  });
  return { ...s, wn8, wnx };
});

// --- Snapshot fallback (when no replays configured) ---
interface SnapshotSession {
  battles: number; wins: number; winRate: number;
  wn8: number; dpg: number; frags: number;
  survival: number; xp: number; wnxDelta: number;
}

const snapshotSession = computed((): SnapshotSession | null => {
  const snaps = props.snapshots;
  if (snaps.length < 2) return null;
  const latest = snaps[snaps.length - 1];
  if (!latest.rawDamage && !latest.rawWins) return null;

  const cutoff = latest.takenAt - 24 * 60 * 60 * 1000;
  let baseline = snaps[0];
  for (let i = snaps.length - 2; i >= 0; i--) {
    if (snaps[i].takenAt <= cutoff) { baseline = snaps[i]; break; }
    baseline = snaps[i];
  }
  if (baseline.id === latest.id) return null;

  const battles = latest.battles - baseline.battles;
  if (battles <= 0) return null;
  const wins     = latest.rawWins    - baseline.rawWins;
  const damage   = latest.rawDamage  - baseline.rawDamage;
  const frags    = latest.rawFrags   - baseline.rawFrags;
  const survived = latest.rawSurvived- baseline.rawSurvived;
  const xp       = latest.rawXp      - baseline.rawXp;
  const spotted  = latest.rawSpotted - baseline.rawSpotted;
  const dropped  = latest.rawDroppedCp - baseline.rawDroppedCp;

  return {
    battles, wins,
    winRate:  Math.round((wins / battles) * 1000) / 10,
    wn8:      calculateWn8({ battles, wins, damage_dealt: damage, frags, spotted, dropped_capture_points: dropped }),
    dpg:      Math.round(damage / battles),
    frags:    Math.round((frags / battles) * 100) / 100,
    survival: Math.round((survived / battles) * 1000) / 10,
    xp,
    wnxDelta: latest.wnx > 0 && baseline.wnx > 0 ? latest.wnx - baseline.wnx : 0,
  };
});

function deltaColor(val: number) {
  if (val > 0) return '#34d399';
  if (val < 0) return '#f87171';
  return '#6b7280';
}
function deltaSign(val: number) { return val > 0 ? '+' : ''; }
</script>

<template>
  <div
    class="bg-card border border-line rounded-xl mb-6"
    style="box-shadow: 0 4px 20px rgba(0,0,0,0.25)"
  >
    <div class="px-5 py-4 border-b border-line flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold text-fg">Today's session</h3>
        <span v-if="replayDisplay" class="text-xs text-faint bg-sub px-2 py-0.5 rounded-full">from replays</span>
        <span v-else-if="snapshotSession" class="text-xs text-faint bg-sub px-2 py-0.5 rounded-full">local</span>
      </div>
      <button @click="fetchSession" :disabled="loading"
        class="text-faint hover:text-muted disabled:opacity-40 transition-colors text-sm"
        title="Refresh session"
      >
        <span :class="loading ? 'animate-spin inline-block' : ''">↻</span>
      </button>
    </div>

    <div v-if="loading && !replayDisplay && !snapshotSession" class="px-5 py-8 text-center">
      <p class="text-sm text-muted animate-pulse">Loading session...</p>
    </div>

    <!-- Replay-based session -->
    <div v-else-if="replayDisplay" class="p-5">
      <div class="flex flex-wrap gap-3 mb-3">
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">Battles</p>
          <p class="text-2xl font-bold text-fg leading-none">{{ replayDisplay.battles }}</p>
          <p class="text-xs text-faint mt-1.5">{{ replayDisplay.wins }}W / {{ replayDisplay.losses }}L</p>
        </div>
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">WN8</p>
          <p class="text-2xl font-bold leading-none" :style="{ color: getWn8Color(replayDisplay.wn8) }">{{ replayDisplay.wn8 || '—' }}</p>
          <p class="text-xs text-faint mt-1.5">today</p>
        </div>
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">WNX</p>
          <p class="text-2xl font-bold leading-none" :style="{ color: getWn8Color(replayDisplay.wnx) }">{{ replayDisplay.wnx || '—' }}</p>
          <p class="text-xs text-faint mt-1.5">with assist</p>
        </div>
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">Win rate</p>
          <p class="text-2xl font-bold leading-none" :style="{ color: getWrColor(replayDisplay.winRate) }">{{ replayDisplay.winRate.toFixed(1) }}%</p>
          <p class="text-xs text-faint mt-1.5">{{ replayDisplay.wins }} wins</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <div class="border border-line rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">Avg damage</p>
          <p class="text-2xl font-bold text-fg leading-none">{{ replayDisplay.avgDamage > 0 ? replayDisplay.avgDamage.toLocaleString('en-US') : '—' }}</p>
          <p class="text-xs text-faint mt-1.5">per battle</p>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[110px] flex-1">
          <p class="text-xs text-muted">Survival</p>
          <p class="text-lg font-bold text-fg mt-0.5">{{ replayDisplay.survivalRate.toFixed(0) }}%</p>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[110px] flex-1">
          <p class="text-xs text-muted">Frags / battle</p>
          <p class="text-lg font-bold text-fg mt-0.5">{{ replayDisplay.avgFrags.toFixed(2) }}</p>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[110px] flex-1">
          <p class="text-xs text-muted">Tanks played</p>
          <p class="text-lg font-bold text-fg mt-0.5">{{ replayDisplay.tankCount }}</p>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[130px] flex-1">
          <p class="text-xs text-muted">Net credits</p>
          <p class="text-lg font-bold mt-0.5" :style="{ color: replayDisplay.totalNetCredits >= 0 ? '#34d399' : '#f87171' }">
            {{ replayDisplay.totalNetCredits >= 0 ? '+' : '' }}{{ replayDisplay.totalNetCredits.toLocaleString('en-US') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Snapshot fallback -->
    <div v-else-if="snapshotSession" class="p-5">
      <div class="flex flex-wrap gap-3 mb-3">
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">Battles</p>
          <p class="text-2xl font-bold text-fg leading-none">{{ snapshotSession.battles }}</p>
          <p class="text-xs text-faint mt-1.5">{{ snapshotSession.wins }}W / {{ snapshotSession.battles - snapshotSession.wins }}L</p>
        </div>
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">WN8</p>
          <p class="text-2xl font-bold leading-none" :style="{ color: getWn8Color(snapshotSession.wn8) }">{{ snapshotSession.wn8 || '—' }}</p>
        </div>
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">Win rate</p>
          <p class="text-2xl font-bold leading-none" :style="{ color: getWrColor(snapshotSession.winRate) }">{{ snapshotSession.winRate.toFixed(1) }}%</p>
        </div>
        <div class="bg-sub rounded-lg p-3 min-w-[120px] flex-1">
          <p class="text-xs text-muted mb-1">Avg damage</p>
          <p class="text-2xl font-bold text-fg leading-none">{{ snapshotSession.dpg > 0 ? snapshotSession.dpg.toLocaleString('en-US') : '—' }}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[130px] flex-1 flex items-center justify-between">
          <div>
            <p class="text-xs text-muted">WNX change</p>
            <p class="text-lg font-bold mt-0.5" :style="{ color: deltaColor(snapshotSession.wnxDelta) }">
              <span v-if="snapshotSession.wnxDelta !== 0">{{ deltaSign(snapshotSession.wnxDelta) }}{{ snapshotSession.wnxDelta }}</span>
              <span v-else class="text-faint">—</span>
            </p>
          </div>
          <span v-if="snapshotSession.wnxDelta !== 0" class="text-lg" :style="{ color: deltaColor(snapshotSession.wnxDelta) }">
            {{ snapshotSession.wnxDelta > 0 ? '↑' : '↓' }}
          </span>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[110px] flex-1">
          <p class="text-xs text-muted">Survival</p>
          <p class="text-lg font-bold text-fg mt-0.5">{{ snapshotSession.survival.toFixed(0) }}%</p>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[110px] flex-1">
          <p class="text-xs text-muted">Frags / battle</p>
          <p class="text-lg font-bold text-fg mt-0.5">{{ snapshotSession.frags.toFixed(2) }}</p>
        </div>
        <div class="border border-line rounded-lg px-3 py-2.5 min-w-[110px] flex-1">
          <p class="text-xs text-muted">XP earned</p>
          <p class="text-lg font-bold text-fg mt-0.5">{{ snapshotSession.xp.toLocaleString('en-US') }}</p>
        </div>
      </div>
    </div>

    <!-- No data -->
    <div v-else class="px-5 py-6 text-center">
      <p class="text-sm text-muted">No battles today</p>
      <p class="text-xs text-faint mt-1">Set up your replays directory in Settings to enable session tracking.</p>
    </div>
  </div>
</template>
