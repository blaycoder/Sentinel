# @sentinel-scan/core

Sentinel core analysis engine — pure, zero runtime dependencies.

Use this package to run Sentinel scans programmatically in Node.js scripts, CI pipelines, or custom tooling.

## Requirements

- **Node.js** `>=20.0.0`
- **TypeScript** `>=5.0.0` (required peer dependency — used at runtime for AST parsing)

Install TypeScript alongside core if your project does not already have it:

```bash
npm install @sentinel-scan/core typescript
```

## Installation

```bash
npm install @sentinel-scan/core
```

## Programmatic API

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

Key exports include `scan`, `resolveConfig`, `parseSourceFile`, contract helpers (`matchApiCalls`, `diffRequestBodies`, `runContractCheck`), and the full domain model (`Finding`, `ScanResult`, `Severity`, etc.).

## Documentation

Full project documentation, configuration reference, and contract-checking details:

**https://github.com/blaycoder/Sentinel**

## License

MIT — see [LICENSE](./LICENSE).
