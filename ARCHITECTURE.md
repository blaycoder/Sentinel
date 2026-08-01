# Sentinel Architecture

Contributor and maintainer guide to how Sentinel is structured and how a scan runs. This document describes the system **as it exists today** — not a roadmap. For user-facing install and usage, see [README.md](README.md).

---

## 1. High-level overview

Sentinel is a static analysis tool for TypeScript and JavaScript frontends. It walks a source tree, parses each file with the TypeScript compiler API, extracts HTTP client call sites (`fetch`, `axios`, `ky`, and similar patterns), resolves URLs where possible, and runs built-in rules against the resulting `ApiCall[]`. When `ScanConfig.contractSource` points at a local OpenAPI v3 JSON file, an optional contract-check phase matches calls to backend routes and diffs statically resolvable request bodies against the spec schema.

The public entry point is `scan(config)` in [`packages/core/src/runner/scanner.ts`](packages/core/src/runner/scanner.ts), which returns a `ScanResult` (API calls, findings, diagnostics, stats). The CLI ([`packages/cli/`](packages/cli/)) is a thin wrapper: load config, parse args, call `scan()`, format output, set exit codes. All analysis logic lives in `@sentinel-scan/core`.

---

## 2. Monorepo structure

| Package                    | Path                                                 | Role today                                                                                                                            |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@sentinel-scan/core`      | [`packages/core/`](packages/core/)                   | Analysis engine. Published on npm. Zero runtime dependencies (TypeScript is a peer). No stdout, no CLI flags, no config file loading. |
| `@sentinel-scan/cli`       | [`packages/cli/`](packages/cli/)                     | Terminal interface. Published on npm. Depends only on core. Config loading, arg parsing, formatters, exit codes.                      |
| `@sentinel-scan/ai`        | [`packages/ai/`](packages/ai/)                       | Placeholder. `"private": true`. Not implemented.                                                                                      |
| `@sentinel-scan/cloud-sdk` | [`packages/cloud-sdk/`](packages/cloud-sdk/)         | Placeholder. `"private": true`. Not implemented.                                                                                      |
| `sentinel-vscode`          | [`packages/vscode/`](packages/vscode/)               | Shell package. `"private": true`. Not implemented.                                                                                    |
| `sentinel-action`          | [`packages/github-action/`](packages/github-action/) | Stub GitHub Action. `"private": true`. Not implemented.                                                                               |
| Dev scripts                | [`scripts/`](scripts/)                               | Learning and debugging tools (e.g. [`scripts/parse-ast.ts`](scripts/parse-ast.ts)). Not shipped in any npm package.                   |

### Why core and CLI are split

Core is designed to be usable programmatically (CI scripts, future VS Code extension, cloud upload) without pulling in terminal I/O. It accepts a `ScanConfig` object and a `Logger` interface — never `console.*` directly. The CLI owns filesystem config discovery, human-readable output, and process exit semantics. Dependency flow is one-way: **cli → core**, never the reverse. ESLint enforces this boundary (see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

## 3. The scan pipeline

Orchestration lives in `scan()` in [`packages/core/src/runner/scanner.ts`](packages/core/src/runner/scanner.ts). Phases run in this order:

```
scan(config)
  │
  ├─ Phase 1: File discovery     scanFiles()
  ├─ Phase 2: Read + extract     readFileContent() → extractApiCalls()  (per file)
  ├─ Phase 3: URL resolution     resolveUrls()
  ├─ Phase 4: Rule execution       executeRules()
  ├─ Phase 4.5: Contract check     runContractCheck()  (optional)
  └─ Phase 5: Result assembly      buildResult()
