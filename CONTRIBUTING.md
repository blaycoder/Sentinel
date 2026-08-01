# Contributing to Sentinel

Thank you for your interest in contributing to Sentinel!

## Getting Started

```bash
npm install
npm run lint
npm test
npm run typecheck
npm run build
```

Run all five commands before opening a pull request. For CI parity you can also run `npm run format:check`.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — tooling, deps, CI
- `test:` — tests only
- `refactor:` — code change that neither fixes a bug nor adds a feature

Examples:

```
feat(cli): add --format sarif flag
fix(core): resolve template literal URLs correctly
chore: upgrade vitest to v2
```

Commit messages are validated by commitlint via Husky.

## Dependency Boundaries

Sentinel enforces strict package boundaries. When adding imports, follow these rules:

| Package               | May import                         | Must NOT import                                    |
| --------------------- | ---------------------------------- | -------------------------------------------------- |
| `@sentinel/core`      | Node builtins, `typescript` (peer) | Any other `@sentinel/*` package                    |
| `@sentinel/cli`       | `@sentinel/core`                   | `@sentinel/ai`, `@sentinel/cloud-sdk`              |
| `@sentinel/ai`        | `@sentinel/core`                   | `@sentinel/cli`, `sentinel-vscode`                 |
| `@sentinel/cloud-sdk` | `@sentinel/core`                   | `@sentinel/cli`, `@sentinel/ai`, `sentinel-vscode` |

`@sentinel/core` must remain pure — zero runtime dependencies. All I/O (stdout, filesystem, network) belongs in consumer packages like CLI or cloud-sdk.

Boundary violations are caught by ESLint (`no-restricted-imports`) and TypeScript project references.

## Architecture

Architecture documentation is coming soon.

## Tests

Root `npm test` runs Vitest across all workspace packages.

**Well covered today:** API extraction, file scanning, OpenAPI parsing, route matching, body diffing, contract pipeline integration (`scanner.test.ts`), CLI scan end-to-end (`scan.test.ts`), reporters, and path validation.

**Areas still lacking dedicated unit tests** (behavior is often exercised indirectly):

- `@sentinel/core`: `url-resolver.ts`, `file-reader.ts`
- `@sentinel/core`: individual rule modules (`no-hardcoded-url.ts`, `missing-error-handler.ts`)
- `@sentinel/cli`: `config/loader.ts`, `args.ts`, formatters, `init.ts`

Add tests for new behavior in the package you change. Backfilling every gap above is not required for each PR.

## Pull Requests

1. Fork the repo and create a feature branch from `main`.
2. Make your changes with tests where appropriate.
3. Ensure `npm run lint && npm run typecheck && npm test && npm run build` all pass.
4. Open a PR with a clear description of what changed and why.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

See [RELEASING.md](RELEASING.md) for npm publish instructions.
