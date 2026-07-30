/**
 * ApiCall — the canonical representation of a single API call site extracted
 * from the source code.
 *
 * This is the primary output of the parse phase and the primary input to rules.
 * Its shape is frozen: changes require a major version bump.
 */

/** The HTTP method of an API call. 'UNKNOWN' when it cannot be statically determined. */
export type HttpMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'UNKNOWN'

/** How the URL was expressed in source code. */
export type UrlKind =
  | 'string-literal' // fetch('/api/users')
  | 'template-literal' // fetch(`/api/users/${id}`)
  | 'identifier' // fetch(apiUrl) — URL is a variable reference
  | 'call-expression' // fetch(buildUrl('users')) — URL is computed
  | 'unknown'

/** A precise location in a source file. All values are 1-indexed. */
export interface SourceLocation {
  readonly file: string // Absolute path
  readonly line: number // 1-indexed
  readonly column: number // 1-indexed
  readonly endLine: number
  readonly endColumn: number
}

/**
 * A single API call site extracted from the source code.
 *
 * @property url         The raw URL string as written. For template literals,
 *                       this is the template with placeholders (e.g. `/api/${id}`).
 * @property resolvedUrl The URL after resolving baseURL config (if determinable).
 *                       Undefined if it cannot be statically resolved.
 */
export interface ApiCall {
  /** Unique identifier for this call site within a scan. */
  readonly id: string
  /** The API caller library/pattern detected. */
  readonly caller: ApiCaller
  /** HTTP method, if statically determinable. */
  readonly method: HttpMethod
  /** URL as written in source. */
  readonly url: string
  /** How the URL was expressed. */
  readonly urlKind: UrlKind
  /** URL after baseURL composition (if resolvable). */
  readonly resolvedUrl: string | undefined
  /** Location of the call expression in source. */
  readonly location: SourceLocation
  /** Whether the call has a .catch() / try-catch / error callback. */
  readonly hasErrorHandler: boolean
  /** Raw TypeScript AST node text for debugging. */
  readonly rawExpression: string
}

/**
 * The library or pattern that made the API call.
 * Extensible: third-party rules may produce custom caller strings.
 */
export type ApiCaller =
  | 'fetch'
  | 'axios'
  | 'axios.get'
  | 'axios.post'
  | 'axios.put'
  | 'axios.patch'
  | 'axios.delete'
  | 'axios.head'
  | 'axios.options'
  | 'axios.request'
  | 'ky'
  | 'ky.get'
  | 'ky.post'
  | 'ky.put'
  | 'ky.patch'
  | 'ky.delete'
  | 'got'
  | 'superagent'
  | 'xhr'
  | (string & Record<never, never>) // Allow custom callers while preserving autocomplete
