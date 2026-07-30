import { describe, expect, it } from 'vitest'

import { parseGitignoreLines } from './gitignore.js'

describe('parseGitignoreLines', () => {
  it('skips blank lines and comments', () => {
    const patterns = parseGitignoreLines(
      `
# comment
dist

.env
`,
      '',
    )

    expect(patterns).toEqual(['**/dist', '**/.env'])
  })

  it('handles root-anchored patterns', () => {
    const patterns = parseGitignoreLines('/build\n', '')
    expect(patterns).toEqual(['build'])
  })

  it('prefixes patterns with gitignore directory', () => {
    const patterns = parseGitignoreLines('temp\n/logs\n', 'src')
    expect(patterns).toEqual(['src/**/temp', 'src/logs'])
  })
})
