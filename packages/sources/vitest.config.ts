import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'sources',
    include: ['test/**/*.test.ts'],
  },
});
