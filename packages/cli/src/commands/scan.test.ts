import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Logger, ScanResult } from '@sentinel/core'
import { Severity } from '@sentinel/core'
import { describe, expect, it } from 'vitest'

import type { ScanFlags } from '../args.js'
import { computeExitCode, runScan } from './scan.js'

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

function makeCapturingLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = []

  const logger: Logger = {
    debug(message) {
      entries.push({ level: 'debug', message })
    },
    info(message) {
      entries.push({ level: 'info', message })
    },
    warn(message) {
      entries.push({ level: 'warn', message })
    },
    error(message) {
      entries.push({ level: 'error', message })
    },
  }

  return { logger, entries }
}

function makeScanFlags(overrides: Partial<ScanFlags> = {}): ScanFlags {
  return {
    verbose: false,
    noColor: true,
    help: false,
    version: false,
    format: 'text',
    output: undefined,
    config: undefined,
    rootDir: undefined,
    maxWarnings: -1,
    ...overrides,
  }
}

function createFixture(): string {
  return mkdtempSync(join(tmpdir(), 'sentinel-cli-scan-'))
}

function writeScanFixture(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content, 'utf8')
  }
}

function writeRulesConfig(root: string, rules: Record<string, string>): void {
  writeFileSync(join(root, '.sentinelrc.json'), JSON.stringify({ rules }), 'utf8')
}

const ALL_RULES_OFF = {
  'no-hardcoded-url': 'off',
  'missing-error-handler': 'off',
  'api-contract-mismatch': 'off',
}

describe('computeExitCode', () => {
  function makeResult(
    findingsBySeverity: Record<string, number>,
    findingsCount: number,
  ): ScanResult {
    return {
      apiCalls: [],
      findings: [],
      diagnostics: [],
      stats: {
        filesScanned: 1,
        filesErrored: 0,
        apiCallsFound: 0,
        findingsCount,
        findingsBySeverity,
        durationMs: 1,
      },
    }
  }

  it('returns 0 when there are no error or warning findings', () => {
    expect(computeExitCode(makeResult({}, 0), -1)).toBe(0)
  })

  it('returns 1 when there are error-severity findings', () => {
    expect(computeExitCode(makeResult({ [Severity.Error]: 1 }, 1), -1)).toBe(1)
  })

  it('returns 1 when warnings exceed maxWarnings', () => {
    expect(computeExitCode(makeResult({ [Severity.Warning]: 2 }, 2), 0)).toBe(1)
  })

  it('returns 0 when warnings are at or below maxWarnings', () => {
    expect(computeExitCode(makeResult({ [Severity.Warning]: 1 }, 1), 1)).toBe(0)
  })
})

describe('runScan', () => {
  it('returns exit 2 and logs error for a nonexistent path', async () => {
    const missing = join(tmpdir(), 'sentinel-missing-path-xyz')
    const { logger, entries } = makeCapturingLogger()

    const result = await runScan(missing, makeScanFlags(), logger)

    expect(result.exitCode).toBe(2)
    expect(entries.some((e) => e.level === 'error' && e.message.includes('does not exist'))).toBe(
      true,
    )
  })

  it('returns exit 2 and logs error when path exists but is a file', async () => {
    const dir = createFixture()
    const file = join(dir, 'not-a-dir.txt')
    writeFileSync(file, 'hello')
    const { logger, entries } = makeCapturingLogger()

    try {
      const result = await runScan(file, makeScanFlags(), logger)

      expect(result.exitCode).toBe(2)
      expect(
        entries.some((e) => e.level === 'error' && e.message.includes('not a directory')),
      ).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns exit 0 for a clean scan with no findings', async () => {
    const root = createFixture()

    try {
      writeRulesConfig(root, ALL_RULES_OFF)
      writeScanFixture(root, {
        'api.ts': "fetch('/ok').catch(() => {})",
      })

      const result = await runScan(root, makeScanFlags(), makeCapturingLogger().logger)

      expect(result.exitCode).toBe(0)
      expect(result.output).toBeDefined()
      expect(result.output).toContain('No findings')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns exit 1 when error-severity findings are present', async () => {
    const root = createFixture()

    try {
      writeRulesConfig(root, {
        ...ALL_RULES_OFF,
        'no-hardcoded-url': 'error',
      })
      writeScanFixture(root, {
        'api.ts': "fetch('https://api.example.com/x')",
      })

      const result = await runScan(root, makeScanFlags(), makeCapturingLogger().logger)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('no-hardcoded-url')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns exit 0 when warnings are within --max-warnings', async () => {
    const root = createFixture()

    try {
      writeRulesConfig(root, {
        ...ALL_RULES_OFF,
        'missing-error-handler': 'warning',
      })
      writeScanFixture(root, {
        'api.ts': "fetch('/x')",
      })

      const result = await runScan(
        root,
        makeScanFlags({ maxWarnings: 1 }),
        makeCapturingLogger().logger,
      )

      expect(result.exitCode).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns exit 1 when warnings exceed --max-warnings', async () => {
    const root = createFixture()

    try {
      writeRulesConfig(root, {
        ...ALL_RULES_OFF,
        'missing-error-handler': 'warning',
      })
      writeScanFixture(root, {
        'a.ts': "fetch('/one')",
        'b.ts': "fetch('/two')",
      })

      const result = await runScan(
        root,
        makeScanFlags({ maxWarnings: 0 }),
        makeCapturingLogger().logger,
      )

      expect(result.exitCode).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns valid JSON output when --format json is set', async () => {
    const root = createFixture()

    try {
      writeRulesConfig(root, ALL_RULES_OFF)
      writeScanFixture(root, {
        'api.ts': "fetch('/ok').catch(() => {})",
      })

      const result = await runScan(
        root,
        makeScanFlags({ format: 'json' }),
        makeCapturingLogger().logger,
      )

      expect(result.exitCode).toBe(0)
      expect(result.output).toBeDefined()

      const parsed = JSON.parse(result.output ?? '') as {
        version: string
        result: { findings: unknown[] }
      }
      expect(parsed.version).toBe('1')
      expect(Array.isArray(parsed.result.findings)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes output to --output file instead of returning stdout content', async () => {
    const root = createFixture()
    const outFile = join(root, 'results.txt')

    try {
      writeRulesConfig(root, ALL_RULES_OFF)
      writeScanFixture(root, {
        'api.ts': "fetch('/ok').catch(() => {})",
      })

      const result = await runScan(
        root,
        makeScanFlags({ output: outFile }),
        makeCapturingLogger().logger,
      )

      expect(result.exitCode).toBe(0)
      expect(result.output).toBeUndefined()
      expect(existsSync(outFile)).toBe(true)
      expect(readFileSync(outFile, 'utf8').length).toBeGreaterThan(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
