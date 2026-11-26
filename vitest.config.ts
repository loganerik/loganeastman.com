import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['packages/**/*.test.ts', 'site/tests/**/*.test.ts', 'worker/test/**/*.test.ts'] },
});
