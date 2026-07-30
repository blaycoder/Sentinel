/**
 * formatters/text.ts — human-readable terminal output formatter.
 *
 * Converts a ScanResult to a coloured, structured terminal string.
 * No runtime deps — ANSI colour codes are hand-rolled constants.
 *
 * This is a pure function: (result, options) => string
 * All console output decisions (stdout vs stderr, newlines) are made
 * by the caller, not this module.
 */

import type { Finding, ScanResult } from '@sentinel/core'
import { Severity } from '@sentinel/core'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TextFormatterOptions {
  /** Disable ANSI colour codes (for non-TTY output or --no-color flag). */
  noColor?: boolean
  /** Show detailed stats at the end. */
  showStats?: boolean
}

// ─── ANSI Codes ───────────────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
} as const

const SEVERITY_ICONS: Record<string, string> = {
  [Severity.Error]: '✖',
  [Severity.Warning]: '⚠',
  [Severity.Info]: 'ℹ',
  [Severity.Hint]: '◈',
}

const SEVERITY_COLORS: Record<string, string> = {
  [Severity.Error]: ANSI.red,
  [Severity.Warning]: ANSI.yellow,
  [Severity.Info]: ANSI.blue,
  [Severity.Hint]: ANSI.gray,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Format a ScanResult as a human-readable terminal string.
 *
 * @param result  The scan result to format.
 * @param options Formatting options (color, stats).
 * @returns       A multi-line string ready to write to stdout.
 */
export function formatText(result: ScanResult, options: TextFormatterOptions = {}): string {
  const { noColor = false, showStats = true } = options
  const c = noColor ? noopColors() : colors()

  const lines: string[] = []

  if (result.findings.length === 0 && result.diagnostics.length === 0) {
    lines.push(c.green('✔ No findings. Your API calls look clean.'))
  } else {
    // Group findings by file
    const byFile = groupByFile(result.findings)

    for (const [file, fileFindings] of byFile) {
      lines.push('')
      lines.push(c.bold(c.white(file)))

      for (const finding of fileFindings) {
        lines.push(formatFinding(finding, c))
      }
    }

    // Non-fatal scan diagnostics
    if (result.diagnostics.length > 0) {
      lines.push('')
      lines.push(c.dim('── Scan diagnostics ─────────────────────────────'))
      for (const diag of result.diagnostics) {
        const prefix = diag.kind === 'parse-error' ? c.red('parse error') : c.yellow(diag.kind)
        const file = diag.file ? ` ${c.dim(diag.file)}` : ''
        lines.push(`  ${prefix}${file}: ${diag.message}`)
      }
    }
  }

  if (showStats) {
    lines.push('')
    lines.push(formatStats(result, c))
  }

  return lines.join('\n').trimStart()
}

// ─── Internals ────────────────────────────────────────────────────────────────

function formatFinding(finding: Finding, c: ReturnType<typeof colors>): string {
  const icon = SEVERITY_ICONS[finding.severity] ?? '?'
  const colorFn = SEVERITY_COLORS[finding.severity]
  const colorize = (s: string) => (colorFn ? `${colorFn}${s}${ANSI.reset}` : s)

  const location = c.dim(`${String(finding.location.line)}:${String(finding.location.column)}`)
  const ruleId = c.dim(`(${finding.ruleId})`)
  const message = finding.message

  let line = `  ${colorize(icon)} ${location}  ${message}  ${ruleId}`

  if (finding.suggestion) {
    const suggestion = finding.suggestion
      .split('\n')
      .map((l, i) => (i === 0 ? `    ${c.dim('→')} ${l}` : `      ${l}`))
      .join('\n')
    line += `\n${c.dim(suggestion)}`
  }

  return line
}

function formatStats(result: ScanResult, c: ReturnType<typeof colors>): string {
  const { stats } = result
  const errors = stats.findingsBySeverity[Severity.Error] ?? 0
  const warnings = stats.findingsBySeverity[Severity.Warning] ?? 0
  const total = stats.findingsCount

  const parts: string[] = [
    `${String(stats.filesScanned)} file${stats.filesScanned !== 1 ? 's' : ''} scanned`,
    `${String(stats.apiCallsFound)} API call${stats.apiCallsFound !== 1 ? 's' : ''} found`,
    c.dim(`${String(stats.durationMs)}ms`),
  ]

  const summary = parts.join(c.dim(' · '))

  if (total === 0) {
    return `${c.green('✔')} ${summary}`
  }

  const errorStr = errors > 0 ? c.red(`${String(errors)} error${errors !== 1 ? 's' : ''}`) : ''
  const warnStr =
    warnings > 0 ? c.yellow(`${String(warnings)} warning${warnings !== 1 ? 's' : ''}`) : ''
  const counts = [errorStr, warnStr].filter(Boolean).join(', ')

  return `${counts}  ${c.dim(summary)}`
}

function groupByFile(findings: readonly Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>()

  for (const finding of findings) {
    const file = finding.location.file
    const existing = map.get(file)
    if (existing !== undefined) {
      existing.push(finding)
    } else {
      map.set(file, [finding])
    }
  }

  return map
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function colors() {
  return {
    reset: (s: string) => `${ANSI.reset}${s}${ANSI.reset}`,
    bold: (s: string) => `${ANSI.bold}${s}${ANSI.reset}`,
    dim: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
    red: (s: string) => `${ANSI.red}${s}${ANSI.reset}`,
    yellow: (s: string) => `${ANSI.yellow}${s}${ANSI.reset}`,
    blue: (s: string) => `${ANSI.blue}${s}${ANSI.reset}`,
    cyan: (s: string) => `${ANSI.cyan}${s}${ANSI.reset}`,
    green: (s: string) => `${ANSI.green}${s}${ANSI.reset}`,
    gray: (s: string) => `${ANSI.gray}${s}${ANSI.reset}`,
    white: (s: string) => `${ANSI.white}${s}${ANSI.reset}`,
  }
}

function noopColors(): ReturnType<typeof colors> {
  const identity = (s: string) => s
  return {
    reset: identity,
    bold: identity,
    dim: identity,
    red: identity,
    yellow: identity,
    blue: identity,
    cyan: identity,
    green: identity,
    gray: identity,
    white: identity,
  }
}
