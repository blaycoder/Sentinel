/**
 * api-extractor.ts — TypeScript AST walker that extracts API call sites.
 *
 * Uses the TypeScript compiler API (tsc) to parse source files into ASTs
 * and walks them with a visitor to detect:
 *   - fetch() calls
 *   - axios / axios.get / axios.post / etc.
 *   - ky / ky.get / etc.
 *
 * WHY TypeScript compiler API over @babel/parser:
 *   - Handles TypeScript type system semantics (type assertions, generics)
 *   - No additional dep — typescript is already a peer dep
 *   - Accurate source locations (1-indexed line/column, matching TS's own diagnostics)
 *
 * This module is the most complex in the codebase. Every supported caller
 * pattern is explicitly matched — no heuristics.
 */

import { randomUUID } from 'node:crypto'

import * as ts from 'typescript'

import type { ApiCall, ApiCaller, HttpMethod, SourceLocation, UrlKind } from '../model/api-call.js'
import type { Logger } from '../model/logger.js'
import { noopLogger } from '../model/logger.js'
import type { ScanDiagnostic } from '../model/scan-result.js'

import {
  formatSyntacticDiagnosticMessage,
  getSyntacticDiagnostics,
} from './syntactic-diagnostics.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractorOptions {
  logger?: Logger
  /** When set, syntax diagnostics are appended here as unsupported-syntax entries. */
  diagnostics?: ScanDiagnostic[]
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a TypeScript/JavaScript source file and extract all API call sites.
 *
 * @param filePath   Absolute path — used for SourceLocation and error reporting.
 * @param content    Raw source text.
 * @param options    Extractor options (logger).
 * @returns          All API calls found in the file.
 */
export function extractApiCalls(
  filePath: string,
  content: string,
  options: ExtractorOptions = {},
): ApiCall[] {
  const logger = options.logger ?? noopLogger

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    detectScriptKind(filePath),
  )

  const syntaxDiagnostics = getSyntacticDiagnostics(sourceFile)
  if (syntaxDiagnostics.length > 0 && options.diagnostics !== undefined) {
    for (const diagnostic of syntaxDiagnostics) {
      const detail = formatSyntacticDiagnosticMessage(diagnostic, sourceFile)
      options.diagnostics.push({
        kind: 'unsupported-syntax',
        message: `${detail} Results for this file may be incomplete.`,
        file: filePath,
        cause: undefined,
      })
    }
  }

  const calls: ApiCall[] = []
  visitNode(sourceFile, sourceFile, calls, logger)

  logger.debug(`Extracted ${String(calls.length)} API call(s)`, { file: filePath })
  return calls
}

// ─── AST Walker ───────────────────────────────────────────────────────────────

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  accumulator: ApiCall[],
  logger: Logger,
): void {
  if (ts.isCallExpression(node)) {
    const call = tryExtractCall(node, sourceFile, logger)
    if (call !== undefined) {
      accumulator.push(call)
    }
  }

  // Continue walking children
  ts.forEachChild(node, (child) => {
    visitNode(child, sourceFile, accumulator, logger)
  })
}

function tryExtractCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  logger: Logger,
): ApiCall | undefined {
  const callerInfo = identifyCaller(node)
  if (callerInfo === undefined) return undefined

  const { caller, method } = callerInfo
  const urlArg = resolveUrlArg(node, caller)
  if (urlArg === undefined) return undefined

  const { url, urlKind } = urlArg
  const location = getLocation(node, sourceFile)
  const hasErrorHandler = detectErrorHandler(node)
  const requestBody = resolveRequestBody(node, caller, sourceFile)
  const rawExpression = node.getText(sourceFile).slice(0, 200) // Cap for safety

  logger.debug(`Found ${caller} call`, { file: sourceFile.fileName, line: location.line, url })

  return {
    id: randomUUID(),
    caller,
    method,
    url,
    urlKind,
    resolvedUrl: undefined, // Filled in by resolve/ phase
    location,
    hasErrorHandler,
    rawExpression,
    requestBody,
  }
}

// ─── Caller Detection ─────────────────────────────────────────────────────────

interface CallerInfo {
  caller: ApiCaller
  method: HttpMethod
}

/**
 * Determine if this call expression is a known API caller.
 * Returns undefined if it's not a recognised pattern.
 */
