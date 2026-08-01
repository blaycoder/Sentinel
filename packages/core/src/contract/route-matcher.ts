/**
 * route-matcher.ts — match frontend ApiCall[] against backend BackendRoute[].
 *
 * v1 limitations (intentional):
 * - Query strings are not stripped. A URL like `/users/1?page=1` is split
 *   as-is; the last segment becomes `1?page=1` and will not match `{id}`.
 * - Trailing slashes are not normalized. `/users/` vs `/users` differ in
 *   segment count and will not match each other.
 */

import type { ApiCall } from '../model/api-call.js'

import type { BackendRoute, MatchResult } from './model.js'

const ROUTE_PARAM_PATTERN = /^\{[^}]+\}$/
const CALL_WILDCARD_PATTERN = /^\$\{[^}]+\}$/

function splitPathSegments(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0)
}

function isRouteParamSegment(segment: string): boolean {
  return ROUTE_PARAM_PATTERN.test(segment)
}

function isCallWildcardSegment(segment: string): boolean {
  return CALL_WILDCARD_PATTERN.test(segment)
}

function pathsMatch(callSegments: readonly string[], routeSegments: readonly string[]): boolean {
  if (callSegments.length !== routeSegments.length) {
    return false
  }

  for (let i = 0; i < callSegments.length; i++) {
    const callSegment = callSegments[i]
    const routeSegment = routeSegments[i]
    if (callSegment === undefined || routeSegment === undefined) {
      return false
    }

    if (isRouteParamSegment(routeSegment) || isCallWildcardSegment(callSegment)) {
      continue
    }

    if (callSegment !== routeSegment) {
      return false
    }
  }

  return true
}

function isTemplateMatchable(url: string): boolean {
  const segments = splitPathSegments(url)

  for (const segment of segments) {
    if (segment.includes('${') && !isCallWildcardSegment(segment)) {
      return false
    }
  }

  return true
}

function findMatchingRoute(
  call: ApiCall,
  routes: readonly BackendRoute[],
): BackendRoute | undefined {
  const callSegments = splitPathSegments(call.url)

  for (const route of routes) {
    if (route.method !== call.method) {
      continue
    }

    const routeSegments = splitPathSegments(route.path)
    if (pathsMatch(callSegments, routeSegments)) {
      return route
    }
  }

  return undefined
}

function matchSingleApiCall(call: ApiCall, routes: readonly BackendRoute[]): MatchResult {
  if (
    call.urlKind === 'identifier' ||
    call.urlKind === 'call-expression' ||
    call.urlKind === 'unknown'
  ) {
    return {
      apiCallId: call.id,
      status: 'unresolvable',
      route: undefined,
      reason: `URL could not be statically resolved (${call.urlKind})`,
    }
  }

  if (call.method === 'UNKNOWN') {
    return {
      apiCallId: call.id,
      status: 'unresolvable',
      route: undefined,
      reason: 'HTTP method could not be statically determined',
    }
  }

  if (call.urlKind === 'template-literal' && !isTemplateMatchable(call.url)) {
    return {
      apiCallId: call.id,
      status: 'unresolvable',
      route: undefined,
      reason: 'URL template is too dynamic to match statically',
    }
  }

  const matchedRoute = findMatchingRoute(call, routes)

  if (matchedRoute !== undefined) {
    return {
      apiCallId: call.id,
      status: 'matched',
      route: matchedRoute,
      reason: `Matched ${call.method} ${matchedRoute.path}`,
    }
  }

  return {
    apiCallId: call.id,
    status: 'unmatched',
    route: undefined,
    reason: `No route found for ${call.method} ${call.url}`,
  }
}

/**
 * Match each ApiCall against backend routes. Returns one MatchResult per call,
 * in the same order as the input.
 */
export function matchApiCalls(
  apiCalls: readonly ApiCall[],
  routes: readonly BackendRoute[],
): MatchResult[] {
  return apiCalls.map((call) => matchSingleApiCall(call, routes))
}
