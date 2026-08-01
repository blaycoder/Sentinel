import { describe, expect, it } from 'vitest'

import type { ApiCall } from '../model/api-call.js'

import { diffRequestBodies } from './body-diff.js'
import type { BackendRoute, MatchResult } from './model.js'

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
    caller: 'axios.post',
    resolvedUrl: undefined,
    requestBody: undefined,
    hasErrorHandler: false,
    rawExpression: 'axios.post(...)',
    location: dummyLocation,
    ...overrides,
  }
}

function makeMatchedResult(apiCallId: string, route: BackendRoute): MatchResult {
  return {
    apiCallId,
    status: 'matched',
    route,
    reason: `Matched ${route.method} ${route.path}`,
  }
}

const postRoute: BackendRoute = {
  path: '/users',
  method: 'POST',
  operationId: 'createUser',
  requestBody: {
    kind: 'resolved',
    fields: [
      { name: 'name', type: 'string', required: true },
      { name: 'age', type: 'integer', required: false },
    ],
  },
  responseBody: undefined,
}

const getRoute: BackendRoute = {
  path: '/users',
  method: 'GET',
  operationId: 'listUsers',
  requestBody: undefined,
  responseBody: undefined,
}

const routes: BackendRoute[] = [postRoute, getRoute]

describe('diffRequestBodies', () => {
  it('returns compatible when the call body matches the route shape exactly', () => {
    const call = makeApiCall({
      id: 'call-1',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: "{ name: 'Alice', age: 30 }",
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-1', postRoute)], routes)

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('compatible')
    expect(results[0]?.discrepancies).toEqual([])
    expect(results[0]?.reason).toBeUndefined()
  })

  it('flags missing required fields as discrepancies-found', () => {
    const call = makeApiCall({
      id: 'call-2',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: '{ age: 30 }',
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-2', postRoute)], routes)

    expect(results[0]?.status).toBe('discrepancies-found')
    expect(results[0]?.discrepancies).toEqual([
      {
        kind: 'missing-required-field',
        field: 'name',
        expected: 'string',
        actual: undefined,
      },
    ])
  })

  it('flags extra fields not in the schema as unexpected-field', () => {
    const call = makeApiCall({
      id: 'call-3',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: "{ name: 'Alice', extra: true }",
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-3', postRoute)], routes)

    expect(results[0]?.status).toBe('discrepancies-found')
    expect(results[0]?.discrepancies).toContainEqual({
      kind: 'unexpected-field',
      field: 'extra',
      expected: undefined,
      actual: 'boolean',
    })
  })

  it('flags type mismatches for literal field values', () => {
    const call = makeApiCall({
      id: 'call-4',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: "{ name: 'Alice', age: 'thirty' }",
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-4', postRoute)], routes)

    expect(results[0]?.status).toBe('discrepancies-found')
    expect(results[0]?.discrepancies).toContainEqual({
      kind: 'type-mismatch',
      field: 'age',
      expected: 'integer',
      actual: 'string',
    })
  })

  it('skips type comparison for non-literal field values without flagging them', () => {
    const call = makeApiCall({
      id: 'call-5',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: '{ name: userName }',
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-5', postRoute)], routes)

    expect(results[0]?.status).toBe('compatible')
    expect(results[0]?.discrepancies).toEqual([])
  })

  it('returns not-diffable when the call request body is undefined', () => {
    const call = makeApiCall({
      id: 'call-6',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: undefined,
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-6', postRoute)], routes)

    expect(results[0]?.status).toBe('not-diffable')
    expect(results[0]?.reason).toBe('Request body is not statically resolvable from source')
    expect(results[0]?.discrepancies).toEqual([])
  })

  it('returns not-diffable when the route body shape is unresolvable', () => {
    const unresolvableRoute: BackendRoute = {
      ...postRoute,
      requestBody: {
        kind: 'unresolvable',
        reason: 'schema uses $ref or unsupported JSON Schema combinators',
      },
    }

    const call = makeApiCall({
      id: 'call-7',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: "{ name: 'Alice' }",
    })

    const results = diffRequestBodies(
      [call],
      [makeMatchedResult('call-7', unresolvableRoute)],
      routes,
    )

    expect(results[0]?.status).toBe('not-diffable')
    expect(results[0]?.reason).toBe('schema uses $ref or unsupported JSON Schema combinators')
  })

  it('returns compatible when a GET route has no body and the call sends none', () => {
    const call = makeApiCall({
      id: 'call-8',
      method: 'GET',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: undefined,
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-8', getRoute)], routes)

    expect(results[0]?.status).toBe('compatible')
    expect(results[0]?.discrepancies).toEqual([])
    expect(results[0]?.reason).toBeUndefined()
  })

  it('flags unexpected fields when the route declares no body but the call sends one', () => {
    const call = makeApiCall({
      id: 'call-9',
      method: 'GET',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: '{ foo: 1 }',
    })

    const results = diffRequestBodies([call], [makeMatchedResult('call-9', getRoute)], routes)

    expect(results[0]?.status).toBe('discrepancies-found')
    expect(results[0]?.discrepancies).toEqual([
      {
        kind: 'unexpected-field',
        field: 'foo',
        expected: undefined,
        actual: 'integer',
      },
    ])
  })

  it('skips unmatched and unresolvable match results', () => {
    const call = makeApiCall({
      id: 'call-10',
      method: 'POST',
      url: '/users',
      urlKind: 'string-literal',
      requestBody: "{ name: 'Alice' }",
    })

    const matchResults: MatchResult[] = [
      {
        apiCallId: 'call-10',
        status: 'unmatched',
        route: undefined,
        reason: 'No route found for POST /users',
      },
      {
        apiCallId: 'call-10',
        status: 'unresolvable',
        route: undefined,
        reason: 'URL could not be statically resolved (identifier)',
      },
    ]

    const results = diffRequestBodies([call], matchResults, routes)

    expect(results).toEqual([])
  })
})