function identifyCaller(node: ts.CallExpression): CallerInfo | undefined {
  const expr = node.expression

  // TODO: resolve named/namespace imports (e.g. import { get } from 'axios')
  // TODO: support bracket-access callees (axios['get'])
  // TODO: add got / superagent caller detection
  // TODO: detect window.fetch / globalThis.fetch PropertyAccessExpression
  // TODO: support axios.request()
  // TODO: reduce generic-instance false positives (cache.get, Map.get)

  // fetch(url, options?)
  if (ts.isIdentifier(expr) && expr.text === 'fetch') {
    return { caller: 'fetch', method: extractFetchMethod(node) }
  }

  // XMLHttpRequest / xhr
  if (ts.isIdentifier(expr) && (expr.text === 'XMLHttpRequest' || expr.text === 'xhr')) {
    return { caller: 'xhr', method: 'UNKNOWN' }
  }

  if (ts.isPropertyAccessExpression(expr)) {
    const obj = expr.expression
    const prop = expr.name.text

    // axios.get / axios.post / etc.
    if (ts.isIdentifier(obj) && obj.text === 'axios') {
      const axiosCaller = matchAxiosMethod(prop)
      if (axiosCaller) return axiosCaller
    }

    // ky.get / ky.post / etc.
    if (ts.isIdentifier(obj) && obj.text === 'ky') {
      const kyCaller = matchKyMethod(prop)
      if (kyCaller) return kyCaller
    }

    // instance.get / instance.post — common pattern with axios instances
    // We detect these conservatively only when the method name exactly matches
    // an HTTP verb to avoid false positives on unrelated method chains.
    if (ts.isIdentifier(obj)) {
      const httpMethod = HTTP_METHOD_MAP[prop.toLowerCase()]
      if (httpMethod !== undefined) {
        const callerName = `${obj.text}.${prop}` as ApiCaller
        return { caller: callerName, method: httpMethod }
      }
    }
  }

  // axios({ method: 'get', url: '...' }) — called as function with config object
  if (ts.isIdentifier(expr) && expr.text === 'axios') {
    return { caller: 'axios', method: extractAxiosConfigMethod(node) }
  }

  return undefined
}

const HTTP_METHOD_MAP: Readonly<Record<string, HttpMethod>> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  del: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS',
}

function matchAxiosMethod(prop: string): CallerInfo | undefined {
  const method = HTTP_METHOD_MAP[prop.toLowerCase()]
  if (method === undefined) return undefined
  return {
    caller: `axios.${prop.toLowerCase()}` as ApiCaller,
    method,
  }
}

function matchKyMethod(prop: string): CallerInfo | undefined {
  const method = HTTP_METHOD_MAP[prop.toLowerCase()]
  if (method === undefined) return undefined
  return {
    caller: `ky.${prop.toLowerCase()}` as ApiCaller,
    method,
  }
}

// ─── URL Extraction ───────────────────────────────────────────────────────────

interface UrlInfo {
  url: string
  urlKind: UrlKind
}

function resolveUrlArg(node: ts.CallExpression, caller: ApiCaller): UrlInfo | undefined {
  // axios({ url: '...' }) — config object pattern
  if (caller === 'axios' && node.arguments.length > 0) {
    const firstArg = node.arguments[0]
    if (firstArg !== undefined && ts.isObjectLiteralExpression(firstArg)) {
      return extractUrlFromConfig(firstArg)
    }
  }

  // All other callers: first argument is the URL
  const firstArg = node.arguments[0]
  if (firstArg === undefined) return undefined

  return extractUrlFromExpression(firstArg)
}

function extractUrlFromExpression(node: ts.Expression): UrlInfo | undefined {
  if (ts.isStringLiteral(node)) {
    return { url: node.text, urlKind: 'string-literal' }
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return { url: node.text, urlKind: 'template-literal' }
  }

  if (ts.isTemplateExpression(node)) {
    // Reconstruct the template as a string with placeholder markers
    const head = node.head.text
    const spans = node.templateSpans.map((span) => {
      const expr = span.expression.getText()
      return `\${${expr}}${span.literal.text}`
    })
    return { url: head + spans.join(''), urlKind: 'template-literal' }
  }

  if (ts.isIdentifier(node)) {
    return { url: node.text, urlKind: 'identifier' }
  }

  if (ts.isCallExpression(node)) {
    return { url: node.getText(), urlKind: 'call-expression' }
  }

  // Binary expressions like '/api/' + endpoint
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = extractUrlFromExpression(node.left)
    const right = extractUrlFromExpression(node.right)
    if (left !== undefined && right !== undefined) {
      return {
        url: `${left.url}${right.url}`,
        urlKind: 'template-literal',
      }
    }
  }

  return { url: node.getText(), urlKind: 'unknown' }
}

function extractUrlFromConfig(obj: ts.ObjectLiteralExpression): UrlInfo | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'url') {
      return extractUrlFromExpression(prop.initializer)
    }
  }
  return undefined
}

// ─── Method Detection ─────────────────────────────────────────────────────────

function extractFetchMethod(node: ts.CallExpression): HttpMethod {
  // fetch(url, { method: 'POST' })
  const optionsArg = node.arguments[1]
  if (optionsArg === undefined) return 'GET' // fetch default

  if (ts.isObjectLiteralExpression(optionsArg)) {
    for (const prop of optionsArg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'method'
      ) {
        if (ts.isStringLiteral(prop.initializer)) {
          const m = HTTP_METHOD_MAP[prop.initializer.text.toLowerCase()]
          return m ?? 'UNKNOWN'
        }
      }
    }
  }

  return 'UNKNOWN'
}

