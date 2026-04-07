import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ThemeMode = 'auto' | 'dark' | 'light';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>((localStorage.getItem('hd-theme') as ThemeMode) ?? 'auto');
  const sidebarCollapsed = ref(localStorage.getItem('hd-sidebar') === 'true');

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    const root = document.documentElement;
    if (theme.value === 'auto') {
      root.dataset.theme = mediaQuery.matches ? 'dark' : 'light';
    } else {
      root.dataset.theme = theme.value;
    }
  }

  function setTheme(mode: ThemeMode) {
    theme.value = mode;
    localStorage.setItem('hd-theme', mode);
    applyTheme();
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    localStorage.setItem('hd-sidebar', String(sidebarCollapsed.value));
  }

  mediaQuery.addEventListener('change', () => {
    if (theme.value === 'auto') applyTheme();
  });

  // Apply immediately on store init
  applyTheme();

  return { theme, sidebarCollapsed, setTheme, toggleSidebar };
});
