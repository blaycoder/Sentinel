/**
 * reporter.ts — shared contract for formatting and emitting Finding[] output.
 *
 * Reporters consume rule findings (issues), not raw ApiCall inventory.
 * Callers inject a ReportSink so output destination stays outside the engine.
 */

import type { Finding } from '../model/finding.js'
import type { ScanDiagnostic } from '../model/scan-result.js'

/** Destination for a single formatted report payload. */
export interface ReportSink {
  /** Write fully formatted output from one report() invocation. */
  write(output: string): void
}

/** Contract implemented by TerminalReporter, JsonReporter, and future reporters. */
export interface Reporter {
  report(findings: readonly Finding[], diagnostics?: readonly ScanDiagnostic[]): void
}

export interface TerminalReporterOptions {
  sink: ReportSink
  /** Disable ANSI colour codes (non-TTY or --no-color). */
  noColor?: boolean
}

export interface JsonReporterOptions {
  /** Write JSON to stdout when filePath is not set. */
  sink?: ReportSink
  /** When set, write JSON to this file path instead of the sink. */
  filePath?: string
  /** Indent JSON output for readability. Default: false. */
  pretty?: boolean
}

/** Validate JsonReporter has a destination. */
export function assertJsonReporterDestination(options: JsonReporterOptions): void {
  if (options.filePath === undefined && options.sink === undefined) {
    throw new Error('JsonReporter requires either sink or filePath')
  }
}
