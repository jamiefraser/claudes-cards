import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@cards': path.resolve(__dirname, '../../packages/cards-engine/src'),
    },
  },
  server: {
    // Dev-server proxy so relative '/api' and '/socket.io' paths work
    // without CORS. Production uses nginx (apps/frontend/nginx.conf).
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
