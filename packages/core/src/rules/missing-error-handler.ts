/**
 * Rule: missing-error-handler
 *
 * Detects API calls that do not have any error handling — no .catch(), no
 * try/catch wrapper, and no second argument to .then().
 *
 * WHY this matters:
 *   Unhandled promise rejections from network calls are one of the most common
 *   sources of silent failures in frontend applications. A failed fetch() with
 *   no error handler means the app silently breaks with no user feedback and
 *   no error in the logs.
 *
 * Detects:
 *   fetch('/api/users')                       → Warning (no error handling)
 *   axios.get('/api/users')                   → Warning
 *
 * Does NOT flag:
 *   fetch('/api/users').catch(handleError)    → has .catch()
 *   try { await fetch(...) } catch (e) {...}  → has try/catch
 *   fetch(...).then(ok, err)                  → has rejection handler
 */

import type { ApiCall } from '../model/api-call.js'
import type { Finding } from '../model/finding.js'
import { Severity } from '../model/finding.js'
import type { Rule, RuleContext } from '../model/rule.js'

export const missingErrorHandler: Rule = {
  meta: {
    id: 'missing-error-handler',
    description: 'Require error handling for all API calls',
    url: 'https://sentinel.dev/rules/missing-error-handler',
    defaultSeverity: Severity.Warning,
    recommended: true,
  },

  check(calls: readonly ApiCall[], context: RuleContext): readonly Finding[] {
    return calls
      .filter((call) => !call.hasErrorHandler)
      .map((call) => ({
        ruleId: missingErrorHandler.meta.id,
        message: `${call.caller}() call to '${formatUrl(call.url)}' has no error handler. Add .catch() or wrap in try/catch.`,
        severity: context.severity,
        location: call.location,
        apiCallId: call.id,
        code: 'sentinel/missing-error-handler/no-catch',
        url: missingErrorHandler.meta.url,
        suggestion: buildSuggestion(call),
      }))
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUrl(url: string): string {
  // Truncate long URLs for readable messages
  return url.length > 60 ? url.slice(0, 57) + '...' : url
}

function buildSuggestion(call: ApiCall): string {
  return [
    `Wrap in try/catch:`,
    `  try {`,
    `    const response = await ${call.caller}(...)`,
    `  } catch (error) {`,
    `    // handle error`,
    `  }`,
  ].join('\n')
}
