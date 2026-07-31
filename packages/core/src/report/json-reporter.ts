/**
 * json-reporter.ts — machine-readable Finding[] reporter (JSON envelope).
 */

import { writeFileSync } from 'node:fs'

import type { Finding } from '../model/finding.js'

import {
  assertJsonReporterDestination,
  type JsonReporterOptions,
  type Reporter,
} from './reporter.js'

/** Stable JSON schema for findings-only output. */
export interface FindingsJsonOutput {
  version: '1'
  timestamp: string
  findings: Finding[]
}

export class JsonReporter implements Reporter {
  private readonly options: JsonReporterOptions

  constructor(options: JsonReporterOptions) {
    assertJsonReporterDestination(options)
    this.options = options
  }

  report(findings: readonly Finding[]): void {
    const output: FindingsJsonOutput = {
      version: '1',
      timestamp: new Date().toISOString(),
      findings: [...findings],
    }

    const json = JSON.stringify(output, null, this.options.pretty === true ? 2 : undefined)

    if (this.options.filePath !== undefined) {
      writeFileSync(this.options.filePath, json, 'utf8')
      return
    }

    this.options.sink?.write(json)
  }
}
