/**
 * Rule: no-hardcoded-url
 *
 * Detects API calls that use hardcoded absolute URLs (e.g. https://api.example.com/users)
 * instead of environment-relative paths (/api/users) or environment variables.
 *
 * WHY this matters:
 *   Hardcoded absolute URLs bypass environment configuration, making it impossible
 *   to point the same build at staging vs production. They commonly leak into
 *   commits during development and cause subtle environment-specific breakages.
 *
 * Detects:
 *   - fetch('https://api.example.com/users')   → Error
 *   - axios.get('http://localhost:3000/api')    → Warning (localhost is common in dev)
 *   - fetch('//api.example.com/users')         → Error (protocol-relative)
 *
 * Does NOT flag:
 *   - fetch('/api/users')                      → relative path, fine
 *   - fetch(`/api/users/${id}`)               → template literal, fine
 *   - fetch(process.env.API_URL + '/users')   → dynamic, cannot be statically flagged
 */

import type { ApiCall } from '../model/api-call.js'
import type { Finding } from '../model/finding.js'
import { Severity } from '../model/finding.js'
import type { Rule, RuleContext } from '../model/rule.js'

export const noHardcodedUrl: Rule = {
  meta: {
    id: 'no-hardcoded-url',
    description: 'Disallow hardcoded absolute URLs in API calls',
    url: 'https://sentinel.dev/rules/no-hardcoded-url',
    defaultSeverity: Severity.Error,
    recommended: true,
  },

  check(calls: readonly ApiCall[], context: RuleContext): readonly Finding[] {
    const findings: Finding[] = []

    for (const call of calls) {
      // Only flag string and template literals — we can't statically resolve others
      if (call.urlKind !== 'string-literal' && call.urlKind !== 'template-literal') continue

      // Extract the static prefix of template literals for analysis
      const urlToCheck =
        call.urlKind === 'template-literal' ? getTemplateLiteralStaticPrefix(call.url) : call.url

      if (isAbsoluteHttpUrl(urlToCheck)) {
        const isLocalhost = isLocalhostUrl(urlToCheck)

        findings.push({
          ruleId: noHardcodedUrl.meta.id,
          message: isLocalhost
            ? `Localhost URL '${urlToCheck}' is hardcoded. Use an environment variable or relative path.`
            : `Absolute URL '${urlToCheck}' is hardcoded. Use an environment variable or relative path instead.`,
          severity: isLocalhost ? Severity.Warning : context.severity,
          location: call.location,
          apiCallId: call.id,
          code: isLocalhost
            ? 'sentinel/no-hardcoded-url/localhost'
            : 'sentinel/no-hardcoded-url/absolute',
          url: noHardcodedUrl.meta.url,
          suggestion: isLocalhost
            ? `Replace with a relative path (e.g. '/api/...') or use process.env.API_URL`
            : `Replace with an environment variable: fetch(process.env.API_URL + '${extractPath(urlToCheck)}')`,
        })
      } else if (isProtocolRelativeUrl(urlToCheck)) {
        findings.push({
          ruleId: noHardcodedUrl.meta.id,
          message: `Protocol-relative URL '${urlToCheck}' is hardcoded.`,
          severity: context.severity,
          location: call.location,
          apiCallId: call.id,
          code: 'sentinel/no-hardcoded-url/protocol-relative',
          url: noHardcodedUrl.meta.url,
          suggestion: `Use an explicit https:// URL via an environment variable, or a relative path.`,
        })
      }
    }

    return findings
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function isProtocolRelativeUrl(url: string): boolean {
  return url.startsWith('//')
}

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(url)
}

/**
 * Extract the static prefix of a template literal URL.
 * `https://api.example.com/${path}` → `https://api.example.com/`
 */
function getTemplateLiteralStaticPrefix(template: string): string {
  const interpolationIndex = template.indexOf('${')
  return interpolationIndex === -1 ? template : template.slice(0, interpolationIndex)
}

/**
 * Extract the path portion of an absolute URL.
 * `https://api.example.com/users/profile` → `/users/profile`
 */
function extractPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return '/'
  }
}
