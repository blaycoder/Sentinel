import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { err, ok } from '../model/result.js'
import { Severity } from '../model/finding.js'
import * as fileReader from '../parse/file-reader.js'
import { FileReaderError } from '../parse/file-reader.js'
import { missingErrorHandler } from '../rules/missing-error-handler.js'
import { resolveConfig, scan } from './scanner.js'

function createFixture(): string {
  return mkdtempSync(join(tmpdir(), 'sentinel-scanner-'))
}

function writeScanFixture(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content, 'utf8')
  }
}

describe('scan', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('continues scanning when one file fails to read and emits parse-error', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'good.ts': "fetch('/ok')",
        'bad.ts': "fetch('/bad')",
      })

      const badPath = resolve(root, 'bad.ts')
      const readSpy = vi.spyOn(fileReader, 'readFileContent')
      readSpy.mockImplementation(async (path) => {
        if (resolve(path) === badPath) {
          return err(new FileReaderError(`Could not read file: ${path}`, new Error('EACCES')))
        }
        try {
          return ok(await readFile(path, 'utf-8'))
        } catch (cause) {
          return err(new FileReaderError(`Could not read file: ${path}`, cause))
        }
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          rules: { 'missing-error-handler': Severity.Warning, 'no-hardcoded-url': 'off' },
        }),
      )

      expect(readSpy).toHaveBeenCalled()
      expect(result.stats.filesErrored).toBe(1)
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'parse-error',
            file: badPath,
          }),
        ]),
      )
      expect(result.apiCalls.some((call) => call.url === '/ok')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('emits unsupported-syntax for malformed files and still extracts partial calls', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'broken.ts': "fetch('/partial')\nconst x = {{{\n",
        'valid.ts': "fetch('/ok')",
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          rules: { 'missing-error-handler': 'off', 'no-hardcoded-url': 'off' },
        }),
      )

      const brokenPath = join(root, 'broken.ts')
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'unsupported-syntax',
            file: brokenPath,
            message: expect.stringContaining('Results for this file may be incomplete.'),
          }),
        ]),
      )
      expect(result.apiCalls.some((call) => call.url === '/partial')).toBe(true)
      expect(result.apiCalls.some((call) => call.url === '/ok')).toBe(true)
      expect(result.stats.filesErrored).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('emits rule-error (not parse-error) when a rule throws', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'api.ts': "fetch('/users')",
      })

      vi.spyOn(missingErrorHandler, 'check').mockImplementation(() => {
        throw new Error('rule boom')
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          rules: { 'missing-error-handler': Severity.Warning, 'no-hardcoded-url': 'off' },
        }),
      )

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'rule-error',
            message: expect.stringContaining('rule boom'),
          }),
        ]),
      )
      expect(result.diagnostics.some((d) => d.kind === 'parse-error')).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('never throws for domain-level errors across combined failure modes', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'good.ts': "fetch('/ok')",
        'bad.ts': "fetch('/bad')",
        'broken.ts': "fetch('/partial')\nconst x = {{{\n",
        'api.ts': "fetch('/users')",
      })

      const badPath = resolve(root, 'bad.ts')
      const readSpy = vi.spyOn(fileReader, 'readFileContent')
      readSpy.mockImplementation(async (path) => {
        if (resolve(path) === badPath) {
          return err(new FileReaderError(`Could not read file: ${path}`, new Error('ENOENT')))
        }
        try {
          return ok(await readFile(path, 'utf-8'))
        } catch (cause) {
          return err(new FileReaderError(`Could not read file: ${path}`, cause))
        }
      })

      vi.spyOn(missingErrorHandler, 'check').mockImplementation(() => {
        throw new Error('rule boom')
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          rules: { 'missing-error-handler': Severity.Warning, 'no-hardcoded-url': 'off' },
        }),
      )

      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics.some((d) => d.kind === 'parse-error')).toBe(true)
      expect(result.diagnostics.some((d) => d.kind === 'unsupported-syntax')).toBe(true)
      expect(result.diagnostics.some((d) => d.kind === 'rule-error')).toBe(true)
      expect(result.apiCalls.some((call) => call.url === '/ok')).toBe(true)
      expect(result.apiCalls.some((call) => call.url === '/partial')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('respects include patterns and excludes files outside them', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'src/in-scope.ts': "fetch('/in')",
        'lib/out-of-scope.ts': "fetch('/out')",
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          include: ['src/**'],
          rules: { 'missing-error-handler': 'off', 'no-hardcoded-url': 'off' },
        }),
      )

      expect(result.stats.filesScanned).toBe(1)
      expect(result.apiCalls.some((call) => call.url === '/in')).toBe(true)
      expect(result.apiCalls.some((call) => call.url === '/out')).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('discovers and scans .mts files with default include config', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'api.mts': "fetch('/mts')",
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          rules: { 'missing-error-handler': 'off', 'no-hardcoded-url': 'off' },
        }),
      )

      expect(result.apiCalls.some((call) => call.url === '/mts')).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
