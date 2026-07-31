import { describe, expect, it } from 'vitest'

import { Severity, type Finding } from '../model/finding.js'
import { TerminalReporter } from './terminal-reporter.js'

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

describe('TerminalReporter', () => {
  it('reports no findings message for empty input', () => {
    const { sink, output } = captureSink()
    const reporter = new TerminalReporter({ sink })

    reporter.report([])

    expect(output()).toContain('No findings')
  })

  it('includes ruleId, message, file path, and line:column for a finding', () => {
    const { sink, output } = captureSink()
    const reporter = new TerminalReporter({ sink })
    const finding = sampleFinding()

    reporter.report([finding])

    const text = output()
    expect(text).toContain(finding.ruleId)
    expect(text).toContain(finding.message)
    expect(text).toContain(finding.location.file)
    expect(text).toContain('10:3')
    expect(text).toContain('⚠')
  })

  it('groups findings by file', () => {
    const { sink, output } = captureSink()
    const reporter = new TerminalReporter({ sink })

    reporter.report([
      sampleFinding({
        location: {
          file: '/project/src/a.ts',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 5,
        },
      }),
      sampleFinding({
        ruleId: 'no-hardcoded-url',
        message: 'Hardcoded URL detected',
        severity: Severity.Error,
        location: {
          file: '/project/src/b.ts',
          line: 2,
          column: 4,
          endLine: 2,
          endColumn: 8,
        },
      }),
    ])

    const text = output()
    expect(text).toContain('/project/src/a.ts')
    expect(text).toContain('/project/src/b.ts')
    expect(text).toContain('missing-error-handler')
    expect(text).toContain('no-hardcoded-url')
  })

  it('omits ANSI escape codes when noColor is true', () => {
    const { sink, output } = captureSink()
    const reporter = new TerminalReporter({ sink, noColor: true })

    reporter.report([sampleFinding()])

    const text = output()
    expect(text).toContain('fetch() call has no error handler')
    expect(text).not.toMatch(/\x1b\[/)
  })

  it('includes suggestion text when present', () => {
    const { sink, output } = captureSink()
    const reporter = new TerminalReporter({ sink })

    reporter.report([
      sampleFinding({
        suggestion: 'Wrap in try/catch:\n  try {',
      }),
    ])

    const text = output()
    expect(text).toContain('Wrap in try/catch')
    expect(text).toContain('try {')
  })
})
