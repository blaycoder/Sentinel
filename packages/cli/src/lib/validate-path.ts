import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import { err, ok, type Result } from '@sentinel-scan/core'

import { PathValidationError } from './errors.js'

export function validateScanPath(rawPath: string): Result<string, PathValidationError> {
  const resolvedPath = resolve(rawPath)

  try {
    const stats = statSync(resolvedPath)

    if (!stats.isDirectory()) {
      return err(new PathValidationError(`Path is not a directory: ${resolvedPath}`))
    }

    return ok(resolvedPath)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return err(new PathValidationError(`Path does not exist: ${resolvedPath}`))
    }

    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
