# Sentinel

> **Catch integration issues, API contract mismatches, configuration problems, and breaking changes before deployment.**

[![CI](https://github.com/blaycoder/Sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/blaycoder/Sentinel/actions/workflows/ci.yml)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Today:** Sentinel's phase-one CLI is functional and installable from npm. It scans frontend codebases, extracts API calls, and reports static analysis findings. When you point `contractSource` at a local OpenAPI v3 JSON file, it also checks **request-body shapes** against your backend schema for matched routes.

**Not yet in this release:** response-shape diffing, unmatched-endpoint flagging, third-party rules, and the cloud SDK, VS Code extension, and GitHub Action (future phases).

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

## Current Status

- `sentinel scan` — end-to-end analysis (config load → scan → format → stdout or file)
- `sentinel init` — scaffolds `sentinel.config.ts`
- Built-in rules:
  - `no-hardcoded-url` (default: **error**)
  - `missing-error-handler` (default: **warning**)
  - `api-contract-mismatch` (default: **error**, active when `contractSource` is configured)
- CLI output: `--format text|json|sarif`, `--output <file>`, `--max-warnings`, exit codes 0/1/2
- Source extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`
- **Published on npm:** [`@sentinel-scan/core`](https://www.npmjs.com/package/@sentinel-scan/core), [`@sentinel-scan/cli`](https://www.npmjs.com/package/@sentinel-scan/cli)

### Not yet

- Response-shape diffing
- Unmatched-endpoint flagging
- Third-party / custom rule loading
- `@sentinel-scan/ai` — AI explanations (future phase)
- `@sentinel-scan/cloud-sdk` — cloud dashboard upload (future phase)
- `sentinel-vscode` — VS Code extension (future phase)
- `sentinel-action` — GitHub Action (future phase)

---

## Installation

### Global install (recommended)

```bash
npm install -g @sentinel-scan/cli
sentinel init
sentinel scan ./src
```

### Project-local install

```bash
npm install --save-dev @sentinel-scan/cli
npx sentinel init
npx sentinel scan ./src
```

Requires **Node.js** `>=20.0.0`.

### Example configuration

`sentinel init` scaffolds a starter config with the two original rules. To enable contract checking, add `contractSource` and `api-contract-mismatch` manually:

```ts
import type { SentinelConfig } from '@sentinel-scan/core'

export default {
  include: ['src/**/*.{ts,tsx,js,jsx,mts,cts}'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],
  rules: {
    'no-hardcoded-url': 'error',
    'missing-error-handler': 'warning',
    'api-contract-mismatch': 'error',
  },
  // Request-body contract checking against a local OpenAPI v3 JSON file only
  // (no remote URLs, no YAML)
  contractSource: './openapi/api.json',
} satisfies SentinelConfig
```

`contractSource` paths are resolved relative to `rootDir` (the directory you scan, or the config file's directory when discovered automatically).

### CLI examples

```bash
# Scan with JSON output
sentinel scan ./src --format json

# Write SARIF for GitHub Code Scanning
sentinel scan ./src --format sarif --output results.sarif

# Fail CI if more than 10 warnings
sentinel scan ./src --max-warnings 10
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

## Programmatic usage

`@sentinel-scan/core` exposes the analysis engine for library consumers:

```bash
npm install @sentinel-scan/core typescript
```

TypeScript (`>=5.0.0`) is a **required peer dependency** — it is used at runtime for AST parsing. Install it alongside core if your project does not already have it.

```ts
import { resolveConfig, scan } from '@sentinel-scan/core'

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

| Package                                          | Status                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [`@sentinel-scan/core`](packages/core)           | **Published** — analysis engine ([npm](https://www.npmjs.com/package/@sentinel-scan/core)) |
| [`@sentinel-scan/cli`](packages/cli)             | **Published** — CLI ([npm](https://www.npmjs.com/package/@sentinel-scan/cli))              |
| [`@sentinel-scan/ai`](packages/ai)               | Planned — not on npm (future phase)                                                        |
| [`@sentinel-scan/cloud-sdk`](packages/cloud-sdk) | Planned — not on npm (future phase)                                                        |
| [`sentinel-vscode`](packages/vscode)             | Planned — not on npm (future phase)                                                        |
| [`sentinel-action`](packages/github-action)      | Planned — not on npm (future phase)                                                        |

---

## Developing from source

For contributors working from a clone (not the primary install path):

```bash
git clone https://github.com/blaycoder/Sentinel.git
cd Sentinel
npm install
npm run build
npm exec -w @sentinel-scan/cli -- sentinel scan ./src
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions, dependency boundaries, and the PR checklist.

Architecture docs are planned.

---

## License

[MIT](LICENSE)

## Maintainers

See [RELEASING.md](RELEASING.md) for npm publish instructions.