function extractAxiosConfigMethod(node: ts.CallExpression): HttpMethod {
  const firstArg = node.arguments[0]
  if (firstArg === undefined || !ts.isObjectLiteralExpression(firstArg)) return 'UNKNOWN'

  for (const prop of firstArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'method'
    ) {
      if (ts.isStringLiteral(prop.initializer)) {
        const m = HTTP_METHOD_MAP[prop.initializer.text.toLowerCase()]
        return m ?? 'UNKNOWN'
      }
    }
  }

  return 'UNKNOWN'
}

// ─── Request Body Extraction ──────────────────────────────────────────────────
//
// Body extraction reuses object-literal walks similar to URL/method parsing, but
// targets payload fields instead of url/method:
//
//   ObjectLiteralExpression — fetch options, axios config, or inline { id: 1 } body.
//     A comma-separated { key: value } node; we scan .properties for named keys.
//
//   PropertyAssignment — one data:/body: entry inside that object.
//     prop.name is an Identifier ('data' | 'body'); prop.initializer is the value.
//
//   StringLiteral — static string body; read .text directly.
//
//   TemplateExpression / NoSubstitutionTemplateLiteral — template body; reconstruct
//     with ${expr} placeholders (same approach as URL template extraction).

function resolveRequestBody(
  node: ts.CallExpression,
  caller: ApiCaller,
  sourceFile: ts.SourceFile,
): string | undefined {
  // axios({ url, data }) — config object pattern
  if (caller === 'axios') {
    const firstArg = node.arguments[0]
    if (firstArg !== undefined && ts.isObjectLiteralExpression(firstArg)) {
      return extractBodyFromConfig(firstArg, sourceFile)
    }
    return undefined
  }

  // fetch(url, { body })
  if (caller === 'fetch') {
    const optionsArg = node.arguments[1]
    if (optionsArg !== undefined && ts.isObjectLiteralExpression(optionsArg)) {
      return extractBodyFromFetchOptions(optionsArg, sourceFile)
    }
    return undefined
  }

  // axios.post(url, data) / ky.post(url, data) / client.post(url, data)
  if (ts.isPropertyAccessExpression(node.expression)) {
    const secondArg = node.arguments[1]
    if (secondArg !== undefined) {
      return extractStaticBodyFromExpression(secondArg, sourceFile)
    }
  }

  return undefined
}

function extractStaticBodyFromExpression(
  node: ts.Expression,
  sourceFile: ts.SourceFile,
): string | undefined {
  if (ts.isStringLiteral(node)) {
    return node.text
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  if (ts.isTemplateExpression(node)) {
    const head = node.head.text
    const spans = node.templateSpans.map((span) => {
      const expr = span.expression.getText(sourceFile)
      return `\${${expr}}${span.literal.text}`
    })
    return head + spans.join('')
  }

  if (ts.isObjectLiteralExpression(node)) {
    return node.getText(sourceFile)
  }

  return undefined
}

function extractBodyFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  keys: readonly string[],
): string | undefined {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      keys.includes(prop.name.text)
    ) {
      return extractStaticBodyFromExpression(prop.initializer, sourceFile)
    }
  }
  return undefined
}

function extractBodyFromConfig(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): string | undefined {
  return extractBodyFromObjectLiteral(obj, sourceFile, ['data', 'body'])
}

function extractBodyFromFetchOptions(
  options: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
): string | undefined {
  return extractBodyFromObjectLiteral(options, sourceFile, ['body'])
}

// ─── Error Handler Detection ──────────────────────────────────────────────────

/**
 * Determines if the API call has error handling by walking up the AST.
 * Detects:
 *   - .catch() chaining
 *   - try/catch wrapping
 *   - .then(onFulfilled, onRejected) — second argument to .then()
 */
function detectErrorHandler(node: ts.CallExpression): boolean {
  // Check if this call is wrapped in a try block
  if (isInsideTryCatch(node)) return true

  // Check if .catch() is chained onto this call or any parent call expression
  return hasCatchChain(node)
}

function isInsideTryCatch(node: ts.Node): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- AST root may lack a parent
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTryStatement(current)) return true
    // Stop at function boundaries — a try/catch in an outer function doesn't count
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return false
    }
  }
  return false
}

function hasCatchChain(node: ts.CallExpression): boolean {
  // Walk up from node; check whether any ancestor is a .catch / .then(_, reject) chain.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- AST root may lack a parent
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isSourceFile(parent)) {
      return false
    }

    if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'catch') {
      return true
    }

    // .then(resolve, reject) — second arg is error handler
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.name.text === 'then' &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.arguments.length >= 2
    ) {
      return true
    }

    // Stop climbing at statement level
    if (ts.isExpressionStatement(parent) || ts.isVariableDeclaration(parent)) {
      return false
    }
  }

  return false
}

function getLocation(node: ts.Node, sourceFile: ts.SourceFile): SourceLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())

  return {
    file: sourceFile.fileName,
    line: start.line + 1, // Convert 0-indexed to 1-indexed
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
