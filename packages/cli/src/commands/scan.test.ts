import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Logger } from '@sentinel/core'
import { describe, expect, it } from 'vitest'

import { runScan } from './scan.js'

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

const defaultFlags = { verbose: false, noColor: true }

describe('runScan', () => {
  it('logs Scanning... and exits 0 for a valid directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-scan-'))
    const { logger, entries } = makeCapturingLogger()

    try {
      const result = runScan(dir, defaultFlags, logger)

      expect(result.exitCode).toBe(0)
      expect(entries.some((e) => e.level === 'info' && e.message === 'Scanning...')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns exit 2 and logs error for a nonexistent path', () => {
    const missing = join(tmpdir(), 'sentinel-missing-path-xyz')
    const { logger, entries } = makeCapturingLogger()

    const result = runScan(missing, defaultFlags, logger)

    expect(result.exitCode).toBe(2)
    expect(entries.some((e) => e.level === 'error' && e.message.includes('does not exist'))).toBe(
      true,
    )
  })

  it('returns exit 2 and logs error when path exists but is a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-scan-'))
    const file = join(dir, 'not-a-dir.txt')
    writeFileSync(file, 'hello')
    const { logger, entries } = makeCapturingLogger()

    try {
      const result = runScan(file, defaultFlags, logger)

      expect(result.exitCode).toBe(2)
      expect(
        entries.some((e) => e.level === 'error' && e.message.includes('not a directory')),
      ).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('defaults to cwd when path is omitted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-scan-'))
    const originalCwd = process.cwd()
    const { logger, entries } = makeCapturingLogger()

    try {
      process.chdir(dir)
      const result = runScan(undefined, defaultFlags, logger)

      expect(result.exitCode).toBe(0)
      expect(entries.some((e) => e.level === 'info' && e.message === 'Scanning...')).toBe(true)
    } finally {
      process.chdir(originalCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
