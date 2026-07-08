<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  remaining: number;
  limit: number;
  /** Noun for the quota, e.g. "debriefs", "reports", "tips" */
  label: string;
  /** compact = inline badge; prominent = card above CTAs */
  variant?: 'compact' | 'prominent';
  /** When the shared global budget is exhausted for everyone today */
  globalAvailable?: boolean;
}>(), {
  variant: 'compact',
  globalAvailable: true,
});

const pct = computed(() => (props.limit > 0 ? (props.remaining / props.limit) * 100 : 0));

const tone = computed<'empty' | 'critical' | 'low' | 'ok'>(() => {
  if (!props.globalAvailable || props.remaining === 0) return 'empty';
  if (props.remaining <= 2) return 'critical';
  if (pct.value <= 20) return 'low';
  return 'ok';
});

const toneClasses = computed(() => {
  switch (tone.value) {
    case 'empty':
      return 'border-red-500/40 bg-red-500/10 text-red-300';
    case 'critical':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'low':
      return 'border-amber-500/30 bg-amber-500/5 text-amber-200';
    default:
      return 'border-gold/40 bg-gold-bg text-gold';
  }
});

const barColor = computed(() => {
  switch (tone.value) {
    case 'empty': return 'bg-red-400';
    case 'critical': return 'bg-amber-400';
    case 'low': return 'bg-amber-400/80';
    default: return 'bg-gold';
  }
});

const headline = computed(() => {
  if (!props.globalAvailable) return 'Free AI at capacity today';
  if (props.remaining === 0) return `No free ${props.label} left today`;
  return `${props.remaining} free ${props.label} left today`;
});

const subline = computed(() => {
  if (!props.globalAvailable) return 'Shared limit reached — try again tomorrow or add your own Claude key';
  return `Resets at midnight UTC · ${props.remaining} of ${props.limit} remaining`;
});
</script>

<template>
  <div
    v-if="variant === 'prominent'"
    class="rounded-xl border px-4 py-3 text-left w-full max-w-md mx-auto"
    :class="toneClasses"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-semibold leading-snug">{{ headline }}</p>
        <p class="text-xs opacity-80 mt-0.5">{{ subline }}</p>
      </div>
      <div class="shrink-0 text-right tabular-nums">
        <p class="text-2xl font-bold leading-none">{{ remaining }}</p>
        <p class="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">of {{ limit }}</p>
      </div>
    </div>
    <div class="mt-2.5 h-1.5 rounded-full bg-black/20 overflow-hidden">
      <div
        class="h-full rounded-full transition-all"
        :class="barColor"
        :style="{ width: `${Math.max(0, Math.min(100, pct))}%` }"
      />
    </div>
  </div>

  <div
    v-else
    class="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums"
    :class="toneClasses"
    :title="subline"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true">
      <path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2h2V6a4 4 0 014-4z" />
      <circle cx="12" cy="14" r="2" />
    </svg>
    <span class="font-bold">{{ remaining }}</span>
    <span class="opacity-70">/ {{ limit }} free today</span>
  </div>
</template>
