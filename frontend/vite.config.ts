import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss()],
  envDir: '..',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: loadEnv(mode, '..', 'BACKEND_PUBLIC_URL').BACKEND_PUBLIC_URL || 'http://127.0.0.1:3000', changeOrigin: false } } },
  test: { environment: 'node', include: ['tests/**/*.spec.ts'] },
}));
