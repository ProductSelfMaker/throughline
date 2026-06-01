import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  // '^/api/' (regex) matches real API routes like /api/transcript but NOT the
  // frontend's own /api.ts module — a plain '/api' key proxies /api.ts to the
  // backend and breaks the module graph (white screen) in dev.
  server: { port: 5173, proxy: { '^/api/': 'http://localhost:5174' } },
  build: { outDir: '../../dist', emptyOutDir: true },
});
