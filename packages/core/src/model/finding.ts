/**
 * Finding — a diagnostic produced by a rule against one or more ApiCalls.
 *
 * Findings are the primary output of the rules phase and the primary input
 * to every consumer (CLI formatters, VS Code diagnostics, cloud dashboard).
 * This shape is frozen: changes require a major version bump.
 */

import type { SourceLocation } from './api-call.js'

/**
 * The severity of a finding.
 * Matches conventional static analysis levels and VS Code DiagnosticSeverity.
 */
export enum Severity {
  /** Code will likely fail at runtime or violate a contract. */
  Error = 'error',
  /** Code may behave unexpectedly or violates a best practice. */
  Warning = 'warning',
  /** Informational — not a defect, just something to be aware of. */
  Info = 'info',
  /** Stylistic or trivial suggestion. */
  Hint = 'hint',
}

/** A diagnostic produced by a single rule for a single call site. */
export interface Finding {
  /** The ID of the rule that produced this finding (e.g. 'no-hardcoded-url'). */
  readonly ruleId: string
  /** Human-readable message explaining the problem. */
  readonly message: string
  /** Severity level. */
  readonly severity: Severity
  /** Where in the source code the problem was found. */
  readonly location: SourceLocation
  /** The ID of the ApiCall that triggered this finding. */
  readonly apiCallId: string
  /**
   * An optional code that can be used to look up documentation or suggestions.
   * Format: `sentinel/<rule-id>/<code>` (e.g. 'sentinel/no-hardcoded-url/absolute')
   */
  readonly code: string | undefined
  readonly url: string | undefined
  /**
   * Optional suggested fix. Plain text description for CLI display.
   * A structured `TextEdit[]` will be added when the VS Code LSP integration matures.
   */
  readonly suggestion: string | undefined
}
