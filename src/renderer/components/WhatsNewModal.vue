<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import type { WhatsNewInfo } from '../../shared/types';

const props = defineProps<{
  info: WhatsNewInfo | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const panelRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const title = computed(() => {
  if (!props.info?.notes.length) return "What's new";
  if (props.info.notes.length === 1) return props.info.notes[0].title;
  return `What's new in v${props.info.currentVersion}`;
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    dismiss();
    return;
  }
  if (e.key === 'Tab' && panelRef.value) {
    const focusables = panelRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(
  () => props.info,
  async (info) => {
    if (info?.show) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      document.addEventListener('keydown', handleKeydown);
      await nextTick();
      panelRef.value?.focus();
    } else {
      document.removeEventListener('keydown', handleKeydown);
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

async function dismiss() {
  await window.api.markVersionSeen();
  emit('close');
}

async function openChangelog() {
  await window.api.openExternal('https://github.com/xTurl/Hulldown/blob/main/CHANGELOG.md');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="info?.show"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4"
      @click.self="dismiss"
    >
      <div class="absolute inset-0 bg-black/60" @click="dismiss" />

      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        tabindex="-1"
        class="relative z-10 w-full max-w-lg bg-card border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] outline-none"
      >
        <div class="px-5 py-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <h2 id="whats-new-title" class="text-base font-semibold text-fg">What's new</h2>
            <p class="text-sm text-muted mt-0.5">{{ title }}</p>
          </div>
          <button
            @click="dismiss"
            class="text-faint hover:text-fg transition-colors p-1 rounded hover:bg-sub shrink-0"
            aria-label="Close dialog"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <section v-for="note in info.notes" :key="note.version" class="space-y-3">
            <div v-if="info.notes.length > 1" class="flex items-center gap-2">
              <span class="text-xs font-mono text-gold bg-gold-bg border border-gold/30 px-2 py-0.5 rounded">
                v{{ note.version }}
              </span>
              <h3 class="text-sm font-semibold text-fg">{{ note.title }}</h3>
            </div>

            <ul class="space-y-2.5">
              <li
                v-for="(item, i) in note.highlights"
                :key="i"
                class="flex gap-2.5 text-sm text-fg leading-relaxed"
              >
                <span class="flex h-[1.625em] shrink-0 items-center" aria-hidden="true">
                  <span class="size-1.5 rounded-full bg-gold" />
                </span>
                <span>{{ item }}</span>
              </li>
            </ul>
          </section>
        </div>

        <div class="px-5 py-4 border-t border-line flex items-center justify-between gap-3 shrink-0">
          <button
            @click="openChangelog"
            class="text-xs text-faint hover:text-gold transition-colors"
          >
            Full changelog on GitHub ↗
          </button>
          <button
            @click="dismiss"
            class="px-4 py-2 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 text-sm font-medium rounded-lg transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
