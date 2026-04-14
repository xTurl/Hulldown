<script setup lang="ts">
import { useScanStore } from '../stores/scan';
const scanStore = useScanStore();
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="scanStore.scanning"
      class="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-gold-bg border border-gold/40 rounded-xl shadow-lg"
    >
      <svg class="w-4 h-4 text-gold animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span class="text-xs font-medium text-gold">Reading replays…</span>
    </div>
  </Transition>
</template>
