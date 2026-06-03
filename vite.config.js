import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Forward /uploads and /api to the Flask backend when it is running.
      // In local-only mode (no Flask) these 502 gracefully and the frontend
      // falls back to localStorage / placeholder covers automatically.
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
