/**
 * gitignore.ts — parse .gitignore files into root-relative glob patterns.
 *
 * Hand-rolled subset: blank lines, comments, simple patterns.
 * Does not support negation (!) or full git escape rules.
 */

/**
 * Parse .gitignore content into glob patterns relative to the scan root.
 *
 * @param content Raw .gitignore file content
 * @param gitignoreRelDir Directory containing .gitignore, relative to scan root (POSIX)
 */
export function parseGitignoreLines(content: string, gitignoreRelDir: string): string[] {
  const patterns: string[] = []
  const relDir = normalizeRelDir(gitignoreRelDir)

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue

    const pattern = gitignoreLineToRootGlob(line, relDir)
    if (pattern.length > 0) {
      patterns.push(pattern)
    }
  }

  return patterns
}

function normalizeRelDir(dir: string): string {
  return dir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function gitignoreLineToRootGlob(line: string, gitignoreRelDir: string): string {
  const prefix = gitignoreRelDir.length > 0 ? `${gitignoreRelDir}/` : ''

  if (line.startsWith('/')) {
    return `${prefix}${line.slice(1)}`
  }

  if (line.includes('/')) {
    return `${prefix}${line}`
  }

  if (gitignoreRelDir.length > 0) {
    return `${prefix}**/${line}`
  }

  return `**/${line}`
}
