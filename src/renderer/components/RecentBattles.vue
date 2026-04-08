<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { BattleRecord } from '../../shared/types';
import { getWn8Color } from '../../shared/utils/wn8';

// Fallback local calculation used only when main process hasn't enriched the battle
// (e.g. WN8 expected values not yet fetched or this is the first scan)

const PAGE_SIZE = 10;

const battles = ref<BattleRecord[]>([]);
const totalCount = ref(0);
const page = ref(0);
const loading = ref(false);
const scanning = ref(false);
const newCount = ref(0);

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)));

function battleWn8(b: BattleRecord): number | undefined {
  return b.wn8;
}

function battleWnx(b: BattleRecord): number | undefined {
  return b.wnx;
}

async function loadPage(p: number) {
  loading.value = true;
  page.value = p;
  battles.value = await window.api.getBattles(PAGE_SIZE, p * PAGE_SIZE);
  loading.value = false;
}

async function scan() {
  scanning.value = true;
  newCount.value = 0;
  try {
    const result = await window.api.scanReplays();
    newCount.value = result.added;
    if (result.added > 0) {
      totalCount.value = await window.api.getBattlesCount();
      await loadPage(0);
    }
  } finally {
    scanning.value = false;
  }
}

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  loading.value = true;
  [totalCount.value] = await Promise.all([window.api.getBattlesCount()]);
  await loadPage(0);
  await scan();
  autoRefreshTimer = setInterval(() => {
    if (!scanning.value) scan();
  }, 30_000);
});

onUnmounted(() => {
  if (autoRefreshTimer !== null) clearInterval(autoRefreshTimer);
});

defineExpose({ scan });

function rowBg(result: BattleRecord['result']): string {
  if (result === 'win')  return 'bg-green-500/10 hover:bg-green-500/[0.16]';
  if (result === 'loss') return 'bg-red-500/[0.13] hover:bg-red-500/20';
  return 'hover:bg-sub';
}

