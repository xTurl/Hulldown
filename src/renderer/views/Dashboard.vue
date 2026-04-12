<script setup lang="ts">
import { ref, computed, onMounted, useTemplateRef } from 'vue';
import { usePlayerStore } from '../stores/player';
import { useTanksStore } from '../stores/tanks';
import StatCard from '../components/StatCard.vue';
import SessionCard from '../components/SessionCard.vue';
import RecentBattles from '../components/RecentBattles.vue';
import { getWn8Color, getWrColor } from '../../shared/utils/wn8';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import type { ProgressSnapshot } from '../../shared/types';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

const playerStore = usePlayerStore();
const tanksStore = useTanksStore();
const syncing = ref(false);
const progress = ref<ProgressSnapshot[]>([]);
const recentBattlesRef = useTemplateRef<{ scan: () => Promise<void> }>('recentBattles');
const sessionRefreshKey = ref(0);
const selectedMetric = ref<'wn8' | 'wnx' | 'wr'>('wn8');

const winRate = computed(() => {
  if (!playerStore.playerInfo) return '0%';
  const s = playerStore.playerInfo.statistics;
  return s.battles > 0 ? ((s.wins / s.battles) * 100).toFixed(1) + '%' : '0%';
});

function weightedAvgFromTanks(getValue: (t: typeof tanksStore.tankList[number]) => number): number {
  if (tanksStore.tankList.length === 0) return 0;
  let totalBattles = 0;
  let weighted = 0;
  for (const t of tanksStore.tankList) {
    // Only include tanks with XVM expected values — matches tomato.gg behaviour.
    // Tanks without expected values use a rough fallback that distorts the overall.
    if (!t.hasExpectedValues) continue;
    const v = getValue(t);
    if (!isFinite(v)) continue;
    weighted += v * t.battles;
    totalBattles += t.battles;
  }
  return totalBattles > 0 ? Math.round(weighted / totalBattles) : 0;
}

// Computed from per-tank data using real WN8 formula — more accurate than playerInfo.wn8
// which is stored in cache and may reflect the old approximation formula.
const overallWn8 = computed(() =>
  weightedAvgFromTanks(t => t.wn8) || playerStore.playerInfo?.wn8 || 0
);

const overallWnx = computed(() =>
  weightedAvgFromTanks(t => t.wnx)
);

const METRIC_CONFIG = {
  wn8: {
    label: 'WN8',
    color: '#818cf8',
    areaColor: 'rgba(129,140,248,0.08)',
    getValue: (p: ProgressSnapshot): number | null => p.wn8,
    format: (v: number) => String(Math.round(v)),
    isPercent: false,
  },
  wnx: {
    label: 'WNX',
    color: '#fb923c',
    areaColor: 'rgba(251,146,60,0.08)',
    getValue: (p: ProgressSnapshot): number | null => p.wnx > 0 ? p.wnx : null,
    format: (v: number) => String(Math.round(v)),
    isPercent: false,
  },
  wr: {
    label: 'WR%',
    color: '#34d399',
    areaColor: 'rgba(52,211,153,0.08)',
    getValue: (p: ProgressSnapshot): number | null => p.winRate,
    format: (v: number) => v.toFixed(1) + '%',
    isPercent: true,
  },
};

const progressDelta = computed(() => {
  if (progress.value.length < 2) return null;
  const cfg = METRIC_CONFIG[selectedMetric.value];
  const first = cfg.getValue(progress.value[0]);
  const last = cfg.getValue(progress.value[progress.value.length - 1]);
  if (first === null || last === null) return null;
  const delta = last - first;
  const abs = cfg.format(Math.abs(delta));
  return { delta, label: delta >= 0 ? `+${abs}` : `-${abs}` };
});

const chartOption = computed(() => {
  if (progress.value.length < 2) return null;

  const cfg = METRIC_CONFIG[selectedMetric.value];
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const dates = progress.value.map(p =>
    new Date(p.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  return {
    backgroundColor: 'transparent',
    grid: { left: 52, right: 20, top: 16, bottom: 36 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: css('--card') || '#13151a',
      borderColor: css('--line') || 'rgba(255,255,255,0.07)',
      textStyle: { color: css('--fg') || '#f0f0f0', fontSize: 12 },
      formatter: (params: { axisValue: string; value: number }[]) =>
        `${params[0].axisValue}<br/>${cfg.label}: <b>${cfg.format(params[0].value)}</b>`,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: css('--muted') || '#8b9099', fontSize: 11 },
      axisLine: { lineStyle: { color: css('--line') || 'rgba(255,255,255,0.07)' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: css('--muted') || '#8b9099',
        fontSize: 11,
        formatter: cfg.isPercent ? '{value}%' : '{value}',
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: css('--card') || '#13151a' } },
      min: cfg.isPercent ? (v: { min: number }) => Math.max(40, Math.floor(v.min - 1)) : undefined,
      max: cfg.isPercent ? (v: { max: number }) => Math.min(70, Math.ceil(v.max + 1)) : undefined,
    },
    series: [
      {
        name: cfg.label,
        type: 'line',
        data: progress.value.map(p => cfg.getValue(p)),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: cfg.color, width: 2 },
        itemStyle: { color: cfg.color },
        areaStyle: { color: cfg.areaColor },
      },
    ],
  };
});

