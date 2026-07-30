/**
 * Built-in rules index.
 *
 * This is the registry of all rules that ship with @sentinel/core.
 * Third-party rules are NOT registered here — they are declared in
 * the user's sentinel.config.ts and passed to the runner directly.
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
