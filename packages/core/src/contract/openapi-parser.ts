/**
 * openapi-parser.ts — parse JSON OpenAPI v3 specs into normalized BackendRoute[].
 *
 * Parsing only — no matching against ApiCall[], no ScanConfig wiring.
 * YAML specs are explicitly rejected.
 */

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import type { Result } from '../model/result.js'
import { err, ok } from '../model/result.js'

import type { BackendRoute, BodyShape, ContractHttpMethod } from './model.js'
import { OpenApiParseError } from './model.js'
import { resolveBodyShape } from './schema-shape.js'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

type OpenApiHttpMethod = (typeof HTTP_METHODS)[number]

const METHOD_TO_CONTRACT: Record<OpenApiHttpMethod, ContractHttpMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS',
}

/**
 * Parse a JSON OpenAPI v3 document from disk into normalized backend routes.
 */
export async function parseOpenApiSpec(
  filePath: string,
): Promise<Result<BackendRoute[], OpenApiParseError>> {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.yaml' || extension === '.yml') {
    return err(new OpenApiParseError('YAML OpenAPI specs are not supported yet', undefined))
  }

  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch (cause) {
    return err(new OpenApiParseError(`Could not read OpenAPI spec: ${filePath}`, cause))
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (cause) {
    return err(new OpenApiParseError(`Invalid JSON in OpenAPI spec: ${filePath}`, cause))
  }

  const specResult = validateOpenApiSpec(parsed)
  if (!specResult.ok) {
    return specResult
  }

  const routes = extractRoutes(specResult.value)
  return ok(routes)
}

function validateOpenApiSpec(parsed: unknown): Result<Record<string, unknown>, OpenApiParseError> {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return err(new OpenApiParseError('OpenAPI spec root must be a JSON object', undefined))
  }

  const spec = parsed as Record<string, unknown>
  const openapiVersion = spec.openapi

  if (typeof openapiVersion !== 'string' || !openapiVersion.startsWith('3.')) {
    return err(new OpenApiParseError('OpenAPI spec must declare openapi version 3.x.x', undefined))
  }

  const paths = spec.paths
  if (paths === null || typeof paths !== 'object' || Array.isArray(paths)) {
    return err(new OpenApiParseError('OpenAPI spec must include a paths object', undefined))
  }

  return ok(spec)
}

function extractRoutes(spec: Record<string, unknown>): BackendRoute[] {
  const paths = spec.paths as Record<string, unknown>
  const routes: BackendRoute[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (pathItem === null || typeof pathItem !== 'object' || Array.isArray(pathItem)) {
      continue
    }

    const pathItemObj = pathItem as Record<string, unknown>

    if ('$ref' in pathItemObj) {
      continue
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItemObj[method]
      if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
        continue
      }

      routes.push(extractRoute(path, method, operation as Record<string, unknown>))
    }
  }

  return routes
}

function extractRoute(
  path: string,
  method: OpenApiHttpMethod,
  operation: Record<string, unknown>,
): BackendRoute {
  const operationId = typeof operation.operationId === 'string' ? operation.operationId : undefined

  const requestBody = extractRequestBody(operation.requestBody)
  const responseBody = extractResponseBody(operation.responses)

  return {
    path,
    method: METHOD_TO_CONTRACT[method],
    operationId,
    requestBody,
    responseBody,
  }
}

function extractRequestBody(requestBody: unknown): BodyShape | undefined {
  if (requestBody === undefined) {
    return undefined
  }

  if (requestBody === null || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return { kind: 'unresolvable', reason: 'requestBody is not a valid object' }
  }

  const schema = extractSchemaFromContent((requestBody as Record<string, unknown>).content)
  if (schema === undefined) {
    return { kind: 'unresolvable', reason: 'requestBody has no JSON schema' }
  }

  return resolveBodyShape(schema)
}

function extractResponseBody(responses: unknown): BodyShape | undefined {
  if (responses === null || typeof responses !== 'object' || Array.isArray(responses)) {
    return undefined
  }

  const responsesObj = responses as Record<string, unknown>
  const statusCode = findFirst2xxStatus(responsesObj)
  if (statusCode === undefined) {
    return undefined
  }

  const response = responsesObj[statusCode]
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    return undefined
  }

  const schema = extractSchemaFromContent((response as Record<string, unknown>).content)
  if (schema === undefined) {
    return undefined
  }

  return resolveBodyShape(schema)
}

function findFirst2xxStatus(responses: Record<string, unknown>): string | undefined {
  const keys = Object.keys(responses).sort()
  return keys.find((key) => /^2\d{2}$/.test(key))
}

function extractSchemaFromContent(content: unknown): unknown {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    return undefined
  }

  const contentObj = content as Record<string, unknown>

  const jsonEntry = contentObj['application/json']
  if (jsonEntry !== undefined) {
    return extractSchemaFromMediaType(jsonEntry)
  }

  for (const mediaType of Object.values(contentObj)) {
    const schema = extractSchemaFromMediaType(mediaType)
    if (schema !== undefined) {
      return schema
    }
  }

  return undefined
}

function extractSchemaFromMediaType(mediaType: unknown): unknown {
  if (mediaType === null || typeof mediaType !== 'object' || Array.isArray(mediaType)) {
    return undefined
  }

  const schema = (mediaType as Record<string, unknown>).schema
  return schema !== undefined ? schema : undefined
}
