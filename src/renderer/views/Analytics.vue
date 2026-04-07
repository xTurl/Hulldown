<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { ReplayMapStat, ReplayTankStat, EconomyDay, SessionSummary } from '../../main/services/cache';
import { getWn8Color } from '../../shared/utils/wn8';

type Tab = 'economy' | 'maps' | 'tanks' | 'sessions';
const activeTab = ref<Tab>('economy');

// ── Economy ───────────────────────────────────────────────────────────────────
const economyDays = ref(30);
const economyData = ref<EconomyDay[]>([]);
const economyLoading = ref(false);

const economySummary = computed(() => {
  if (!economyData.value.length) return null;
  const total = economyData.value.reduce((a, d) => ({
    battles: a.battles + d.battles,
    netCredits: a.netCredits + d.netCredits,
    totalRepairs: a.totalRepairs + d.totalRepairs,
    grossCredits: a.grossCredits + d.grossCredits,
  }), { battles: 0, netCredits: 0, totalRepairs: 0, grossCredits: 0 });
  return {
    ...total,
    avgPerBattle: total.battles ? Math.round(total.netCredits / total.battles) : 0,
    bestDay: [...economyData.value].sort((a, b) => b.netCredits - a.netCredits)[0],
  };
});

const maxDayCredits = computed(() =>
  Math.max(...economyData.value.map(d => Math.abs(d.netCredits)), 1)
);

async function loadEconomy() {
  economyLoading.value = true;
  economyData.value = await window.api.getEconomy(economyDays.value);
  economyLoading.value = false;
}

watch(economyDays, loadEconomy);

// ── Maps ──────────────────────────────────────────────────────────────────────
const mapData = ref<ReplayMapStat[]>([]);
const mapLoading = ref(false);
const mapSort = ref<'battles' | 'winRate' | 'avgDamage'>('battles');

const sortedMaps = computed(() =>
  [...mapData.value].sort((a, b) => b[mapSort.value] - a[mapSort.value])
);

async function loadMaps() {
  mapLoading.value = true;
  mapData.value = await window.api.getMapStats();
  mapLoading.value = false;
}

// ── Tanks ─────────────────────────────────────────────────────────────────────
const tankData = ref<ReplayTankStat[]>([]);
const tankLoading = ref(false);
const tankPeriod = ref<number>(30 * 86400000); // ms
const tankSort = ref<'battles' | 'winRate' | 'avgDamage' | 'netCredits'>('battles');

const PERIODS = [
  { label: '7 days',  ms: 7  * 86400000 },
  { label: '30 days', ms: 30 * 86400000 },
  { label: '60 days', ms: 60 * 86400000 },
  { label: 'All time', ms: 0 },
];

const sortedTanks = computed(() =>
  [...tankData.value].sort((a, b) => b[tankSort.value] - a[tankSort.value])
);

async function loadTanks() {
  tankLoading.value = true;
  tankData.value = await window.api.getTankRecentStats(tankPeriod.value);
  tankLoading.value = false;
}

watch(tankPeriod, loadTanks);

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessionData = ref<SessionSummary[]>([]);
const sessionLoading = ref(false);

