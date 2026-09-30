import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
// Isolated preview: no Portal auth, API proxy, host environment or production route.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  envPrefix: 'M0_PUBLIC_',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 14320, strictPort: true },
});
