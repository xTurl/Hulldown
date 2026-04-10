<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { PatchItem } from '../../shared/types';

const items = ref<PatchItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const filter = ref<'all' | 'update' | 'hotfix' | 'micropatch'>('all');
const lastFetched = ref<number | null>(null);

const displayed = computed(() => {
  if (filter.value === 'all') return items.value;
  return items.value.filter(i => i.patchType === filter.value);
});

const counts = computed(() => ({
  update: items.value.filter(i => i.patchType === 'update').length,
  hotfix: items.value.filter(i => i.patchType === 'hotfix').length,
  micropatch: items.value.filter(i => i.patchType === 'micropatch').length,
}));

function formatDate(pubDate: string): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  return isNaN(d.getTime())
    ? pubDate
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function openLink(url: string) {
  window.api.openExternal(url);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    items.value = await window.api.getPatches();
    lastFetched.value = Date.now();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch patches';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto w-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-fg">Updates & Patches</h2>
        <p class="text-sm text-muted mt-0.5">
          WoT game update history
          <span v-if="lastFetched" class="text-faint">
            · {{ new Date(lastFetched).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </p>
      </div>
      <button
        @click="load"
        :disabled="loading"
        class="px-4 py-2 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 disabled:opacity-50 text-sm rounded-lg transition-opacity"
      >
        {{ loading ? 'Fetching...' : '↻ Refresh' }}
      </button>
    </div>

    <!-- Filter toggle -->
    <div class="flex gap-1 bg-sub border border-line rounded-xl p-1 mb-5 w-fit">
      <button
        @click="filter = 'all'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors', filter === 'all' ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg']"
      >
        All
      </button>
      <button
        @click="filter = 'update'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5', filter === 'update' ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg']"
      >
        Updates
        <span v-if="counts.update" class="text-xs px-1.5 py-0.5 rounded-full"
          :class="filter === 'update' ? 'bg-gold text-surface' : 'bg-sub text-muted'">
          {{ counts.update }}
        </span>
      </button>
      <button
        @click="filter = 'hotfix'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5', filter === 'hotfix' ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg']"
      >
        Hotfixes
        <span v-if="counts.hotfix" class="text-xs px-1.5 py-0.5 rounded-full"
          :class="filter === 'hotfix' ? 'bg-gold text-surface' : 'bg-sub text-muted'">
          {{ counts.hotfix }}
        </span>
      </button>
      <button
        @click="filter = 'micropatch'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5', filter === 'micropatch' ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg']"
      >
        Micropatches
        <span v-if="counts.micropatch" class="text-xs px-1.5 py-0.5 rounded-full"
          :class="filter === 'micropatch' ? 'bg-gold text-surface' : 'bg-sub text-muted'">
          {{ counts.micropatch }}
        </span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 5" :key="i" class="bg-card border border-line rounded-xl p-5 animate-pulse">
        <div class="h-3 bg-sub rounded w-1/4 mb-3"></div>
        <div class="h-4 bg-sub rounded w-3/4 mb-3"></div>
        <div class="h-3 bg-sub rounded w-full mb-1"></div>
        <div class="h-3 bg-sub rounded w-2/3"></div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-xl p-6 text-center">
      <p class="text-red-300 mb-2">{{ error }}</p>
      <button @click="load" class="text-sm text-red-400 hover:text-red-300 underline">Try again</button>
    </div>

    <!-- Empty -->
    <div v-else-if="displayed.length === 0" class="bg-card border border-line rounded-xl p-8 text-center">
      <p class="text-muted">No patch articles found.</p>
      <p class="text-xs text-faint mt-1">Try refreshing or switching to "All".</p>
    </div>

    <!-- Patch list -->
    <div v-else class="space-y-3">
      <div
        v-for="item in displayed"
        :key="item.link"
        class="bg-card border border-line rounded-xl p-5 hover:border-muted transition-colors"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <!-- Type badge + version + date -->
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="{
                  'bg-gold-bg text-gold': item.patchType === 'update',
                  'bg-red-900/30 text-red-400': item.patchType === 'hotfix',
                  'bg-sub text-muted': item.patchType === 'micropatch',
                }"
              >
                {{ item.patchType === 'update' ? 'Update' : item.patchType === 'hotfix' ? 'Hotfix' : 'Micropatch' }}
              </span>
              <span v-if="item.version" class="text-xs font-mono text-gold">
                v{{ item.version }}
              </span>
              <span class="text-xs text-faint">{{ formatDate(item.pubDate) }}</span>
            </div>

            <!-- Title -->
            <h3 class="text-sm font-semibold text-fg leading-snug mb-2">{{ item.title }}</h3>

            <!-- Description -->
            <p v-if="item.description" class="text-xs text-muted leading-relaxed line-clamp-2">
              {{ item.description }}
            </p>
          </div>

          <button
            @click="openLink(item.link)"
            class="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg border bg-sub hover:bg-card-hover text-muted border-line transition-colors whitespace-nowrap"
          >
            Read more →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
