import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project below /DRGSeekerAPI/; Docker serves it at /.
  base: process.env.VITE_BASE_PATH || '/',
  appType: 'spa',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
