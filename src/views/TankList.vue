<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useTanksStore } from '../stores/tanks';
import { getWn8Color, getWrColor } from '../utils/wn8';

const playerStore = usePlayerStore();
const tanksStore = useTanksStore();
const router = useRouter();

const viewMode = ref<'all' | 'focus'>('all');
const search = ref('');
const filterTier = ref('');
const filterType = ref('');
const sortBy = ref<'battles' | 'winRate' | 'wn8' | 'wnx' | 'avgDamage'>('battles');

const tiers = [1,2,3,4,5,6,7,8,9,10];
const types = ['heavyTank','mediumTank','lightTank','AT-SPG','SPG'];
const typeLabels: Record<string, string> = {
  'heavyTank': 'Heavy', 'mediumTank': 'Medium', 'lightTank': 'Light',
  'AT-SPG': 'Tank Destroyer', 'SPG': 'Artillery',
};

// Weighted player averages across all tanks
const playerAvgWr = computed(() => {
  const tanks = tanksStore.tankList.filter(t => t.battles > 0);
  if (tanks.length === 0) return 0;
  const totalBattles = tanks.reduce((s, t) => s + t.battles, 0);
  const totalWins = tanks.reduce((s, t) => s + t.wins, 0);
  return totalBattles > 0 ? (totalWins / totalBattles) * 100 : 0;
});

const playerAvgWn8 = computed(() => {
  const tanks = tanksStore.tankList.filter(t => t.battles > 0);
  if (tanks.length === 0) return 0;
  const totalBattles = tanks.reduce((s, t) => s + t.battles, 0);
  const totalWn8 = tanks.reduce((s, t) => s + t.wn8 * t.battles, 0);
  return totalBattles > 0 ? totalWn8 / totalBattles : 0;
});

const focusTanks = computed(() => {
  const avgWr = playerAvgWr.value;
  const avgWn8 = playerAvgWn8.value;
  return tanksStore.tankList
    .filter(t => t.battles >= 50)
    .map(t => ({ ...t, wrDeficit: avgWr - t.winRate, wn8Deficit: avgWn8 - t.wn8 }))
    .filter(t => t.wrDeficit > 3 || t.wn8Deficit > 150)
    .sort((a, b) => (b.wrDeficit * 15 + b.wn8Deficit) - (a.wrDeficit * 15 + a.wn8Deficit));
});

const filteredTanks = computed(() => {
  let tanks = tanksStore.tankList;
  if (search.value) {
    const s = search.value.toLowerCase();
    tanks = tanks.filter(t => t.name.toLowerCase().includes(s));
  }
  if (filterTier.value) tanks = tanks.filter(t => t.tier === Number(filterTier.value));
  if (filterType.value) tanks = tanks.filter(t => t.type === filterType.value);
  return [...tanks].sort((a, b) => b[sortBy.value] - a[sortBy.value]);
});

