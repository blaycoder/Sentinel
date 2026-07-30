/**
 * scanner.ts — the main orchestrator for a Sentinel scan.
 *
 * This is the single entry point for all consumers. It wires together:
 *   1. File discovery (scan/file-scanner)
 *   2. AST parsing & API extraction (api-extractor)
 *   3. URL resolution (url-resolver)
 *   4. Rule execution (rules/)
 *   5. Result assembly
 *
 * The public API is a single function:
 *   scan(config: ScanConfig): Promise<ScanResult>
 *
 * This function NEVER throws for domain-level errors. Parse failures for
 * individual files are captured as ScanDiagnostics and the scan continues.
 * Only truly unexpected errors (programmer bugs) propagate as exceptions.
 */

import type { ApiCall } from '../model/api-call.js'
import type { Finding } from '../model/finding.js'
import { Severity } from '../model/finding.js'
import type { Logger } from '../model/logger.js'
import { noopLogger, scopedLogger } from '../model/logger.js'
import type { Rule, RuleContext } from '../model/rule.js'
import type { ScanConfig, ScanDiagnostic, ScanResult, ScanStats } from '../model/scan-result.js'
import { extractApiCalls } from '../parse/api-extractor.js'
import { readFileContent } from '../parse/file-reader.js'
import { resolveUrls } from '../resolve/url-resolver.js'
import { BUILT_IN_RULES } from '../rules/index.js'
import { scanFiles } from '../scan/file-scanner.js'

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SCAN_CONFIG: Readonly<ScanConfig> = {
  include: ['**/*.{ts,tsx,js,jsx,mts,cts}'],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.d.ts',
  ],
  rootDir: process.cwd(),
  rules: {
    'no-hardcoded-url': Severity.Error,
    'missing-error-handler': Severity.Warning,
  },
  tsConfigPath: undefined,
  baseUrl: undefined,
  logger: undefined,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Merge a partial user config with defaults, producing a complete ScanConfig.
 */
export function resolveConfig(partial: Partial<ScanConfig>): ScanConfig {
  return {
    ...DEFAULT_SCAN_CONFIG,
    ...partial,
    // Deep-merge rules rather than replacing the entire object
    rules: {
      ...DEFAULT_SCAN_CONFIG.rules,
      ...partial.rules,
    },
  }
}

/**
 * Run a full Sentinel scan.
 *
 * @param config Complete scan configuration (use resolveConfig to build from partial).
 * @returns      A ScanResult containing all ApiCalls, Findings, and diagnostics.
 *
 * @example
 * const config = resolveConfig({ rootDir: './src', baseUrl: 'https://api.example.com' })
 * const result = await scan(config)
 * console.log(`Found ${result.findings.length} findings`)
 */
