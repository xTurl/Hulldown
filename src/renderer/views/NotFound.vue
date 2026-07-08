<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="p-6 h-full flex items-center justify-center">
    <div class="text-center">
      <p class="text-5xl font-bold text-gold mb-3">404</p>
      <h2 class="text-lg font-semibold text-fg mb-1">Page not found</h2>
      <p class="text-sm text-muted mb-6">The page you're looking for doesn't exist.</p>
      <button
        @click="router.push('/')"
        class="px-4 py-2 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 text-sm rounded-lg transition-opacity"
      >
        ← Back to Dashboard
      </button>
    </div>
  </div>
</template>
