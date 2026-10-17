import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'dataset',
    include: ['test/**/*.test.ts'],
  },
});
