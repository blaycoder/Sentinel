# @sentinel-scan/cli

Sentinel CLI — scan your codebase for API integration problems.

## Installation

Global install (recommended once published):

```bash
npm install -g @sentinel-scan/cli
```

Or add as a project dependency:

```bash
npm install @sentinel-scan/cli
npx sentinel scan
```

Requires **Node.js** `>=20.0.0`.

## Quick start

```bash
sentinel init              # create sentinel.config.ts in cwd
sentinel scan              # scan current directory
sentinel scan ./src        # scan a specific path
```

## Configuration

Sentinel looks for a config file by walking up from the scan directory:

1. `sentinel.config.ts`
2. `sentinel.config.js`
3. `sentinel.config.mjs`
4. `.sentinelrc.json`

If none is found, engine defaults apply. Override with `--config <path>`.

**Note:** Loading `.ts` config files requires a TypeScript loader (e.g. `tsx` or `ts-node`) available at runtime. Use `.js`, `.mjs`, or `.sentinelrc.json` if you prefer zero extra tooling.

### Contract mismatch detection

Enable request-body contract checking by setting `contractSource` to a local OpenAPI v3 JSON file and keeping the `api-contract-mismatch` rule enabled (default severity: `error`):

```ts
export default {
  contractSource: './openapi.json',
  rules: { 'api-contract-mismatch': 'error' },
}
```

v1 limitations to know before expecting findings:

- **Request bodies only** — response shapes are not checked
- **Static URLs only** — URLs built by helper functions (e.g. `fetch(apiUrl('/path'))`) cannot be matched
- **Static object-literal bodies only** — GET requests, variable bodies, and dynamic payloads produce no finding

For a step-by-step walkthrough, a minimal “does it work” test recipe, and troubleshooting when silence is expected, see **[Testing API Contract Mismatches](https://github.com/blaycoder/Sentinel#testing-api-contract-mismatches)** in the root README.

## Commands

### `sentinel scan [path] [options]`

| Flag                    | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `-f, --format <format>` | Output format: `text`, `json`, or `sarif` (default: `text`) |
| `-o, --output <file>`   | Write output to file instead of stdout                      |
| `-c, --config <file>`   | Path to sentinel config file                                |
| `--root-dir <dir>`      | Override scan root directory                                |
| `--max-warnings <n>`    | Exit 1 if warning count exceeds `n` (default: disabled)     |
| `-v, --verbose`         | Enable verbose debug logging (stderr)                       |
| `--no-color`            | Disable color output                                        |
| `-h, --help`            | Show help                                                   |

Examples:

```bash
sentinel scan --format json
sentinel scan --output results.sarif --format sarif
sentinel scan ./src --max-warnings 10
```

### `sentinel init [path] [options]`

| Flag          | Description               |
| ------------- | ------------------------- |
| `-f, --force` | Overwrite existing config |
| `-h, --help`  | Show help                 |

## Exit codes

| Code | Meaning                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------- |
| `0`  | Scan completed; no error-severity findings; warnings within `--max-warnings` threshold (if set) |
| `1`  | Scan completed; one or more error findings, or warnings exceeded `--max-warnings`               |
| `2`  | Setup failure (invalid path, config load error, usage error)                                    |

Log output goes to stderr; scan results go to stdout (or `--output`).

## Documentation

Full project documentation and configuration reference:

**https://github.com/blaycoder/Sentinel**

Contract mismatch setup, scope limits, and troubleshooting: [Testing API Contract Mismatches](https://github.com/blaycoder/Sentinel#testing-api-contract-mismatches).

## License

MIT — see [LICENSE](./LICENSE).
