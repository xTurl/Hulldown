import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

const DEFAULT_DURATION_MS = 5000;

let nextId = 1;

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function show(message: string, type: Toast['type'] = 'info', durationMs = DEFAULT_DURATION_MS) {
    const id = nextId++;
    toasts.value.push({ id, message, type });
    setTimeout(() => dismiss(id), durationMs);
  }

  function error(message: string)   { show(message, 'error', 8000); }
  function success(message: string) { show(message, 'success'); }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, show, error, success, dismiss };
});
