<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getWn8Color, getWrColor } from '../utils/wn8';
import StatCard from '../components/StatCard.vue';
import type { TankDetails } from '../types';

const props = defineProps<{ id: string }>();
const router = useRouter();

const tank = ref<TankDetails | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const activeTab = ref<'stats' | 'maps' | 'ai'>('stats');
const generatingAI = ref(false);
const replayMaps = ref<{ mapName: string; battles: number; winRate: number; avgDamage: number }[]>([]);
const fetchingMaps = ref(false);
const mapsError = ref<string | null>(null);

const tankId = computed(() => Number(props.id));

async function loadTank() {
  loading.value = true;
  error.value = null;
  try {
    tank.value = await window.api.getTankDetails(tankId.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tank data';
  } finally {
    loading.value = false;
  }
}

async function generateAI(force = false) {
  generatingAI.value = true;
  try {
    tank.value = await window.api.getTankRecommendations(tankId.value, force);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to generate recommendations';
  } finally {
    generatingAI.value = false;
  }
}

async function fetchMaps() {
  if (!tank.value) return;
  fetchingMaps.value = true;
  mapsError.value = null;
  try {
    const maps = await window.api.getTankMapStats(tank.value.name);
    replayMaps.value = maps;
    if (maps.length === 0) mapsError.value = 'No map data in replays for this tank yet (need ≥2 battles per map).';
  } catch (e) {
    mapsError.value = e instanceof Error ? e.message : 'Failed to load map data';
  } finally {
    fetchingMaps.value = false;
  }
}

async function refresh() {
  await window.api.clearCache();
  await loadTank();
}

const sortedMaps = computed(() =>
  [...replayMaps.value].sort((a, b) => b.battles - a.battles)
);

onMounted(loadTank);
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto w-full">
    <!-- Back button -->
    <button @click="router.back()" class="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition-colors">
      ← Back
    </button>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="h-8 bg-gray-800 rounded w-64 animate-pulse"></div>
      <div class="grid grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-20"></div>
      </div>
    </div>

    <template v-else-if="tank">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span v-if="tank.isPremium" class="text-xs px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded">Premium</span>
            <span class="text-xs text-gray-400">Tier {{ tank.tier }} • {{ tank.type }} • {{ tank.nation }}</span>
          </div>
          <h2 class="text-2xl font-bold text-gray-100">{{ tank.name }}</h2>
          <p class="text-sm text-gray-400 mt-0.5">{{ tank.battles.toLocaleString('en-US') }} battles</p>
        </div>
        <button @click="refresh" class="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700">
          ↻ Refresh
        </button>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard title="Win Rate" :value="tank.winRate.toFixed(1) + '%'" :color="getWrColor(tank.winRate)" />
        <StatCard title="WN8" :value="tank.wn8" :color="getWn8Color(tank.wn8)" subtitle="direct dmg only" />
        <StatCard
          title="WNX"
          :value="tank.wnx"
          :color="getWn8Color(tank.wnx)"
          :subtitle="tank.wnx > tank.wn8 ? `+${tank.wnx - tank.wn8} vs WN8` : 'with assisted dmg'"
        />
        <StatCard title="Avg Damage" :value="tank.avgDamage.toLocaleString('en-US')" />
      </div>

      <!-- Assisted damage highlight -->
      <div v-if="tank.avgDamageAssisted > 0 || tank.avgDamageAssistedTrack > 0" class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-gray-900 border border-indigo-900/50 rounded-xl p-3 text-center">
          <p class="text-xs text-gray-400 mb-1">Avg Spotting (radio)</p>
          <p class="text-lg font-bold text-indigo-300">{{ tank.avgDamageAssisted.toLocaleString('en-US') }}</p>
        </div>
        <div class="bg-gray-900 border border-indigo-900/50 rounded-xl p-3 text-center">
          <p class="text-xs text-gray-400 mb-1">Avg Tracking</p>
          <p class="text-lg font-bold text-indigo-300">{{ tank.avgDamageAssistedTrack.toLocaleString('en-US') }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p class="text-xs text-gray-400 mb-1">Avg Blocked</p>
          <p class="text-lg font-bold text-gray-300">{{ tank.avgDamageBlocked.toLocaleString('en-US') }}</p>
        </div>
      </div>
      <div v-else class="mb-6"></div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-4 w-fit">
        <button
          v-for="tab in (['stats', 'maps', 'ai'] as const)"
          :key="tab"
          @click="activeTab = tab"
          :class="['px-4 py-1.5 text-sm rounded-lg transition-colors', activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200']"
        >
          {{ tab === 'stats' ? 'Stats' : tab === 'maps' ? 'Maps' : 'AI Tips' }}
        </button>
      </div>

      <!-- Stats tab -->
      <div v-if="activeTab === 'stats'" class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table class="w-full">
          <tbody>
            <tr v-for="(row, i) in [
              ['Battles', tank.battles.toLocaleString('en-US')],
              ['Wins', tank.wins.toLocaleString('en-US')],
              ['Win Rate', tank.winRate.toFixed(1) + '%'],
              ['WN8 (direct dmg)', tank.wn8],
              ['WNX (with assisted)', tank.wnx],
              ['Avg damage (direct)', tank.avgDamage.toLocaleString('en-US')],
              ['Avg spotting (radio)', tank.avgDamageAssisted.toLocaleString('en-US')],
              ['Avg tracking', tank.avgDamageAssistedTrack.toLocaleString('en-US')],
              ['Avg blocked', tank.avgDamageBlocked.toLocaleString('en-US')],
              ['Avg frags', tank.avgFrags.toFixed(2)],
              ['Avg spots', tank.avgSpots.toFixed(2)],
              ['Survival rate', tank.survivalRate.toFixed(1) + '%'],
              ['Avg XP', tank.avgXp.toLocaleString('en-US')],
            ]" :key="i" :class="[i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/30']">
              <td class="px-5 py-3 text-sm text-gray-400">{{ row[0] }}</td>
              <td class="px-5 py-3 text-sm font-medium text-gray-100 text-right">{{ row[1] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Maps tab -->
      <div v-else-if="activeTab === 'maps'">
        <div v-if="sortedMaps.length === 0 && !fetchingMaps" class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p class="text-gray-400 mb-2">No map data yet</p>
          <p class="text-sm text-gray-500 mb-4">Map stats are built from your replay files (min. 2 battles per map).</p>
          <p v-if="mapsError" class="text-sm text-amber-400 mb-3">{{ mapsError }}</p>
          <button @click="fetchMaps" :disabled="fetchingMaps"
            class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm rounded-lg transition-colors"
          >
            {{ fetchingMaps ? 'Loading...' : '↓ Load from replays' }}
          </button>
        </div>
        <div v-else class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div class="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <span class="text-xs text-gray-500">{{ sortedMaps.length }} maps · from your replays</span>
            <button @click="fetchMaps" :disabled="fetchingMaps"
              class="text-xs text-indigo-400 hover:text-indigo-300 disabled:text-gray-600"
            >{{ fetchingMaps ? 'Refreshing...' : '↻ Refresh' }}</button>
          </div>
          <table class="w-full">
            <thead>
              <tr class="text-xs text-gray-500 uppercase border-b border-gray-800">
                <th class="px-5 py-3 text-left">Map</th>
                <th class="px-4 py-3 text-right">Battles</th>
                <th class="px-4 py-3 text-right">WR%</th>
                <th class="px-4 py-3 text-right">Avg DMG</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(map, i) in sortedMaps" :key="map.mapName"
                :class="['border-t border-gray-800', i % 2 === 0 ? '' : 'bg-gray-800/20']">
                <td class="px-5 py-3 text-sm text-gray-100">{{ map.mapName }}</td>
                <td class="px-4 py-3 text-right text-sm text-gray-300">{{ map.battles }}</td>
                <td class="px-4 py-3 text-right text-sm font-medium" :style="{ color: getWrColor(map.winRate) }">{{ map.winRate.toFixed(1) }}%</td>
                <td class="px-4 py-3 text-right text-sm text-gray-300">{{ map.avgDamage.toLocaleString('en-US') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- AI tab -->
      <div v-else-if="activeTab === 'ai'">
        <div v-if="!tank.recommendations">
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p class="text-gray-300 mb-2">AI tips haven't been generated yet</p>
            <p class="text-sm text-gray-500 mb-4">Click below to generate personalized tips for this tank (1 Claude API request).</p>
            <button
              @click="generateAI"
              :disabled="generatingAI"
              class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm rounded-lg transition-colors"
            >
              {{ generatingAI ? 'Generating tips...' : '✨ Generate AI tips' }}
            </button>
          </div>
        </div>
        <div v-else class="space-y-4">
          <!-- Summary -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-gray-300 mb-2">Summary</h3>
            <p class="text-sm text-gray-100 leading-relaxed">{{ tank.recommendations.summary }}</p>
          </div>
          <!-- Strengths / Weaknesses -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 class="text-sm font-semibold text-green-400 mb-3">✓ Strengths</h3>
              <ul class="space-y-1">
                <li v-for="s in tank.recommendations.strengths" :key="s" class="text-sm text-gray-300 flex gap-2">
                  <span class="text-green-500 flex-shrink-0">+</span>{{ s }}
                </li>
              </ul>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 class="text-sm font-semibold text-red-400 mb-3">✗ Weaknesses</h3>
              <ul class="space-y-1">
                <li v-for="w in tank.recommendations.weaknesses" :key="w" class="text-sm text-gray-300 flex gap-2">
                  <span class="text-red-500 flex-shrink-0">−</span>{{ w }}
                </li>
              </ul>
            </div>
          </div>
          <!-- Tips -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-indigo-400 mb-3">💡 Tips</h3>
            <ol class="space-y-3">
              <li v-for="(tip, i) in tank.recommendations.tips" :key="i" class="flex gap-3 text-sm text-gray-100">
                <span class="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-900 text-indigo-300 text-xs flex items-center justify-center font-bold">{{ i + 1 }}</span>
                {{ tip }}
              </li>
            </ol>
          </div>
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-600">
              Generated: {{ new Date(tank.recommendations.generatedAt).toLocaleString('en-US') }}
            </p>
            <button
              @click="generateAI(true)"
              :disabled="generatingAI"
              class="text-xs text-gray-500 hover:text-indigo-400 disabled:opacity-40 transition-colors px-2 py-1 rounded hover:bg-gray-800"
            >
              {{ generatingAI ? 'Regenerating...' : '↻ Regenerate with replay data' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Error state -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-xl p-6 text-center">
      <p class="text-red-300 mb-2">{{ error }}</p>
      <button @click="loadTank" class="text-sm text-red-400 hover:text-red-300 underline">Try again</button>
    </div>
  </div>
</template>
