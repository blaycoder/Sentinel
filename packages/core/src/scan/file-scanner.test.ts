import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Logger } from '../model/logger.js'
import { describe, expect, it } from 'vitest'

import { scanFiles } from './file-scanner.js'

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, unknown>
}

function makeCapturingLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = []

  const logger: Logger = {
    debug(message, meta) {
      entries.push(meta === undefined ? { level: 'debug', message } : { level: 'debug', message, meta })
    },
    info(message, meta) {
      entries.push(meta === undefined ? { level: 'info', message } : { level: 'info', message, meta })
    },
    warn(message, meta) {
      entries.push(meta === undefined ? { level: 'warn', message } : { level: 'warn', message, meta })
    },
    error(message, meta) {
      entries.push(meta === undefined ? { level: 'error', message } : { level: 'error', message, meta })
    },
  }

  return { logger, entries }
}

function createFixture(): string {
  return mkdtempSync(join(tmpdir(), 'sentinel-file-scanner-'))
}

describe('scanFiles', () => {
  it('discovers nested source files with relativePath and extension', async () => {
    const root = createFixture()

    try {
      mkdirSync(join(root, 'src', 'deep'), { recursive: true })
      writeFileSync(join(root, 'src', 'a.ts'), 'export {}')
      writeFileSync(join(root, 'src', 'deep', 'b.tsx'), 'export {}')

      const result = await scanFiles({ rootDir: root })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(2)
      expect(result.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            relativePath: 'src/a.ts',
            extension: '.ts',
          }),
          expect.objectContaining({
            relativePath: 'src/deep/b.tsx',
            extension: '.tsx',
          }),
        ]),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('excludes default ignored directories', async () => {
    const root = createFixture()

    try {
      mkdirSync(join(root, 'node_modules'), { recursive: true })
      mkdirSync(join(root, 'dist'), { recursive: true })
      mkdirSync(join(root, 'coverage'), { recursive: true })
      writeFileSync(join(root, 'index.ts'), 'export {}')
      writeFileSync(join(root, 'node_modules', 'bad.ts'), 'export {}')
      writeFileSync(join(root, 'dist', 'bad.ts'), 'export {}')
      writeFileSync(join(root, 'coverage', 'bad.ts'), 'export {}')

      const result = await scanFiles({ rootDir: root })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.relativePath).toBe('index.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('respects custom extraIgnore patterns', async () => {
    const root = createFixture()

    try {
      mkdirSync(join(root, 'generated'), { recursive: true })
      writeFileSync(join(root, 'index.ts'), 'export {}')
      writeFileSync(join(root, 'generated', 'foo.ts'), 'export {}')

      const result = await scanFiles({
        rootDir: root,
        extraIgnore: ['generated/**'],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.relativePath).toBe('index.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('respects .gitignore patterns', async () => {
    const root = createFixture()

    try {
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, '.gitignore'), 'ignored.ts\n')
      writeFileSync(join(root, 'src', 'kept.ts'), 'export {}')
      writeFileSync(join(root, 'src', 'ignored.ts'), 'export {}')

      const result = await scanFiles({ rootDir: root })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.relativePath).toBe('src/kept.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not follow symlinks', async () => {
    const root = createFixture()

    try {
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'src', 'real.ts'), 'export {}')

      const loopDir = join(root, 'loop')
      mkdirSync(loopDir, { recursive: true })
      try {
        symlinkSync(loopDir, join(root, 'src', 'link-to-loop'), 'dir')
      } catch {
        // Symlinks may require elevated privileges on Windows — skip assertion
        return
      }

      writeFileSync(join(loopDir, 'inside.ts'), 'export {}')

      const { logger, entries } = makeCapturingLogger()
      const result = await scanFiles({ rootDir: root, logger })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.some((f) => f.relativePath === 'loop/inside.ts')).toBe(false)
      expect(entries.some((e) => e.level === 'debug' && e.message === 'Skipping symlink')).toBe(
        true,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('logs info when no matching files are found', async () => {
    const root = createFixture()
    const { logger, entries } = makeCapturingLogger()

    try {
      writeFileSync(join(root, 'readme.md'), '# hello')

      const result = await scanFiles({ rootDir: root, logger })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value).toHaveLength(0)
      expect(
        entries.some(
          (e) => e.level === 'info' && e.message === 'No matching source files found',
        ),
      ).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
