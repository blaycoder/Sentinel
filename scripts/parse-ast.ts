/**
 * AST Parse Learning Script
 *
 * Section 1: full SyntaxKind tree (printTree)
 * Section 2: CallExpression-only walk (printCallExpressions)
 *
 * Run from repo root:
 *   npm run parse-ast          → reads ./sample.ts
 *   npm run parse-ast:tsx       → reads ./sample.tsx (includes JSX nodes)
 *
 * Compare the output with https://astexplorer.net (select "typescript").
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSourceFile } from '@sentinel-scan/core'
import * as ts from 'typescript'

// ─── Resolve paths relative to repo root ─────────────────────────────────────
//
// parseSourceFile (from @sentinel-scan/core) reads the file and runs createSourceFile.
// The script only chooses which sample file to parse.

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')

const useTsx = process.argv.includes('--tsx')
const sampleFileName = useTsx ? 'sample.tsx' : 'sample.ts'
const samplePath = join(repoRoot, sampleFileName)

let sourceFile: ts.SourceFile
try {
  sourceFile = parseSourceFile(samplePath)
} catch {
  console.error(`Could not read or parse ${samplePath}`)
  process.exit(1)
}

console.log(`\nParsing: ${sampleFileName}\n${'─'.repeat(60)}\n`)

// ─── Babel "plugins" vs TypeScript's integrated parser ───────────────────────
//
// Babel is a pluggable pipeline: you add @babel/plugin-syntax-jsx,
// @babel/preset-typescript, etc. because Babel's core parser does not know
// about every language extension out of the box.
//
// The TypeScript Compiler API is a single integrated parser. Pass
// ScriptKind.TSX and JSX is parsed natively — no plugin array required.
//
// Note: TS does have "transformers" (ts.transform) for emit/codemods — a
// different concept from Babel plugins. We use neither here; parsing only.

// ─── JSX vs CallExpression (when using sample.tsx) ───────────────────────────
//
// Side-by-side in the AST:
//
//   fetch(url)              → CallExpression
//                               └─ expression: Identifier ("fetch")
//
//   axios.get(url)          → CallExpression
//                               └─ expression: PropertyAccessExpression (axios.get)
//                                  (Babel calls this MemberExpression)
//
//   <span>{name}</span>     → JsxElement
//                               ├─ openingElement: JsxOpeningElement ("span")
//                               ├─ children: JsxExpression { expression: Identifier }
//                               └─ closingElement: JsxClosingElement
//
// JSX nodes are NOT CallExpressions in the TS AST. A build step may later
// desugar JSX to React.createElement(...) calls, but the parser preserves
// JsxElement / JsxSelfClosingElement nodes as distinct syntax.

if (useTsx) {
  console.log(
    'Note: sample.tsx includes JSX — look for JsxElement / JsxOpeningElement nodes.\n' +
      '      Compare with CallExpression nodes from fetch() and axios.get().\n',
  )
}

// ─── Walk the tree and print SyntaxKind names ──────────────────────────────────
//
// ts.forEachChild visits only real AST child nodes (not comment/token noise).
// ts.forEachChild is preferred over node.getChildren() for traversal because
// getChildren() also returns punctuation tokens (parens, semicolons, etc.).

/** Human-readable label for a node kind, e.g. "CallExpression". */
function kindName(node: ts.Node): string {
  const name = ts.SyntaxKind[node.kind]
  return typeof name === 'string' ? name : `Unknown(${String(node.kind)})`
}

/**
 * Optional hint appended to a line for leaf-ish nodes that carry useful text.
 * Keeps output readable without dumping raw JSON.
 */
function nodeHint(node: ts.Node): string {
  if (ts.isIdentifier(node)) {
    return `  (${node.text})`
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return `  ("${node.text}")`
  }
  if (ts.isNumericLiteral(node)) {
    return `  (${node.text})`
  }
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const tag = node.tagName.getText(sourceFile)
    return `  (<${tag}>)`
  }
  if (ts.isJsxClosingElement(node)) {
    const tag = node.tagName.getText(sourceFile)
    return `  (</${tag}>)`
  }
  return ''
}

/** Recursively print each node kind, indented by depth. */
function printTree(node: ts.Node, depth = 0): void {
  const indent = '  '.repeat(depth)
  console.log(`${indent}${kindName(node)}${nodeHint(node)}`)

  ts.forEachChild(node, (child) => {
    printTree(child, depth + 1)
  })
}

printTree(sourceFile)

// ─── CallExpression-only walk ────────────────────────────────────────────────
//
// Same depth-first pre-order as printTree: handle the current node, then walk
// each child left-to-right via ts.forEachChild. printTree does this for every
// SyntaxKind; here we filter with node.kind === ts.SyntaxKind.CallExpression.
//
// Visitor pattern (OOP): frameworks like Babel use objects such as
// { CallExpression(path) { ... } }. The TS Compiler API uses manual dispatch —
// if (ts.isCallExpression(node)) — plus recursive forEachChild. Same idea, no
// visitor class required.
//
// We do NOT use ts.transform / transformer visitors here. Transformers mutate or
// emit AST nodes during compilation. Static analysis only reads the tree; reach
// for ts.transform when codemodding or custom emit.
//
// Traversal order for foo(bar(1), baz()) — verify in sample.ts demoCallOrder:
//   1. foo  (depth 0 — outer call)
//   2. bar  (depth 1 — first argument)
//   3. baz  (depth 1 — second argument)

console.log(`\n${'─'.repeat(60)}`)
console.log('CallExpression walk (pre-order, depth-first)\n')

/** Resolve a human-readable callable name from CallExpression.expression. */
function getCallableName(expression: ts.Expression, file: ts.SourceFile): string {
  // Plain call: fetch(url), foo(), get('/api')
  if (ts.isIdentifier(expression)) {
    return expression.text
  }

  // Member call: axios.get(url), client.post(url)
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.getText(file)
  }

  // obj[method](url), (() => {})(), await fn() — no stable name
  return 'anonymous'
}

/** Format 1-indexed line:column for a node (matches Sentinel diagnostics). */
function formatLocation(node: ts.Node, file: ts.SourceFile): string {
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart())
  return `${String(line + 1)}:${String(character + 1)}`
}

/**
 * Walk the AST and print only CallExpression nodes, including nested calls
 * (e.g. bar inside foo(bar(1), baz())).
 */
function printCallExpressions(file: ts.SourceFile, node: ts.Node = file, callDepth = 0): void {
  if (node.kind === ts.SyntaxKind.CallExpression) {
    const call = node as ts.CallExpression
    const indent = '  '.repeat(callDepth)
    const name = getCallableName(call.expression, file)
    const loc = formatLocation(call, file)
    console.log(`${indent}${name} @ ${loc}`)
  }

  const nextDepth = ts.isCallExpression(node) ? callDepth + 1 : callDepth

  ts.forEachChild(node, (child) => {
    printCallExpressions(file, child, nextDepth)
  })
}

printCallExpressions(sourceFile)

console.log(`\n${'─'.repeat(60)}`)
console.log(
  `Done. Root node: ${kindName(sourceFile)} (${String(sourceFile.statements.length)} top-level statements)\n`,
)
