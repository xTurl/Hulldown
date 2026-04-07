<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useTanksStore } from '../stores/tanks';
import StatCard from '../components/StatCard.vue';
import SessionCard from '../components/SessionCard.vue';
import RecentBattles from '../components/RecentBattles.vue';
import { getWn8Color, getWrColor } from '../../shared/utils/wn8';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import type { ProgressSnapshot } from '../../shared/types';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent]);

const playerStore = usePlayerStore();
const tanksStore = useTanksStore();
const router = useRouter();
const syncing = ref(false);
const progress = ref<ProgressSnapshot[]>([]);

const winRate = computed(() => {
  if (!playerStore.playerInfo) return '0%';
  const s = playerStore.playerInfo.statistics;
  return s.battles > 0 ? ((s.wins / s.battles) * 100).toFixed(1) + '%' : '0%';
});

const top5Tanks = computed(() => tanksStore.tankList.slice(0, 5));

function weightedAvgFromTanks(getValue: (t: typeof tanksStore.tankList[number]) => number): number {
  if (tanksStore.tankList.length === 0) return 0;
  let totalBattles = 0;
  let weighted = 0;
  for (const t of tanksStore.tankList) {
    const v = getValue(t);
    if (!isFinite(v)) continue; // skip any NaN/Infinity from bad data
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

const chartOption = computed(() => {
  if (progress.value.length < 2) return null;

  const dates = progress.value.map(p =>
    new Date(p.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  return {
    backgroundColor: 'transparent',
    grid: { left: 52, right: 52, top: 16, bottom: 36 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f3f4f6', fontSize: 12 },
      formatter: (params: { axisValue: string; value: number }[]) =>
        `${params[0].axisValue}<br/>WN8: <b>${params[0].value}</b><br/>WNX: <b>${params[1].value || '—'}</b><br/>WR%: <b>${params[2].value}%</b>`,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: '#6b7280', fontSize: 11 },
      axisLine: { lineStyle: { color: '#374151' } },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: { color: '#6b7280', fontSize: 11 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1f2937' } },
      },
      {
        type: 'value',
        axisLabel: { color: '#6b7280', fontSize: 11, formatter: '{value}%' },
        axisLine: { show: false },
        splitLine: { show: false },
        min: (v: { min: number }) => Math.max(40, Math.floor(v.min - 1)),
        max: (v: { max: number }) => Math.min(70, Math.ceil(v.max + 1)),
      },
    ],
    series: [
      {
        name: 'WN8',
        type: 'line',
        data: progress.value.map(p => p.wn8),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#818cf8', width: 2 },
        itemStyle: { color: '#818cf8' },
        areaStyle: { color: 'rgba(129,140,248,0.08)' },
        yAxisIndex: 0,
      },
      {
        name: 'WNX',
        type: 'line',
        data: progress.value.map(p => p.wnx > 0 ? p.wnx : null),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#fb923c', width: 2 },
        itemStyle: { color: '#fb923c' },
        areaStyle: { color: 'rgba(251,146,60,0.08)' },
        yAxisIndex: 0,
      },
      {
        name: 'WR%',
        type: 'line',
        data: progress.value.map(p => p.winRate),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#34d399', width: 2 },
        itemStyle: { color: '#34d399' },
        areaStyle: { color: 'rgba(52,211,153,0.08)' },
        yAxisIndex: 1,
      },
    ],
  };
});

async function sync() {
  syncing.value = true;
  await tanksStore.fetchTankList();
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
  <div class="p-6 max-w-6xl mx-auto w-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-gray-100">Dashboard</h2>
        <p class="text-sm text-gray-400 mt-0.5">Overview of your stats</p>
      </div>
      <button
        @click="sync"
        :disabled="syncing"
        class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm rounded-lg transition-colors"
      >
        <span :class="syncing ? 'animate-spin' : ''">↻</span>
        {{ syncing ? 'Syncing...' : 'Sync' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="playerStore.error || tanksStore.error" class="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
      {{ playerStore.error || tanksStore.error }}
    </div>

    <!-- Stat cards -->
    <div v-if="playerStore.playerInfo" class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <StatCard title="Total battles" :value="playerStore.playerInfo.statistics.battles.toLocaleString('en-US')" subtitle="all tanks" />
      <StatCard title="Win Rate" :value="winRate" :color="getWrColor(parseFloat(winRate))" />
      <StatCard title="WN8" :value="overallWn8" :color="getWn8Color(overallWn8)" />
      <StatCard title="WNX" :value="overallWnx" :color="getWn8Color(overallWnx)" subtitle="with assist" />
      <StatCard title="Tanks in garage" :value="tanksStore.tankList.length" subtitle="with battles" />
    </div>
    <div v-else-if="playerStore.loading" class="grid grid-cols-5 gap-4 mb-6">
      <div v-for="i in 5" :key="i" class="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse">
        <div class="h-3 bg-gray-700 rounded w-1/2 mb-2"></div>
        <div class="h-8 bg-gray-700 rounded w-3/4"></div>
      </div>
    </div>

    <!-- Session card -->
    <SessionCard :snapshots="progress" :current-wnx="overallWnx" :syncing="syncing" />
    <RecentBattles />

    <!-- Progress chart -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl mb-6">
      <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-100">Progress over time</h3>
        <span class="text-xs text-gray-500">{{ progress.length }} sync{{ progress.length !== 1 ? 's' : '' }} recorded</span>
      </div>
      <div v-if="chartOption" class="px-2 py-3">
        <VChart :option="chartOption" :autoresize="true" style="height: 200px" />
      </div>
      <div v-else class="px-5 py-8 text-center">
        <p class="text-sm text-gray-400">No progress data yet</p>
        <p class="text-xs text-gray-600 mt-1">Click "Sync" a few times after playing to see your progress chart.</p>
      </div>
    </div>

    <!-- Top tanks -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl">
      <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-100">Top tanks (by battles)</h3>
        <button @click="router.push('/tanks')" class="text-xs text-indigo-400 hover:text-indigo-300">
          Show all →
        </button>
      </div>
      <div v-if="tanksStore.loading" class="p-5 text-sm text-gray-400">Loading...</div>
      <div v-else-if="top5Tanks.length === 0" class="p-5 text-sm text-gray-400">
        Click "Sync" to fetch tank data.
      </div>
      <table v-else class="w-full">
        <thead>
          <tr class="text-xs text-gray-500 uppercase">
            <th class="px-5 py-3 text-left">Tank</th>
            <th class="px-4 py-3 text-right">Battles</th>
            <th class="px-4 py-3 text-right">WR%</th>
            <th class="px-4 py-3 text-right">WN8</th>
            <th class="px-4 py-3 text-right">WNX</th>
            <th class="px-4 py-3 text-right">Avg DMG</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="tank in top5Tanks"
            :key="tank.tankId"
            @click="router.push(`/tanks/${tank.tankId}`)"
            class="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
          >
            <td class="px-5 py-3">
              <div class="text-sm font-medium text-gray-100">{{ tank.name }}</div>
              <div class="text-xs text-gray-500">Tier {{ tank.tier }} • {{ tank.type }}</div>
            </td>
            <td class="px-4 py-3 text-right text-sm text-gray-300">{{ tank.battles.toLocaleString('en-US') }}</td>
            <td class="px-4 py-3 text-right text-sm font-medium" :style="{ color: getWrColor(tank.winRate) }">{{ tank.winRate.toFixed(1) }}%</td>
            <td class="px-4 py-3 text-right text-sm font-bold" :style="{ color: getWn8Color(tank.wn8) }">{{ tank.wn8 }}</td>
            <td class="px-4 py-3 text-right text-sm font-bold" :style="{ color: getWn8Color(tank.wnx) }">{{ tank.wnx }}</td>
            <td class="px-4 py-3 text-right text-sm text-gray-300">{{ tank.avgDamage.toLocaleString('en-US') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
