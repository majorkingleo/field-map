import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Apache serves this repo root directly at http://localhost/~martin/field-map/.
// index.html is a *static* page that references the compiled bundle
// dist/app.js + dist/app.css. The Vite build takes src/main.ts as its input
// (not index.html) to avoid Vite trying to resolve ./dist/* at build time.
// Run `npm run build` (or `npm run dev:watch`) after editing src/, then reload
// the Apache URL.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.ts'),
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
