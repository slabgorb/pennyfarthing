import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    // Use forks pool to truly isolate each test file in a separate process
    // This prevents shared module state from causing flaky tests
    // (e.g., otlp-receiver.ts event stores, server state)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: [
      // 68-6: Map browser absolute paths to source for test environment
      { find: /^\/js\/(.*)/, replacement: path.resolve(__dirname, 'src/public/js/$1') },
    ],
  },
});
