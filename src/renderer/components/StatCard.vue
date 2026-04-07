<script setup lang="ts">
defineProps<{
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}>();
</script>

<template>
  <div
    class="bg-card border border-line rounded-xl p-4"
    style="box-shadow: 0 4px 20px rgba(0,0,0,0.25)"
  >
    <p class="text-[11px] text-muted uppercase tracking-wider mb-2">{{ title }}</p>
    <p class="text-2xl font-bold text-fg leading-none" :style="color ? { color } : {}">{{ value }}</p>
    <p v-if="subtitle" class="text-xs text-faint mt-2">{{ subtitle }}</p>
  </div>
</template>
