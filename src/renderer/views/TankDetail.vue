<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getWn8Color, getWrColor } from '../../shared/utils/wn8';
import { normalizeMapName } from '../../shared/utils/mapNames';
import StatCard from '../components/StatCard.vue';
import type { TankDetails, AppConfig } from '../../shared/types';

import iconLight from '../assets/light.png';
import iconLightPremium from '../assets/light_premium.png';
import iconMedium from '../assets/medium.png';
import iconMediumPremium from '../assets/medium_premium.png';
import iconHeavy from '../assets/heavy.png';
import iconHeavyPremium from '../assets/heavy_premium.png';
import iconTD from '../assets/tank_destroyer.png';
import iconTDPremium from '../assets/tank_destroyer_premium.png';
import iconSPG from '../assets/artyllery.png';

const TANK_TYPE_LABELS: Record<string, string> = {
  lightTank: 'Light Tank',
  mediumTank: 'Medium Tank',
  heavyTank: 'Heavy Tank',
  'AT-SPG': 'Tank Destroyer',
  SPG: 'SPG',
};

const TANK_TYPE_ICONS: Record<string, { normal: string; premium?: string }> = {
  lightTank:  { normal: iconLight,  premium: iconLightPremium },
  mediumTank: { normal: iconMedium, premium: iconMediumPremium },
  heavyTank:  { normal: iconHeavy,  premium: iconHeavyPremium },
  'AT-SPG':   { normal: iconTD,     premium: iconTDPremium },
  SPG:        { normal: iconSPG },
};

