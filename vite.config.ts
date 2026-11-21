import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const BUILD_TIME = new Date().toISOString();
const COMMIT_SHA = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  'local'
).slice(0, 8);
const COMPACT_TIMESTAMP = BUILD_TIME.replace(/[-:T.Z]/g, '').slice(0, 14);
const APP_VERSION = `${COMPACT_TIMESTAMP}-${COMMIT_SHA}`;

function otaVersionManifestPlugin(version: string, buildTime: string, commitSha: string): Plugin {
  const payload = JSON.stringify(
    {
      version,
      buildTime,
      commitSha,
    },
    null,
    2
  );

  return {
    name: 'ota-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
      __APP_COMMIT_SHA__: JSON.stringify(COMMIT_SHA),
    },
    plugins: [
      react(),
      tailwindcss(),
      otaVersionManifestPlugin(APP_VERSION, BUILD_TIME, COMMIT_SHA),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Overtime Claim Manager',
          short_name: 'OT Claim',
          description: 'Digitally enter overtime claims, calibrate custom form templates with millimetric precision, and generate print-ready official A4 PDFs.',
          theme_color: '#1e293b',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/],
          runtimeCaching: [
            {
              urlPattern: /\/version\.json$/i,
              handler: 'NetworkOnly',
            },
          ],
        },
        injectRegister: process.env.NODE_ENV === 'production' ? 'auto' : null,
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
