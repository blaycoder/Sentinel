/**
 * ScanResult, ScanConfig, and ScanDiagnostic — the top-level scan contract.
 *
 * ScanConfig is what consumers pass in. ScanResult is what scan() returns.
 * Both shapes are frozen: changes require a major version bump.
 */

import type { ApiCall } from './api-call.js'
import type { Finding, Severity } from './finding.js'
import type { Logger } from './logger.js'

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Configuration for a single scan invocation.
 * Matches the shape of `sentinel.config.ts`.
 */
export interface ScanConfig {
  /**
   * Glob patterns of files to include.
   * Relative to `rootDir`.
   * @default ['**\/*.{ts,tsx,js,jsx}']
   */
  readonly include: readonly string[]

  /**
   * Glob patterns of files to exclude.
   * @default ['**\/node_modules\/**', '**\/dist\/**', '**\/*.test.ts', '**\/*.spec.ts']
   */
  readonly exclude: readonly string[]

  /**
   * The root directory to scan. All relative paths are resolved from here.
   * @default process.cwd()
   */
  readonly rootDir: string

  /**
   * Rules to enable and their severities.
   * Rule ID → severity or 'off'.
   */
  readonly rules: Readonly<Record<string, Severity | 'off'>>

  /**
   * Optional path to the project's tsconfig.json.
   * Used for path alias resolution.
   * @default '<rootDir>/tsconfig.json'
   */
  readonly tsConfigPath: string | undefined

  /**
   * Optional base URL to prepend to relative API paths.
   * If set, resolvedUrl in ApiCall will include this prefix.
   */
  readonly baseUrl: string | undefined

  /** Logger to use during the scan. If omitted, noopLogger is used. */
  readonly logger: Logger | undefined
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/** The category of a scan-level diagnostic (not a rule finding). */
export type ScanDiagnosticKind =
  | 'parse-error' // File could not be parsed
  | 'resolve-error' // Import or alias could not be resolved
  | 'config-warning' // Non-fatal config issue
  | 'unsupported-syntax' // Syntax the extractor doesn't handle yet

/**
 * A non-fatal diagnostic about the scan process itself (not a rule violation).
 * Parse failures for individual files are reported here rather than aborting
 * the entire scan.
 */
export interface ScanDiagnostic {
  readonly kind: ScanDiagnosticKind
  readonly message: string
  /** The file that triggered this diagnostic, if applicable. */
  readonly file: string | undefined
  /** The underlying error, if one was caught. */
  readonly cause: Error | undefined
}

// ─── Result ──────────────────────────────────────────────────────────────────

/** The complete output of a `scan()` invocation. */
export interface ScanResult {
  /** All API call sites extracted from the scanned files. */
  readonly apiCalls: readonly ApiCall[]

  /** All findings produced by enabled rules. */
  readonly findings: readonly Finding[]

  /** Non-fatal diagnostics about the scan process (parse errors, skipped files). */
  readonly diagnostics: readonly ScanDiagnostic[]

  /** Summary statistics. */
  readonly stats: ScanStats
}

export interface ScanStats {
  /** Total number of files scanned. */
  readonly filesScanned: number
  /** Number of files that could not be parsed. */
  readonly filesErrored: number
  /** Total number of API call sites found. */
  readonly apiCallsFound: number
  /** Total number of findings produced. */
  readonly findingsCount: number
  /** Breakdown of findings by severity. */
  readonly findingsBySeverity: Readonly<Record<string, number>>
  /** Wall-clock time of the scan in milliseconds. */
  readonly durationMs: number
}

// ─── User-facing config type ─────────────────────────────────────────────────

/**
 * The type for `sentinel.config.ts` — a partial ScanConfig that users write.
 * The runner merges this with defaults before passing to scan().
 *
 * Exported from the public API so users can get type safety on their config file:
 *   import type { SentinelConfig } from '@sentinel/core'
 *   export default { ... } satisfies SentinelConfig
 */
export type SentinelConfig = Partial<Omit<ScanConfig, 'logger'>>
