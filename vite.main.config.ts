import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    define: {
      'process.env.WG_API_KEY': JSON.stringify(env.WG_API_KEY || ''),
      'process.env.AI_PROXY_URL': JSON.stringify(env.AI_PROXY_URL || ''),
    },
    build: {
      rolldownOptions: {
        external: ['better-sqlite3', 'electron'],
        output: { entryFileNames: 'main.js' },
      },
    },
  };
});
