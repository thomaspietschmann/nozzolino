import { createRequire } from 'module';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const _require = createRequire(import.meta.url);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@notes-app/common': resolve('../../packages/common/src/index.ts'),
        '@notes-app/vault': resolve('../../packages/vault/src/index.ts'),
      },
    },
    build: {
      outDir: 'dist/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@notes-app/common': resolve('../../packages/common/src/index.ts'),
      },
    },
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
    },
    resolve: {
      alias: {
        '@notes-app/common': resolve('../../packages/common/src/index.ts'),
        '@notes-app/editor': resolve('../../packages/editor/src/index.ts'),
        '@notes-app/ui/styles': resolve('../../packages/ui/src/styles.css'),
        '@notes-app/ui': resolve('../../packages/ui/src/index.ts'),
        '@notes-app/search': resolve('../../packages/search/src/index.ts'),
        '@notes-app/graph': resolve('../../packages/graph/src/index.ts'),
        '@': resolve('../../packages/ui/src'),
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
  },
});
