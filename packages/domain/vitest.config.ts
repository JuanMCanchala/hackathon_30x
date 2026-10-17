import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'domain',
    include: ['test/**/*.test.ts'],
  },
});
