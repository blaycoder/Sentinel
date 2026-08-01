// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── TypeScript quality rules ─────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // ── Import ordering ──────────────────────────────────────────────────
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
      'import/no-duplicates': 'error',

      // ── General quality ──────────────────────────────────────────────────
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // Allow console in CLI entry point and scripts
    files: ['packages/cli/src/index.ts', 'internal/scripts/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // ── Dependency boundary enforcement ──────────────────────────────────
    // @sentinel-scan/core must not import from any other sentinel package
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@sentinel-scan/cli',
            '@sentinel-scan/ai',
            '@sentinel-scan/cloud-sdk',
            '../../../packages/cli/*',
            '../../../packages/ai/*',
            '../../../packages/cloud-sdk/*',
          ],
        },
      ],
    },
  },
  {
    // @sentinel-scan/ai must not import from CLI or vscode
    files: ['packages/ai/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@sentinel-scan/cli', 'sentinel-vscode'] },
      ],
    },
  },
  {
    // @sentinel-scan/cloud-sdk must not import from CLI, AI, or vscode
    files: ['packages/cloud-sdk/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@sentinel-scan/cli', '@sentinel-scan/ai', 'sentinel-vscode'] },
      ],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.js',
      '**/tsup.config.ts',
      'vitest.config.ts',
      '**/*.test.ts',
      'packages/vscode/**',
      'packages/github-action/**',
      'coverage/**',
      'sample.ts',
      'sample.tsx',
    ],
  },
)
