/**
 * commands/init.ts — the `sentinel init` command.
 *
 * Scaffolds a sentinel.config.ts file in the target directory.
 * Uses a template with sensible defaults and inline documentation.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

import type { InitFlags } from '../args.js'

const CONFIG_TEMPLATE = `import type { SentinelConfig } from '@sentinel-scan/core'

export default {
  // Files to scan (relative to this config file's directory)
  include: ['src/**/*.{ts,tsx,js,jsx}'],

  // Files to exclude from scanning
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],

  // Rules and their severity levels
  // 'error' | 'warning' | 'info' | 'hint' | 'off'
  rules: {
    'no-hardcoded-url': 'error',
    'missing-error-handler': 'warning',
  },

  // Optional: base URL to prefix relative API paths with for display
  // baseUrl: 'https://api.example.com',

  // Optional: path to your tsconfig.json for path alias resolution
  // tsConfigPath: './tsconfig.json',
} satisfies SentinelConfig
`

export interface InitCommandResult {
  exitCode: 0 | 1 | 2
  output: string
}

export function initCommand(positionals: string[], flags: InitFlags): InitCommandResult {
  const targetDir = positionals[0] ? resolve(positionals[0]) : process.cwd()
  const configPath = join(targetDir, 'sentinel.config.ts')

  if (existsSync(configPath) && !flags.force) {
    return {
      exitCode: 1,
      output: [
        `sentinel.config.ts already exists at ${configPath}`,
        `Use --force to overwrite it.`,
      ].join('\n'),
    }
  }

  writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8')

  return {
    exitCode: 0,
    output: [
      `✔ Created sentinel.config.ts at ${configPath}`,
      ``,
      `Next steps:`,
      `  1. Review the config and adjust rules to your project`,
      `  2. Run: sentinel scan`,
    ].join('\n'),
  }
}
