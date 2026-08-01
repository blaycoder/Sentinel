import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OpenApiParseError } from './model.js'
import { parseOpenApiSpec } from './openapi-parser.js'
import { resolveBodyShape } from './schema-shape.js'

function createFixture(): string {
  return mkdtempSync(join(tmpdir(), 'sentinel-openapi-'))
}

function writeSpec(root: string, fileName: string, spec: unknown): string {
  const filePath = join(root, fileName)
  writeFileSync(filePath, JSON.stringify(spec), 'utf8')
  return filePath
}

describe('resolveBodyShape', () => {
  it('marks $ref schemas as unresolvable', () => {
    const shape = resolveBodyShape({
      $ref: '#/components/schemas/User',
    })

    expect(shape.kind).toBe('unresolvable')
  })

  it('marks oneOf schemas as unresolvable', () => {
    const shape = resolveBodyShape({
      type: 'object',
      oneOf: [{ type: 'string' }, { type: 'number' }],
    })

    expect(shape.kind).toBe('unresolvable')
  })
})

describe('parseOpenApiSpec', () => {
  it('parses a minimal valid spec with flat request and response bodies', async () => {
    const root = createFixture()

    try {
      const filePath = writeSpec(root, 'api.json', {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: {
                        name: { type: 'string' },
                        age: { type: 'integer' },
                      },
                    },
                  },
                },
              },
              responses: {
                '201': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })

      const result = await parseOpenApiSpec(filePath)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(2)

      const postRoute = result.value.find((route) => route.method === 'POST')
      expect(postRoute).toEqual(
        expect.objectContaining({
          path: '/users',
          operationId: 'createUser',
        }),
      )
      expect(postRoute?.requestBody?.kind).toBe('resolved')
      if (postRoute?.requestBody?.kind === 'resolved') {
        expect(postRoute.requestBody.fields).toEqual(
          expect.arrayContaining([
            { name: 'name', type: 'string', required: true },
            { name: 'age', type: 'integer', required: false },
          ]),
        )
      }
      expect(postRoute?.responseBody?.kind).toBe('resolved')

      const getRoute = result.value.find((route) => route.method === 'GET')
      expect(getRoute).toEqual(
        expect.objectContaining({
          path: '/users/{id}',
          operationId: 'getUser',
          requestBody: undefined,
        }),
      )
      expect(getRoute?.responseBody?.kind).toBe('resolved')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks routes with unresolvable request body schemas without crashing', async () => {
    const root = createFixture()

    try {
      const filePath = writeSpec(root, 'ref.json', {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/items': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/ItemInput',
                    },
                  },
                },
              },
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
        },
      })

      const result = await parseOpenApiSpec(filePath)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.requestBody?.kind).toBe('unresolvable')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns an error Result for malformed JSON without throwing', async () => {
    const root = createFixture()

    try {
      const filePath = join(root, 'broken.json')
      writeFileSync(filePath, '{ not valid json', 'utf8')

      const result = await parseOpenApiSpec(filePath)

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error).toBeInstanceOf(OpenApiParseError)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns an error Result for a missing file without throwing', async () => {
    const result = await parseOpenApiSpec(join(tmpdir(), 'sentinel-missing-openapi.json'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toBeInstanceOf(OpenApiParseError)
  })

  it('parses GET routes without requestBody', async () => {
    const root = createFixture()

    try {
      const filePath = writeSpec(root, 'get-only.json', {
        openapi: '3.0.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/health': {
            get: {
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
        },
      })

      const result = await parseOpenApiSpec(filePath)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.method).toBe('GET')
      expect(result.value[0]?.requestBody).toBeUndefined()
      expect(result.value[0]?.responseBody).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects YAML spec files explicitly', async () => {
    const root = createFixture()

    try {
      const filePath = join(root, 'api.yaml')
      writeFileSync(filePath, 'openapi: 3.0.0', 'utf8')

      const result = await parseOpenApiSpec(filePath)

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error.message).toContain('YAML')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
