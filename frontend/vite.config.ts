import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  envDir: '..',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.spec.ts'] },
});