const NATION_FLAGS: Record<string, string> = {
  france: '🇫🇷',
  germany: '🇩🇪',
  usa: '🇺🇸',
  ussr: '🇷🇺',
  uk: '🇬🇧',
  japan: '🇯🇵',
  china: '🇨🇳',
  czech: '🇨🇿',
  sweden: '🇸🇪',
  poland: '🇵🇱',
  italy: '🇮🇹',
  netherlands: '🇳🇱',
  pan_america: '🌎',
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const props = defineProps<{ id: string }>();
const router = useRouter();

const tank = ref<TankDetails | null>(null);
const config = ref<AppConfig | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const aiError = ref<string | null>(null);
const activeTab = ref<'stats' | 'maps' | 'ai'>('stats');
const generatingAI = ref(false);
const replayMaps = ref<{ mapName: string; battles: number; winRate: number; avgDamage: number }[]>([]);
const fetchingMaps = ref(false);
const mapsError = ref<string | null>(null);

const tankId = computed(() => Number(props.id));
const hasApiKey = computed(() => !!config.value?.claudeApiKey);

async function loadTank() {
  loading.value = true;
  error.value = null;
  try {
    [tank.value, config.value] = await Promise.all([
      window.api.getTankDetails(tankId.value),
      window.api.getConfig(),
    ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tank data';
  } finally {
    loading.value = false;
  }
}

async function generateAI(force = false) {
  aiError.value = null;
  generatingAI.value = true;
  try {
    tank.value = await window.api.getTankRecommendations(tankId.value, force);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('401') || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('invalid x-api-key')) {
      aiError.value = 'Invalid Claude API key. Please check your key in Settings.';
    } else {
      aiError.value = msg || 'Failed to generate recommendations';
    }
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

const tankTypeLabel = computed(() => tank.value ? (TANK_TYPE_LABELS[tank.value.type] ?? capitalize(tank.value.type)) : '');
const tankTypeImg = computed(() => {
  if (!tank.value) return '';
  const icons = TANK_TYPE_ICONS[tank.value.type];
  if (!icons) return '';
  return (tank.value.isPremium && icons.premium) ? icons.premium : icons.normal;
});
const nationFlag = computed(() => tank.value ? (NATION_FLAGS[tank.value.nation] ?? '') : '');
const nationLabel = computed(() => tank.value ? capitalize(tank.value.nation) : '');

watch(activeTab, (tab) => {
  if (tab === 'maps' && replayMaps.value.length === 0 && !fetchingMaps.value) {
    fetchMaps();
  }
});

onMounted(loadTank);
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto w-full">
    <!-- Back button -->
    <button @click="router.back()" class="flex items-center gap-1 text-sm text-muted hover:text-fg mb-4 transition-colors">
      ← Back
    </button>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="h-8 bg-sub rounded w-64 animate-pulse"></div>
      <div class="grid grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="bg-card border border-line rounded-xl p-4 animate-pulse h-20"></div>
      </div>
    </div>

    <template v-else-if="tank">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span v-if="tank.isPremium" class="text-xs px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded">Premium</span>
            <span class="text-xs text-muted flex items-center gap-1.5">
              Tier {{ tank.tier }}
              <span class="text-faint">·</span>
              <span class="inline-flex items-center gap-1">
                <img v-if="tankTypeImg" :src="tankTypeImg" class="w-5 h-5 object-contain" alt="" />{{ tankTypeLabel }}
              </span>
              <span class="text-faint">·</span>
              {{ nationFlag }} {{ nationLabel }}
            </span>
          </div>
          <h2 class="text-2xl font-bold text-fg">{{ tank.name }}</h2>
          <p class="text-sm text-muted mt-0.5">{{ tank.battles.toLocaleString('en-US') }} battles</p>
        </div>
        <button @click="refresh" class="px-3 py-1.5 text-xs bg-sub hover:bg-card text-muted rounded-lg border border-line">
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
        <div class="bg-card border border-line rounded-xl p-3 text-center">
          <p class="text-xs text-muted mb-1">Avg Spotting (radio)</p>
          <p class="text-lg font-bold text-gold">{{ tank.avgDamageAssisted.toLocaleString('en-US') }}</p>
        </div>
        <div class="bg-card border border-line rounded-xl p-3 text-center">
          <p class="text-xs text-muted mb-1">Avg Tracking</p>
          <p class="text-lg font-bold text-gold">{{ tank.avgDamageAssistedTrack.toLocaleString('en-US') }}</p>
        </div>
        <div class="bg-card border border-line rounded-xl p-3 text-center">
          <p class="text-xs text-muted mb-1">Avg Blocked</p>
          <p class="text-lg font-bold text-muted">{{ tank.avgDamageBlocked.toLocaleString('en-US') }}</p>
        </div>
      </div>
      <div v-else class="mb-6"></div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-sub border border-line rounded-xl p-1 mb-4 w-fit">
        <button
          v-for="tab in (['stats', 'maps', 'ai'] as const)"
          :key="tab"
          @click="activeTab = tab"
          :class="['px-4 py-1.5 text-sm rounded-lg transition-colors', activeTab === tab ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg']"
        >
          {{ tab === 'stats' ? 'Stats' : tab === 'maps' ? 'Maps' : 'AI Tips' }}
        </button>
      </div>

      <!-- Stats tab -->
      <div v-if="activeTab === 'stats'" class="bg-card border border-line rounded-xl overflow-hidden">
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
            ]" :key="i" :class="[i % 2 === 0 ? '' : 'bg-sub/50']">
              <td class="px-5 py-3 text-sm text-muted">{{ row[0] }}</td>
              <td class="px-5 py-3 text-sm font-medium text-fg text-right">{{ row[1] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Maps tab -->
      <div v-else-if="activeTab === 'maps'">
        <div v-if="fetchingMaps" class="bg-card border border-line rounded-xl p-8 text-center">
          <p class="text-muted animate-pulse">Loading map data...</p>
        </div>
        <div v-else-if="sortedMaps.length === 0" class="bg-card border border-line rounded-xl p-8 text-center">
          <p class="text-muted mb-2">No map data yet</p>
          <p class="text-sm text-faint mb-4">Map stats are built from your replay files (min. 2 battles per map).</p>
          <p v-if="mapsError" class="text-sm text-amber-400 mb-3">{{ mapsError }}</p>
          <button @click="fetchMaps"
            class="px-5 py-2.5 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 text-sm rounded-lg transition-opacity"
          >
            ↓ Load from replays
          </button>
        </div>
        <div v-else class="bg-card border border-line rounded-xl overflow-hidden">
          <div class="px-5 py-3 border-b border-line flex items-center justify-between">
            <span class="text-xs text-faint">{{ sortedMaps.length }} maps · from your replays</span>
            <button @click="fetchMaps" :disabled="fetchingMaps"
              class="text-xs text-gold hover:text-gold-dim disabled:text-faint"
            >{{ fetchingMaps ? 'Refreshing...' : '↻ Refresh' }}</button>
          </div>
          <table class="w-full">
            <thead>
              <tr class="text-xs text-faint uppercase border-b border-line">
                <th class="px-5 py-3 text-left">Map</th>
                <th class="px-4 py-3 text-right">Battles</th>
                <th class="px-4 py-3 text-right">WR%</th>
                <th class="px-4 py-3 text-right">Avg DMG</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(map, i) in sortedMaps" :key="map.mapName"
                :class="['border-t border-line', i % 2 === 0 ? '' : 'bg-sub/50']">
                <!-- Safe normalization for replays parsed before Polish map translation was added -->
                <td class="px-5 py-3 text-sm text-fg">{{ normalizeMapName(map.mapName) }}</td>
                <td class="px-4 py-3 text-right text-sm text-muted">{{ map.battles }}</td>
                <td class="px-4 py-3 text-right text-sm font-medium" :style="{ color: getWrColor(map.winRate) }">{{ map.winRate.toFixed(1) }}%</td>
                <td class="px-4 py-3 text-right text-sm text-muted">{{ map.avgDamage.toLocaleString('en-US') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- AI tab -->
      <div v-else-if="activeTab === 'ai'">
        <div v-if="!tank.recommendations">
          <div class="bg-card border border-line rounded-xl p-8 text-center">
            <p class="text-muted mb-2">AI tips haven't been generated yet</p>
            <p class="text-sm text-faint mb-4">Click below to generate personalized tips for this tank (1 Claude API request).</p>
            <div v-if="!hasApiKey" class="mb-4 px-4 py-2.5 bg-sub border border-line rounded-lg text-sm text-muted inline-block">
              Set your Claude API key in <strong class="text-fg">Settings</strong> to use AI tips.
            </div>
            <div v-else-if="aiError" class="mb-4 px-4 py-2.5 bg-red-900/20 border border-red-700/50 rounded-lg text-sm text-red-300 inline-block">
              {{ aiError }}
            </div>
            <div>
              <button
                @click="generateAI"
                :disabled="generatingAI || !hasApiKey"
                class="px-5 py-2.5 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 disabled:opacity-50 text-sm rounded-lg transition-opacity"
              >
                {{ generatingAI ? 'Generating tips...' : '✨ Generate AI tips' }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="space-y-4">
          <!-- Summary -->
          <div class="bg-card border border-line rounded-xl p-5">
            <h3 class="text-sm font-semibold text-muted mb-2">Summary</h3>
            <p class="text-sm text-fg leading-relaxed">{{ tank.recommendations.summary }}</p>
          </div>
          <!-- Strengths / Weaknesses -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-card border border-line rounded-xl p-5">
              <h3 class="text-sm font-semibold text-green-400 mb-3">✓ Strengths</h3>
              <ul class="space-y-1">
                <li v-for="s in tank.recommendations.strengths" :key="s" class="text-sm text-muted flex gap-2">
                  <span class="text-green-500 flex-shrink-0">+</span>{{ s }}
                </li>
              </ul>
            </div>
            <div class="bg-card border border-line rounded-xl p-5">
              <h3 class="text-sm font-semibold text-red-400 mb-3">✗ Weaknesses</h3>
              <ul class="space-y-1">
                <li v-for="w in tank.recommendations.weaknesses" :key="w" class="text-sm text-muted flex gap-2">
                  <span class="text-red-500 flex-shrink-0">−</span>{{ w }}
                </li>
              </ul>
            </div>
          </div>
          <!-- Tips -->
          <div class="bg-card border border-line rounded-xl p-5">
            <h3 class="text-sm font-semibold text-gold mb-3">💡 Tips</h3>
            <ol class="space-y-3">
              <li v-for="(tip, i) in tank.recommendations.tips" :key="i" class="flex gap-3 text-sm text-fg">
                <span class="flex-shrink-0 w-5 h-5 rounded-full bg-gold-bg text-gold text-xs flex items-center justify-center font-bold">{{ i + 1 }}</span>
                {{ tip }}
              </li>
            </ol>
          </div>
          <div v-if="aiError" class="px-4 py-2.5 bg-red-900/20 border border-red-700/50 rounded-lg text-sm text-red-300">
            {{ aiError }}
          </div>
          <div class="flex items-center justify-between">
            <p class="text-xs text-faint">
              Generated: {{ new Date(tank.recommendations.generatedAt).toLocaleString('en-US') }}
            </p>
            <button
              @click="generateAI(true)"
              :disabled="generatingAI"
              class="text-xs text-faint hover:text-gold disabled:opacity-40 transition-colors px-2 py-1 rounded hover:bg-sub"
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
