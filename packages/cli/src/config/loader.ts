/**
 * config/loader.ts — sentinel.config.ts finder and loader.
 *
 * Walks up the directory tree from the rootDir looking for:
 *   1. sentinel.config.ts
 *   2. sentinel.config.js
 *   3. sentinel.config.mjs
 *   4. .sentinelrc.json
 *
 * Merges the found config with the ScanConfig defaults via resolveConfig().
 *
 * NOTE: We use dynamic import() for .ts/.js configs so they can be ESM modules.
 * For this to work with .ts files, the user must have tsx or ts-node installed,
 * OR the config file must be pre-compiled. In practice, most projects have tsx
 * already (it's in the monorepo devDeps). We document this requirement clearly.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveConfig } from '@sentinel-scan/core'
import type { ScanConfig, SentinelConfig } from '@sentinel-scan/core'

// ─── Types ────────────────────────────────────────────────────────────────────

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly configPath: string,
    public override readonly cause: unknown,
  ) {
    super(message)
    this.name = 'ConfigLoadError'
  }
}

export interface LoadedConfig {
  config: ScanConfig
  configPath: string | undefined // undefined if using all defaults
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the Sentinel config for a given directory, walking up if needed.
 * Merges with defaults via resolveConfig().
 *
 * @param startDir  Start searching from this directory.
 * @param explicit  An explicit config path provided via --config flag.
 */
export async function loadConfig(startDir: string, explicit?: string): Promise<LoadedConfig> {
  if (explicit !== undefined) {
    const configPath = resolve(explicit)
    const raw = await importConfig(configPath)
    return { config: resolveConfig({ ...raw, rootDir: startDir }), configPath }
  }

  const found = findConfigFile(startDir)

  if (found === undefined) {
    // No config found — use all defaults with rootDir set
    return { config: resolveConfig({ rootDir: startDir }), configPath: undefined }
  }

  const raw = await importConfig(found)
  // rootDir defaults to the directory containing the config file
  const defaultRootDir = dirname(found)
  return {
    config: resolveConfig({ rootDir: defaultRootDir, ...raw }),
    configPath: found,
  }
}

// ─── Config File Discovery ─────────────────────────────────────────────────────

const CONFIG_FILENAMES = [
  'sentinel.config.ts',
  'sentinel.config.js',
  'sentinel.config.mjs',
  '.sentinelrc.json',
] as const

/**
 * Walk up from startDir, looking for a sentinel config file.
 * Stops at filesystem root.
 */
export function findConfigFile(startDir: string): string | undefined {
  let dir = resolve(startDir)

  for (;;) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = join(dir, filename)
      if (existsSync(candidate)) return candidate
    }

    const parent = dirname(dir)
    if (parent === dir) return undefined // Reached filesystem root
    dir = parent
  }
}

// ─── Config Importers ─────────────────────────────────────────────────────────

async function importConfig(configPath: string): Promise<SentinelConfig> {
  try {
    if (configPath.endsWith('.json')) {
      return importJsonConfig(configPath)
    }
    return await importModuleConfig(configPath)
  } catch (cause) {
    throw new ConfigLoadError(
      `Failed to load config from ${configPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      configPath,
      cause,
    )
  }
}

function importJsonConfig(configPath: string): SentinelConfig {
  const raw = readFileSync(configPath, 'utf-8')
  const parsed = JSON.parse(raw) as unknown
  return validateConfig(parsed, configPath)
}

async function importModuleConfig(configPath: string): Promise<SentinelConfig> {
  // Use file:// URL for Windows compatibility
  const fileUrl = pathToFileURL(configPath).href
  const module = (await import(fileUrl)) as Record<string, unknown>

  // Support both `export default` and `module.exports =`
  const exported = module.default ?? module
  return validateConfig(exported, configPath)
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Hand-rolled config validator. We don't use zod to avoid a runtime dep.
 * Validates the shape of a user-provided config object.
 */
function validateConfig(raw: unknown, configPath: string): SentinelConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigLoadError(
      `Config must export an object. Got: ${typeof raw}`,
      configPath,
      undefined,
    )
  }

  const config = raw as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if ('include' in config) {
    if (!isStringArray(config.include)) {
      throw new ConfigLoadError(`'include' must be an array of strings`, configPath, undefined)
    }
    result.include = config.include
  }

  if ('exclude' in config) {
    if (!isStringArray(config.exclude)) {
      throw new ConfigLoadError(`'exclude' must be an array of strings`, configPath, undefined)
    }
    result.exclude = config.exclude
  }

  if ('rootDir' in config) {
    if (typeof config.rootDir !== 'string') {
      throw new ConfigLoadError(`'rootDir' must be a string`, configPath, undefined)
    }
    result.rootDir = config.rootDir
  }

  if ('rules' in config) {
    if (!isObject(config.rules)) {
      throw new ConfigLoadError(`'rules' must be an object`, configPath, undefined)
    }
    result.rules = config.rules
  }

  if ('tsConfigPath' in config) {
    if (config.tsConfigPath !== undefined && typeof config.tsConfigPath !== 'string') {
      throw new ConfigLoadError(
        `'tsConfigPath' must be a string or undefined`,
        configPath,
        undefined,
      )
    }
    result.tsConfigPath = config.tsConfigPath
  }

  if ('baseUrl' in config) {
    if (config.baseUrl !== undefined && typeof config.baseUrl !== 'string') {
      throw new ConfigLoadError(`'baseUrl' must be a string or undefined`, configPath, undefined)
    }
    result.baseUrl = config.baseUrl
  }

  if ('contractSource' in config) {
    if (config.contractSource !== undefined && typeof config.contractSource !== 'string') {
      throw new ConfigLoadError(
        `'contractSource' must be a string or undefined`,
        configPath,
        undefined,
      )
    }
    result.contractSource = config.contractSource
  }

  return result
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
