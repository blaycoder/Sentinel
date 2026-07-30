import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    // Use a single pool so TypeScript compiler API singleton isn't duplicated
    pool: 'forks',
    // Respect .js extension imports (ESM NodeNext style)
    alias: {},
    // Coverage config (used with --coverage flag)
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/index.ts',
        'packages/vscode/**',
        'packages/github-action/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      reporter: ['text', 'lcov', 'html'],
    },
    // Global test timeout
    testTimeout: 30_000,
    // Reporters
    reporters: process.env.CI ? ['verbose', 'junit'] : ['verbose'],
  },
})
