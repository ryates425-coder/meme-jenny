/**
 * Vite config for React feed app.
 * Proxies /api and /meme to Express on port 3000 for dev.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/meme': 'http://localhost:3000',
    },
  },
});
