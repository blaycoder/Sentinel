/**
 * diagnostic-format.ts — pure ScanDiagnostic[] → terminal string formatting.
 */

import type { ScanDiagnostic, ScanDiagnosticKind } from '../../model/scan-result.js'

import { ANSI, colors, noopColors, type TerminalColors } from './terminal-colors.js'

export interface DiagnosticFormatOptions {
  noColor?: boolean
}

const ERROR_KINDS = new Set<ScanDiagnosticKind>(['parse-error', 'rule-error'])

/**
 * Format scan-level diagnostics as a terminal section.
 * Pure function — no I/O.
 */
export function formatScanDiagnosticsTerminal(
  diagnostics: readonly ScanDiagnostic[],
  options: DiagnosticFormatOptions = {},
): string {
  if (diagnostics.length === 0) {
    return ''
  }

  const { noColor = false } = options
  const c = noColor ? noopColors() : colors()
  const lines: string[] = []

  lines.push('')
  lines.push(c.dim('── Scan diagnostics ─────────────────────────────'))

  for (const diag of diagnostics) {
    lines.push(formatDiagnosticLine(diag, c, noColor))
  }

  return lines.join('\n')
}

function formatDiagnosticLine(diag: ScanDiagnostic, c: TerminalColors, noColor: boolean): string {
  const label = formatKindLabel(diag.kind, c, noColor)
  const file = diag.file !== undefined ? ` ${c.dim(diag.file)}` : ''
  return `  ${label}${file}: ${diag.message}`
}

function formatKindLabel(kind: ScanDiagnosticKind, c: TerminalColors, noColor: boolean): string {
  const display = kindLabel(kind)
  if (noColor) {
    return display
  }
  if (ERROR_KINDS.has(kind)) {
    return `${ANSI.red}${display}${ANSI.reset}`
  }
  return `${ANSI.yellow}${display}${ANSI.reset}`
}

function kindLabel(kind: ScanDiagnosticKind): string {
  switch (kind) {
    case 'parse-error':
      return 'parse error'
    case 'rule-error':
      return 'rule error'
    case 'unsupported-syntax':
      return 'unsupported syntax'
    default:
      return kind
  }
}

/**
 * Compose findings output with an optional diagnostics section.
 */
export function formatReportTerminal(
  findingsOutput: string,
  diagnostics: readonly ScanDiagnostic[],
  options: DiagnosticFormatOptions = {},
): string {
  const diagnosticsOutput = formatScanDiagnosticsTerminal(diagnostics, options)

  if (findingsOutput.length === 0 && diagnosticsOutput.length === 0) {
    const c = options.noColor === true ? noopColors() : colors()
    return c.green('✔ No findings.')
  }

  if (findingsOutput.length === 0) {
    return diagnosticsOutput.trimStart()
  }

  if (diagnosticsOutput.length === 0) {
    return findingsOutput
  }

  return `${findingsOutput}${diagnosticsOutput}`
}
