<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { NewsItem } from '../../shared/types';
import { useAsyncData } from '../composables/useAsyncData';
import { formatPubDate as formatDate } from '../utils/format';

const { data: items, loading, error, lastFetched, load } = useAsyncData<NewsItem[]>(
  () => window.api.getNews(),
  [],
);
const filter = ref<'all' | 'events' | 'high'>('all');

const highValueCount = computed(() => items.value.filter(i => i.valueLevel === 'high').length);
const eventCount = computed(() => items.value.filter(i => i.isEvent).length);

const displayed = computed(() => {
  if (filter.value === 'high') return items.value.filter(i => i.valueLevel === 'high');
  if (filter.value === 'events') return items.value.filter(i => i.isEvent);
  return items.value;
});

function openLink(url: string) {
  window.api.openExternal(url);
}

onMounted(load);
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto w-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-fg">News & Events</h2>
        <p class="text-sm text-muted mt-0.5">
          Latest from the WoT portal
          <span v-if="lastFetched" class="text-faint"> · {{ new Date(lastFetched).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }}</span>
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
        All news
      </button>
      <button
        @click="filter = 'high'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5', filter === 'high' ? 'bg-yellow-600 text-white' : 'text-muted hover:text-fg']"
      >
        🎁 High value
        <span v-if="highValueCount" class="text-xs px-1.5 py-0.5 rounded-full"
          :class="filter === 'high' ? 'bg-yellow-500' : 'bg-sub text-muted'">
          {{ highValueCount }}
        </span>
      </button>
      <button
        @click="filter = 'events'"
        :class="['px-4 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5', filter === 'events' ? 'bg-gold-bg text-gold' : 'text-muted hover:text-fg']"
      >
        Events
        <span v-if="eventCount" class="text-xs px-1.5 py-0.5 rounded-full"
          :class="filter === 'events' ? 'bg-gold text-surface' : 'bg-sub text-muted'">
          {{ eventCount }}
        </span>
      </button>
    </div>

    <!-- High value legend -->
    <div v-if="filter === 'high' || (filter === 'all' && highValueCount > 0)" class="mb-4 px-4 py-2.5 bg-yellow-900/20 border border-yellow-800/40 rounded-lg text-xs text-yellow-600 flex items-center gap-2">
      <span>🎁</span>
      <span>High value events — free rewards, premium tanks, crew books, bonds, blueprints or marathon prizes.</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 6" :key="i" class="bg-card border border-line rounded-xl p-5 animate-pulse">
        <div class="h-4 bg-sub rounded w-3/4 mb-3"></div>
        <div class="h-3 bg-sub rounded w-1/4 mb-3"></div>
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
      <p class="text-muted">No articles found for this filter.</p>
      <p class="text-xs text-faint mt-1">Try refreshing or switch to "All news".</p>
    </div>

    <!-- News list -->
    <div v-else class="space-y-3">
      <div
        v-for="item in displayed"
        :key="item.link"
        class="border rounded-xl p-5 transition-colors hover:border-opacity-80"
        :class="{
          'bg-yellow-900/10 border-yellow-700/50 hover:border-yellow-600/60': item.valueLevel === 'high',
          'bg-card border-gold/20 hover:border-gold/40': item.valueLevel === 'standard',
          'bg-card border-line hover:border-muted': !item.isEvent,
        }"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span v-if="item.valueLevel === 'high'" class="text-xs px-2 py-0.5 bg-yellow-800/60 text-yellow-300 rounded-full flex-shrink-0">
                🎁 High value
              </span>
              <span v-else-if="item.valueLevel === 'standard'" class="text-xs px-2 py-0.5 bg-gold-bg text-gold rounded-full flex-shrink-0">
                Event
              </span>
              <span class="text-xs text-faint flex-shrink-0">{{ formatDate(item.pubDate) }}</span>
            </div>
            <h3 class="text-sm font-semibold leading-snug mb-2"
              :class="item.valueLevel === 'high' ? 'text-yellow-100' : 'text-fg'">
              {{ item.title }}
            </h3>
            <p v-if="item.description" class="text-xs text-muted leading-relaxed line-clamp-2">{{ item.description }}</p>
          </div>
          <button
            @click="openLink(item.link)"
            class="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap"
            :class="item.valueLevel === 'high'
              ? 'bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-300 border-yellow-800/50'
              : 'bg-sub hover:bg-card text-muted border-line'"
          >
            Read more →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
