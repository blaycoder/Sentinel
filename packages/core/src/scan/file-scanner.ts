/**
 * file-scanner.ts — recursively discover source files under a root directory.
 *
 * Hand-rolled using node:fs/promises (no fast-glob). Single entry point
 * for CLI, runner, and future API extractor consumers.
 */

import type { Dirent } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

import type { Logger } from '../model/logger.js'
import { noopLogger } from '../model/logger.js'
import type { Result } from '../model/result.js'
import { err, ok } from '../model/result.js'

import { parseGitignoreLines } from './gitignore.js'
import { matchesAnyGlob } from './glob.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single source file discovered under rootDir. */
export interface ScannedFile {
  /** Absolute path, normalized (platform path.resolve). */
  readonly absolutePath: string
  /** Path relative to rootDir, forward-slash normalized (POSIX-style). */
  readonly relativePath: string
  /** Lowercase extension including dot, e.g. '.tsx' */
  readonly extension: string
}

export interface FileScannerOptions {
  /** Root directory to scan (must exist and be a directory). */
  readonly rootDir: string
  /**
   * Glob patterns a file must match at least one of to be included.
   * When omitted or empty, all discovered source extensions are included.
   */
  readonly include?: readonly string[]
  /** Additional glob patterns to exclude (merged with defaults). */
  readonly extraIgnore?: readonly string[]
  /** When true (default), merge patterns from .gitignore files found during walk. */
  readonly respectGitignore?: boolean
  /** Logger for warnings (permission denied) and info (empty result). */
  readonly logger?: Logger
}

export class FileScannerError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message)
    this.name = 'FileScannerError'
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.env',
  'out',
])

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Recursively discover .ts, .tsx, .js, .jsx, .mts, and .cts files under rootDir.
 *
 * When `include` patterns are provided, a file must match at least one to be
 * returned. Exclude patterns reject files that match any ignore glob.
 *
 * Non-fatal errors (permission denied on a subdirectory) warn and continue.
 * Fatal errors (root unreadable) return err().
 */
export async function scanFiles(
  options: FileScannerOptions,
): Promise<Result<ScannedFile[], FileScannerError>> {
  const rootDir = resolve(options.rootDir)
  const logger = options.logger ?? noopLogger
  const respectGitignore = options.respectGitignore !== false
  const ignorePatterns = [...(options.extraIgnore ?? [])]
  const includePatterns = [...(options.include ?? [])]

  try {
    const files: ScannedFile[] = []
    await walkDir(
      rootDir,
      rootDir,
      ignorePatterns,
      includePatterns,
      respectGitignore,
      logger,
      files,
    )

    if (files.length === 0) {
      logger.info('No matching source files found', { rootDir })
    }

    return ok(files)
  } catch (cause) {
    return err(new FileScannerError(`Failed to scan directory: ${rootDir}`, cause))
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function walkDir(
  dir: string,
  rootDir: string,
  ignorePatterns: readonly string[],
  includePatterns: readonly string[],
  respectGitignore: boolean,
  logger: Logger,
  accumulator: ScannedFile[],
): Promise<void> {
  let entries: Dirent[]

  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch (error) {
    if (isPermissionError(error)) {
      logger.warn('Permission denied, skipping directory', { path: dir })
      return
    }

    if (dir === rootDir) {
      throw error
    }

    logger.warn('Could not read directory, skipping', {
      path: dir,
      cause: error instanceof Error ? error.message : String(error),
    })
    return
  }

  const dirRelative = normalizeRelativePath(relative(rootDir, dir))
  const localIgnorePatterns = [...ignorePatterns]

  if (respectGitignore) {
    const gitignorePatterns = await loadGitignorePatterns(dir, dirRelative)
    localIgnorePatterns.push(...gitignorePatterns)
  }

  for (const entry of entries) {
    const absolutePath = resolve(join(dir, entry.name))
    const relativePath = normalizeRelativePath(relative(rootDir, absolutePath))

    if (entry.isSymbolicLink()) {
      logger.debug('Skipping symlink', { path: relativePath })
      continue
    }

    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue
      if (isIgnoredPath(relativePath, localIgnorePatterns, true)) continue
      await walkDir(
        absolutePath,
        rootDir,
        localIgnorePatterns,
        includePatterns,
        respectGitignore,
        logger,
        accumulator,
      )
      continue
    }

    if (!entry.isFile()) continue
    if (isIgnoredPath(relativePath, localIgnorePatterns, false)) continue

    const extension = extname(relativePath).toLowerCase()
    if (!SOURCE_EXTENSIONS.has(extension)) continue
    if (!isIncludedPath(relativePath, includePatterns)) continue

    accumulator.push({
      absolutePath,
      relativePath,
      extension,
    })
  }
}

async function loadGitignorePatterns(dir: string, dirRelative: string): Promise<string[]> {
  const gitignorePath = join(dir, '.gitignore')

  try {
    const content = await readFile(gitignorePath, 'utf-8')
    return parseGitignoreLines(content, dirRelative)
  } catch (error) {
    if (isNotFoundError(error)) return []
    return []
  }
}

function isIgnoredPath(
  relativePath: string,
  ignorePatterns: readonly string[],
  isDirectory: boolean,
): boolean {
  if (matchesAnyGlob(relativePath, ignorePatterns)) return true

  if (isDirectory) {
    return matchesAnyGlob(`${relativePath}/**`, ignorePatterns)
  }

  return false
}

function isIncludedPath(relativePath: string, includePatterns: readonly string[]): boolean {
  if (includePatterns.length === 0) return true
  return matchesAnyGlob(relativePath, includePatterns)
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function isPermissionError(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'EACCES' || error.code === 'EPERM')
}

function isNotFoundError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
