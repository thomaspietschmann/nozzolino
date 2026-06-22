import { defineWorkspace } from 'vitest/config';

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
]);
