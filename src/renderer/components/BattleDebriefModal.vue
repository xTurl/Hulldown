<script setup lang="ts">
import { ref, watch } from 'vue';
import type { BattleRecord, BattleDebrief } from '../../shared/types';

const props = defineProps<{
  battle: BattleRecord | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const debrief = ref<BattleDebrief | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchDebrief(force = false) {
  if (!props.battle) return;
  loading.value = true;
  error.value = null;
  debrief.value = null;
  try {
    debrief.value = await window.api.getBattleDebrief(props.battle.arenaId, force);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Analysis failed. Please retry.';
  } finally {
    loading.value = false;
  }
}

// Trigger fetch whenever the modal opens (battle becomes non-null)
watch(
  () => props.battle,
  (b) => {
    if (b) fetchDebrief();
    else {
      debrief.value = null;
      error.value = null;
    }
  },
  { immediate: true },
);

function close() {
  emit('close');
}

function retry() {
  fetchDebrief(true);
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <div
      v-if="battle"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      @click.self="close"
    >
      <!-- Dim overlay -->
      <div class="absolute inset-0 bg-black/60" @click="close" />

      <!-- Modal panel -->
      <div class="relative z-10 w-full max-w-2xl bg-card border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

        <!-- Header -->
        <div class="px-5 py-4 border-b border-line flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="text-sm font-semibold text-fg">Battle Debrief</h2>
            <p class="text-xs text-muted mt-0.5">{{ battle.tankName }} · {{ battle.mapName }}</p>
          </div>
          <button
            @click="close"
            class="text-faint hover:text-fg transition-colors p-1 rounded hover:bg-sub"
            title="Close"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Body — scrollable -->
        <div class="overflow-y-auto flex-1 px-5 py-4">

          <!-- Loading -->
          <div v-if="loading" class="py-12 flex flex-col items-center gap-3">
            <svg class="w-6 h-6 text-gold animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10" />
            </svg>
            <p class="text-sm text-muted">Analyzing battle...</p>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="py-10 flex flex-col items-center gap-4">
            <p class="text-sm text-center" style="color: var(--error-fg)">{{ error }}</p>
            <button
              @click="retry"
              class="flex items-center gap-1.5 px-3 py-1.5 text-gold bg-gold-bg border border-gold/30 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity"
            >
              Retry
            </button>
          </div>

          <!-- Debrief content -->
          <div v-else-if="debrief" class="space-y-4">

            <!-- Summary -->
            <div class="bg-sub rounded-lg p-4">
              <p class="text-sm text-fg leading-relaxed">{{ debrief.summary }}</p>
            </div>

            <!-- What went well -->
            <div v-if="debrief.wentWell.length > 0">
              <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">What went well</h3>
              <ul class="space-y-1.5">
                <li
                  v-for="(item, i) in debrief.wentWell"
                  :key="i"
                  class="flex items-start gap-2 text-sm text-fg"
                >
                  <span class="mt-0.5 text-green-400 flex-shrink-0">✓</span>
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>

            <!-- What went wrong -->
            <div v-if="debrief.wentWrong.length > 0">
              <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">What went wrong</h3>
              <ul class="space-y-1.5">
                <li
                  v-for="(item, i) in debrief.wentWrong"
                  :key="i"
                  class="flex items-start gap-2 text-sm text-fg"
                >
                  <span class="mt-0.5 text-red-400 flex-shrink-0">✗</span>
                  <span>{{ item }}</span>
                </li>
              </ul>
            </div>

            <!-- Tips for next time -->
            <div v-if="debrief.tips.length > 0">
              <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tips for next time</h3>
              <ol class="space-y-2">
                <li
                  v-for="(tip, i) in debrief.tips"
                  :key="i"
                  class="flex items-start gap-3 text-sm text-fg"
                >
                  <span class="flex-shrink-0 w-5 h-5 rounded-full bg-gold-bg text-gold text-xs font-bold flex items-center justify-center mt-0.5">
                    {{ i + 1 }}
                  </span>
                  <span>{{ tip }}</span>
                </li>
              </ol>
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div v-if="debrief" class="px-5 py-3 border-t border-line flex items-center justify-between flex-shrink-0">
          <span class="text-xs text-faint">Generated {{ formatDate(debrief.generatedAt) }}</span>
          <button
            @click="retry"
            :disabled="loading"
            class="text-xs text-faint hover:text-gold transition-colors disabled:opacity-50"
            title="Re-generate analysis"
          >
            Re-analyze
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>
