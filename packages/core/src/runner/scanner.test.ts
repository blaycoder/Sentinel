import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_CONTRACT_MISMATCH_RULE_ID } from '../contract/contract-check.js'
import { err, ok } from '../model/result.js'
import { Severity } from '../model/finding.js'
import * as fileReader from '../parse/file-reader.js'
import { FileReaderError } from '../parse/file-reader.js'
import { missingErrorHandler } from '../rules/missing-error-handler.js'
import { DEFAULT_SCAN_CONFIG, resolveConfig, scan } from './scanner.js'

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

function writeOpenApiSpec(root: string, fileName: string, spec: unknown): string {
  const filePath = join(root, fileName)
  writeFileSync(filePath, JSON.stringify(spec), 'utf8')
  return filePath
}

const OFF_RULES = {
  'missing-error-handler': 'off' as const,
  'no-hardcoded-url': 'off' as const,
  'api-contract-mismatch': Severity.Error,
}

function usersPostSpec(): unknown {
  return {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1.0.0' },
    paths: {
      '/users': {
        post: {
          operationId: 'createUser',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    age: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

function usersGetSpec(): unknown {
  return {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          operationId: 'listUsers',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

describe('resolveConfig', () => {
  it('uses default exclude when exclude is omitted', () => {
    const config = resolveConfig({ rootDir: '/tmp' })
    expect(config.exclude).toEqual(DEFAULT_SCAN_CONFIG.exclude)
    expect(config.exclude).toHaveLength(15)
  })

  it('merges user exclude patterns onto defaults', () => {
    const config = resolveConfig({
      rootDir: '/tmp',
      exclude: ['generated/**'],
    })

    expect(config.exclude).toContain('**/node_modules/**')
    expect(config.exclude).toContain('**/*.min.js')
    expect(config.exclude).toContain('**/*.d.ts')
    expect(config.exclude).toContain('**/vendor/**')
    expect(config.exclude).toContain('generated/**')
  })

  it('deduplicates exclude patterns when user repeats a default', () => {
    const config = resolveConfig({
      rootDir: '/tmp',
      exclude: ['**/node_modules/**'],
    })

    const nodeModulesCount = config.exclude.filter((p) => p === '**/node_modules/**').length
    expect(nodeModulesCount).toBe(1)
  })

  it('replaces include when user provides include (does not merge)', () => {
    const config = resolveConfig({
      rootDir: '/tmp',
      include: ['src/**'],
    })

    expect(config.include).toEqual(['src/**'])
  })
})

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

  it('excludes minified vendor lib files and vendor dirs by default', async () => {
    const root = createFixture()

    try {
      writeScanFixture(root, {
        'src/assets/js/lib/apexcharts.min.js': "fetch('https://cdn.example.com')",
        'src/assets/js/lib/bootstrap.bundle.min.js': "fetch('/noise')",
        'vendor/jquery/index.js': "fetch('/vendor')",
        'src/lib/utils.ts': "fetch('/lib-utils')",
        'src/app.ts': "fetch('/real')",
      })

      const result = await scan(
        resolveConfig({
          rootDir: root,
          rules: { 'missing-error-handler': 'off', 'no-hardcoded-url': 'off' },
        }),
      )

      expect(result.stats.filesScanned).toBe(2)
      expect(result.apiCalls.some((call) => call.url === '/real')).toBe(true)
      expect(result.apiCalls.some((call) => call.url === '/lib-utils')).toBe(true)
      expect(result.apiCalls.some((call) => call.url === '/noise')).toBe(false)
      expect(result.apiCalls.some((call) => call.url === '/vendor')).toBe(false)
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

  describe('contract checking', () => {
    it('produces no contract findings when contractSource is unset', async () => {
      const root = createFixture()

      try {
        writeOpenApiSpec(root, 'api.json', usersPostSpec())
        writeScanFixture(root, {
          'api.ts': "axios.post('/users', { name: 'Alice' })",
        })

        const result = await scan(
          resolveConfig({
            rootDir: root,
            rules: OFF_RULES,
          }),
        )

        expect(
          result.findings.filter((f) => f.ruleId === API_CONTRACT_MISMATCH_RULE_ID),
        ).toHaveLength(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('produces api-contract-mismatch findings for body-shape discrepancies', async () => {
      const root = createFixture()

      try {
        writeOpenApiSpec(root, 'api.json', usersPostSpec())
        const apiPath = join(root, 'api.ts')
        writeScanFixture(root, {
          'api.ts': "axios.post('/users', { age: 1 })",
        })

        const result = await scan(
          resolveConfig({
            rootDir: root,
            contractSource: 'api.json',
            rules: OFF_RULES,
          }),
        )

        const contractFindings = result.findings.filter(
          (f) => f.ruleId === API_CONTRACT_MISMATCH_RULE_ID,
        )
        expect(contractFindings).toHaveLength(1)
        expect(contractFindings[0]?.message).toContain("Missing required field 'name'")
        expect(contractFindings[0]?.message).toContain('POST /users')
        expect(resolve(contractFindings[0]?.location.file ?? '')).toBe(resolve(apiPath))
        expect(contractFindings[0]?.location.line).toBeGreaterThan(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('emits config-warning and no contract findings when the spec file is missing', async () => {
      const root = createFixture()

      try {
        writeScanFixture(root, {
          'api.ts': "axios.post('/users', { name: 'Alice' })",
        })

        const result = await scan(
          resolveConfig({
            rootDir: root,
            contractSource: 'missing.json',
            rules: OFF_RULES,
          }),
        )

        expect(result.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: 'config-warning',
              message: expect.stringContaining('Could not parse OpenAPI spec'),
            }),
          ]),
        )
        expect(
          result.findings.filter((f) => f.ruleId === API_CONTRACT_MISMATCH_RULE_ID),
        ).toHaveLength(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('produces no findings for unmatched calls', async () => {
      const root = createFixture()

      try {
        writeOpenApiSpec(root, 'api.json', usersGetSpec())
        writeScanFixture(root, {
          'api.ts': "fetch('/nope')",
        })

        const result = await scan(
          resolveConfig({
            rootDir: root,
            contractSource: 'api.json',
            rules: OFF_RULES,
          }),
        )

        expect(
          result.findings.filter((f) => f.ruleId === API_CONTRACT_MISMATCH_RULE_ID),
        ).toHaveLength(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('produces one finding per discrepancy for a call with multiple issues', async () => {
      const root = createFixture()

      try {
        writeOpenApiSpec(root, 'api.json', usersPostSpec())
        writeScanFixture(root, {
          'api.ts': "axios.post('/users', { extra: true, age: 'bad' })",
        })

        const result = await scan(
          resolveConfig({
            rootDir: root,
            contractSource: 'api.json',
            rules: OFF_RULES,
          }),
        )

        const contractFindings = result.findings.filter(
          (f) => f.ruleId === API_CONTRACT_MISMATCH_RULE_ID,
        )
        expect(contractFindings.length).toBeGreaterThanOrEqual(2)

        const apiCallIds = new Set(contractFindings.map((f) => f.apiCallId))
        expect(apiCallIds.size).toBe(1)

        const messages = contractFindings.map((f) => f.message)
        expect(messages.some((m) => m.includes("Missing required field 'name'"))).toBe(true)
        expect(messages.some((m) => m.includes("Unexpected field 'extra'"))).toBe(true)
        expect(messages.some((m) => m.includes("Field 'age'"))).toBe(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })
})
