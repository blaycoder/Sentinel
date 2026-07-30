/**
 * commands/scan.ts — the `sentinel scan` command (stub).
 *
 * Validates the target path and logs a scanning message.
 * Actual scanning is wired in a later prompt.
 *
 * Return codes:
 *   0  — valid directory, ready to scan
 *   2  — setup error (invalid path)
 */

import type { Logger } from '@sentinel/core'

import type { ScanFlags } from '../args.js'
import { validateScanPath } from '../lib/validate-path.js'
import { makeConsoleLogger } from '../logger.js'

export interface ScanCommandResult {
  exitCode: 0 | 2
}

export function runScan(
  rawPath: string | undefined,
  flags: Pick<ScanFlags, 'verbose' | 'noColor'>,
  logger?: Logger,
): ScanCommandResult {
  const target = rawPath ?? process.cwd()
  const log = logger ?? makeConsoleLogger({ verbose: flags.verbose, noColor: flags.noColor })
  const validation = validateScanPath(target)

  if (!validation.ok) {
    log.error(validation.error.message)
    return { exitCode: 2 }
  }

  log.info('Scanning...')
  return { exitCode: 0 }
}

export function scanCommand(positionals: string[], flags: ScanFlags): ScanCommandResult {
  return runScan(positionals[0], flags)
}
