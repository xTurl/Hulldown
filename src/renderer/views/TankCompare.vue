<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTanksStore } from '../stores/tanks';
import { getWn8Color, getWrColor } from '../../shared/utils/wn8';
import type { Tank } from '../../shared/types';

const tanksStore = useTanksStore();

const typeLabels: Record<string, string> = {
  'heavyTank': 'Heavy', 'mediumTank': 'Medium', 'lightTank': 'Light',
  'AT-SPG': 'TD', 'SPG': 'Artillery',
};

const searchA = ref('');
const searchB = ref('');
const tankA = ref<Tank | null>(null);
const tankB = ref<Tank | null>(null);
const showDropA = ref(false);
const showDropB = ref(false);

const filteredA = computed(() => {
  if (!searchA.value) return tanksStore.tankList.slice(0, 8);
  const s = searchA.value.toLowerCase();
  return tanksStore.tankList.filter(t => t.name.toLowerCase().includes(s)).slice(0, 8);
});

const filteredB = computed(() => {
  if (!searchB.value) return tanksStore.tankList.slice(0, 8);
  const s = searchB.value.toLowerCase();
  return tanksStore.tankList.filter(t => t.name.toLowerCase().includes(s)).slice(0, 8);
});

function selectA(t: Tank) {
  tankA.value = t;
  searchA.value = t.name;
  showDropA.value = false;
}

function selectB(t: Tank) {
  tankB.value = t;
  searchB.value = t.name;
  showDropB.value = false;
}

function clearA() { tankA.value = null; searchA.value = ''; }
function clearB() { tankB.value = null; searchB.value = ''; }

type StatRow = {
  label: string;
  a: string | number;
  b: string | number;
  aRaw: number;
  bRaw: number;
  higherIsBetter: boolean;
};

const statRows = computed((): StatRow[] => {
  if (!tankA.value || !tankB.value) return [];
  const a = tankA.value;
  const b = tankB.value;
  return [
    { label: 'Battles',          a: a.battles.toLocaleString('en-US'),          b: b.battles.toLocaleString('en-US'),          aRaw: a.battles,              bRaw: b.battles,              higherIsBetter: true },
    { label: 'Win Rate',         a: a.winRate.toFixed(1) + '%',                  b: b.winRate.toFixed(1) + '%',                  aRaw: a.winRate,              bRaw: b.winRate,              higherIsBetter: true },
    { label: 'WN8',              a: a.wn8,                                       b: b.wn8,                                       aRaw: a.wn8,                  bRaw: b.wn8,                  higherIsBetter: true },
    { label: 'WNX',              a: a.wnx,                                       b: b.wnx,                                       aRaw: a.wnx,                  bRaw: b.wnx,                  higherIsBetter: true },
    { label: 'Avg Damage',       a: a.avgDamage.toLocaleString('en-US'),         b: b.avgDamage.toLocaleString('en-US'),         aRaw: a.avgDamage,            bRaw: b.avgDamage,            higherIsBetter: true },
    { label: 'Avg Spotting',     a: a.avgDamageAssisted.toLocaleString('en-US'), b: b.avgDamageAssisted.toLocaleString('en-US'), aRaw: a.avgDamageAssisted,    bRaw: b.avgDamageAssisted,    higherIsBetter: true },
    { label: 'Avg Tracking',     a: a.avgDamageAssistedTrack.toLocaleString('en-US'), b: b.avgDamageAssistedTrack.toLocaleString('en-US'), aRaw: a.avgDamageAssistedTrack, bRaw: b.avgDamageAssistedTrack, higherIsBetter: true },
    { label: 'Avg Blocked',      a: a.avgDamageBlocked.toLocaleString('en-US'),  b: b.avgDamageBlocked.toLocaleString('en-US'),  aRaw: a.avgDamageBlocked,     bRaw: b.avgDamageBlocked,     higherIsBetter: true },
    { label: 'Avg Frags',        a: a.avgFrags.toFixed(2),                       b: b.avgFrags.toFixed(2),                       aRaw: a.avgFrags,             bRaw: b.avgFrags,             higherIsBetter: true },
    { label: 'Avg Spots',        a: a.avgSpots.toFixed(2),                       b: b.avgSpots.toFixed(2),                       aRaw: a.avgSpots,             bRaw: b.avgSpots,             higherIsBetter: true },
    { label: 'Survival Rate',    a: a.survivalRate.toFixed(1) + '%',             b: b.survivalRate.toFixed(1) + '%',             aRaw: a.survivalRate,         bRaw: b.survivalRate,         higherIsBetter: true },
    { label: 'Avg XP',           a: a.avgXp.toLocaleString('en-US'),             b: b.avgXp.toLocaleString('en-US'),             aRaw: a.avgXp,                bRaw: b.avgXp,                higherIsBetter: true },
  ];
});

function cellClass(row: StatRow, side: 'a' | 'b'): string {
  const myVal = side === 'a' ? row.aRaw : row.bRaw;
  const otherVal = side === 'a' ? row.bRaw : row.aRaw;
  const diff = Math.abs(myVal - otherVal);
  const threshold = Math.max(Math.abs(myVal), Math.abs(otherVal)) * 0.01; // 1% tolerance
  if (diff <= threshold) return 'text-gray-100';
  const winning = row.higherIsBetter ? myVal > otherVal : myVal < otherVal;
  return winning ? 'text-green-400 font-semibold' : 'text-red-400';
}

