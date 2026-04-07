import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rolldownOptions: {
      output: { entryFileNames: 'preload.js' },
    },
  },
});
