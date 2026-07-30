# Sentinel

> **Static analysis for integration confidence.** Detect API contract mismatches, configuration issues, and breaking changes before deployment.

[![CI](https://github.com/your-org/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/sentinel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is Sentinel?

Sentinel is an open-source static analysis platform that helps developers catch integration problems at development time rather than in production.

**First feature:** A CLI that scans your frontend codebase, extracts every API call, and reports:

- Hardcoded URLs that bypass your environment configuration
- `fetch`/`axios` calls with no error handling
- Calls to endpoints that don't match your backend's schema

## Packages

| Package                                     | Description                                  |
| ------------------------------------------- | -------------------------------------------- |
| [`@sentinel/core`](packages/core)           | Pure analysis engine — the heart of Sentinel |
| [`@sentinel/cli`](packages/cli)             | Terminal interface (`sentinel scan`)         |
| [`@sentinel/ai`](packages/ai)               | AI-powered explanations and fix suggestions  |
| [`@sentinel/cloud-sdk`](packages/cloud-sdk) | Upload results to the Sentinel dashboard     |
| [`sentinel-vscode`](packages/vscode)        | VS Code extension                            |
| [`sentinel-action`](packages/github-action) | GitHub Action                                |

## Quick Start

```bash
# Install the CLI globally
npm install -g @sentinel/cli

# Scan your project
sentinel scan ./src

# Output as JSON
sentinel scan ./src --format json

# Output SARIF (for GitHub Code Scanning)
sentinel scan ./src --format sarif --output results.sarif
```

## Configuration

Create a `sentinel.config.ts` in your project root:

```ts
import type { SentinelConfig } from '@sentinel/core'

export default {
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/*.test.ts', '**/*.spec.ts'],
  rules: {
    'no-hardcoded-url': 'error',
    'missing-error-handler': 'warn',
  },
} satisfies SentinelConfig
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Format
npm run format
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture design document including all major decisions and their rationale.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
