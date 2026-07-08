<script setup lang="ts">
import { useToastStore } from '../stores/toast';

const toastStore = useToastStore();

const TYPE_CLASSES: Record<string, string> = {
  info:    'bg-card border-line text-fg',
  success: 'bg-green-900/80 border-green-700 text-green-100',
  error:   'bg-red-900/80 border-red-700 text-red-100',
};
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="toast">
        <div
          v-for="t in toastStore.toasts"
          :key="t.id"
          role="status"
          :class="['flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur text-sm', TYPE_CLASSES[t.type]]"
        >
          <span class="flex-1 whitespace-pre-line leading-snug">{{ t.message }}</span>
          <button
            @click="toastStore.dismiss(t.id)"
            class="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