async function sync() {
  syncing.value = true;
  // Clear both in-memory WG API cache and the SQLite player_info cache so
  // fetchPlayerInfo() always hits the WG API and returns fresh data.
  await Promise.all([window.api.clearMemCache(), window.api.clearPlayerInfoCache()]);
  await Promise.all([
    tanksStore.fetchTankList(),
    recentBattlesRef.value?.scan(),
  ]);
  await playerStore.fetchPlayerInfo();
  progress.value = await window.api.getProgress();
  syncing.value = false;
}

onMounted(async () => {
  progress.value = await window.api.getProgress();
  if (tanksStore.tankList.length === 0) {
    await tanksStore.fetchTankList();
  }
});
</script>

<template>
  <div class="p-6 w-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-fg">Dashboard</h2>
        <p class="text-sm text-muted mt-0.5">Overview of your stats</p>
      </div>
      <button
        @click="sync"
        :disabled="syncing"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        style="background: var(--gold-bg); color: var(--gold); border: 1px solid var(--gold)44"
      >
        <span :class="syncing ? 'animate-spin inline-block' : ''">↻</span>
        {{ syncing ? 'Syncing...' : 'Sync' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="playerStore.error || tanksStore.error"
         class="mb-4 px-4 py-3 rounded-lg text-sm"
         style="color: var(--error-fg); background: var(--error-bg); border: 1px solid var(--error-border)">
      {{ playerStore.error || tanksStore.error }}
    </div>

    <!-- Main grid: [left stats + session] [right recent battles] -->
    <div class="grid gap-6 mb-6 items-start" style="grid-template-columns: minmax(0, 2fr) minmax(0, 3fr)">
      <!-- Left column -->
      <div class="flex flex-col gap-4 min-w-0">
        <!-- 2x2 stat tiles -->
        <div v-if="playerStore.playerInfo" class="grid grid-cols-2 gap-3">
          <StatCard title="Total battles" :value="playerStore.playerInfo.statistics.battles.toLocaleString('en-US')" subtitle="all tanks" />
          <StatCard title="Win Rate" :value="winRate" :color="getWrColor(parseFloat(winRate))" />
          <StatCard title="WN8" :value="overallWn8" :color="getWn8Color(overallWn8)" />
          <StatCard title="WNX" :value="overallWnx" :color="getWn8Color(overallWnx)" subtitle="with assist" />
        </div>
        <div v-else-if="playerStore.loading" class="grid grid-cols-2 gap-3">
          <div v-for="i in 4" :key="i" class="bg-card border border-line rounded-xl p-4 animate-pulse">
            <div class="h-3 bg-sub rounded w-1/2 mb-2"></div>
            <div class="h-8 bg-sub rounded w-3/4"></div>
          </div>
        </div>

        <!-- Session card -->
        <SessionCard :snapshots="progress" :current-wnx="overallWnx" :syncing="syncing" :refresh-key="sessionRefreshKey" />

        <!-- Progress chart -->
        <div class="bg-card border border-line rounded-xl" style="box-shadow: 0 4px 20px rgba(0,0,0,0.25)">
          <div class="px-5 py-4 border-b border-line flex items-center justify-between">
            <h3 class="text-sm font-semibold text-fg">Progress over time</h3>
            <div class="flex gap-1 bg-sub border border-line rounded-lg p-0.5">
              <button
                v-for="m in (['wn8', 'wnx', 'wr'] as const)"
                :key="m"
                @click="selectedMetric = m"
                class="px-2.5 py-0.5 text-xs rounded-md transition-colors"
                :class="selectedMetric === m ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg'"
              >
                {{ METRIC_CONFIG[m].label }}
              </button>
            </div>
          </div>
          <div v-if="chartOption" class="px-2 pt-3 pb-1">
            <VChart :option="chartOption" :autoresize="true" style="height: 200px" />
            <div v-if="progressDelta" class="px-3 pt-1 pb-2 flex items-center gap-1.5">
              <span
                class="text-sm font-medium"
                :style="{ color: progressDelta.delta >= 0 ? '#34d399' : '#f87171' }"
              >{{ progressDelta.label }}</span>
              <span class="text-xs text-faint">since first sync</span>
              <span class="text-xs text-faint ml-auto">{{ progress.length }} sync{{ progress.length !== 1 ? 's' : '' }}</span>
            </div>
          </div>
          <div v-else class="px-5 py-8 text-center">
            <p class="text-sm text-muted">No progress data yet</p>
            <p class="text-xs text-faint mt-1">Click "Sync" a few times after playing to see your progress chart.</p>
          </div>
        </div>
      </div>

      <!-- Right column: Recent Battles -->
      <RecentBattles ref="recentBattles" @scanned="sessionRefreshKey++" />
    </div>
  </div>
</template>
