<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useThemeStore } from '../stores/theme';
import { getWn8Color } from '../../shared/utils/wn8';
import { computed } from 'vue';

const router = useRouter();
const route = useRoute();
const playerStore = usePlayerStore();
const themeStore = useThemeStore();

const navItems = [
  {
    path: '/',
    label: 'Dashboard',
    // Bar chart
    icon: '<rect x="4" y="12" width="3.5" height="9" rx="1"/><rect x="10.25" y="7" width="3.5" height="14" rx="1"/><rect x="16.5" y="3" width="3.5" height="18" rx="1"/>',
  },
  {
    path: '/tanks',
    label: 'Tanks',
    // Shield
    icon: '<path d="M12 2L4 6v5.5c0 4.5 3.4 8.7 8 9.9 4.6-1.2 8-5.4 8-9.9V6L12 2z"/>',
  },
  {
    path: '/compare',
    label: 'Compare',
    // Arrows left-right
    icon: '<path d="M7 17L3 12l4-5M17 7l4 5-4 5"/><line x1="3" y1="12" x2="21" y2="12"/>',
  },
  {
    path: '/analytics',
    label: 'Analytics',
    // Trending line with arrow
    icon: '<polyline points="3,19 8,13 12,16 17,8 21,10"/><polyline points="16,8 21,8 21,13"/>',
  },
  {
    path: '/news',
    label: 'News',
    // Document with lines
    icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="14" y2="13"/><line x1="7" y1="17" x2="11" y2="17"/>',
  },
  {
    path: '/tutorials',
    label: 'Guides',
    // Open book
    icon: '<path d="M12 7C10 5 6 4.5 3 6v13c3-1.5 7-1 9 .8M12 7c2-2 6-2.5 9-1v13c-3-1.5-7-1-9 .8M12 7v13.8"/>',
  },
  {
    path: '/settings',
    label: 'Settings',
    // Gear
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15c.2.6.1 1.3-.3 1.8l-.7.7c-.5.5-1.2.6-1.8.3a4.1 4.1 0 00-3.4 0c-.6.3-1.3.2-1.8-.3l-.7-.7c-.4-.5-.5-1.2-.3-1.8a4.1 4.1 0 000-3.4c-.2-.6-.1-1.3.3-1.8l.7-.7c.5-.4 1.2-.5 1.8-.3a4.1 4.1 0 003.4 0c.6-.2 1.3-.1 1.8.3l.7.7c.4.5.5 1.2.3 1.8a4.1 4.1 0 000 3.4z"/>',
  },
];

const wn8Color = computed(() =>
  playerStore.playerInfo ? getWn8Color(playerStore.playerInfo.wn8 || 0) : 'var(--faint)',
);
const winRate = computed(() => {
  if (!playerStore.playerInfo) return '0';
  const s = playerStore.playerInfo.statistics;
  return s.battles > 0 ? ((s.wins / s.battles) * 100).toFixed(1) : '0';
});

const collapsed = computed(() => themeStore.sidebarCollapsed);
</script>

<template>
  <nav
    :class="[
      'flex-shrink-0 flex flex-col border-r border-line bg-card transition-[width] duration-200 ease-in-out overflow-hidden',
      collapsed ? 'w-16' : 'w-60',
    ]"
    style="box-shadow: 2px 0 20px rgba(0,0,0,0.25)"
  >
    <!-- Logo -->
    <div
      :class="[
        'flex items-center border-b border-line shrink-0',
        collapsed ? 'h-16 justify-center' : 'h-16 px-5',
      ]"
    >
      <template v-if="!collapsed">
        <div class="flex flex-col">
          <span class="text-base font-bold text-gold tracking-wide leading-tight">Hulldown</span>
          <span class="text-[10px] text-faint leading-tight mt-0.5">World of Tanks Tracker</span>
        </div>
      </template>
      <span v-else class="text-lg font-bold text-gold">H</span>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
      <button
        v-for="item in navItems"
        :key="item.path"
        @click="router.push(item.path)"
        :title="collapsed ? item.label : undefined"
        :class="[
          'w-full flex items-center rounded-lg text-sm transition-colors duration-150 relative',
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          route.path === item.path
            ? 'bg-gold-bg text-gold font-medium'
            : 'text-muted hover:text-fg hover:bg-sub',
        ]"
      >
        <!-- Active bar -->
        <span
          v-if="route.path === item.path"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-gold"
        />

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-5 h-5 shrink-0"
          v-html="item.icon"
        />
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </button>
    </div>

    <!-- Player info -->
    <div class="border-t border-line shrink-0">
      <div
        v-if="playerStore.playerInfo"
        :class="['py-3', collapsed ? 'flex justify-center px-0' : 'px-3']"
      >
        <div :class="['flex items-center', collapsed ? '' : 'gap-3']">
          <!-- Avatar -->
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
            :style="{
              backgroundColor: wn8Color + '22',
              color: wn8Color,
              border: `1px solid ${wn8Color}44`,
            }"
          >
            {{ playerStore.playerInfo.username.charAt(0).toUpperCase() }}
          </div>
          <!-- Info -->
          <div v-if="!collapsed" class="min-w-0">
            <p class="text-sm font-medium text-fg truncate leading-tight">
              {{ playerStore.playerInfo.username }}
            </p>
            <div class="flex items-center gap-2 mt-1">
              <span
                class="text-xs font-semibold px-1.5 py-0.5 rounded"
                :style="{ backgroundColor: wn8Color + '22', color: wn8Color }"
              >
                {{ playerStore.playerInfo.wn8 }}
              </span>
              <span class="text-xs text-muted">{{ winRate }}% WR</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="!collapsed" class="px-4 py-3">
        <p class="text-xs text-faint">Loading...</p>
      </div>

      <!-- Collapse toggle -->
      <button
        @click="themeStore.toggleSidebar()"
        :class="[
          'w-full flex items-center py-2.5 text-faint hover:text-muted transition-colors border-t border-line',
          collapsed ? 'justify-center' : 'px-4 gap-2',
        ]"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-4 h-4 shrink-0"
        >
          <path :d="collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'" />
        </svg>
        <span v-if="!collapsed" class="text-xs">Collapse</span>
      </button>
    </div>
  </nav>
</template>