const scoreA = computed(() => statRows.value.filter(r => {
  const diff = Math.abs(r.aRaw - r.bRaw);
  const threshold = Math.max(Math.abs(r.aRaw), Math.abs(r.bRaw)) * 0.01;
  return diff > threshold && (r.higherIsBetter ? r.aRaw > r.bRaw : r.aRaw < r.bRaw);
}).length);

const scoreB = computed(() => statRows.value.filter(r => {
  const diff = Math.abs(r.aRaw - r.bRaw);
  const threshold = Math.max(Math.abs(r.aRaw), Math.abs(r.bRaw)) * 0.01;
  return diff > threshold && (r.higherIsBetter ? r.bRaw > r.aRaw : r.bRaw < r.aRaw);
}).length);

onMounted(async () => {
  if (tanksStore.tankList.length === 0) await tanksStore.fetchTankList();
});
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto w-full">
    <h2 class="text-2xl font-bold text-gray-100 mb-6">Compare Tanks</h2>

    <!-- Selectors -->
    <div class="grid grid-cols-2 gap-4 mb-6">
      <!-- Tank A -->
      <div>
        <label class="block text-xs text-gray-400 mb-1.5">Tank A</label>
        <div class="relative">
          <div class="flex gap-2">
            <input
              v-model="searchA"
              @focus="showDropA = true"
              @blur="setTimeout(() => showDropA = false, 150)"
              placeholder="Search tank..."
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button v-if="tankA" @click="clearA" class="px-2 text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
          </div>
          <div v-if="showDropA && filteredA.length" class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            <div
              v-for="t in filteredA"
              :key="t.tankId"
              @mousedown="selectA(t)"
              class="px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer flex items-center justify-between"
            >
              <span>{{ t.name }}</span>
              <span class="text-xs text-gray-500">T{{ t.tier }} {{ typeLabels[t.type] || t.type }}</span>
            </div>
          </div>
        </div>
        <div v-if="tankA" class="mt-2 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-400">
          Tier {{ tankA.tier }} • {{ typeLabels[tankA.type] || tankA.type }} • {{ tankA.nation }}
          <span v-if="tankA.isPremium" class="ml-2 text-yellow-500">Premium</span>
        </div>
      </div>

      <!-- Tank B -->
      <div>
        <label class="block text-xs text-gray-400 mb-1.5">Tank B</label>
        <div class="relative">
          <div class="flex gap-2">
            <input
              v-model="searchB"
              @focus="showDropB = true"
              @blur="setTimeout(() => showDropB = false, 150)"
              placeholder="Search tank..."
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button v-if="tankB" @click="clearB" class="px-2 text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
          </div>
          <div v-if="showDropB && filteredB.length" class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            <div
              v-for="t in filteredB"
              :key="t.tankId"
              @mousedown="selectB(t)"
              class="px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer flex items-center justify-between"
            >
              <span>{{ t.name }}</span>
              <span class="text-xs text-gray-500">T{{ t.tier }} {{ typeLabels[t.type] || t.type }}</span>
            </div>
          </div>
        </div>
        <div v-if="tankB" class="mt-2 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-400">
          Tier {{ tankB.tier }} • {{ typeLabels[tankB.type] || tankB.type }} • {{ tankB.nation }}
          <span v-if="tankB.isPremium" class="ml-2 text-yellow-500">Premium</span>
        </div>
      </div>
    </div>

    <!-- Placeholder -->
    <div v-if="!tankA || !tankB" class="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
      <p class="text-gray-400">Select two tanks to compare their stats side by side.</p>
    </div>

    <!-- Comparison table -->
    <template v-else>
      <!-- Score header -->
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div class="bg-gray-900 border rounded-xl p-4 text-center" :class="scoreA > scoreB ? 'border-green-700' : 'border-gray-800'">
          <p class="text-xs text-gray-500 mb-1">{{ tankA.name }}</p>
          <p class="text-2xl font-bold" :style="{ color: getWn8Color(tankA.wn8) }">{{ scoreA }}</p>
          <p class="text-xs text-gray-500 mt-0.5">stats won</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center flex items-center justify-center">
          <span class="text-2xl text-gray-600">vs</span>
        </div>
        <div class="bg-gray-900 border rounded-xl p-4 text-center" :class="scoreB > scoreA ? 'border-green-700' : 'border-gray-800'">
          <p class="text-xs text-gray-500 mb-1">{{ tankB.name }}</p>
          <p class="text-2xl font-bold" :style="{ color: getWn8Color(tankB.wn8) }">{{ scoreB }}</p>
          <p class="text-xs text-gray-500 mt-0.5">stats won</p>
        </div>
      </div>

      <!-- Stats table -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-xs text-gray-500 uppercase border-b border-gray-800">
              <th class="px-5 py-3 text-left">Stat</th>
              <th class="px-5 py-3 text-right">{{ tankA.name }}</th>
              <th class="px-5 py-3 text-right">{{ tankB.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in statRows"
              :key="row.label"
              :class="['border-t border-gray-800', i % 2 === 0 ? '' : 'bg-gray-800/20']"
            >
              <td class="px-5 py-3 text-sm text-gray-400">{{ row.label }}</td>
              <td class="px-5 py-3 text-sm text-right" :class="cellClass(row, 'a')">{{ row.a }}</td>
              <td class="px-5 py-3 text-sm text-right" :class="cellClass(row, 'b')">{{ row.b }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-gray-600 mt-2 text-right">Green = better in that stat. Differences below 1% shown as neutral.</p>
    </template>
  </div>
</template>