function accuracy(hits: number, shots: number): string {
  if (!shots) return '—';
  return Math.round((hits / shots) * 100) + '%';
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const MASTERY_LABEL = ['', '3rd', '2nd', '1st', 'Ace'];
const MASTERY_COLOR = ['', '#9ca3af', '#a78bfa', '#fbbf24', '#f97316'];

function masteryLabel(m: number) { return MASTERY_LABEL[m] ?? ''; }
function masteryColor(m: number) { return MASTERY_COLOR[m] ?? ''; }
</script>

<template>
  <div class="bg-card border border-line rounded-xl mb-6">

    <!-- Header -->
    <div class="px-5 py-4 border-b border-line flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h3 class="text-sm font-semibold text-fg">Recent battles</h3>
        <span class="text-xs text-faint">{{ totalCount.toLocaleString('en-US') }} total</span>
        <span v-if="newCount > 0" class="text-xs font-medium text-green-400 bg-green-900/30 border border-green-800/50 px-2 py-0.5 rounded-full">
          +{{ newCount }} new
        </span>
      </div>
      <button
        @click="scan"
        :disabled="scanning"
        class="flex items-center gap-1.5 px-3 py-1.5 text-gold bg-gold-bg text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        title="Scan for new replays"
      >
        <span :class="scanning ? 'animate-spin inline-block' : ''">↻</span>
        <span>{{ scanning ? 'Scanning...' : 'Scan' }}</span>
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="px-5 py-10 text-center">
      <p class="text-sm text-faint animate-pulse">Loading battles...</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="battles.length === 0" class="px-5 py-10 text-center">
      <p class="text-muted text-sm">No battles found</p>
      <p class="text-faint text-xs mt-1">Make sure the replays directory is set in Settings, then click Scan.</p>
    </div>

    <!-- Battle list -->
    <div v-else class="divide-y divide-line">
      <div
        v-for="b in battles"
        :key="b.id"
        :class="['px-5 py-4 transition-colors', rowBg(b.result)]"
      >
        <div class="flex items-start gap-4">

          <!-- Tank + context -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-fg">{{ b.tankName }}</span>
              <span v-if="b.markOfMastery > 0"
                class="text-xs font-bold px-1.5 py-0.5 rounded"
                :style="{ color: masteryColor(b.markOfMastery), backgroundColor: masteryColor(b.markOfMastery) + '22' }"
              >{{ masteryLabel(b.markOfMastery) }}</span>
              <span v-if="b.achievements.length > 0" class="text-xs text-yellow-500/70">
                🏅 {{ b.achievements.length }}
              </span>
            </div>
            <div class="flex items-baseline gap-2 mt-0.5 flex-wrap">
              <span class="text-xs text-muted">{{ b.mapName }}</span>
              <span class="text-xs text-faint">·</span>
              <span class="text-xs text-muted">{{ b.battleType }}</span>
            </div>
            <div class="flex items-center gap-3 mt-1 text-xs text-muted">
              <span>{{ formatTime(b.playedAt) }}</span>
              <span>{{ formatDuration(b.duration) }}</span>
              <span v-if="b.survived" class="text-teal-500">survived</span>
            </div>
          </div>

          <!-- Stats grid -->
          <div class="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">

            <!-- WN8 -->
            <div class="text-center bg-sub rounded-lg px-3 py-2 min-w-[56px]">
              <p class="text-xs text-muted mb-0.5">WN8</p>
              <p class="text-sm font-bold" :style="{ color: getWn8Color(battleWn8(b) ?? 0) }">
                {{ battleWn8(b) !== undefined ? battleWn8(b) : '—' }}
              </p>
            </div>

            <!-- WNX -->
            <div class="text-center bg-sub rounded-lg px-3 py-2 min-w-[56px]">
              <p class="text-xs text-muted mb-0.5">WNX</p>
              <p class="text-sm font-bold" :style="{ color: getWn8Color(battleWnx(b) ?? 0) }">
                {{ battleWnx(b) !== undefined ? battleWnx(b) : '—' }}
              </p>
            </div>

            <!-- Damage -->
            <div class="text-center bg-sub rounded-lg px-3 py-2 min-w-[64px]">
              <p class="text-xs text-muted mb-0.5">Damage</p>
              <p class="text-sm font-bold text-fg">
                {{ b.damage > 0 ? b.damage.toLocaleString('en-US') : '—' }}
              </p>
            </div>

            <!-- Assist -->
            <div v-if="b.assist > 0" class="text-center bg-sub rounded-lg px-3 py-2 min-w-[56px]">
              <p class="text-xs text-muted mb-0.5">Assist</p>
              <p class="text-sm font-bold text-muted">{{ b.assist.toLocaleString('en-US') }}</p>
            </div>

            <!-- Frags -->
            <div class="text-center bg-sub rounded-lg px-3 py-2 min-w-[48px]">
              <p class="text-xs text-muted mb-0.5">Frags</p>
              <p class="text-sm font-bold text-fg">{{ b.kills }}</p>
            </div>

            <!-- Accuracy -->
            <div class="text-center bg-sub rounded-lg px-3 py-2 min-w-[56px]">
              <p class="text-xs text-muted mb-0.5">Acc</p>
              <p class="text-sm font-bold text-fg">{{ accuracy(b.hits, b.shots) }}</p>
            </div>

            <!-- XP -->
            <div class="text-center bg-sub rounded-lg px-3 py-2 min-w-[52px]">
              <p class="text-xs text-muted mb-0.5">XP</p>
              <p class="text-sm font-bold text-muted">{{ b.xp.toLocaleString('en-US') }}</p>
            </div>

            <!-- Net credits -->
            <div v-if="b.credits > 0" class="text-center bg-sub rounded-lg px-3 py-2 min-w-[72px]">
              <p class="text-xs text-muted mb-0.5">Credits</p>
              <p class="text-sm font-bold" :style="{ color: b.netCredits >= 0 ? '#34d399' : '#f87171' }">
                {{ b.netCredits >= 0 ? '+' : '' }}{{ b.netCredits.toLocaleString('en-US') }}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalCount > PAGE_SIZE" class="px-5 py-3 border-t border-line flex items-center justify-between">
      <button
        @click="loadPage(page - 1)"
        :disabled="page === 0 || loading"
        class="px-3 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed bg-sub hover:bg-card-hover rounded-lg transition-colors"
      >
        ← Prev
      </button>

      <span class="text-xs text-faint">
        Page {{ page + 1 }} of {{ totalPages }}
      </span>

      <button
        @click="loadPage(page + 1)"
        :disabled="page >= totalPages - 1 || loading"
        class="px-3 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed bg-sub hover:bg-card-hover rounded-lg transition-colors"
      >
        Next →
      </button>
    </div>

  </div>
</template>
