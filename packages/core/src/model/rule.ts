/**
 * Rule — the plugin contract for analysis rules.
 *
 * A rule is a pure, synchronous function. It receives a snapshot of all
 * extracted ApiCalls and returns zero or more Findings.
 *
 * Rules are synchronous by design:
 *   - Deterministic: no race conditions, no ordering sensitivity.
 *   - Testable: pure function, easy to unit test.
 *   - Fast: no await points, can be called in batch.
 *
 * If a rule needs external data (e.g. an OpenAPI schema), that data is loaded
 * during runner setup and provided via RuleContext. The rule itself stays pure.
 */

import type { ApiCall } from './api-call.js'
import type { Finding, Severity } from './finding.js'
import type { Logger } from './logger.js'

/**
 * Context provided to each rule by the runner.
 * Rules may read from this but must not mutate it.
 */
export interface RuleContext {
  /** The severity the user configured for this rule. */
  readonly severity: Severity
  /** Logger scoped to this rule invocation. */
  readonly logger: Logger
  /**
   * The root directory of the project being scanned.
   * Useful for resolving relative paths in external data.
   */
  readonly rootDir: string
  /**
   * Arbitrary external data loaded by the runner during setup.
   * Typed as unknown; each rule is responsible for validating what it receives.
   * Example: a parsed OpenAPI schema object.
   */
  readonly externalData: unknown
}

/**
 * Metadata about a rule, used for documentation and reporting.
 */
export interface RuleMeta {
  /** Unique, kebab-case identifier. Example: 'no-hardcoded-url' */
  readonly id: string
  /** One-line human-readable description. */
  readonly description: string
  /** Documentation URL. Conventionally: https://sentinel.dev/rules/<id> */
  readonly url: string | undefined
  /** The default severity if not overridden in config. */
  readonly defaultSeverity: Severity
  /** Whether this rule is enabled by default. */
  readonly recommended: boolean
}

/**
 * A Sentinel analysis rule.
 *
 * @example
 * const myRule: Rule = {
 *   meta: {
 *     id: 'no-hardcoded-url',
 *     description: 'Disallow hardcoded absolute URLs in API calls',
 *     url: 'https://sentinel.dev/rules/no-hardcoded-url',
 *     defaultSeverity: Severity.Error,
 *     recommended: true,
 *   },
 *   check(calls, context) {
 *     return calls
 *       .filter(call => isAbsoluteUrl(call.url))
 *       .map(call => ({ ... }))
 *   }
 * }
 */
export interface Rule {
  readonly meta: RuleMeta
  /**
   * The rule's analysis function.
   *
   * @param calls   All API call sites extracted from the scanned codebase.
   * @param context Runner-provided context including severity and logger.
   * @returns       Zero or more Findings. Return an empty array if no issues found.
   */
  check(calls: readonly ApiCall[], context: RuleContext): readonly Finding[]
}
