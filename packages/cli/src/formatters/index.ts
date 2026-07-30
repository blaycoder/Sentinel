/**
 * formatters/index.ts — formatter registry and dispatcher.
 *
 * Exports all formatters and a single dispatch function that picks
 * the right formatter based on the OutputFormat flag.
 */

import type { ScanResult } from '@sentinel/core'

import type { OutputFormat } from '../args.js'

import { formatJson } from './json.js'
import { formatSarif } from './sarif.js'
import { formatText } from './text.js'

export { formatText } from './text.js'
export { formatJson } from './json.js'
export { formatSarif } from './sarif.js'

export interface FormatOptions {
  noColor?: boolean
  repositoryRoot?: string
  toolVersion?: string
}

/**
 * Format a ScanResult using the specified output format.
 * Pure function — no side effects.
 */
export function format(
  result: ScanResult,
  outputFormat: OutputFormat,
  options: FormatOptions = {},
): string {
  switch (outputFormat) {
    case 'text':
      return formatText(result, {
        ...(options.noColor !== undefined ? { noColor: options.noColor } : {}),
      })
    case 'json':
      return formatJson(result, { pretty: true })
    case 'sarif':
      return formatSarif(result, {
        ...(options.repositoryRoot !== undefined ? { repositoryRoot: options.repositoryRoot } : {}),
        ...(options.toolVersion !== undefined ? { toolVersion: options.toolVersion } : {}),
      })
  }
}
