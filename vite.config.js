import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Side panel (React) + service worker build'i.
// Content script ayrı (IIFE) olarak vite.content.config.js ile derlenir.

const outDir = resolve(import.meta.dirname, 'dist');

// Agent sunucusunun adresi build sırasında verilir:
//   geliştirme:  npm run build                                  -> http://localhost:8000
//   yayın:       $env:AGENT_URL="https://....run.app"; npm run package
const AGENT_URL = (process.env.AGENT_URL || 'http://localhost:8000').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(AGENT_URL) && !/^http:\/\/localhost(:\d+)?$/.test(AGENT_URL)) {
  throw new Error(`AGENT_URL geçersiz: ${AGENT_URL} (https://alan-adi veya http://localhost:port olmalı)`);
}

// Manifest'teki izin (host_permissions) ve CSP connect-src, kodla aynı adrese ayarlanır;
// böylece adres tek yerden değişir ve eklenti başka hiçbir sunucuya bağlanamaz.
function agentUrlInManifest() {
  return {
    name: 'agent-url-in-manifest',
    closeBundle() {
      const file = resolve(outDir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      manifest.host_permissions = [`${AGENT_URL}/*`];
      const csp = manifest.content_security_policy;
      csp.extension_pages = csp.extension_pages.replace(/connect-src [^;]+/, `connect-src ${AGENT_URL}`);
      writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  publicDir: resolve(import.meta.dirname, 'public'),
  plugins: [react(), agentUrlInManifest()],
  define: { __AGENT_BASE_URL__: JSON.stringify(AGENT_URL) },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    // Uzak kod yok: tüm bağımlılıklar pakete gömülür.
    modulePreload: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel.html'),
        background: resolve(import.meta.dirname, 'src/background/index.js'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