async function loadSessions() {
  sessionLoading.value = true;
  sessionData.value = await window.api.getSessions(30);
  sessionLoading.value = false;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
async function switchTab(tab: Tab) {
  activeTab.value = tab;
  if (tab === 'economy' && !economyData.value.length) await loadEconomy();
  if (tab === 'maps'    && !mapData.value.length)     await loadMaps();
  if (tab === 'tanks'   && !tankData.value.length)    await loadTanks();
  if (tab === 'sessions'&& !sessionData.value.length) await loadSessions();
}

onMounted(() => loadEconomy());

// ── Helpers ───────────────────────────────────────────────────────────────────
const MASTERY = ['', '3rd', '2nd', '1st', 'Ace'];
const MASTERY_COLOR = ['', '#9ca3af', '#a78bfa', '#fbbf24', '#f97316'];

function wrColor(wr: number) {
  if (wr < 46) return '#f87171';
  if (wr < 50) return '#d97706';
  if (wr < 54) return '#a3e635';
  if (wr < 60) return '#34d399';
  return '#818cf8';
}

function creditsColor(n: number) { return n >= 0 ? '#34d399' : '#f87171'; }

function formatCredits(n: number) {
  const sign = n >= 0 ? '+' : '';
  return sign + Math.round(n).toLocaleString('en-US');
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function sessionDuration(s: SessionSummary) {
  const ms = s.endedAt - s.startedAt;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
</script>

<template>
  <div class="flex-1 overflow-auto">
    <div class="max-w-5xl mx-auto px-6 py-6">
      <h2 class="text-2xl font-bold text-gray-100 mb-6">Analytics</h2>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1">
        <button
          v-for="{ id, label } in [
            { id: 'economy',  label: 'Economy'  },
            { id: 'maps',     label: 'Maps'     },
            { id: 'tanks',    label: 'Tanks'    },
            { id: 'sessions', label: 'Sessions' },
          ]"
          :key="id"
          @click="switchTab(id as Tab)"
          :class="[
            'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
            activeTab === id
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
          ]"
        >{{ label }}</button>
      </div>

      <!-- ── ECONOMY ── -->
      <div v-if="activeTab === 'economy'">
        <!-- Period selector -->
        <div class="flex items-center gap-2 mb-5">
          <span class="text-xs text-gray-500">Period:</span>
          <button v-for="d in [7, 14, 30, 90]" :key="d"
            @click="economyDays = d"
            :class="['px-3 py-1 text-xs rounded-lg transition-colors', economyDays === d ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200']"
          >{{ d }}d</button>
        </div>

        <div v-if="economyLoading" class="py-16 text-center text-gray-500 animate-pulse">Loading...</div>
        <template v-else-if="economySummary">
          <!-- Summary cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Net credits</p>
              <p class="text-xl font-bold" :style="{ color: creditsColor(economySummary.netCredits) }">
                {{ formatCredits(economySummary.netCredits) }}
              </p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Per battle</p>
              <p class="text-xl font-bold" :style="{ color: creditsColor(economySummary.avgPerBattle) }">
                {{ formatCredits(economySummary.avgPerBattle) }}
              </p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Repairs paid</p>
              <p class="text-xl font-bold text-red-400">-{{ economySummary.totalRepairs.toLocaleString('en-US') }}</p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Best day</p>
              <p class="text-xl font-bold text-green-400">{{ formatCredits(economySummary.bestDay.netCredits) }}</p>
              <p class="text-xs text-gray-600 mt-0.5">{{ economySummary.bestDay.day }}</p>
            </div>
          </div>

          <!-- Per-day bars -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 class="text-sm font-semibold text-gray-300 mb-4">Net credits by day</h3>
            <div class="space-y-2">
              <div v-for="d in [...economyData].reverse()" :key="d.day" class="flex items-center gap-3">
                <span class="text-xs text-gray-500 w-24 flex-shrink-0 text-right">{{ d.day }}</span>
                <div class="flex-1 h-5 bg-gray-800 rounded overflow-hidden relative">
                  <div
                    class="absolute top-0 bottom-0 rounded transition-all"
                    :style="{
                      width: (Math.abs(d.netCredits) / maxDayCredits * 100) + '%',
                      backgroundColor: d.netCredits >= 0 ? '#34d399' : '#f87171',
                      opacity: 0.7,
                    }"
                  />
                </div>
                <span class="text-xs w-28 flex-shrink-0" :style="{ color: creditsColor(d.netCredits) }">
                  {{ formatCredits(d.netCredits) }}
                </span>
                <span class="text-xs text-gray-600 w-16 flex-shrink-0">{{ d.battles }}b {{ d.wins }}w</span>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="py-16 text-center text-gray-500 text-sm">No economy data yet. Scan replays first.</div>
      </div>

      <!-- ── MAPS ── -->
      <div v-if="activeTab === 'maps'">
        <div v-if="mapLoading" class="py-16 text-center text-gray-500 animate-pulse">Loading...</div>
        <div v-else-if="mapData.length" class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <!-- Sort controls -->
          <div class="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
            <span class="text-xs text-gray-500">Sort by:</span>
            <button v-for="{ key, label } in [{ key: 'battles', label: 'Battles' }, { key: 'winRate', label: 'Win rate' }, { key: 'avgDamage', label: 'Avg damage' }]"
              :key="key"
              @click="mapSort = key as typeof mapSort"
              :class="['px-2.5 py-1 text-xs rounded-lg transition-colors', mapSort === key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200']"
            >{{ label }}</button>
          </div>
          <!-- Table header -->
          <div class="grid grid-cols-6 gap-2 px-5 py-2 text-xs text-gray-600 border-b border-gray-800/50">
            <span class="col-span-2">Map</span>
            <span class="text-right">Battles</span>
            <span class="text-right">Win rate</span>
            <span class="text-right">Avg damage</span>
            <span class="text-right">Avg frags</span>
          </div>
          <div class="divide-y divide-gray-800/40">
            <div v-for="m in sortedMaps" :key="m.mapName"
              class="grid grid-cols-6 gap-2 px-5 py-3 items-center hover:bg-gray-800/20 transition-colors"
            >
              <span class="col-span-2 text-sm font-medium text-gray-200">{{ m.mapName }}</span>
              <span class="text-sm text-gray-300 text-right">{{ m.battles }}</span>
              <span class="text-sm font-semibold text-right" :style="{ color: wrColor(m.winRate) }">
                {{ m.winRate.toFixed(1) }}%
              </span>
              <span class="text-sm text-gray-300 text-right">{{ m.avgDamage.toLocaleString('en-US') }}</span>
              <span class="text-sm text-gray-300 text-right">{{ m.avgKills.toFixed(2) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="py-16 text-center text-gray-500 text-sm">No map data yet.</div>
      </div>

      <!-- ── TANKS ── -->
      <div v-if="activeTab === 'tanks'">
        <div class="flex items-center gap-2 mb-5 flex-wrap">
          <span class="text-xs text-gray-500">Period:</span>
          <button v-for="p in PERIODS" :key="p.ms"
            @click="tankPeriod = p.ms"
            :class="['px-3 py-1 text-xs rounded-lg transition-colors', tankPeriod === p.ms ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200']"
          >{{ p.label }}</button>
          <span class="ml-4 text-xs text-gray-500">Sort:</span>
          <button v-for="{ key, label } in [{ key: 'battles', label: 'Battles' }, { key: 'winRate', label: 'WR' }, { key: 'avgDamage', label: 'Damage' }, { key: 'netCredits', label: 'Credits' }]"
            :key="key"
            @click="tankSort = key as typeof tankSort"
            :class="['px-2.5 py-1 text-xs rounded-lg transition-colors', tankSort === key ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200']"
          >{{ label }}</button>
        </div>

        <div v-if="tankLoading" class="py-16 text-center text-gray-500 animate-pulse">Loading...</div>
        <div v-else-if="sortedTanks.length" class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div class="grid grid-cols-8 gap-2 px-5 py-2 text-xs text-gray-600 border-b border-gray-800">
            <span class="col-span-2">Tank</span>
            <span class="text-right">Battles</span>
            <span class="text-right">Win rate</span>
            <span class="text-right">Avg dmg</span>
            <span class="text-right">Avg assist</span>
            <span class="text-right">Net credits</span>
            <span class="text-right">Best</span>
          </div>
          <div class="divide-y divide-gray-800/40">
            <div v-for="t in sortedTanks" :key="t.tankKey"
              class="grid grid-cols-8 gap-2 px-5 py-3 items-center hover:bg-gray-800/20 transition-colors"
            >
              <span class="col-span-2 text-sm font-medium text-gray-200 truncate">{{ t.tankName }}</span>
              <span class="text-sm text-gray-300 text-right">{{ t.battles }}</span>
              <span class="text-sm font-semibold text-right" :style="{ color: wrColor(t.winRate) }">
                {{ t.winRate.toFixed(1) }}%
              </span>
              <span class="text-sm text-gray-300 text-right">{{ t.avgDamage.toLocaleString('en-US') }}</span>
              <span class="text-sm text-gray-400 text-right">{{ t.avgAssist > 0 ? t.avgAssist.toLocaleString('en-US') : '—' }}</span>
              <span class="text-sm font-medium text-right" :style="{ color: creditsColor(t.netCredits) }">
                {{ formatCredits(t.netCredits) }}
              </span>
              <span class="text-xs font-bold text-right" :style="{ color: MASTERY_COLOR[t.bestMastery] }">
                {{ MASTERY[t.bestMastery] || '—' }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="py-16 text-center text-gray-500 text-sm">No tank data for this period.</div>
      </div>

      <!-- ── SESSIONS ── -->
      <div v-if="activeTab === 'sessions'">
        <div v-if="sessionLoading" class="py-16 text-center text-gray-500 animate-pulse">Loading...</div>
        <div v-else-if="sessionData.length" class="space-y-3">
          <div v-for="s in sessionData" :key="s.sessionNum"
            class="bg-gray-900 border border-gray-800 rounded-xl p-5"
          >
            <div class="flex items-start justify-between gap-4 mb-4">
              <div>
                <p class="text-sm font-semibold text-gray-100">{{ formatDate(s.startedAt) }}</p>
                <p class="text-xs text-gray-500 mt-0.5">{{ sessionDuration(s) }} · {{ s.battles }} battles</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-bold" :style="{ color: creditsColor(s.netCredits) }">
                  {{ formatCredits(s.netCredits) }}
                </p>
                <p class="text-xs text-gray-600">net credits</p>
              </div>
            </div>
            <div class="grid grid-cols-4 gap-3">
              <div class="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
                <p class="text-xs text-gray-500">Win rate</p>
                <p class="text-base font-bold mt-0.5" :style="{ color: wrColor(s.winRate) }">
                  {{ s.winRate.toFixed(1) }}%
                </p>
                <p class="text-xs text-gray-600">{{ s.wins }}W / {{ s.battles - s.wins }}L</p>
              </div>
              <div class="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
                <p class="text-xs text-gray-500">Avg damage</p>
                <p class="text-base font-bold text-gray-100 mt-0.5">{{ s.avgDamage.toLocaleString('en-US') }}</p>
              </div>
              <div class="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
                <p class="text-xs text-gray-500">Avg frags</p>
                <p class="text-base font-bold text-gray-100 mt-0.5">{{ s.avgKills.toFixed(2) }}</p>
              </div>
              <div class="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
                <p class="text-xs text-gray-500">Ended</p>
                <p class="text-xs font-medium text-gray-300 mt-1">{{ formatDate(s.endedAt) }}</p>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="py-16 text-center text-gray-500 text-sm">No session data yet.</div>
      </div>

    </div>
  </div>
</template>
