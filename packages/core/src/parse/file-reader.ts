/**
 * file-reader.ts — read source file contents from disk.
 *
 * File discovery lives in scan/file-scanner.ts.
 */

import { readFile, stat } from 'node:fs/promises'

import type { Result } from '../model/result.js'
import { err, ok } from '../model/result.js'

export class FileReaderError extends Error {
  constructor(
    message: string,
    public override readonly cause: unknown,
  ) {
    super(message)
    this.name = 'FileReaderError'
  }
}

/**
 * Read the content of a single file.
 */
export async function readFileContent(
  absolutePath: string,
): Promise<Result<string, FileReaderError>> {
  try {
    const content = await readFile(absolutePath, 'utf-8')
    return ok(content)
  } catch (cause) {
    return err(new FileReaderError(`Could not read file: ${absolutePath}`, cause))
  }
}

/**
 * Get file size in bytes. Returns undefined if stat fails.
 */
export async function getFileSize(absolutePath: string): Promise<number | undefined> {
  try {
    const info = await stat(absolutePath)
    return info.size
  } catch {
    return undefined
  }
}
