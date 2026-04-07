<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useConfigStore } from '../stores/config';
import { getWn8Color, getWn8Label } from '../../shared/utils/wn8';
import { computed } from 'vue';

const router = useRouter();
const route = useRoute();
const playerStore = usePlayerStore();
const configStore = useConfigStore();

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/tanks', label: 'Tanks', icon: '🛡️' },
  { path: '/compare', label: 'Compare', icon: '⚖️' },
  { path: '/analytics', label: 'Analytics', icon: '📈' },
  { path: '/news', label: 'News', icon: '📰' },
  { path: '/tutorials', label: 'Guides', icon: '📖' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

const wn8Color = computed(() => playerStore.playerInfo ? getWn8Color(playerStore.playerInfo.wn8 || 0) : '#666');
const wn8Label = computed(() => playerStore.playerInfo ? getWn8Label(playerStore.playerInfo.wn8 || 0) : '');
const winRate = computed(() => {
  if (!playerStore.playerInfo) return '0';
  const s = playerStore.playerInfo.statistics;
  return s.battles > 0 ? ((s.wins / s.battles) * 100).toFixed(1) : '0';
});
</script>

<template>
  <nav class="w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
    <!-- Logo -->
    <div class="px-6 py-5 border-b border-gray-800">
      <h1 class="text-lg font-bold text-indigo-400">Hulldown</h1>
      <p class="text-xs text-gray-500 mt-0.5">World of Tanks Tracker</p>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-3 py-4 space-y-1">
      <button
        v-for="item in navItems"
        :key="item.path"
        @click="router.push(item.path)"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
          route.path === item.path
            ? 'bg-indigo-600 text-white font-medium'
            : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800',
        ]"
      >
        <span class="text-base">{{ item.icon }}</span>
        {{ item.label }}
      </button>
    </div>

    <!-- Player info -->
    <div v-if="playerStore.playerInfo" class="px-4 py-4 border-t border-gray-800">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-bold text-sm">
          {{ playerStore.playerInfo.username.charAt(0).toUpperCase() }}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-gray-100 truncate">{{ playerStore.playerInfo.username }}</p>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs font-bold px-1.5 py-0.5 rounded" :style="{ backgroundColor: wn8Color + '33', color: wn8Color }">
              WN8 {{ playerStore.playerInfo.wn8 }}
            </span>
            <span class="text-xs text-gray-400">{{ winRate }}% WR</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="px-4 py-4 border-t border-gray-800">
      <div class="text-xs text-gray-500">Loading profile...</div>
    </div>
  </nav>
</template>