export async function scan(config: ScanConfig): Promise<ScanResult> {
  const startMs = Date.now()
  const logger: Logger = config.logger ?? noopLogger
  const scanLogger = scopedLogger(logger, 'sentinel:scan')

  scanLogger.info('Starting scan', { rootDir: config.rootDir })

  const diagnostics: ScanDiagnostic[] = []
  const allApiCalls: ApiCall[] = []

  // ── Phase 1: File Discovery ──────────────────────────────────────────────
  scanLogger.debug('Discovering files', { exclude: config.exclude })

  const discoveryResult = await scanFiles({
    rootDir: config.rootDir,
    extraIgnore: config.exclude,
    logger: scopedLogger(logger, 'sentinel:scan:files'),
  })

  if (!discoveryResult.ok) {
    diagnostics.push({
      kind: 'resolve-error',
      message: `File discovery failed: ${discoveryResult.error.message}`,
      file: config.rootDir,
      cause: discoveryResult.error,
    })
    // Fatal discovery failure — return empty result
    return buildResult([], [], diagnostics, 0, 0, startMs)
  }

  const files = discoveryResult.value
  scanLogger.info(`Discovered ${String(files.length)} file(s)`, { rootDir: config.rootDir })

  // ── Phase 2: Parse & Extract ─────────────────────────────────────────────
  const parseLogger = scopedLogger(logger, 'sentinel:parse')
  let filesErrored = 0

  for (const file of files) {
    const contentResult = await readFileContent(file.absolutePath)

    if (!contentResult.ok) {
      filesErrored++
      diagnostics.push({
        kind: 'parse-error',
        message: `Could not read file: ${contentResult.error.message}`,
        file: file.absolutePath,
        cause: contentResult.error,
      })
      continue
    }

    try {
      const calls = extractApiCalls(file.absolutePath, contentResult.value, {
        logger: parseLogger,
      })
      allApiCalls.push(...calls)
    } catch (cause) {
      filesErrored++
      diagnostics.push({
        kind: 'parse-error',
        message: `Failed to parse ${file.relativePath}`,
        file: file.absolutePath,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      })
    }
  }

  scanLogger.info(
    `Extracted ${String(allApiCalls.length)} API call(s) from ${String(files.length - filesErrored)} file(s)`,
  )

  // ── Phase 3: URL Resolution ──────────────────────────────────────────────
  const resolvedCalls = resolveUrls(allApiCalls, {
    rootDir: config.rootDir,
    logger: scopedLogger(logger, 'sentinel:resolve'),
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    ...(config.tsConfigPath !== undefined ? { tsConfigPath: config.tsConfigPath } : {}),
  })

  // ── Phase 4: Rule Execution ──────────────────────────────────────────────
  const findings = executeRules(resolvedCalls, config, logger, diagnostics)

  // ── Phase 5: Result Assembly ─────────────────────────────────────────────
  const result = buildResult(
    resolvedCalls,
    findings,
    diagnostics,
    files.length,
    filesErrored,
    startMs,
  )

  scanLogger.info('Scan complete', {
    durationMs: result.stats.durationMs,
    filesScanned: result.stats.filesScanned,
    apiCallsFound: result.stats.apiCallsFound,
    findingsCount: result.stats.findingsCount,
  })

  return result
}

// ─── Rule Execution ───────────────────────────────────────────────────────────

function executeRules(
  calls: readonly ApiCall[],
  config: ScanConfig,
  logger: Logger,
  diagnostics: ScanDiagnostic[],
): Finding[] {
  const findings: Finding[] = []
  const ruleLogger = scopedLogger(logger, 'sentinel:rules')

  for (const [ruleId, severityOrOff] of Object.entries(config.rules)) {
    if (severityOrOff === 'off') continue

    const severity = severityOrOff

    // Look up in built-in rules first
    const rule: Rule | undefined = BUILT_IN_RULES.get(ruleId)

    if (rule === undefined) {
      diagnostics.push({
        kind: 'config-warning',
        message: `Unknown rule '${ruleId}'. Check your sentinel.config.ts.`,
        file: undefined,
        cause: undefined,
      })
      continue
    }

    const context: RuleContext = {
      severity,
      logger: scopedLogger(ruleLogger, ruleId),
      rootDir: config.rootDir,
      externalData: undefined,
    }

    try {
      const rulefindings = rule.check(calls, context)
      findings.push(...rulefindings)
      ruleLogger.debug(`Rule '${ruleId}' produced ${String(rulefindings.length)} finding(s)`)
    } catch (cause) {
      diagnostics.push({
        kind: 'parse-error',
        message: `Rule '${ruleId}' threw an unexpected error: ${cause instanceof Error ? cause.message : String(cause)}`,
        file: undefined,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      })
    }
  }

  return findings
}

// ─── Result Assembly ──────────────────────────────────────────────────────────

function buildResult(
  apiCalls: readonly ApiCall[],
  findings: readonly Finding[],
  diagnostics: readonly ScanDiagnostic[],
  filesScanned: number,
  filesErrored: number,
  startMs: number,
): ScanResult {
  const findingsBySeverity: Record<string, number> = {}
  for (const finding of findings) {
    findingsBySeverity[finding.severity] = (findingsBySeverity[finding.severity] ?? 0) + 1
  }

  const stats: ScanStats = {
    filesScanned,
    filesErrored,
    apiCallsFound: apiCalls.length,
    findingsCount: findings.length,
    findingsBySeverity,
    durationMs: Date.now() - startMs,
  }

  return {
    apiCalls,
    findings,
    diagnostics,
    stats,
  }
}
