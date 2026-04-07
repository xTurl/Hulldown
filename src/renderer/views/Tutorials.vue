<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlayerStore } from '../stores/player';
import { useTanksStore } from '../stores/tanks';
import { tutorials } from '../data/tutorials';
import TutorialCard from '../components/TutorialCard.vue';

const playerStore = usePlayerStore();
const tanksStore = useTanksStore();
const expanded = ref<string | null>(null);

function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id;
}

const weakStats = computed(() => {
  const info = playerStore.playerInfo;
  const tanks = tanksStore.tankList;
  if (!info) return {} as Record<string, boolean>;

  const s = info.statistics;
  const battles = s.battles;
  const survivalRate  = battles > 0 ? (s.survived_battles / battles) * 100 : 50;
  const winRate       = battles > 0 ? (s.wins / battles) * 100 : 50;
  const wn8           = info.wn8 ?? 0;

  const totalBattles  = tanks.reduce((sum, t) => sum + t.battles, 0);
  const avgSpots      = totalBattles > 0
    ? tanks.reduce((sum, t) => sum + t.avgSpots * t.battles, 0) / totalBattles
    : 1;
  const overallWnx    = totalBattles > 0
    ? tanks.reduce((sum, t) => sum + t.wnx * t.battles, 0) / totalBattles
    : 0;

  return {
    lowSurvival:  survivalRate < 35,
    lowWinRate:   winRate < 50,
    lowDamage:    wn8 < 900,
    lowSpots:     avgSpots < 0.5,
    lowWnxVsWn8:  overallWnx > 0 && wn8 > 0 && (overallWnx / wn8) < 0.85,
  };
});

const recommended = computed(() =>
  tutorials.filter(t =>
    Object.entries(t.triggers).some(
      ([key, val]) => val && weakStats.value[key]
    )
  )
);

const remaining = computed(() =>
  tutorials.filter(t => !recommended.value.includes(t))
);

const difficultyColor: Record<string, string> = {
  beginner:     'text-green-400 bg-green-900/30 border-green-800',
  intermediate: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
  advanced:     'text-red-400 bg-red-900/30 border-red-800',
};
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto w-full">
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-fg">Guides & Mechanics</h2>
      <p class="text-sm text-muted mt-0.5">Core game mechanics explained — click any card to expand</p>
    </div>

    <!-- Recommended -->
    <div v-if="recommended.length > 0" class="mb-8">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-xs font-semibold uppercase tracking-wider text-gold">Recommended for you</span>
        <div class="flex-1 h-px bg-gold-bg"></div>
      </div>
      <p class="text-xs text-faint mb-4">
        Based on your stats — these mechanics may address your weak points.
      </p>
      <div class="space-y-2">
        <TutorialCard
          v-for="t in recommended"
          :key="t.id"
          :tutorial="t"
          :is-expanded="expanded === t.id"
          :difficulty-color="difficultyColor[t.difficulty]"
          :highlighted="true"
          @toggle="toggle(t.id)"
        />
      </div>
    </div>

    <!-- No stats yet -->
    <div v-else-if="!playerStore.playerInfo" class="mb-6 px-4 py-3 bg-card border border-line rounded-xl text-sm text-muted">
      Sync your stats on the Dashboard to get personalised recommendations.
    </div>

    <!-- All guides -->
    <div>
      <div class="flex items-center gap-3 mb-3">
        <span class="text-xs font-semibold uppercase tracking-wider text-faint">
          {{ recommended.length > 0 ? 'All guides' : 'Guides' }}
        </span>
        <div class="flex-1 h-px bg-line"></div>
      </div>
      <div class="space-y-2">
        <TutorialCard
          v-for="t in (recommended.length > 0 ? remaining : tutorials)"
          :key="t.id"
          :tutorial="t"
          :is-expanded="expanded === t.id"
          :difficulty-color="difficultyColor[t.difficulty]"
          :highlighted="false"
          @toggle="toggle(t.id)"
        />
      </div>
    </div>
  </div>
</template>
