import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { Severity, type Finding } from '../model/finding.js'
import { JsonReporter, type FindingsJsonOutput } from './json-reporter.js'

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'missing-error-handler',
    message: 'fetch() call has no error handler',
    severity: Severity.Warning,
    location: {
      file: '/project/src/api.ts',
      line: 10,
      column: 3,
      endLine: 10,
      endColumn: 20,
    },
    apiCallId: 'call-1',
    code: 'sentinel/missing-error-handler/no-catch',
    url: 'https://sentinel.dev/rules/missing-error-handler',
    suggestion: undefined,
    ...overrides,
  }
}

function captureSink(): { sink: { write: (output: string) => void }; output: () => string } {
  let captured = ''
  return {
    sink: {
      write(output: string) {
        captured = output
      },
    },
    output: () => captured,
  }
}

describe('JsonReporter', () => {
  it('writes findings JSON envelope to sink', () => {
    const { sink, output } = captureSink()
    const finding = sampleFinding()
    const reporter = new JsonReporter({ sink })

    reporter.report([finding])

    const parsed = JSON.parse(output()) as FindingsJsonOutput
    expect(parsed.version).toBe('1')
    expect(typeof parsed.timestamp).toBe('string')
    expect(parsed.findings).toHaveLength(1)
    expect(parsed.findings[0]?.ruleId).toBe(finding.ruleId)
    expect(parsed.findings[0]?.message).toBe(finding.message)
    expect(parsed.findings[0]?.severity).toBe(Severity.Warning)
    expect(parsed.findings[0]?.location.file).toBe('/project/src/api.ts')
    expect(parsed.findings[0]?.apiCallId).toBe('call-1')
  })

  it('writes findings to a file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-json-reporter-'))
    const filePath = join(dir, 'findings.json')

    try {
      const reporter = new JsonReporter({ filePath })
      reporter.report([sampleFinding({ ruleId: 'no-hardcoded-url' })])

      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as FindingsJsonOutput
      expect(parsed.findings).toHaveLength(1)
      expect(parsed.findings[0]?.ruleId).toBe('no-hardcoded-url')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('outputs empty findings array', () => {
    const { sink, output } = captureSink()
    const reporter = new JsonReporter({ sink })

    reporter.report([])

    const parsed = JSON.parse(output()) as FindingsJsonOutput
    expect(parsed.findings).toEqual([])
  })

  it('pretty-prints JSON with newlines when pretty is true', () => {
    const { sink, output } = captureSink()
    const reporter = new JsonReporter({ sink, pretty: true })

    reporter.report([sampleFinding()])

    expect(output()).toContain('\n')
  })

  it('outputs compact JSON when pretty is false', () => {
    const { sink, output } = captureSink()
    const reporter = new JsonReporter({ sink, pretty: false })

    reporter.report([sampleFinding()])

    expect(output().split('\n')).toHaveLength(1)
  })

  it('throws when neither sink nor filePath is provided', () => {
    expect(() => new JsonReporter({})).toThrow(/sink or filePath/)
  })
})
