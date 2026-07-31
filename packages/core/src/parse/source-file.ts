/**
 * source-file.ts — read a path and parse it into a TypeScript AST.
 *
 * Wraps readFileSync + ts.createSourceFile. No type-checker, no transformers —
 * just the parse step Sentinel needs before walking the tree.
 *
 * Error handling: this module throws on read failure (ENOENT, EACCES, etc.).
 * That is intentional for script/learning callers (e.g. scripts/parse-ast.ts)
 * which fail fast with a clear exit code. The production scan pipeline uses
 * readFileContent() + Result and never calls parseSourceFile.
 */

import { readFileSync } from 'node:fs'

import * as ts from 'typescript'

/**
 * Read a .ts/.tsx/.js file from disk and return its parsed SourceFile AST.
 *
 * @param filePath  Absolute or relative path (used for ScriptKind and error messages).
 */
export function parseSourceFile(filePath: string): ts.SourceFile {
  const content = readFileSync(filePath, 'utf8')

  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    detectScriptKind(filePath),
  )
}

function detectScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) return ts.ScriptKind.TSX
  if (filePath.endsWith('.ts') || filePath.endsWith('.cts') || filePath.endsWith('.mts')) {
    return ts.ScriptKind.TS
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.cjs') || filePath.endsWith('.mjs')) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.Unknown
}
