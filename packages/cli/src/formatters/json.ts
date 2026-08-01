/**
 * formatters/json.ts — machine-readable JSON output formatter.
 *
 * Outputs the ScanResult as a stable JSON document suitable for:
 *   - Piping to jq
 *   - Programmatic consumption by CI scripts
 *   - Cloud dashboard ingestion
 *
 * The JSON shape is versioned (via the `version` field) so consumers
 * can handle multiple Sentinel versions gracefully.
 */

import type { ScanResult } from '@sentinel-scan/core'

// ─── Types ────────────────────────────────────────────────────────────────────

/** The stable JSON output schema. */
export interface SentinelJsonOutput {
  /** Semver-style schema version for this JSON format. */
  version: '1'
  /** ISO 8601 timestamp of when the scan was produced. */
  timestamp: string
  /** The scan results. */
  result: ScanResult
}

export interface JsonFormatterOptions {
  /** Indent the JSON output for readability. Default: false (compact). */
  pretty?: boolean
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Format a ScanResult as a JSON string.
 *
 * @param result  The scan result to format.
 * @param options Formatting options.
 * @returns       A JSON string.
 */
export function formatJson(result: ScanResult, options: JsonFormatterOptions = {}): string {
  const { pretty = false } = options

  const output: SentinelJsonOutput = {
    version: '1',
    timestamp: new Date().toISOString(),
    result,
  }

  return JSON.stringify(output, null, pretty ? 2 : undefined)
}
