/**
 * @sentinel/core model — re-exports all domain types.
 *
 * All types that cross package boundaries live here.
 * This barrel is the only one in `src/model/`; individual sub-modules
 * do NOT have their own barrel files to avoid circular dependency traps.
 */

export type { Ok, Err, Result } from './result.js'
export { ok, err, unwrap, mapOk, mapErr } from './result.js'

export type { Logger } from './logger.js'
export { noopLogger, scopedLogger } from './logger.js'

export type { HttpMethod, UrlKind, SourceLocation, ApiCall, ApiCaller } from './api-call.js'

export { Severity } from './finding.js'
export type { Finding } from './finding.js'

export type {
  ScanConfig,
  ScanResult,
  ScanStats,
  ScanDiagnostic,
  ScanDiagnosticKind,
  SentinelConfig,
} from './scan-result.js'

export type { Rule, RuleMeta, RuleContext } from './rule.js'
