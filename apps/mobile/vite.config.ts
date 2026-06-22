import { createRequire } from 'module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const _require = createRequire(import.meta.url);

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      // Workspace packages — point at src entry points for HMR + tree-shaking
      '@notes-app/common': resolve('../../packages/common/src/index.ts'),
      '@notes-app/editor': resolve('../../packages/editor/src/index.ts'),
      '@notes-app/ui/styles': resolve('../../packages/ui/src/styles.css'),
      '@notes-app/ui': resolve('../../packages/ui/src/index.ts'),
      '@notes-app/search': resolve('../../packages/search/src/index.ts'),
      '@notes-app/graph': resolve('../../packages/graph/src/index.ts'),
      '@notes-app/sync': resolve('../../packages/sync/src/index.ts'),
      '@notes-app/vault': resolve('../../packages/vault/src/index.ts'),
      '@': resolve('../../packages/ui/src'),
      // Stub Node-only modules. NodeVaultFS + VaultWatcher are tree-shaken away
      // (sideEffects:false on @notes-app/vault), but Rollup still resolves named
      // imports at parse time — the stubs export compatible signatures.
      fs: resolve('./src/stubs/node-fs.ts'),
      path: resolve('./src/stubs/node-path.ts'),
      chokidar: resolve('./src/stubs/chokidar.ts'),
    },
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        _require('tailwindcss')(resolve('tailwind.config.cjs')),
        _require('autoprefixer'),
      ],
    },
  },
});
