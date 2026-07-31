import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  formatSyntacticDiagnosticMessage,
  getSyntacticDiagnostics,
} from './syntactic-diagnostics.js'

describe('getSyntacticDiagnostics', () => {
  it('returns diagnostics for malformed syntax', () => {
    const sourceFile = ts.createSourceFile(
      'broken.ts',
      'const x = {{{\nfetch("/ok")\n',
      ts.ScriptTarget.Latest,
      true,
    )

    const diagnostics = getSyntacticDiagnostics(sourceFile)

    expect(diagnostics.length).toBeGreaterThan(0)
  })

  it('returns no diagnostics for valid syntax', () => {
    const sourceFile = ts.createSourceFile('valid.ts', "fetch('/ok')", ts.ScriptTarget.Latest, true)

    const diagnostics = getSyntacticDiagnostics(sourceFile)

    expect(diagnostics).toHaveLength(0)
  })

  it('formats diagnostic messages with line and column', () => {
    const sourceFile = ts.createSourceFile(
      'broken.ts',
      'const x = {{{',
      ts.ScriptTarget.Latest,
      true,
    )
    const diagnostics = getSyntacticDiagnostics(sourceFile)

    expect(diagnostics.length).toBeGreaterThan(0)
    const message = formatSyntacticDiagnosticMessage(diagnostics[0]!, sourceFile)
    expect(message).toMatch(/^\d+:\d+ — /)
  })
})
