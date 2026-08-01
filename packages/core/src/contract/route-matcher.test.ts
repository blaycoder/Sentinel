import { describe, expect, it } from 'vitest'

import type { ApiCall } from '../model/api-call.js'

import type { BackendRoute } from './model.js'
import { matchApiCalls } from './route-matcher.js'

const dummyLocation = {
  file: '/src/api.ts',
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 20,
}

function makeApiCall(
  overrides: Partial<ApiCall> & Pick<ApiCall, 'id' | 'url' | 'urlKind' | 'method'>,
): ApiCall {
  return {
    caller: 'fetch',
    resolvedUrl: undefined,
    requestBody: undefined,
    hasErrorHandler: false,
    rawExpression: 'fetch(...)',
    location: dummyLocation,
    ...overrides,
  }
}

const resolvedBody = { kind: 'resolved' as const, fields: [] }

const routes: BackendRoute[] = [
  {
    path: '/users/{id}',
    method: 'GET',
    operationId: 'getUser',
    requestBody: undefined,
    responseBody: resolvedBody,
  },
  {
    path: '/users/{id}/orders',
    method: 'POST',
    operationId: 'createOrder',
    requestBody: resolvedBody,
    responseBody: resolvedBody,
  },
]

describe('matchApiCalls', () => {
  it('matches a string-literal URL against a route with a path parameter', () => {
    const calls = [
      makeApiCall({
        id: 'call-1',
        method: 'GET',
        url: '/users/123',
        urlKind: 'string-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('matched')
    expect(results[0]?.route?.path).toBe('/users/{id}')
    expect(results[0]?.route?.method).toBe('GET')
    expect(results[0]?.reason).toBe('Matched GET /users/{id}')
  })

  it('returns unmatched with a clear reason when no route exists', () => {
    const calls = [
      makeApiCall({
        id: 'call-2',
        method: 'GET',
        url: '/nope',
        urlKind: 'string-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('unmatched')
    expect(results[0]?.route).toBeUndefined()
    expect(results[0]?.reason).toBe('No route found for GET /nope')
  })

  it('returns unmatched when the path matches but the method does not', () => {
    const calls = [
      makeApiCall({
        id: 'call-3',
        method: 'POST',
        url: '/users/123',
        urlKind: 'string-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('unmatched')
    expect(results[0]?.reason).toBe('No route found for POST /users/123')
  })

  it('matches a template-literal URL with an interpolated segment', () => {
    const calls = [
      makeApiCall({
        id: 'call-4',
        method: 'GET',
        url: '/users/${id}',
        urlKind: 'template-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('matched')
    expect(results[0]?.route?.path).toBe('/users/{id}')
    expect(results[0]?.reason).toBe('Matched GET /users/{id}')
  })

  it('returns unresolvable for a template-literal URL that is too dynamic', () => {
    const calls = [
      makeApiCall({
        id: 'call-5',
        method: 'GET',
        url: '/api/v${version}/users',
        urlKind: 'template-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('unresolvable')
    expect(results[0]?.route).toBeUndefined()
    expect(results[0]?.reason).toBe('URL template is too dynamic to match statically')
  })

  it('returns unresolvable for identifier URLs without attempting a match', () => {
    const calls = [
      makeApiCall({
        id: 'call-6',
        method: 'GET',
        url: 'apiUrl',
        urlKind: 'identifier',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('unresolvable')
    expect(results[0]?.reason).toBe('URL could not be statically resolved (identifier)')
  })

  it('returns unresolvable for call-expression URLs without attempting a match', () => {
    const calls = [
      makeApiCall({
        id: 'call-6b',
        method: 'GET',
        url: "buildUrl('users')",
        urlKind: 'call-expression',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('unresolvable')
    expect(results[0]?.reason).toBe('URL could not be statically resolved (call-expression)')
  })

  it('returns unmatched when path segment count differs from the route template', () => {
    const calls = [
      makeApiCall({
        id: 'call-7',
        method: 'GET',
        url: '/users/123/extra',
        urlKind: 'string-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results[0]?.status).toBe('unmatched')
    expect(results[0]?.reason).toBe('No route found for GET /users/123/extra')
  })

  it('returns one result per ApiCall in input order', () => {
    const calls = [
      makeApiCall({
        id: 'a',
        method: 'GET',
        url: '/users/1',
        urlKind: 'string-literal',
      }),
      makeApiCall({
        id: 'b',
        method: 'GET',
        url: 'apiUrl',
        urlKind: 'identifier',
      }),
      makeApiCall({
        id: 'c',
        method: 'GET',
        url: '/missing',
        urlKind: 'string-literal',
      }),
    ]

    const results = matchApiCalls(calls, routes)

    expect(results).toHaveLength(3)
    expect(results.map((r) => r.apiCallId)).toEqual(['a', 'b', 'c'])
    expect(results.map((r) => r.status)).toEqual(['matched', 'unresolvable', 'unmatched'])
  })
})
