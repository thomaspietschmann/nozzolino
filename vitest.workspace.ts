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
]);
