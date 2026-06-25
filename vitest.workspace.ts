import { defineWorkspace } from 'vitest/config';
import { resolve } from 'path';

export default defineWorkspace([
  {
    test: {
      name: 'common',
      include: ['packages/common/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'vault',
      include: ['packages/vault/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'search',
      include: ['packages/search/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'graph',
      include: ['packages/graph/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'sync',
      include: ['packages/sync/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'server',
      include: ['server/test/**/*.test.ts', 'server/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    resolve: {
      alias: {
        '@notes-app/common': resolve('packages/common/src/index.ts'),
        '@notes-app/vault': resolve('packages/vault/src/index.ts'),
      },
    },
    test: {
      name: 'import',
      include: ['packages/import/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    resolve: {
      alias: {
        '@notes-app/common': resolve('packages/common/src/index.ts'),
        '@notes-app/vault': resolve('packages/vault/src/index.ts'),
        '@notes-app/sync': resolve('packages/sync/src/index.ts'),
      },
    },
    test: {
      name: 'mobile',
      include: ['apps/mobile/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    resolve: {
      alias: {
        '@notes-app/common': resolve('packages/common/src/index.ts'),
        '@notes-app/vault': resolve('packages/vault/src/index.ts'),
        '@notes-app/search': resolve('packages/search/src/index.ts'),
        '@notes-app/sync': resolve('packages/sync/src/index.ts'),
        '@notes-app/graph': resolve('packages/graph/src/index.ts'),
        '@notes-app/editor': resolve('packages/editor/src/index.ts'),
        '@notes-app/ui/styles': resolve('packages/ui/src/styles.css'),
        '@notes-app/ui': resolve('packages/ui/src/index.ts'),
      },
    },
    test: {
      name: 'ui',
      include: ['packages/ui/src/**/*.test.ts'],
      environment: 'jsdom',
    },
  },
]);
