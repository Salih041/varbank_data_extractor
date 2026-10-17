import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content script'ler ES module olarak yüklenemez; tek dosyalık IIFE üretiyoruz.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.js'),
      formats: ['iife'],
      name: 'VarbankExtractorContent',
      fileName: () => 'content.js',
    },
  },
});
