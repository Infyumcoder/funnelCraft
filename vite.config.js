import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run dev`, the React app runs on :5173 and calls /api/*.
// We proxy those /api calls to the Express backend (server.js) on :3000,
// so the front-end code can just fetch('/api/generate') exactly like before.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Vite builds into dist/ — server.js serves this folder in production.
    outDir: 'dist',
  },
});
