import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'common',
      include: ['packages/common/src/**/*.test.ts'],
      environment: 'node',
    },
  },
]);
