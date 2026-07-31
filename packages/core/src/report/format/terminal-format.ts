/**
 * terminal-format.ts — pure Finding[] → terminal string formatting.
 *
 * Grouping is by file so developers can fix all issues in one file at a time.
 * Severity is shown per line via icon and colour, not as top-level sections.
 */

import type { Finding } from '../../model/finding.js'

import {
  ANSI,
  colors,
  noopColors,
  SEVERITY_COLORS,
  SEVERITY_ICONS,
  type TerminalColors,
} from './terminal-colors.js'

export interface TerminalFormatOptions {
  noColor?: boolean
}

/**
 * Format findings as human-readable terminal output.
 * Pure function — no I/O.
 *
 * Returns an empty string when there are no findings (caller may append diagnostics).
 */
export function formatFindingsTerminal(
  findings: readonly Finding[],
  options: TerminalFormatOptions = {},
): string {
  const { noColor = false } = options
  const c = noColor ? noopColors() : colors()

  if (findings.length === 0) {
    return ''
  }

  const lines: string[] = []

  for (const [file, fileFindings] of groupByFile(findings)) {
    lines.push('')
    lines.push(c.bold(c.white(file)))

    for (const finding of fileFindings) {
      lines.push(formatFindingLine(finding, c, noColor))
    }
  }

  return lines.join('\n').trimStart()
}

function formatFindingLine(finding: Finding, c: TerminalColors, noColor: boolean): string {
  const icon = SEVERITY_ICONS[finding.severity] ?? '?'
  const colorFn = noColor ? undefined : SEVERITY_COLORS[finding.severity]
  const colorize = (s: string) => (colorFn !== undefined ? `${colorFn}${s}${ANSI.reset}` : s)

  const location = c.dim(`${String(finding.location.line)}:${String(finding.location.column)}`)
  const ruleId = c.dim(`(${finding.ruleId})`)

  let line = `  ${colorize(icon)} ${location}  ${finding.message}  ${ruleId}`

  if (finding.suggestion !== undefined) {
    const suggestion = finding.suggestion
      .split('\n')
      .map((l, i) => (i === 0 ? `    ${c.dim('→')} ${l}` : `      ${l}`))
      .join('\n')
    line += `\n${c.dim(suggestion)}`
  }

  return line
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
