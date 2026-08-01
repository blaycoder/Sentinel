/**
 * formatters/sarif.ts — SARIF 2.1.0 output formatter.
 *
 * SARIF (Static Analysis Results Interchange Format) is the standard format
 * for uploading static analysis results to GitHub Code Scanning, Azure DevOps,
 * and other CI platforms.
 *
 * Reference: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * GitHub docs: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
 *
 * This formatter produces SARIF that passes GitHub's sarif schema validation.
 */

import type { Finding, ScanResult } from '@sentinel-scan/core'
import { Severity } from '@sentinel-scan/core'

// ─── SARIF Types (minimal subset) ────────────────────────────────────────────

interface SarifOutput {
  $schema: string
  version: '2.1.0'
  runs: SarifRun[]
}

interface SarifRun {
  tool: SarifTool
  results: SarifResult[]
  originalUriBaseIds?: Record<string, { uri: string }>
}

interface SarifTool {
  driver: SarifDriver
}

interface SarifDriver {
  name: string
  version: string
  informationUri: string
  rules: SarifRule[]
}

interface SarifRule {
  id: string
  name: string
  shortDescription: { text: string }
  helpUri?: string
  properties?: { tags?: string[] }
}

interface SarifResult {
  ruleId: string
  level: 'error' | 'warning' | 'note' | 'none'
  message: { text: string }
  locations: SarifLocation[]
  fixes?: SarifFix[]
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId: string }
    region: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  }
}

interface SarifFix {
  description: { text: string }
}

// ─── Mappings ─────────────────────────────────────────────────────────────────

const SEVERITY_TO_SARIF_LEVEL: Record<string, SarifResult['level']> = {
  [Severity.Error]: 'error',
  [Severity.Warning]: 'warning',
  [Severity.Info]: 'note',
  [Severity.Hint]: 'note',
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SarifFormatterOptions {
  /** Absolute path to the repository root — used to compute relative URIs. */
  repositoryRoot?: string
  /** Version of @sentinel-scan/cli to embed in the tool driver. */
  toolVersion?: string
}

/**
 * Format a ScanResult as a SARIF 2.1.0 JSON string.
 */
export function formatSarif(result: ScanResult, options: SarifFormatterOptions = {}): string {
  const { toolVersion = '0.1.0' } = options

  // Collect unique rules from findings
  const rulesMap = new Map<string, SarifRule>()
  for (const finding of result.findings) {
    if (!rulesMap.has(finding.ruleId)) {
      rulesMap.set(finding.ruleId, {
        id: finding.ruleId,
        name: ruleIdToName(finding.ruleId),
        shortDescription: { text: finding.message },
        helpUri: finding.url ?? `https://sentinel.dev/rules/${finding.ruleId}`,
        properties: { tags: ['sentinel'] },
      })
    }
  }

  const sarifResults: SarifResult[] = result.findings.map((f) => findingToSarifResult(f, options))

  const output: SarifOutput = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Sentinel',
            version: toolVersion,
            informationUri: 'https://sentinel.dev',
            rules: Array.from(rulesMap.values()),
          },
        },
        originalUriBaseIds: {
          SRCROOT: { uri: 'file:///' },
        },
        results: sarifResults,
      },
    ],
  }

  return JSON.stringify(output, null, 2)
}

// ─── Internals ────────────────────────────────────────────────────────────────

function findingToSarifResult(finding: Finding, options: SarifFormatterOptions): SarifResult {
  const uri = filePathToUri(finding.location.file, options.repositoryRoot)

  const result: SarifResult = {
    ruleId: finding.ruleId,
    level: SEVERITY_TO_SARIF_LEVEL[finding.severity] ?? 'note',
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri, uriBaseId: 'SRCROOT' },
          region: {
            startLine: finding.location.line,
            startColumn: finding.location.column,
            endLine: finding.location.endLine,
            endColumn: finding.location.endColumn,
          },
        },
      },
    ],
  }

  if (finding.suggestion) {
    result.fixes = [{ description: { text: finding.suggestion } }]
  }

  return result
}

/**
 * Convert an absolute file path to a SARIF-compatible relative URI.
 */
function filePathToUri(filePath: string, repositoryRoot: string | undefined): string {
  if (repositoryRoot === undefined) return filePath.replace(/\\/g, '/')

  const relative = filePath.replace(repositoryRoot, '').replace(/\\/g, '/').replace(/^\//, '')

  return relative
}

/**
 * Convert a kebab-case rule ID to a PascalCase name for SARIF.
 * 'no-hardcoded-url' → 'NoHardcodedUrl'
 */
function ruleIdToName(ruleId: string): string {
  return ruleId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
