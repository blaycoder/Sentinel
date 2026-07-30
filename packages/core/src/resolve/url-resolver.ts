/**
 * url-resolver.ts — resolves API call URLs using project configuration.
 *
 * Responsibilities:
 *   1. Apply baseUrl from ScanConfig to relative URL paths.
 *   2. Resolve tsconfig.json path aliases in import paths (for future use
 *      when we track where URL constants are imported from).
 *   3. Attempt partial evaluation of template literal URLs where possible.
 *
 * This module operates on the ApiCall array produced by the parse phase.
 * It returns a new array with `resolvedUrl` populated where possible.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

import type { ApiCall } from '../model/api-call.js'
import type { Logger } from '../model/logger.js'
import { noopLogger } from '../model/logger.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolverOptions {
  baseUrl?: string
  tsConfigPath?: string
  rootDir: string
  logger?: Logger
}

export interface PathAliases {
  /** Map of alias prefix → resolved path prefix */
  aliases: Map<string, string>
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve URLs in a set of ApiCalls using project configuration.
 * Returns a new array — does not mutate inputs.
 */
export function resolveUrls(calls: readonly ApiCall[], options: ResolverOptions): ApiCall[] {
  const logger = options.logger ?? noopLogger
  const aliases = loadPathAliases(options)

  return calls.map((call) => {
    const resolvedUrl = resolveUrl(call.url, call.urlKind, options, aliases, logger)
    return resolvedUrl !== undefined ? { ...call, resolvedUrl } : call
  })
}

/**
 * Load path alias definitions from tsconfig.json.
 * Returns empty aliases if tsconfig is not found or not parseable.
 */
export function loadPathAliases(options: ResolverOptions): PathAliases {
  const tsConfigPath = options.tsConfigPath ?? join(options.rootDir, 'tsconfig.json')
  const logger = options.logger ?? noopLogger

  try {
    const raw = readFileSync(tsConfigPath, 'utf-8')
    // Strip trailing commas and comments — tsconfig allows them, JSON.parse doesn't
    const cleaned = stripJsonComments(raw)
    const parsed = JSON.parse(cleaned) as unknown

    if (!isObject(parsed)) return emptyAliases()

    const compilerOptions = parsed.compilerOptions
    if (!isObject(compilerOptions)) return emptyAliases()

    const paths = compilerOptions.paths
    if (!isObject(paths)) return emptyAliases()

    const baseUrl = typeof compilerOptions.baseUrl === 'string' ? compilerOptions.baseUrl : '.'

    const aliasDir = join(dirname(tsConfigPath), baseUrl)
    const aliases = new Map<string, string>()

    for (const [alias, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets) || targets.length === 0) continue
      const firstTarget: unknown = targets[0]
      if (typeof firstTarget !== 'string') continue

      // Remove trailing /* from alias and target
      const cleanAlias = alias.replace(/\/\*$/, '')
      const cleanTarget = join(aliasDir, firstTarget.replace(/\/\*$/, ''))
      aliases.set(cleanAlias, cleanTarget)
    }

    logger.debug(`Loaded ${String(aliases.size)} path alias(es)`, { tsConfigPath })
    return { aliases }
  } catch {
    logger.debug('Could not load tsconfig path aliases', { tsConfigPath })
    return emptyAliases()
  }
}

// ─── URL Resolution ───────────────────────────────────────────────────────────

function resolveUrl(
  url: string,
  urlKind: ApiCall['urlKind'],
  options: ResolverOptions,
  _aliases: PathAliases,
  logger: Logger,
): string | undefined {
  // Only resolve string and template literals — identifiers and call expressions
  // cannot be statically resolved without full type inference.
  if (urlKind !== 'string-literal' && urlKind !== 'template-literal') {
    return undefined
  }

  const { baseUrl } = options

  if (baseUrl === undefined) return url

  // Already absolute — don't prepend baseUrl
  if (isAbsoluteUrl(url)) return url

  // Template literals with dynamic segments — extract the static prefix only
  if (urlKind === 'template-literal' && url.includes('${')) {
    const staticPrefix = url.split('${')[0] ?? url
    const resolved = joinUrl(baseUrl, staticPrefix)
    logger.debug('Partially resolved template URL', { url, resolved })
    return resolved + url.slice(staticPrefix.length)
  }

  const resolved = joinUrl(baseUrl, url)
  logger.debug('Resolved URL', { url, resolved })
  return resolved
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith('//')
}

/**
 * Join a base URL with a path, handling trailing/leading slashes.
 */
function joinUrl(base: string, path: string): string {
  const cleanBase = base.replace(/\/$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return cleanBase + cleanPath
}

function emptyAliases(): PathAliases {
  return { aliases: new Map() }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Minimal JSON comment stripper — handles line and block comments.
 * tsconfig.json allows comments (JSONC format) but JSON.parse doesn't.
 */
function stripJsonComments(jsonc: string): string {
  // Very conservative: only strip // and /* */ outside of string literals
  let result = ''
  let i = 0
  let inString = false

  while (i < jsonc.length) {
    const char = jsonc[i]
    if (char === undefined) break

    if (inString) {
      if (char === '\\') {
        result += char + (jsonc[i + 1] ?? '')
        i += 2
        continue
      }
      if (char === '"') inString = false
      result += char
      i++
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      i++
      continue
    }

    if (char === '/' && jsonc[i + 1] === '/') {
      // Line comment — skip to end of line
      while (i < jsonc.length && jsonc[i] !== '\n') i++
      continue
    }

    if (char === '/' && jsonc[i + 1] === '*') {
      // Block comment — skip to */
      i += 2
      while (i < jsonc.length && !(jsonc[i] === '*' && jsonc[i + 1] === '/')) i++
      i += 2
      continue
    }

    result += char
    i++
  }

  return result
}
