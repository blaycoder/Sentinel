/**
 * commands/scan.ts — the `sentinel scan` command.
 *
 * Validates the target path, loads config, runs the core scan engine,
 * formats output, and returns an exit code.
 *
 * Return codes:
 *   0  — scan completed; no error findings and max-warnings not exceeded
 *   1  — scan completed; error findings or warnings over --max-warnings
 *   2  — setup failure (invalid path, config load error)
 */

import { writeFileSync } from 'node:fs'

import { scan, Severity, type Logger, type ScanResult } from '@sentinel/core'

import type { ScanFlags } from '../args.js'
import { ConfigLoadError, loadConfig } from '../config/loader.js'
import { format } from '../formatters/index.js'
import { SENTINEL_VERSION } from '../help.js'
import { validateScanPath } from '../lib/validate-path.js'
import { makeConsoleLogger } from '../logger.js'

export interface ScanCommandResult {
  exitCode: 0 | 1 | 2
  /** Formatted scan output when writing to stdout (undefined if written to --output file). */
  output: string | undefined
}

/**
 * Compute CLI exit code from scan results.
 * Setup failures (exit 2) are handled before this runs.
 */
export function computeExitCode(result: ScanResult, maxWarnings: number): 0 | 1 {
  const errors = result.stats.findingsBySeverity[Severity.Error] ?? 0
  const warnings = result.stats.findingsBySeverity[Severity.Warning] ?? 0

  if (errors > 0) {
    return 1
  }

  if (maxWarnings >= 0 && warnings > maxWarnings) {
    return 1
  }

  return 0
}

export async function runScan(
  rawPath: string | undefined,
  flags: ScanFlags,
  logger?: Logger,
): Promise<ScanCommandResult> {
  const target = rawPath ?? process.cwd()
  const log = logger ?? makeConsoleLogger({ verbose: flags.verbose, noColor: flags.noColor })
  const validation = validateScanPath(target)

  if (!validation.ok) {
    log.error(validation.error.message)
    return { exitCode: 2, output: undefined }
  }

  const validatedPath = validation.value

  let loaded
  try {
    loaded = await loadConfig(validatedPath, flags.config)
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      log.error(error.message)
      return { exitCode: 2, output: undefined }
    }
    throw error
  }

  const rootDir = flags.rootDir ?? validatedPath
  const scanConfig = {
    ...loaded.config,
    rootDir,
    logger: log,
  }

  const result = await scan(scanConfig)

  const formatted = format(result, flags.format, {
    noColor: flags.noColor,
    repositoryRoot: rootDir,
    toolVersion: SENTINEL_VERSION,
  })

  if (flags.output !== undefined) {
    writeFileSync(flags.output, formatted, 'utf8')
    return {
      exitCode: computeExitCode(result, flags.maxWarnings),
      output: undefined,
    }
  }

  return {
    exitCode: computeExitCode(result, flags.maxWarnings),
    output: formatted,
  }
}

export async function scanCommand(
  positionals: string[],
  flags: ScanFlags,
): Promise<ScanCommandResult> {
  return runScan(positionals[0], flags)
}
