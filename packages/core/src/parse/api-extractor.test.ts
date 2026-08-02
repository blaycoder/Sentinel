import { describe, expect, it } from 'vitest'

import type { ApiCall } from '../model/api-call.js'
import { extractApiCalls } from './api-extractor.js'

const VIRTUAL_FILE = '/virtual/extract.test.ts'

function extract(source: string): ApiCall[] {
  return extractApiCalls(VIRTUAL_FILE, source)
}

function single(source: string): ApiCall {
  const calls = extract(source)
  expect(calls).toHaveLength(1)
  return calls[0]!
}

describe('extractApiCalls', () => {
  describe('caller detection', () => {
    it('detects fetch(url)', () => {
      const call = single("fetch('/api')")
      expect(call.caller).toBe('fetch')
      expect(call.method).toBe('GET')
    })

    it('detects axios.get', () => {
      const call = single("axios.get('/u')")
      expect(call.caller).toBe('axios.get')
      expect(call.method).toBe('GET')
    })

    it('detects axios.post', () => {
      const call = single("axios.post('/u', {})")
      expect(call.caller).toBe('axios.post')
      expect(call.method).toBe('POST')
    })

    it('detects ky.get', () => {
      const call = single("ky.get('/u')")
      expect(call.caller).toBe('ky.get')
      expect(call.method).toBe('GET')
    })

    it('detects ky.post', () => {
      const call = single("ky.post('/u')")
      expect(call.caller).toBe('ky.post')
      expect(call.method).toBe('POST')
    })

    it('detects generic instance.post', () => {
      const call = single("client.post('/u')")
      expect(call.caller).toBe('client.post')
      expect(call.method).toBe('POST')
    })

    it('detects axios(config) object call', () => {
      const call = single("axios({ url: '/u', method: 'get' })")
      expect(call.caller).toBe('axios')
    })

    it('detects XMLHttpRequest() call expression', () => {
      const call = single("XMLHttpRequest('/api')")
      expect(call.caller).toBe('xhr')
      expect(call.method).toBe('UNKNOWN')
    })

    it('does not extract new XMLHttpRequest() — NewExpression is not walked', () => {
      const calls = extract('new XMLHttpRequest()')
      expect(calls).toHaveLength(0)
    })
  })

  describe('url extraction', () => {
    it('extracts string-literal URLs', () => {
      const call = single("fetch('/static')")
      expect(call.url).toBe('/static')
      expect(call.urlKind).toBe('string-literal')
    })

    it('extracts static template-literal URLs', () => {
      const call = single('fetch(`/u`)')
      expect(call.url).toBe('/u')
      expect(call.urlKind).toBe('template-literal')
    })

    it('extracts dynamic template-literal URLs with placeholders', () => {
      const call = single('fetch(`/u/${id}`)')
      expect(call.url).toBe('/u/${id}')
      expect(call.urlKind).toBe('template-literal')
    })

    it('extracts identifier URLs', () => {
      const call = single('fetch(apiUrl)')
      expect(call.url).toBe('apiUrl')
      expect(call.urlKind).toBe('identifier')
    })

    it('extracts call-expression URLs', () => {
      const call = single("fetch(buildUrl('x'))")
      expect(call.urlKind).toBe('call-expression')
      expect(call.url).toContain('buildUrl')
    })

    it('falls back to unknown urlKind for non-literal expressions', () => {
      const call = single('fetch(unknownExpr as any)')
      expect(call.urlKind).toBe('unknown')
    })
  })

  describe('method resolution', () => {
    it('reads method from fetch options object literal', () => {
      const call = single("fetch('/u', { method: 'POST' })")
      expect(call.method).toBe('POST')
    })

    it('reads method from axios config object literal', () => {
      const call = single("axios({ url: '/u', method: 'put' })")
      expect(call.method).toBe('PUT')
    })

    it('returns UNKNOWN when method is not statically readable', () => {
      const call = single("fetch('/u', { method: verb })")
      expect(call.method).toBe('UNKNOWN')
    })
  })

  describe('hasErrorHandler', () => {
    it('detects try/catch wrapping', () => {
      const call = single("try { fetch('/u') } catch {}")
      expect(call.hasErrorHandler).toBe(true)
    })

    it('detects .catch() chaining', () => {
      const call = single("fetch('/u').catch(() => {})")
      expect(call.hasErrorHandler).toBe(true)
    })

    it('detects .then(onFulfilled, onRejected)', () => {
      const call = single("fetch('/u').then(() => {}, () => {})")
      expect(call.hasErrorHandler).toBe(true)
    })

    it('returns false for bare calls', () => {
      const call = single("fetch('/u')")
      expect(call.hasErrorHandler).toBe(false)
    })

    it('does not throw for await fetch inside async function (regression)', () => {
      const source = `
export async function loadItems() {
  const res = await fetch('/api/items', { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  return body;
}
`
      const calls = extract(source)
      expect(calls.length).toBeGreaterThanOrEqual(1)
      const fetchCall = calls.find((c) => c.caller === 'fetch')
      expect(fetchCall).toBeDefined()
      expect(fetchCall!.url).toBe('/api/items')
      expect(fetchCall!.hasErrorHandler).toBe(false)
    })
  })

  describe('known false positives', () => {
    it('detects cache.get as HTTP caller (known behavior, not filtered)', () => {
      const call = single('cache.get("/item")')
      expect(call.caller).toBe('cache.get')
      expect(call.method).toBe('GET')
    })
  })

  describe('requestBody', () => {
    it('extracts object literal from axios.post 2nd argument', () => {
      const call = single("axios.post('/u', { id: 1 })")
      expect(call.requestBody).toBe('{ id: 1 }')
    })

    it('extracts string literal from axios.post 2nd argument', () => {
      const call = single("axios.post('/u', 'payload')")
      expect(call.requestBody).toBe('payload')
    })

    it('extracts template literal from axios.post 2nd argument', () => {
      const call = single('axios.post(`/u`, `body-${x}`)')
      expect(call.requestBody).toBe('body-${x}')
    })

    it('extracts data from axios config object', () => {
      const call = single("axios({ url: '/u', data: { a: 1 } })")
      expect(call.requestBody).toBe('{ a: 1 }')
    })

    it('extracts body from axios config object', () => {
      const call = single("axios({ url: '/u', body: 'x' })")
      expect(call.requestBody).toBe('x')
    })

    it('extracts body from fetch options when statically resolvable', () => {
      const call = single("fetch('/u', { method: 'POST', body: 'raw' })")
      expect(call.requestBody).toBe('raw')
    })

    it('leaves requestBody undefined for variable axios payload', () => {
      const call = single('axios.post("/u", payloadVar)')
      expect(call.requestBody).toBeUndefined()
    })

    it('leaves requestBody undefined for dynamic fetch body', () => {
      const call = single("fetch('/u', { body: build() })")
      expect(call.requestBody).toBeUndefined()
    })

    it('leaves requestBody undefined for call-expression fetch body', () => {
      const call = single("fetch('/u', { method: 'POST', body: JSON.stringify({}) })")
      expect(call.requestBody).toBeUndefined()
    })
  })
})
