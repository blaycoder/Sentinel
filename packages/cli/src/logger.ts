/**
 * logger.ts — Console logger implementation for the CLI.
 *
 * This is the only place in the CLI that implements the Logger interface
 * from @sentinel-scan/core. It writes to stderr (for info/debug/warn/error)
 * so that stdout remains clean for scan output.
 *
 * Color is applied inline (hand-rolled ANSI) for consistency with the
 * text formatter — no chalk dependency.
 */

import type { Logger } from '@sentinel-scan/core'

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const

export interface ConsoleLoggerOptions {
  verbose: boolean
  noColor: boolean
}

export function makeConsoleLogger(options: ConsoleLoggerOptions): Logger {
  const { verbose, noColor } = options

  const c = noColor
    ? {
        dim: (s: string) => s,
        red: (s: string) => s,
        yellow: (s: string) => s,
        cyan: (s: string) => s,
      }
    : {
        dim: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
        red: (s: string) => `${ANSI.red}${s}${ANSI.reset}`,
        yellow: (s: string) => `${ANSI.yellow}${s}${ANSI.reset}`,
        cyan: (s: string) => `${ANSI.cyan}${s}${ANSI.reset}`,
      }

  return {
    debug(message, meta) {
      if (!verbose) return
      process.stderr.write(c.dim(`[debug] ${message}${formatMeta(meta)}\n`))
    },
    info(message, _meta) {
      process.stderr.write(`${message}\n`)
    },
    warn(message, meta) {
      process.stderr.write(c.yellow(`[warn] ${message}${formatMeta(meta)}\n`))
    },
    error(message, meta) {
      process.stderr.write(c.red(`[error] ${message}${formatMeta(meta)}\n`))
    },
  }
}

function formatMeta(meta: Record<string, unknown> | undefined): string {
  if (meta === undefined || Object.keys(meta).length === 0) return ''
  return ` ${JSON.stringify(meta)}`
}
