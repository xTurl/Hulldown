<script setup lang="ts">
defineProps<{
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}>();
</script>

<template>
  <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
    <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">{{ title }}</p>
    <p class="text-2xl font-bold" :style="color ? { color } : {}">{{ value }}</p>
    <p v-if="subtitle" class="text-xs text-gray-500 mt-1">{{ subtitle }}</p>
  </div>
</template>
