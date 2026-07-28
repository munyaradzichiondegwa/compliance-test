import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Both the dev server's own port and the backend it proxies to are
// environment-driven (see client/.env.example) specifically so that changing
// ports never requires hand-editing this file — a hardcoded proxy target
// that silently points at the wrong port is a classic source of confusing
// "everything returns 500" symptoms after moving the backend to a new port.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:4000';
  const devPort = parseInt(env.VITE_DEV_PORT || '5173', 10);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'ZACC Institutional Compliance Portal',
          short_name: 'ZACC Compliance',
          description: 'Zimbabwe Anti-Corruption Commission — Institutional Compliance Portal',
          theme_color: '#161512',
          background_color: '#F7F4EC',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
            { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
            },
          ],
        },
      }),
    ],
    server: {
      port: devPort,
      strictPort: true, // fail loudly instead of silently picking a different port
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, changeOrigin: true, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
});
