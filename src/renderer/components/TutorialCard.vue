<script setup lang="ts">
import type { Tutorial } from '../data/tutorials';

defineProps<{
  tutorial: Tutorial;
  isExpanded: boolean;
  difficultyColor: string;
  highlighted: boolean;
}>();

defineEmits<{ toggle: [] }>();
</script>

<template>
  <div
    :class="[
      'border rounded-xl overflow-hidden transition-colors',
      highlighted ? 'border-gold/30 bg-gold-bg' : 'border-line bg-card',
    ]"
  >
    <!-- Header -->
    <button
      class="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-sub transition-colors"
      @click="$emit('toggle')"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-fg">{{ tutorial.title }}</span>
          <span :class="['text-xs px-2 py-0.5 rounded-full border font-medium', difficultyColor]">
            {{ tutorial.difficulty }}
          </span>
        </div>
        <p class="text-xs text-muted mt-0.5">{{ tutorial.subtitle }}</p>
      </div>
      <span
        class="text-faint text-xl ml-4 flex-shrink-0 transition-transform duration-200"
        :style="{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }"
      >›</span>
    </button>

    <!-- Body -->
    <div v-if="isExpanded" class="px-5 pb-5 border-t border-line">
      <div class="space-y-4 mt-4">
        <div v-for="section in tutorial.sections" :key="section.heading">
          <h4 class="text-sm font-semibold text-fg mb-1">{{ section.heading }}</h4>
          <p class="text-sm text-muted leading-relaxed">{{ section.body }}</p>
        </div>
      </div>

      <!-- Tags -->
      <div class="flex flex-wrap gap-2 mt-5">
        <span
          v-for="tag in tutorial.tags"
          :key="tag"
          class="text-xs text-faint bg-sub px-2 py-0.5 rounded-full"
        >{{ tag }}</span>
      </div>

      <!-- External links -->
      <div v-if="tutorial.links.length > 0" class="mt-4 flex flex-wrap gap-4">
        <button
          v-for="link in tutorial.links"
          :key="link.url"
          @click="window.api.openExternal(link.url)"
          class="text-xs text-gold hover:text-gold-dim flex items-center gap-1 transition-colors"
        >
          ↗ {{ link.label }}
        </button>
      </div>
    </div>
  </div>
</template>
