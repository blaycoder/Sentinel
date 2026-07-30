/**
 * Result<T, E> — a typed discriminated union for recoverable errors.
 *
 * This is intentionally hand-rolled. It is ~15 lines, covers our needs exactly,
 * and avoids pulling in a functional programming library as a dependency.
 *
 * Usage:
 *   function doSomething(): Result<string, SentinelError> {
 *     if (failed) return err(new SentinelError('...'))
 *     return ok('value')
 *   }
 *
 *   const result = doSomething()
 *   if (result.ok) {
 *     console.log(result.value)
 *   } else {
 *     console.error(result.error.message)
 *   }
 */

export interface Ok<T> {
  readonly ok: true
  readonly value: T
}
export interface Err<E> {
  readonly ok: false
  readonly error: E
}
export type Result<T, E> = Ok<T> | Err<E>

/** Construct a successful Result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

/** Construct a failed Result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

/** Narrow a Result to its value, throwing the error if not ok. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  if (result.error instanceof Error) throw result.error
  throw new Error(String(result.error))
}

/** Map the value of an Ok result, leaving Err unchanged. */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Map the error of an Err result, leaving Ok unchanged. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error))
}
