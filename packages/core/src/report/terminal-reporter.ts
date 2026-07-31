/**
 * terminal-reporter.ts — human-readable Finding[] reporter for terminals.
 */

import type { Finding } from '../model/finding.js'
import type { ScanDiagnostic } from '../model/scan-result.js'

import { formatReportTerminal } from './format/diagnostic-format.js'
import { formatFindingsTerminal } from './format/terminal-format.js'
import type { Reporter, TerminalReporterOptions } from './reporter.js'

export class TerminalReporter implements Reporter {
  private readonly options: TerminalReporterOptions

  constructor(options: TerminalReporterOptions) {
    this.options = options
  }

  report(findings: readonly Finding[], diagnostics: readonly ScanDiagnostic[] = []): void {
    const findingsOutput = formatFindingsTerminal(findings, {
      ...(this.options.noColor !== undefined ? { noColor: this.options.noColor } : {}),
    })
    const output = formatReportTerminal(findingsOutput, diagnostics, {
      ...(this.options.noColor !== undefined ? { noColor: this.options.noColor } : {}),
    })
    this.options.sink.write(output)
  }
}
