# Sentinel

> **Catch integration issues, API contract mismatches, configuration problems, and breaking changes before deployment.**

[![CI](https://github.com/your-org/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/sentinel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Today:** Sentinel's phase-one CLI is functional. It scans frontend codebases, extracts API calls, and reports static analysis findings. When you point `contractSource` at a local OpenAPI v3 JSON file, it also checks **request-body shapes** against your backend schema for matched routes.

**Not yet in this release:** response-shape diffing, Findings for unmatched endpoints or unresolvable calls (those are skipped silently), third-party rules, and the cloud SDK, VS Code extension, and GitHub Action (future phases).

---

## What is Sentinel?

Sentinel is an open-source static analysis platform focused on **API contract matching between backend and frontend**. It helps teams detect integration problems at development time rather than in production.

The CLI (`sentinel scan`) walks your source, extracts `fetch`/`axios`/similar call sites, runs built-in rules, and optionally compares request bodies against an OpenAPI spec.

### Contract checking (v1)

When `contractSource` is set, Sentinel:

1. Parses a local OpenAPI v3 **JSON** spec
2. Matches frontend calls to backend routes (method + path pattern)
3. Diffs statically resolvable request bodies against the route schema

**What v1 flags:** missing required fields, unexpected fields, and literal type mismatches (`api-contract-mismatch` rule).

**What v1 does not flag:** response bodies, calls that cannot be matched to a route, calls with dynamic/unresolvable URLs or bodies, or query-string/trailing-slash path variants. Those cases are skipped (debug-logged during development, not surfaced as Findings).

OpenAPI support is deliberately scoped: **local JSON file paths only** — no remote URLs, no YAML.

---

## Status

### Works today

- `sentinel scan` — end-to-end analysis (config load → scan → format → stdout or file)
- `sentinel init` — scaffolds `sentinel.config.ts`
- Built-in rules:
  - `no-hardcoded-url` (default: **error**)
  - `missing-error-handler` (default: **warning**)
  - `api-contract-mismatch` (default: **error**, active when `contractSource` is configured)
- CLI output: `--format text|json|sarif`, `--output <file>`, `--max-warnings`, exit codes 0/1/2
- Source extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`

### Not yet

- Response contract diffing
- Findings for unmatched endpoints, unresolvable URLs, or not-diffable request bodies
- Third-party / custom rule loading
- `@sentinel/ai` — AI explanations (placeholder package)
- `@sentinel/cloud-sdk` — cloud dashboard upload (placeholder)
- `sentinel-vscode` — VS Code extension (shell package)
- `sentinel-action` — GitHub Action (stub)

---

## Quick Start

From a clone of this repository:

```bash
npm install
npm run build
npm exec -w @sentinel/cli -- sentinel init
npm exec -w @sentinel/cli -- sentinel scan ./path/to/your/src
```

When `@sentinel/cli` is published, you will also be able to install globally (`npm install -g @sentinel/cli`) and run `sentinel` directly.

### Example configuration

`sentinel init` scaffolds a starter config with the two original rules. To enable contract checking, add `contractSource` and `api-contract-mismatch` manually:

```ts
import type { SentinelConfig } from '@sentinel/core'

export default {
  include: ['src/**/*.{ts,tsx,js,jsx,mts,cts}'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],
  rules: {
    'no-hardcoded-url': 'error',
    'missing-error-handler': 'warning',
    'api-contract-mismatch': 'error',
  },
  // Optional: request-body contract checking against a local OpenAPI v3 JSON file
  contractSource: './openapi/api.json',
} satisfies SentinelConfig
```

`contractSource` paths are resolved relative to `rootDir` (the directory you scan, or the config file's directory when discovered automatically).

### CLI examples

```bash
# Scan with JSON output
npm exec -w @sentinel/cli -- sentinel scan ./src --format json

# Write SARIF for GitHub Code Scanning
npm exec -w @sentinel/cli -- sentinel scan ./src --format sarif --output results.sarif

# Fail CI if more than 10 warnings
npm exec -w @sentinel/cli -- sentinel scan ./src --max-warnings 10
```

---

## Configuration reference

Sentinel looks for config files by walking up from the scan directory:

`sentinel.config.ts` → `sentinel.config.js` → `sentinel.config.mjs` → `.sentinelrc.json`

If none is found, engine defaults apply. Override with `--config <path>`.

| Field            | Default / notes                                                                     |
| ---------------- | ----------------------------------------------------------------------------------- |
| `include`        | `**/*.{ts,tsx,js,jsx,mts,cts}`                                                      |
| `exclude`        | `node_modules`, `dist`, `build`, `*.test.ts`, `*.spec.ts`, `*.d.ts`, etc.           |
| `rules`          | Per-rule severity: `error`, `warning`, `info`, `hint`, or `off`                     |
| `contractSource` | Optional path to OpenAPI v3 **JSON** spec (relative to `rootDir`). No URLs or YAML. |
| `baseUrl`        | Optional prefix for relative URL display                                            |
| `tsConfigPath`   | Optional path to `tsconfig.json` for path alias resolution                          |

Default rule severities (when not overridden in config):

| Rule                    | Default   |
| ----------------------- | --------- |
| `no-hardcoded-url`      | `error`   |
| `missing-error-handler` | `warning` |
| `api-contract-mismatch` | `error`   |

---

## CLI reference

```
sentinel scan [path] [options]
```

| Flag                               | Description                                             |
| ---------------------------------- | ------------------------------------------------------- |
| `-f, --format <text\|json\|sarif>` | Output format (default: `text`)                         |
| `-o, --output <file>`              | Write output to file instead of stdout                  |
| `-c, --config <file>`              | Explicit config file path                               |
| `--root-dir <dir>`                 | Override scan root directory                            |
| `--max-warnings <n>`               | Exit 1 if warning count exceeds `n` (default: disabled) |
| `-v, --verbose`                    | Enable debug logging (stderr)                           |
| `--no-color`                       | Disable ANSI colors                                     |
| `-h, --help`                       | Show help                                               |

**Exit codes**

| Code | Meaning                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------- |
| `0`  | Scan completed; no error-severity findings; warnings within `--max-warnings` threshold (if set) |
| `1`  | Scan completed; one or more error findings, or warnings exceeded `--max-warnings`               |
| `2`  | Setup failure (invalid path, config load error, usage error)                                    |

Log output goes to stderr; scan results go to stdout (or `--output`).

---

## Using as a library

`@sentinel/core` exposes the analysis engine for programmatic use:

```ts
import { resolveConfig, scan } from '@sentinel/core'

const result = await scan(
  resolveConfig({
    rootDir: './src',
    contractSource: './openapi/api.json',
  }),
)

console.log(result.findings)
console.log(result.diagnostics)
```

---

## Packages

| Package                                     | Status                             |
| ------------------------------------------- | ---------------------------------- |
| [`@sentinel/core`](packages/core)           | **Working** — pure analysis engine |
| [`@sentinel/cli`](packages/cli)             | **Working** — terminal interface   |
| [`@sentinel/ai`](packages/ai)               | Planned (placeholder)              |
| [`@sentinel/cloud-sdk`](packages/cloud-sdk) | Planned (placeholder)              |
| [`sentinel-vscode`](packages/vscode)        | Planned (shell package)            |
| [`sentinel-action`](packages/github-action) | Planned (stub action)              |

---

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions, dependency boundaries, and the PR checklist.

Architecture documentation is coming soon.

---

## License

[MIT](LICENSE)
