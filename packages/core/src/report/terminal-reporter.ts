/**
 * terminal-reporter.ts — human-readable Finding[] reporter for terminals.
 */

import type { Finding } from '../model/finding.js'

import { formatFindingsTerminal } from './format/terminal-format.js'
import type { Reporter, TerminalReporterOptions } from './reporter.js'

export class TerminalReporter implements Reporter {
  private readonly options: TerminalReporterOptions

  constructor(options: TerminalReporterOptions) {
    this.options = options
  }

  report(findings: readonly Finding[]): void {
    const output = formatFindingsTerminal(findings, {
      ...(this.options.noColor !== undefined ? { noColor: this.options.noColor } : {}),
    })
    this.options.sink.write(output)
  }
}
