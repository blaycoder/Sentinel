import { describe, expect, it } from 'vitest'

import { matchesAnyGlob, matchesGlob } from './glob.js'

describe('matchesGlob', () => {
  it('matches **/*.min.js for nested vendor lib paths', () => {
    expect(matchesGlob('src/assets/js/lib/jquery-3.7.1.min.js', '**/*.min.js')).toBe(true)
    expect(matchesGlob('src/assets/js/lib/apexcharts.min.js', '**/*.min.js')).toBe(true)
  })

  it('matches **/*.min.mjs for nested paths', () => {
    expect(matchesGlob('src/assets/js/lib/widget.min.mjs', '**/*.min.mjs')).toBe(true)
  })

  it('does not match non-minified .js files with **/*.min.js', () => {
    expect(matchesGlob('src/app.js', '**/*.min.js')).toBe(false)
  })

  it('matches **/vendor/** for top-level vendor files and directory pruning paths', () => {
    expect(matchesGlob('vendor/jquery.js', '**/vendor/**')).toBe(true)
    expect(matchesGlob('vendor/**', '**/vendor/**')).toBe(true)
    expect(matchesGlob('packages/foo/vendor/**', '**/vendor/**')).toBe(true)
  })

  it('does not match deeply nested vendor file paths directly (file-scanner prunes via dir/**)', () => {
    expect(matchesGlob('vendor/jquery/dist/jquery.js', '**/vendor/**')).toBe(false)
  })

  it('is case-sensitive (no case-insensitive matching)', () => {
    expect(matchesGlob('src/Foo.MIN.js', '**/*.min.js')).toBe(false)
    expect(matchesGlob('src/Foo.min.js', '**/*.min.js')).toBe(true)
  })
})

describe('matchesAnyGlob', () => {
  it('returns true when any pattern matches', () => {
    const patterns = ['**/*.min.js', '**/vendor/**'] as const
    expect(matchesAnyGlob('src/assets/js/lib/jquery.min.js', patterns)).toBe(true)
    expect(matchesAnyGlob('vendor/jquery.js', patterns)).toBe(true)
    expect(matchesAnyGlob('src/app.ts', patterns)).toBe(false)
  })
})
