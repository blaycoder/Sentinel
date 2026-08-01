/**
 * Built-in rules index.
 *
 * This is the registry of all rules that ship with @sentinel/core.
 * Only built-in rules in BUILT_IN_RULES are executed today — the runner
 * resolves rule IDs from ScanConfig.rules via this map. Unknown rule IDs
 * produce a config-warning ScanDiagnostic and are skipped (not executed).
 *
 * Custom/third-party rule loading is not yet supported and is future work.
 */

import type { Rule } from '../model/rule.js'

import { missingErrorHandler } from './missing-error-handler.js'
import { noHardcodedUrl } from './no-hardcoded-url.js'

export { noHardcodedUrl } from './no-hardcoded-url.js'
export { missingErrorHandler } from './missing-error-handler.js'

/**
 * All built-in rules, keyed by their ID.
 * The runner uses this map to look up rules by the IDs in ScanConfig.rules.
 */
export const BUILT_IN_RULES: Readonly<Map<string, Rule>> = new Map([
  [noHardcodedUrl.meta.id, noHardcodedUrl],
  [missingErrorHandler.meta.id, missingErrorHandler],
])

/**
 * The set of rules enabled by default (recommended: true).
 */
export const RECOMMENDED_RULES: readonly string[] = Array.from(BUILT_IN_RULES.values())
  .filter((rule) => rule.meta.recommended)
  .map((rule) => rule.meta.id)
