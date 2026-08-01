/**
 * contract-check.ts — orchestrate OpenAPI parse → route match → body diff.
 *
 * api-contract-mismatch is NOT a BUILT_IN_RULES entry: contract checking is
 * multi-phase orchestration (parse spec, match routes, diff bodies), not a
 * single-pass Rule.check(). Severity is configured via ScanConfig.rules and
 * handled by runContractCheck() when contractSource is set.
 */

import type { ApiCall } from '../model/api-call.js'
import type { Finding } from '../model/finding.js'
import type { Logger } from '../model/logger.js'
import type { ScanDiagnostic } from '../model/scan-result.js'

import { diffRequestBodies } from './body-diff.js'
import type { BackendRoute, ContractDiffResult, Discrepancy, MatchResult } from './model.js'
import { parseOpenApiSpec } from './openapi-parser.js'
import { matchApiCalls } from './route-matcher.js'

export const API_CONTRACT_MISMATCH_RULE_ID = 'api-contract-mismatch'

const RULE_DOC_URL = 'https://sentinel.dev/rules/api-contract-mismatch'

export interface ContractCheckOptions {
  readonly severity: Finding['severity']
  readonly logger: Logger
  readonly diagnostics: ScanDiagnostic[]
}

function formatRouteLabel(route: BackendRoute): string {
  return `${route.method} ${route.path}`
}

function formatDiscrepancyMessage(discrepancy: Discrepancy, routeLabel: string): string {
  switch (discrepancy.kind) {
    case 'missing-required-field':
      return `Missing required field '${discrepancy.field}' expected by ${routeLabel}`
    case 'unexpected-field':
      return `Unexpected field '${discrepancy.field}' not declared in ${routeLabel}`
    case 'type-mismatch':
      return `Field '${discrepancy.field}' has type '${discrepancy.actual ?? 'unknown'}' but ${routeLabel} expects '${discrepancy.expected ?? 'unknown'}'`
  }
}

function discrepancyToFinding(
  discrepancy: Discrepancy,
  call: ApiCall,
  routeLabel: string,
  severity: Finding['severity'],
): Finding {
  return {
    ruleId: API_CONTRACT_MISMATCH_RULE_ID,
    message: formatDiscrepancyMessage(discrepancy, routeLabel),
    severity,
    location: call.location,
    apiCallId: call.id,
    code: `sentinel/api-contract-mismatch/${discrepancy.kind}`,
    url: RULE_DOC_URL,
    suggestion: undefined,
  }
}

function diffResultToFindings(
  diffResult: ContractDiffResult,
  call: ApiCall,
  matchedRoute: BackendRoute | undefined,
  severity: Finding['severity'],
): Finding[] {
  if (diffResult.status !== 'discrepancies-found' || matchedRoute === undefined) {
    return []
  }

  const routeLabel = formatRouteLabel(matchedRoute)
  return diffResult.discrepancies.map((discrepancy) =>
    discrepancyToFinding(discrepancy, call, routeLabel, severity),
  )
}

function logNonFindingMatchResults(matchResults: readonly MatchResult[], logger: Logger): void {
  for (const result of matchResults) {
    if (result.status === 'unmatched' || result.status === 'unresolvable') {
      logger.debug('Contract match skipped', {
        apiCallId: result.apiCallId,
        status: result.status,
        reason: result.reason,
      })
    }
  }
}

function logNonFindingDiffResults(
  diffResults: readonly ContractDiffResult[],
  logger: Logger,
): void {
  for (const result of diffResults) {
    if (result.status === 'not-diffable') {
      logger.debug('Contract diff skipped', {
        apiCallId: result.apiCallId,
        reason: result.reason,
      })
    }
  }
}

/**
 * Run the contract-check pipeline: parse OpenAPI spec, match calls to routes,
 * diff request bodies. Returns Findings for body-shape discrepancies only.
 */
export async function runContractCheck(
  apiCalls: readonly ApiCall[],
  specPath: string,
  options: ContractCheckOptions,
): Promise<Finding[]> {
  const { severity, logger, diagnostics } = options

  const parseResult = await parseOpenApiSpec(specPath)
  if (!parseResult.ok) {
    diagnostics.push({
      kind: 'config-warning',
      message: `Could not parse OpenAPI spec at '${specPath}': ${parseResult.error.message}`,
      file: specPath,
      cause: parseResult.error,
    })
    return []
  }

  const routes = parseResult.value
  logger.debug(`Parsed ${String(routes.length)} backend route(s) from OpenAPI spec`)

  const matchResults = matchApiCalls(apiCalls, routes)
  logNonFindingMatchResults(matchResults, logger)

  const diffResults = diffRequestBodies(apiCalls, matchResults, routes)
  logNonFindingDiffResults(diffResults, logger)

  const callsById = new Map(apiCalls.map((call) => [call.id, call]))
  const matchedRoutesByCallId = new Map<string, BackendRoute>()

  for (const matchResult of matchResults) {
    if (matchResult.status === 'matched' && matchResult.route !== undefined) {
      matchedRoutesByCallId.set(matchResult.apiCallId, matchResult.route)
    }
  }

  const findings: Finding[] = []

  for (const diffResult of diffResults) {
    const call = callsById.get(diffResult.apiCallId)
    if (call === undefined) {
      continue
    }

    const matchedRoute = matchedRoutesByCallId.get(diffResult.apiCallId)
    findings.push(...diffResultToFindings(diffResult, call, matchedRoute, severity))
  }

  logger.debug(`Contract check produced ${String(findings.length)} finding(s)`)
  return findings
}