```

Reporting is **not** part of `scan()`. The CLI formats the returned `ScanResult` after `scan()` completes (see [Reporting](#reporting-outside-scan)).

### Phase 1 — Discovery

**Module:** [`packages/core/src/scan/file-scanner.ts`](packages/core/src/scan/file-scanner.ts)

- Recursively walks `config.rootDir` using `node:fs/promises` (hand-rolled, no fast-glob).
- Applies `include` / `exclude` glob patterns from `ScanConfig`.
- Reads and respects `.gitignore` patterns under the root.
- Does not follow symlinks.
- Returns `Result<ScannedFile[], FileScannerError>`. On failure, scanner emits a single `resolve-error` diagnostic and returns an empty result.

Each `ScannedFile` carries `absolutePath`, `relativePath` (POSIX-style), and `extension`.

### Phase 2 — Read and extract

**Read:** [`packages/core/src/parse/file-reader.ts`](packages/core/src/parse/file-reader.ts)

- `readFileContent(absolutePath)` returns `Result<string, FileReaderError>`.
- Failures are isolated per file: one unreadable file produces a diagnostic and the scan continues.

**Extract:** [`packages/core/src/parse/api-extractor.ts`](packages/core/src/parse/api-extractor.ts)

- Parses source inline via `ts.createSourceFile` (does **not** call [`parseSourceFile()`](packages/core/src/parse/source-file.ts) — that helper is for dev scripts only).
- Runs [`getSyntacticDiagnostics()`](packages/core/src/parse/syntactic-diagnostics.ts); syntax issues become `unsupported-syntax` ScanDiagnostics. Extraction still proceeds on a partial AST.
- Walks the AST with a visitor (`ts.forEachChild`) to find call expressions matching known HTTP client patterns: `fetch`, `axios` / `axios.get` / config-object calls, `ky`, generic instance methods (`.get`, `.post`, etc.), `XMLHttpRequest()` call expressions.
- For each call, extracts method, URL (with `UrlKind`: string-literal, template-literal, identifier, etc.), error-handler presence, and request body when statically resolvable.
- Returns `ApiCall[]` for the file.

If `extractApiCalls` throws unexpectedly, the scanner catches it, records a `parse-error` diagnostic, and continues with the next file.

### Phase 3 — URL resolution

**Module:** [`packages/core/src/resolve/url-resolver.ts`](packages/core/src/resolve/url-resolver.ts)

- Enriches `ApiCall.resolvedUrl` using optional `config.baseUrl` and `config.tsConfigPath` (for TypeScript path alias resolution).
- Operates on the full `ApiCall[]` from all files.
- Does not emit ScanDiagnostics today (resolution failures are silent at the diagnostic layer).

### Phase 4 — Rule execution

**Module:** [`packages/core/src/rules/`](packages/core/src/rules/) via `executeRules()` in scanner.ts

- Iterates `config.rules` (rule ID → severity or `'off'`).
- Looks up each ID in `BUILT_IN_RULES` ([`packages/core/src/rules/index.ts`](packages/core/src/rules/index.ts)).
- **Built-in rules today:** `no-hardcoded-url`, `missing-error-handler` only.
- Unknown rule IDs produce a `config-warning` diagnostic and are skipped.
- Each rule implements `Rule.check(calls, context)` and returns `Finding[]`.
- If a rule throws, the error is caught and recorded as a `rule-error` diagnostic; other rules continue.
- **`api-contract-mismatch` is intentionally skipped here** — it is orchestrated in Phase 4.5 when `contractSource` is set.

### Phase 4.5 — Contract check (optional)

**Module:** [`packages/core/src/contract/contract-check.ts`](packages/core/src/contract/contract-check.ts)

Runs only when:

1. `config.contractSource` is defined, and
2. `config.rules['api-contract-mismatch']` is not `'off'`.

See [Section 4](#4-contract-mismatch-subsystem) for detail.

### Phase 5 — Result assembly

`buildResult()` combines `apiCalls`, `findings`, `diagnostics`, and computed `ScanStats` (file counts, finding counts by severity, duration) into a `ScanResult`.

### Domain-level errors never abort the scan

`scan()` is designed **not to throw** for expected failures (unreadable files, parse errors, rule crashes, bad config). Those become `ScanDiagnostic` entries and the scan continues. Only unexpected internal bugs propagate as exceptions. This contract is documented in the scanner header and tested in [`packages/core/src/runner/scanner.test.ts`](packages/core/src/runner/scanner.test.ts).

### Reporting (outside scan)

| Layer          | Location                                                                                                                                 | Used by                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Core reporters | [`packages/core/src/report/`](packages/core/src/report/) — `TerminalReporter`, `JsonReporter`, shared format helpers in `report/format/` | Programmatic consumers, tests |
| CLI formatters | [`packages/cli/src/formatters/`](packages/cli/src/formatters/) — `text`, `json`, `sarif`                                                 | `sentinel scan` command       |

The CLI does **not** import core reporters. It calls `format(result, outputFormat)` from its own formatter registry after `scan()` returns. See [Known architectural gaps](#6-known-architectural-gaps).

---

## 4. Contract-mismatch subsystem

The newest and most distinctive part of Sentinel. It compares frontend request bodies against a backend OpenAPI spec for **matched** routes.

### Why four modules instead of one function

Each stage is a standalone, pure function with its own tests and no shared mutable state:

| Module       | File                                                                | Input → Output                                                  |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Parser       | [`openapi-parser.ts`](packages/core/src/contract/openapi-parser.ts) | Spec file path → `Result<BackendRoute[], OpenApiParseError>`    |
| Matcher      | [`route-matcher.ts`](packages/core/src/contract/route-matcher.ts)   | `ApiCall[]` + `BackendRoute[]` → `MatchResult[]`                |
| Differ       | [`body-diff.ts`](packages/core/src/contract/body-diff.ts)           | `ApiCall[]` + `MatchResult[]` + routes → `ContractDiffResult[]` |
| Orchestrator | [`contract-check.ts`](packages/core/src/contract/contract-check.ts) | Wires the above → `Finding[]`                                   |

This layout allows each stage to be tested independently (`openapi-parser.test.ts`, `route-matcher.test.ts`, `body-diff.test.ts`) and composed without coupling to `scan()` internals.

### What each stage does — and deliberately does not do

**Parser (`openapi-parser.ts`)**

- Reads a **local JSON file** only. Rejects `.yaml` / `.yml` extensions explicitly.
- Parses OpenAPI v3 paths and methods into normalized `BackendRoute[]` with resolvable `BodyShape` where possible.
- `$ref`, `oneOf`, and other unresolvable schema shapes mark the route body as unresolvable rather than crashing.
- Does not fetch remote URLs. Does not support Swagger 2 / OpenAPI v2.

**Matcher (`route-matcher.ts`)**

- Matches by HTTP method + path segment count and pattern (`{id}` params vs static segments vs template-literal `${…}` wildcards).
- **v1 limitations** (documented in the file header):
  - Query strings are not stripped (`/users/1?page=1` will not match `{id}`).
  - Trailing slashes are not normalized (`/users/` vs `/users` differ).
- Returns per-call status: `matched`, `unmatched`, or `unresolvable` (dynamic URL, identifier URL, etc.).

**Differ (`body-diff.ts`)**

- Compares **request body shapes only** — no response diffing.
- Re-parses the call's request body string via `ts.createSourceFile` and walks object literal properties.
- Flags missing required fields, unexpected fields, and literal type mismatches.
- Returns `not-diffable` when the body is dynamic, the route has no schema, or the schema was unresolvable.
- Does not produce Findings — only structured diff results.

**Orchestrator (`contract-check.ts`)**

- Calls parse → match → diff in sequence.
- Converts `discrepancies-found` diff results into `Finding[]` with `ruleId: 'api-contract-mismatch'`.
- **Does not surface Findings** for unmatched calls, unresolvable URLs, or not-diffable bodies — those are logged at debug level only.
- OpenAPI parse failure → `config-warning` diagnostic; scan continues without contract findings.

### Why `api-contract-mismatch` is not in `BUILT_IN_RULES`

Contract checking is multi-phase orchestration (parse spec, match routes, diff bodies), not a single-pass `Rule.check()` over `ApiCall[]`. Severity is still configured via `ScanConfig.rules['api-contract-mismatch']`, but execution is handled by `runContractCheck()` in the scanner, not the generic rule loop.

### Wiring and backward compatibility

- `contractSource` is optional on `ScanConfig`. When unset, Phase 4.5 is skipped entirely.
- Existing configs without `contractSource` behave exactly as before contract checking was added.
- Spec path resolves relative to `rootDir` unless absolute.

---

## 5. Key conventions

These patterns are intentional. Violating them usually indicates a misunderstanding of the design.

### `Result<T, E>` vs throw

[`packages/core/src/model/result.ts`](packages/core/src/model/result.ts) defines a hand-rolled `Result<T, E>` discriminated union (`ok(value)` / `err(error)`).

**Use `Result` for recoverable, expected failures** in the production pipeline:

- File read errors (`file-reader.ts`)
- File discovery failure (`file-scanner.ts`)
- OpenAPI spec parse errors (`openapi-parser.ts`)

**Use throw for script/learning contexts** where fail-fast is appropriate:

- [`parseSourceFile()`](packages/core/src/parse/source-file.ts) throws on read failure. The comment in that file states this explicitly: production scan uses `readFileContent()` + `Result` and never calls `parseSourceFile`. Dev script [`scripts/parse-ast.ts`](scripts/parse-ast.ts) uses `parseSourceFile` and expects throws.

### `Finding` vs `ScanDiagnostic`

Two separate types in [`packages/core/src/model/scan-result.ts`](packages/core/src/model/scan-result.ts):

| Type             | Meaning                                 | Examples                                                                              |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `Finding`        | A code issue detected by a rule         | Hardcoded URL, missing error handler, contract body mismatch                          |
| `ScanDiagnostic` | A tooling/process issue during the scan | Unreadable file, unsupported syntax, rule crashed, unknown rule ID, spec parse failed |

They are **never merged** into a single list inside core. Both may appear in formatted output (CLI text/json formatters and core reporters render findings and diagnostics in separate sections), but the data model keeps them distinct.

`ScanDiagnosticKind` values today: `parse-error`, `rule-error`, `resolve-error`, `config-warning`, `unsupported-syntax`.

### `ts.is*` type narrowing on AST nodes

All extraction and body-diff code checks node kinds with TypeScript's `ts.isCallExpression`, `ts.isPropertyAccessExpression`, `ts.isVariableStatement`, etc. before accessing properties. This avoids runtime crashes on unexpected AST shapes. See [`api-extractor.ts`](packages/core/src/parse/api-extractor.ts) and [`body-diff.ts`](packages/core/src/contract/body-diff.ts).

### Dependency boundaries

Core imports only Node builtins and `typescript` (peer). CLI imports core. Placeholder packages may import core but must not import CLI. Full table in [CONTRIBUTING.md](CONTRIBUTING.md).

### Logging

Core never calls `console.*`. It uses the injectable `Logger` interface ([`packages/core/src/model/logger.ts`](packages/core/src/model/logger.ts)). The CLI provides `makeConsoleLogger()` that writes to stderr.

---

## 6. Known architectural gaps

Documented limitations and technical debt — not bugs, but real gaps a contributor should know about.

### CLI formatters duplicate core reporters

[`packages/cli/src/formatters/`](packages/cli/src/formatters/) (text, json, sarif) implement formatting parallel to [`packages/core/src/report/`](packages/core/src/report/) (`TerminalReporter`, `JsonReporter`, and helpers in `report/format/`). The CLI is the production output path today and does not use core reporters. Consolidating these two paths is future cleanup.

### Imprecise `ScanDiagnosticKind` usage

Some diagnostic kinds are broader than their names suggest:

- **`parse-error`** is used for both unreadable files and caught exceptions during `extractApiCalls()` ([`scanner.ts`](packages/core/src/runner/scanner.ts) lines ~134 and ~151). Syntax issues have their own kind: **`unsupported-syntax`** (from `api-extractor.ts`).
- **`resolve-error`** suggests URL/path resolution failure, but today it is only emitted when **file discovery** fails entirely. `url-resolver.ts` does not emit diagnostics.

Tightening these kinds would be a breaking change to diagnostic consumers and has not been done yet.

### Third-party / custom rules not supported

Only rules in `BUILT_IN_RULES` execute. Config entries for unknown rule IDs produce a `config-warning` and are skipped ([`rules/index.ts`](packages/core/src/rules/index.ts)). Loading external rule modules is a deliberate current limitation, not an oversight.

---

## 7. Further reading

| Document                           | Audience     | Contents                                                                      |
| ---------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| [README.md](README.md)             | End users    | Install, config, CLI flags, exit codes                                        |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors | Dev setup, commit conventions, dependency boundaries, test gaps, PR checklist |
| [RELEASING.md](RELEASING.md)       | Maintainers  | npm publish order and version coupling                                        |
