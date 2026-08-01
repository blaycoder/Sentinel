/**
 * contract/model.ts — normalized OpenAPI contract types.
 *
 * These types describe backend routes extracted from an OpenAPI v3 spec.
 * They are intentionally simpler than raw OAS/JSON Schema — see schema-shape.ts
 * for resolution limits.
 */

import type { HttpMethod } from '../model/api-call.js'

/** HTTP methods supported in OpenAPI operations (excludes UNKNOWN from ApiCall). */
export type ContractHttpMethod = Exclude<HttpMethod, 'UNKNOWN'>

/** Primitive-ish types representable without JSON Schema resolution. */
export type BasicSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'

export interface SchemaField {
  readonly name: string
  readonly type: BasicSchemaType
  readonly required: boolean
}

/** Resolved flat body, or explicitly unresolvable (no guessing). */
export type BodyShape =
  | { readonly kind: 'resolved'; readonly fields: readonly SchemaField[] }
  | { readonly kind: 'unresolvable'; readonly reason: string }

/** A single backend route from an OpenAPI spec. */
export interface BackendRoute {
  /** Raw OpenAPI path template, e.g. /users/{id}. */
  readonly path: string
  readonly method: ContractHttpMethod
  readonly operationId: string | undefined
  /** undefined when the operation has no requestBody (normal for GET). */
  readonly requestBody: BodyShape | undefined
  /** undefined when no 2xx response has a parseable JSON body. */
  readonly responseBody: BodyShape | undefined
}

/** Outcome of matching a frontend ApiCall against backend OpenAPI routes. */
export type MatchStatus = 'matched' | 'unmatched' | 'unresolvable'

/** One match outcome per ApiCall — always present, matched or not. */
export interface MatchResult {
  readonly apiCallId: string
  readonly status: MatchStatus
  /** Present only when status === 'matched'. */
  readonly route: BackendRoute | undefined
  readonly reason: string
}

export class OpenApiParseError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message)
    this.name = 'OpenApiParseError'
  }
}
