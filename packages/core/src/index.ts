/**
 * @sentinel/core — public API surface.
 *
 * This is the ONLY file that external consumers import from.
 * Everything exported here is part of the stable public API.
 *
 * Internal modules (parse/, resolve/, rules/, runner/) may be refactored
 * freely as long as this surface stays stable.
 */

// ── File scanner ─────────────────────────────────────────────────────────────
export {
  scanFiles,
  FileScannerError,
  type ScannedFile,
  type FileScannerOptions,
} from './scan/file-scanner.js'

// ── Source parsing ───────────────────────────────────────────────────────────
export { parseSourceFile } from './parse/source-file.js'

// ── Primary entry point ──────────────────────────────────────────────────────
export { scan, resolveConfig, DEFAULT_SCAN_CONFIG } from './runner/scanner.js'

// ── Domain model — the stable data contract ──────────────────────────────────
export type {
  // Result<T,E>
  Ok,
  Err,
  Result,
  // Logging
  Logger,
  // API Call
  ApiCall,
  ApiCaller,
  HttpMethod,
  UrlKind,
  SourceLocation,
  // Findings
  Finding,
  // Scan
  ScanConfig,
  ScanResult,
  ScanStats,
  ScanDiagnostic,
  ScanDiagnosticKind,
  SentinelConfig,
  // Rules
  Rule,
  RuleMeta,
  RuleContext,
} from './model/index.js'

export {
  // Result helpers
  ok,
  err,
  unwrap,
  mapOk,
  mapErr,
  // Logging
  noopLogger,
  scopedLogger,
  // Severity
  Severity,
} from './model/index.js'

// ── Built-in rules (for use by config and third-party tooling) ───────────────
export {
  noHardcodedUrl,
  missingErrorHandler,
  BUILT_IN_RULES,
  RECOMMENDED_RULES,
} from './rules/index.js'
