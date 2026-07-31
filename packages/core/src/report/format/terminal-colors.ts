/**
 * terminal-colors.ts — centralized ANSI helpers for terminal finding output.
 */

import { Severity } from '../../model/finding.js'

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
} as const

export const SEVERITY_ICONS: Record<string, string> = {
  [Severity.Error]: '✖',
  [Severity.Warning]: '⚠',
  [Severity.Info]: 'ℹ',
  [Severity.Hint]: '◈',
}

export const SEVERITY_COLORS: Record<string, string> = {
  [Severity.Error]: ANSI.red,
  [Severity.Warning]: ANSI.yellow,
  [Severity.Info]: ANSI.blue,
  [Severity.Hint]: ANSI.gray,
}

export type TerminalColors = ReturnType<typeof colors>

export function colors() {
  return {
    bold: (s: string) => `${ANSI.bold}${s}${ANSI.reset}`,
    dim: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
    red: (s: string) => `${ANSI.red}${s}${ANSI.reset}`,
    yellow: (s: string) => `${ANSI.yellow}${s}${ANSI.reset}`,
    blue: (s: string) => `${ANSI.blue}${s}${ANSI.reset}`,
    green: (s: string) => `${ANSI.green}${s}${ANSI.reset}`,
    gray: (s: string) => `${ANSI.gray}${s}${ANSI.reset}`,
    white: (s: string) => `${ANSI.white}${s}${ANSI.reset}`,
  }
}

export function noopColors(): TerminalColors {
  const identity = (s: string) => s
  return {
    bold: identity,
    dim: identity,
    red: identity,
    yellow: identity,
    blue: identity,
    green: identity,
    gray: identity,
    white: identity,
  }
}
