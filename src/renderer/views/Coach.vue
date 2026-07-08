<script setup lang="ts">
import { ref, computed, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import type { FreeAIFeatureUsage, WeeklyCoachReport } from '../../shared/types';
import { getWrColor } from '../../shared/utils/wn8';
import FreeAIUsageBadge from '../components/FreeAIUsageBadge.vue';

const router = useRouter();

const report = ref<WeeklyCoachReport | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

// AI works out of the box via Hulldown's free built-in AI; this only fires
// when the free tier's fair-use limit is hit or the build has no proxy
// configured at all — either way, adding an own Claude key is the fix.
const aiUpsell = computed(() => error.value?.includes('Claude API key in Settings') ?? false);

// null while using an own Claude key (unlimited — nothing to show) or before the first fetch resolves.
const reportUsage = ref<FreeAIFeatureUsage | null>(null);

async function refreshUsage() {
  try {
    const usage = await window.api.getAIUsage();
    reportUsage.value = usage?.features['weekly-coach'] ?? null;
  } catch {
    reportUsage.value = null;
  }
}

function goToSettings() {
  router.push('/settings');
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPeriod(startMs: number, endMs: number): string {
  const start = new Date(startMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(endMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start} – ${end}`;
}

function deltaTone(delta: string): 'up' | 'down' | 'neutral' {
  const t = delta.trim();
  if (t.startsWith('+')) return 'up';
  if (t.startsWith('-') || t.startsWith('−')) return 'down';
  return 'neutral';
}

const hasReport = computed(() => report.value !== null);

async function generate(force = false) {
  loading.value = true;
  error.value = null;
  try {
    report.value = await window.api.getWeeklyReport(force);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
    void refreshUsage();
  }
}

let initialized = false;
onActivated(async () => {
  void refreshUsage();
  if (initialized) return;
  initialized = true;
  loading.value = true;
  error.value = null;
  try {
    report.value = await window.api.getWeeklyReport(false);
  } catch (e) {
    report.value = null;
    const msg = e instanceof Error ? e.message : String(e);
    // Only surface real failures — "No battles this week" on first open is expected.
    if (!msg.includes('No battles this week')) error.value = msg;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="p-6 w-full max-w-5xl mx-auto space-y-5">

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h2 class="text-2xl font-bold text-fg">Coach</h2>
        <p class="text-sm text-muted mt-0.5">Your weekly action plan</p>
      </div>
      <div class="flex items-center gap-3 shrink-0 flex-wrap justify-end">
        <FreeAIUsageBadge
          v-if="reportUsage"
          :remaining="reportUsage.remaining"
          :limit="reportUsage.limit"
          label="reports"
          :global-available="reportUsage.globalAvailable"
        />
        <div v-if="hasReport && !loading" class="flex items-center gap-3">
          <span class="text-xs text-faint">
            {{ formatPeriod(report!.periodStartMs, report!.periodEndMs) }}
            <span class="mx-1">·</span>
            Generated {{ formatDate(report!.generatedAt) }}
          </span>
          <button
          @click="generate(true)"
          class="text-xs text-gold hover:text-gold-dim disabled:text-faint transition-colors px-2 py-1 rounded hover:bg-sub"
        >
          Re-generate
        </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="bg-card border border-line rounded-xl p-6 animate-pulse">
        <div class="h-4 bg-sub rounded w-3/4" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-card border border-line rounded-xl p-5 animate-pulse space-y-3">
          <div class="h-3 bg-sub rounded w-1/3" />
          <div class="h-3 bg-sub rounded w-4/5" />
          <div class="h-3 bg-sub rounded w-3/5" />
        </div>
        <div class="bg-card border border-line rounded-xl p-5 animate-pulse space-y-3">
          <div class="h-3 bg-sub rounded w-1/3" />
          <div class="h-3 bg-sub rounded w-4/5" />
          <div class="h-3 bg-sub rounded w-3/5" />
        </div>
      </div>
      <p class="text-center text-sm text-muted">Analyzing your week...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-card border border-line rounded-xl p-6 text-center space-y-3">
      <template v-if="error.includes('No battles this week')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
          class="w-12 h-12 mx-auto text-faint">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <p class="text-fg font-medium">No battles this week yet</p>
        <p class="text-sm text-muted">Play some tanks first, then come back for your report.</p>
      </template>
      <template v-else-if="aiUpsell">
        <p class="text-fg font-medium">Free AI is unavailable right now</p>
        <p class="text-sm text-muted">{{ error }}</p>
        <button
          @click="goToSettings"
          class="mt-2 px-4 py-2 text-sm bg-gold-bg text-gold border border-gold/30 hover:opacity-80 transition-opacity rounded-lg"
        >
          Go to Settings
        </button>
      </template>
      <template v-else>
        <p class="text-fg font-medium">Something went wrong</p>
        <p class="text-sm text-muted">{{ error }}</p>
        <button
          @click="generate(false)"
          class="mt-2 px-4 py-2 text-sm bg-gold-bg text-gold border border-gold/30 hover:opacity-80 transition-opacity rounded-lg"
        >
          Retry
        </button>
      </template>
    </div>

    <!-- Generate CTA -->
    <div v-else-if="!hasReport" class="bg-card border border-line rounded-xl p-8 text-center space-y-4 max-w-lg mx-auto">
      <FreeAIUsageBadge
        v-if="reportUsage"
        :remaining="reportUsage.remaining"
        :limit="reportUsage.limit"
        label="reports"
        :global-available="reportUsage.globalAvailable"
        variant="prominent"
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        class="w-14 h-14 mx-auto text-gold">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <div>
        <p class="text-lg font-semibold text-fg">Get your weekly action plan</p>
        <p class="text-sm text-muted mt-1">Tanks to focus on, tanks to rest, maps to target. Takes ~10 seconds.</p>
      </div>
      <button
        @click="generate(false)"
        class="px-6 py-2.5 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 transition-opacity rounded-lg font-medium"
      >
        Generate report
      </button>
    </div>

    <!-- Report -->
    <template v-else-if="hasReport && !loading">

      <!-- Headline summary -->
      <div class="bg-card border border-line rounded-xl px-5 py-4">
        <p class="text-base text-fg leading-relaxed">{{ report!.summary }}</p>
      </div>

      <!-- One thing to fix (hero CTA) -->
      <div class="rounded-xl px-5 py-4 border border-gold/30 bg-gold-bg">
        <div class="flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
            class="w-5 h-5 mt-0.5 shrink-0 text-gold">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <div>
            <p class="text-[11px] font-semibold text-gold uppercase tracking-wider mb-1">Do this first</p>
            <p class="text-sm text-fg leading-relaxed">{{ report!.oneThingToFix }}</p>
          </div>
        </div>
      </div>

      <!-- Tanks: focus + rest -->
      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))">

        <!-- Focus tanks -->
        <div v-if="(report!.focusTanks?.length ?? 0) > 0" class="bg-card border border-line rounded-xl p-5">
          <div class="flex items-center gap-2 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-emerald-400">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
            </svg>
            <h3 class="text-sm font-semibold text-fg">Keep grinding</h3>
          </div>
          <ul class="space-y-3">
            <li v-for="(tank, i) in report!.focusTanks" :key="i"
              class="bg-sub rounded-lg p-3 flex items-start gap-3">
              <div class="shrink-0 text-xs font-bold px-2 py-1 rounded"
                :class="deltaTone(tank.delta) === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-sub text-muted'">
                {{ tank.delta }}
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-fg truncate">{{ tank.tankName }}</p>
                <p class="text-xs text-muted mt-0.5 leading-relaxed">{{ tank.reason }}</p>
              </div>
            </li>
          </ul>
        </div>

        <!-- Rest tanks -->
        <div v-if="(report!.restTanks?.length ?? 0) > 0" class="bg-card border border-line rounded-xl p-5">
          <div class="flex items-center gap-2 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-amber-400">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <h3 class="text-sm font-semibold text-fg">Rest this week</h3>
          </div>
          <ul class="space-y-3">
            <li v-for="(tank, i) in report!.restTanks" :key="i"
              class="bg-sub rounded-lg p-3 flex items-start gap-3">
              <div class="shrink-0 text-xs font-bold px-2 py-1 rounded bg-amber-500/10 text-amber-400">
                {{ tank.delta }}
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-fg truncate">{{ tank.tankName }}</p>
                <p class="text-xs text-muted mt-0.5 leading-relaxed">{{ tank.reason }}</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Map playbook -->
      <div v-if="(report!.mapPlaybook?.length ?? 0) > 0" class="bg-card border border-line rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 text-gold">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <h3 class="text-sm font-semibold text-fg">Map playbook</h3>
        </div>
        <ul class="space-y-2.5">
          <li v-for="(m, i) in report!.mapPlaybook" :key="i"
            class="border border-line rounded-lg px-3 py-2.5 flex items-start gap-3">
            <div class="shrink-0 min-w-[48px] text-center">
              <div class="text-base font-bold tabular-nums" :style="{ color: getWrColor(m.winRate) }">
                {{ Math.round(m.winRate) }}%
              </div>
              <div class="text-[10px] text-faint uppercase tracking-wider">WR</div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-fg">{{ m.mapName }}</p>
              <p class="text-xs text-muted mt-0.5 leading-relaxed">{{ m.tip }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Maps to avoid -->
      <div v-if="(report!.mapsToAvoid?.length ?? 0) > 0" class="bg-card border border-line rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 text-red-400">
            <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <h3 class="text-sm font-semibold text-fg">Reroll these</h3>
        </div>
        <ul class="space-y-2.5">
          <li v-for="(m, i) in report!.mapsToAvoid" :key="i"
            class="border border-line rounded-lg px-3 py-2.5 flex items-start gap-3">
            <div class="shrink-0 min-w-[48px] text-center">
              <div class="text-base font-bold tabular-nums" :style="{ color: getWrColor(m.winRate) }">
                {{ Math.round(m.winRate) }}%
              </div>
              <div class="text-[10px] text-faint uppercase tracking-wider">WR</div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-fg">{{ m.mapName }}</p>
              <p class="text-xs text-muted mt-0.5 leading-relaxed">{{ m.reason }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Common mistakes -->
      <div v-if="(report!.commonMistakes?.length ?? 0) > 0" class="bg-card border border-line rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 text-amber-400">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h3 class="text-sm font-semibold text-fg">Patterns to break</h3>
        </div>
        <ul class="space-y-3">
          <li v-for="(m, i) in report!.commonMistakes" :key="i"
            class="border border-line rounded-lg overflow-hidden">
            <div class="px-3 py-2.5 bg-sub border-b border-line">
              <p class="text-sm font-semibold text-fg">{{ m.pattern }}</p>
              <p class="text-xs text-muted mt-0.5 font-mono">{{ m.evidence }}</p>
            </div>
            <div class="px-3 py-2.5 flex items-start gap-2.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                class="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p class="text-xs text-fg leading-relaxed">{{ m.fix }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- Highlight battle -->
      <div v-if="report!.highlightBattle" class="bg-card border border-line rounded-xl p-5">
        <div class="flex items-center gap-2 mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 text-gold">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <h3 class="text-sm font-semibold text-fg">Battle of the week</h3>
        </div>
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div class="min-w-0">
            <p class="text-base font-semibold text-fg">{{ report!.highlightBattle.tankName }}</p>
            <p class="text-sm text-muted">{{ report!.highlightBattle.mapName }}</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-center">
              <div class="text-lg font-bold text-fg tabular-nums">{{ report!.highlightBattle.damage.toLocaleString() }}</div>
              <div class="text-[10px] text-faint uppercase tracking-wider">Damage</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-bold text-fg tabular-nums">{{ report!.highlightBattle.frags }}</div>
              <div class="text-[10px] text-faint uppercase tracking-wider">Frags</div>
            </div>
            <div
              class="px-2.5 py-1 text-xs font-bold uppercase rounded"
              :class="{
                'bg-emerald-500/10 text-emerald-400': report!.highlightBattle.result === 'win',
                'bg-red-500/10 text-red-400': report!.highlightBattle.result === 'loss',
                'bg-sub text-muted': report!.highlightBattle.result === 'draw',
              }"
            >
              {{ report!.highlightBattle.result }}
            </div>
          </div>
        </div>
      </div>

      <!-- Footer link to analytics -->
      <div class="text-center">
        <button
          @click="router.push('/analytics')"
          class="text-xs text-faint hover:text-gold transition-colors px-2 py-1 rounded hover:bg-sub"
        >
          See full analytics →
        </button>
      </div>

    </template>

  </div>
</template>
