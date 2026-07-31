/**
 * syntactic-diagnostics.ts — retrieve parse/syntax diagnostics for a SourceFile.
 *
 * ts.createSourceFile does not throw on malformed syntax; diagnostics are only
 * available via a Program. This helper builds a minimal in-memory Program so
 * callers never need to re-read from disk.
 */

import * as ts from 'typescript'

/**
 * Return syntactic (parse) diagnostics for an in-memory SourceFile.
 *
 * Uses the public TS 5.x API: createProgram + getSyntacticDiagnostics.
 * SourceFile.parseDiagnostics exists internally but is not part of the stable surface.
 */
export function getSyntacticDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
  const options: ts.CompilerOptions = { noEmit: true, skipLibCheck: true }
  const host = ts.createCompilerHost(options)
  const fileName = sourceFile.fileName

  host.getSourceFile = (name, languageVersion, _onError, shouldCreateNewSourceFile) => {
    if (name === fileName) {
      return sourceFile
    }
    return shouldCreateNewSourceFile ? ts.createSourceFile(name, '', languageVersion) : undefined
  }
  host.fileExists = (name) => name === fileName
  host.readFile = () => undefined

  const program = ts.createProgram([fileName], options, host)
  return program.getSyntacticDiagnostics(sourceFile)
}

/**
 * Format a TS diagnostic as a human-readable message with optional line:column.
 */
export function formatSyntacticDiagnosticMessage(
  diagnostic: ts.Diagnostic,
  sourceFile: ts.SourceFile,
): string {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

  if (diagnostic.start === undefined) {
    return text
  }

  const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
  return `${String(line + 1)}:${String(character + 1)} — ${text}`
}
