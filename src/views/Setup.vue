<script setup lang="ts">
import { ref } from 'vue';
import iconUrl from '../../assets/icon.svg';

const emit = defineEmits<{ complete: [] }>();

const step = ref<'replays' | 'confirm' | 'keys'>('replays');

// Step 1 — replays dir
const replaysDir = ref('');
const detecting = ref(false);
const detectError = ref<string | null>(null);

// Step 2 — detected player
const detectedName = ref('');
const detectedId = ref(0);
const detectedRegion = ref('');

// Step 3 — API keys
const claudeApiKey = ref('');
const saving = ref(false);

async function detect() {
  if (!replaysDir.value.trim()) return;
  detecting.value = true;
  detectError.value = null;
  try {
    const config = await window.api.getConfig();
    await window.api.saveConfig({ ...config, replaysDir: replaysDir.value.trim() });
    const player = await window.api.detectPlayer();
    if (!player) {
      detectError.value = 'No complete replay files found in this directory. Make sure replay saving is enabled in WoT settings.';
      return;
    }
    detectedName.value = player.playerName;
    detectedId.value = player.accountId;
    detectedRegion.value = player.region;
    step.value = 'confirm';
  } catch (e) {
    detectError.value = e instanceof Error ? e.message : 'Detection failed';
  } finally {
    detecting.value = false;
  }
}

async function finish() {
  saving.value = true;
  try {
    const config = await window.api.getConfig();
    await window.api.saveConfig({
      ...config,
      replaysDir: replaysDir.value.trim(),
      username: detectedName.value,
      accountId: detectedId.value,
      region: detectedRegion.value,
      claudeApiKey: claudeApiKey.value.trim() || config.claudeApiKey,
    });
    // Kick off initial scan in background — no need to await
    window.api.scanReplays();
    emit('complete');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
    <div class="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">

      <div class="flex justify-center mb-6">
        <img :src="iconUrl" class="w-16 h-16" alt="WoT Stats" />
      </div>

      <h1 class="text-2xl font-bold text-gray-100 text-center mb-1">Welcome to WoT Stats</h1>

      <!-- Step indicators -->
      <div class="flex items-center justify-center gap-2 mb-8 mt-3">
        <div v-for="s in ['replays', 'confirm', 'keys']" :key="s"
          :class="['w-2 h-2 rounded-full transition-colors', step === s ? 'bg-indigo-500' : 'bg-gray-700']"
        />
      </div>

      <!-- Step 1: Replays directory -->
      <div v-if="step === 'replays'" class="space-y-4">
        <p class="text-sm text-gray-400 text-center mb-6">
          Point to your World of Tanks replays folder.<br>
          Your player info will be detected automatically.
        </p>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Replays directory</label>
          <input
            v-model="replaysDir"
            @keyup.enter="detect"
            placeholder="/path/to/World of Tanks/eu/replays"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 placeholder-gray-600 font-mono"
          />
          <p class="text-xs text-gray-600 mt-1">
            Common paths: <span class="font-mono">~/.steam/.../World of Tanks/eu/replays</span>
          </p>
        </div>

        <div v-if="detectError" class="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {{ detectError }}
        </div>

        <button
          @click="detect"
          :disabled="detecting || !replaysDir.trim()"
          class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {{ detecting ? 'Detecting player...' : 'Detect from replays →' }}
        </button>
      </div>

      <!-- Step 2: Confirm detected player -->
      <div v-else-if="step === 'confirm'" class="space-y-4">
        <p class="text-sm text-gray-400 text-center mb-2">Player detected from your replays:</p>

        <div class="bg-indigo-900/20 border border-indigo-700/50 rounded-xl px-5 py-4 text-center">
          <p class="text-2xl font-bold text-gray-100 mb-1">{{ detectedName }}</p>
          <p class="text-sm text-gray-400">Account ID: {{ detectedId }}</p>
          <p class="text-sm text-gray-400 mt-1">Region: <span class="text-gray-200">{{ detectedRegion }}</span></p>
        </div>

        <p class="text-xs text-gray-500 text-center">
          Wrong player? Check that you selected the correct replays folder.
        </p>

        <button
          @click="step = 'keys'"
          class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Looks good →
        </button>
        <button @click="step = 'replays'" class="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Change directory
        </button>
      </div>

      <!-- Step 3: API keys -->
      <div v-else-if="step === 'keys'" class="space-y-4">
        <p class="text-sm text-gray-400 text-center mb-2">
          Optionally add your Claude API key for AI-powered tips per tank.<br>
          <span class="text-gray-600">You can add it later in Settings.</span>
        </p>

        <div>
          <label class="block text-xs text-gray-400 mb-1">
            Claude API Key
            <span class="text-gray-600 ml-1">— AI tips per tank</span>
          </label>
          <input v-model="claudeApiKey" type="password"
            placeholder="sk-ant-..."
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 font-mono placeholder-gray-600"
          />
          <p class="text-xs text-gray-600 mt-1">Get yours at console.anthropic.com</p>
        </div>

        <button
          @click="finish"
          :disabled="saving"
          class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors mt-2"
        >
          {{ saving ? 'Setting up...' : '✓ Get started' }}
        </button>
        <button @click="step = 'confirm'" class="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Back
        </button>
      </div>

    </div>
  </div>
</template>
