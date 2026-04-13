<script setup lang="ts">
import { ref } from 'vue';
import iconUrl from '../../../assets/icon.svg';

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

async function browseFolder() {
  const dir = await window.api.selectFolder();
  if (dir) replaysDir.value = dir;
}

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
  <div class="fixed inset-0 bg-surface flex items-center justify-center z-50">
    <div class="w-full max-w-md bg-card border border-line rounded-2xl p-8 shadow-2xl">

      <div class="flex justify-center mb-6">
        <img :src="iconUrl" class="w-16 h-16" alt="Hulldown" />
      </div>

      <h1 class="text-2xl font-bold text-fg text-center mb-1">Welcome to Hulldown</h1>

      <!-- Step indicators -->
      <div class="flex items-center justify-center gap-2 mb-8 mt-3">
        <div v-for="s in ['replays', 'confirm', 'keys']" :key="s"
          :class="['w-2 h-2 rounded-full transition-colors', step === s ? 'bg-gold' : 'bg-faint']"
        />
      </div>

      <!-- Step 1: Replays directory -->
      <div v-if="step === 'replays'" class="space-y-4">
        <p class="text-sm text-muted text-center mb-6">
          Point to your World of Tanks replays folder.<br>
          Your player info will be detected automatically.
        </p>
        <div>
          <label class="block text-xs text-muted mb-1">Replays directory</label>
          <div class="flex gap-2">
            <input
              v-model="replaysDir"
              @keyup.enter="detect"
              placeholder="Select your WoT replays folder..."
              class="flex-1 bg-sub border border-line rounded-lg px-3 py-2.5 text-sm text-fg focus:outline-none placeholder-faint font-mono min-w-0"
              @focus="(e) => (e.target as HTMLInputElement).style.borderColor = 'var(--gold)'"
              @blur="(e) => (e.target as HTMLInputElement).style.borderColor = ''"
            />
            <button
              @click="browseFolder"
              class="shrink-0 px-3 py-2.5 bg-sub border border-line rounded-lg text-sm text-muted hover:text-fg hover:border-gold/50 transition-colors"
            >Browse</button>
          </div>
        </div>

        <div v-if="detectError" class="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {{ detectError }}
        </div>

        <button
          @click="detect"
          :disabled="detecting || !replaysDir.trim()"
          class="w-full py-3 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 disabled:opacity-50 text-sm font-semibold rounded-lg transition-opacity"
        >
          {{ detecting ? 'Detecting player...' : 'Detect from replays →' }}
        </button>
      </div>

      <!-- Step 2: Confirm detected player -->
      <div v-else-if="step === 'confirm'" class="space-y-4">
        <p class="text-sm text-muted text-center mb-2">Player detected from your replays:</p>

        <div class="bg-gold-bg border border-gold/20 rounded-xl px-5 py-4 text-center">
          <p class="text-2xl font-bold text-fg mb-1">{{ detectedName }}</p>
          <p class="text-sm text-muted">Account ID: {{ detectedId }}</p>
          <p class="text-sm text-muted mt-1">Region: <span class="text-fg">{{ detectedRegion }}</span></p>
        </div>

        <p class="text-xs text-faint text-center">
          Wrong player? Check that you selected the correct replays folder.
        </p>

        <button
          @click="step = 'keys'"
          class="w-full py-3 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 text-sm font-semibold rounded-lg transition-opacity"
        >
          Looks good →
        </button>
        <button @click="step = 'replays'" class="w-full py-2 text-xs text-faint hover:text-muted transition-colors">
          ← Change directory
        </button>
      </div>

      <!-- Step 3: API keys -->
      <div v-else-if="step === 'keys'" class="space-y-4">
        <p class="text-sm text-muted text-center mb-2">
          Optionally add your Claude API key for AI-powered tips per tank.<br>
          <span class="text-faint">You can skip this and add it later in Settings.</span>
        </p>

        <div class="bg-sub border border-line rounded-lg px-4 py-3 text-xs text-muted space-y-1">
          <p class="font-semibold text-fg mb-2">How to get your free API key:</p>
          <p>1. Click the link below to open Anthropic Console</p>
          <p>2. Sign up or log in (free account)</p>
          <p>3. Go to <span class="text-fg font-mono">API Keys</span> and click <span class="text-fg font-mono">+ Create key</span></p>
          <p>4. Copy the key and paste it below</p>
          <button
            @click="() => window.api.openExternal('https://console.anthropic.com/settings/keys')"
            class="mt-2 inline-flex items-center gap-1.5 text-gold hover:opacity-80 transition-opacity font-medium"
          >
            Open console.anthropic.com →
          </button>
        </div>

        <div>
          <label class="block text-xs text-muted mb-1">
            Claude API Key
            <span class="text-faint ml-1">— AI tips per tank</span>
          </label>
          <input v-model="claudeApiKey" type="password"
            placeholder="sk-ant-..."
            class="w-full bg-sub border border-line rounded-lg px-3 py-2.5 text-sm text-fg focus:outline-none font-mono placeholder-faint"
            @focus="(e) => (e.target as HTMLInputElement).style.borderColor = 'var(--gold)'"
            @blur="(e) => (e.target as HTMLInputElement).style.borderColor = ''"
          />
        </div>

        <button
          @click="finish"
          :disabled="saving"
          class="w-full py-3 bg-gold-bg text-gold border border-gold/30 hover:opacity-80 disabled:opacity-50 text-sm font-semibold rounded-lg transition-opacity mt-2"
        >
          {{ saving ? 'Setting up...' : '✓ Get started' }}
        </button>
        <button @click="step = 'confirm'" class="w-full py-2 text-xs text-faint hover:text-muted transition-colors">
          ← Back
        </button>
      </div>

    </div>
  </div>
</template>
