/**
 * glob.ts — minimal glob matcher for Sentinel exclude/include patterns.
 *
 * Supports **, *, and {a,b} alternation. Not RFC-compliant — handles
 * patterns in Sentinel config and .gitignore conversion only.
 */

export function matchesGlob(filePath: string, pattern: string): boolean {
  const normPath = filePath.replace(/\\/g, '/')
  const normPattern = pattern.replace(/\\/g, '/')
  const expanded = expandAlternations(normPattern)
  return expanded.some((p) => matchSingle(normPath, p))
}

export function matchesAnyGlob(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(filePath, pattern))
}

function expandAlternations(pattern: string): string[] {
  const match = /\{([^}]+)\}/.exec(pattern)
  if (match?.index === undefined) return [pattern]

  const altGroup = match[1]
  if (altGroup === undefined) return [pattern]

  const prefix = pattern.slice(0, match.index)
  const suffix = pattern.slice(match.index + match[0].length)
  const alternatives = altGroup.split(',')

  return alternatives.flatMap((alt) => expandAlternations(`${prefix}${alt}${suffix}`))
}

function matchSingle(path: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, (c) => (c === '{' || c === '}' ? c : `\\${c}`))
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')

  try {
    return new RegExp(`^${regexStr}$`).test(path)
  } catch {
    return false
  }
}