onMounted(async () => {
  if (tanksStore.tankList.length === 0) await tanksStore.fetchTankList();
});
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto w-full">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-gray-100">Tanks</h2>
        <p class="text-sm text-gray-400 mt-0.5">
          <template v-if="viewMode === 'focus'">
            {{ focusTanks.length }} tanks below your average
          </template>
          <template v-else>
            {{ filteredTanks.length }} tanks
          </template>
        </p>
      </div>
      <button
        @click="tanksStore.fetchTankList()"
        :disabled="tanksStore.loading"
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm rounded-lg"
      >
        ↻ Refresh
      </button>
    </div>

    <!-- Mode toggle -->
    <div class="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-5 w-fit">
      <button
        @click="viewMode = 'all'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors', viewMode === 'all' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200']"
      >
        All tanks
      </button>
      <button
        @click="viewMode = 'focus'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5', viewMode === 'focus' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200']"
      >
        Needs improvement
        <span v-if="focusTanks.length" class="text-xs px-1.5 py-0.5 rounded-full"
          :class="viewMode === 'focus' ? 'bg-indigo-500' : 'bg-gray-700 text-gray-300'">
          {{ focusTanks.length }}
        </span>
      </button>
    </div>

    <!-- All tanks filters -->
    <div v-if="viewMode === 'all'" class="flex flex-wrap gap-3 mb-5">
      <input
        v-model="search"
        placeholder="Search tanks..."
        class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-52"
      />
      <select v-model="filterTier" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
        <option value="">All tiers</option>
        <option v-for="t in tiers" :key="t" :value="t">Tier {{ t }}</option>
      </select>
      <select v-model="filterType" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
        <option value="">All types</option>
        <option v-for="t in types" :key="t" :value="t">{{ typeLabels[t] }}</option>
      </select>
      <select v-model="sortBy" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500">
        <option value="battles">Sort: Battles</option>
        <option value="winRate">Sort: WR%</option>
        <option value="wn8">Sort: WN8</option>
        <option value="wnx">Sort: WNX</option>
        <option value="avgDamage">Sort: Avg DMG</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="tanksStore.loading" class="space-y-2">
      <div v-for="i in 10" :key="i" class="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse">
        <div class="h-4 bg-gray-700 rounded w-1/3"></div>
      </div>
    </div>

    <!-- Focus / Needs improvement -->
    <template v-else-if="viewMode === 'focus'">
      <div v-if="focusTanks.length === 0" class="text-center py-12 text-gray-400">
        <p>No tanks significantly below your average.</p>
        <p class="text-sm text-gray-600 mt-1">Either your stats are consistent or you need more battles (min. 50 per tank).</p>
      </div>
      <div v-else>
        <div class="mb-4 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-500 flex gap-6">
          <span>Your avg WR%: <span class="text-gray-300 font-medium">{{ playerAvgWr.toFixed(1) }}%</span></span>
          <span>Your avg WN8: <span class="text-gray-300 font-medium">{{ Math.round(playerAvgWn8) }}</span></span>
          <span class="text-gray-600">Showing tanks ≥50 battles that are &gt;3% WR or &gt;150 WN8 below your average</span>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="text-xs text-gray-500 uppercase border-b border-gray-800">
                <th class="px-5 py-3 text-left">Tank</th>
                <th class="px-4 py-3 text-right">Battles</th>
                <th class="px-4 py-3 text-right">WR%</th>
                <th class="px-4 py-3 text-right">WN8</th>
                <th class="px-4 py-3 text-right">Deficit</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(tank, i) in focusTanks"
                :key="tank.tankId"
                @click="router.push(`/tanks/${tank.tankId}`)"
                :class="['border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors', i % 2 === 0 ? '' : 'bg-gray-800/20']"
              >
                <td class="px-5 py-3">
                  <div class="flex items-center gap-2">
                    <div v-if="tank.isPremium" class="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0"></div>
                    <div>
                      <div class="text-sm font-medium text-gray-100">{{ tank.name }}</div>
                      <div class="text-xs text-gray-500">Tier {{ tank.tier }} • {{ typeLabels[tank.type] || tank.type }}</div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-right text-sm text-gray-300">{{ tank.battles.toLocaleString('en-US') }}</td>
                <td class="px-4 py-3 text-right text-sm font-medium" :style="{ color: getWrColor(tank.winRate) }">
                  {{ tank.winRate.toFixed(1) }}%
                </td>
                <td class="px-4 py-3 text-right text-sm font-bold" :style="{ color: getWn8Color(tank.wn8) }">
                  {{ tank.wn8 }}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex flex-col items-end gap-0.5">
                    <span v-if="tank.wrDeficit > 3" class="text-xs text-red-400">−{{ tank.wrDeficit.toFixed(1) }}% WR</span>
                    <span v-if="tank.wn8Deficit > 150" class="text-xs text-orange-400">−{{ Math.round(tank.wn8Deficit) }} WN8</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- All tanks -->
    <template v-else>
      <div v-if="filteredTanks.length === 0" class="text-center py-12 text-gray-400">
        No tanks found. Click "Refresh" to fetch data.
      </div>
      <div v-else class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-xs text-gray-500 uppercase border-b border-gray-800">
              <th class="px-5 py-3 text-left">Tank</th>
              <th class="px-4 py-3 text-right">Battles</th>
              <th class="px-4 py-3 text-right">WR%</th>
              <th class="px-4 py-3 text-right">WN8</th>
              <th class="px-4 py-3 text-right">WNX</th>
              <th class="px-4 py-3 text-right">Avg DMG</th>
              <th class="px-4 py-3 text-right">Survival</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="tank in filteredTanks"
              :key="tank.tankId"
              @click="router.push(`/tanks/${tank.tankId}`)"
              class="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
            >
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <div v-if="tank.isPremium" class="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0"></div>
                  <div>
                    <div class="text-sm font-medium text-gray-100">{{ tank.name }}</div>
                    <div class="text-xs text-gray-500">Tier {{ tank.tier }} • {{ typeLabels[tank.type] || tank.type }} • {{ tank.nation }}</div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-right text-sm text-gray-300">{{ tank.battles.toLocaleString('en-US') }}</td>
              <td class="px-4 py-3 text-right text-sm font-medium" :style="{ color: getWrColor(tank.winRate) }">{{ tank.winRate.toFixed(1) }}%</td>
              <td class="px-4 py-3 text-right text-sm font-bold" :style="{ color: getWn8Color(tank.wn8) }">{{ tank.wn8 }}</td>
              <td class="px-4 py-3 text-right text-sm font-bold" :style="{ color: getWn8Color(tank.wnx) }">
                {{ tank.wnx }}
                <span v-if="tank.wnx > tank.wn8 + 20" class="text-xs text-indigo-400 ml-1">▲</span>
              </td>
              <td class="px-4 py-3 text-right text-sm text-gray-300">{{ tank.avgDamage.toLocaleString('en-US') }}</td>
              <td class="px-4 py-3 text-right text-sm text-gray-400">{{ tank.survivalRate.toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
