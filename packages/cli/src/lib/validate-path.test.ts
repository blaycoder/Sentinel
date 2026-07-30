import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateScanPath } from './validate-path.js'

describe('validateScanPath', () => {
  it('returns ok for an existing directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-scan-'))

    try {
      const result = validateScanPath(dir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(dir)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns err when path does not exist', () => {
    const result = validateScanPath(join(tmpdir(), 'sentinel-missing-path-xyz'))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('does not exist')
    }
  })

  it('returns err when path exists but is a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-scan-'))
    const file = join(dir, 'not-a-dir.txt')
    writeFileSync(file, 'hello')

    try {
      const result = validateScanPath(file)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('not a directory')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
