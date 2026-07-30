import { describe, expect, it } from 'vitest'

import { BUILT_IN_RULES, ok } from './index.js'

describe('scaffold', () => {
  it('exports core public API', () => {
    expect(ok(1).ok).toBe(true)
    expect(BUILT_IN_RULES.size).toBeGreaterThan(0)
  })
})
