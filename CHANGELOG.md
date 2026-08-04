# Changelog

All notable changes to `@sentinel-scan/core` and `@sentinel-scan/cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-08-04

### Added

- Default exclusion of common vendor/minified file patterns (`**/*.min.js`, `**/*.min.mjs`, `**/vendor/**`, `**/vendors/**`, `**/third-party/**`, `**/third_party/**`, `**/bower_components/**`)

### Fixed

- User-provided `exclude` patterns now merge with engine defaults instead of replacing them wholesale — previously, setting a custom exclude silently dropped `build`, `*.d.ts`, and test-file exclusions

### Changed

- `sentinel init` scaffolded config generates its exclude array dynamically from `DEFAULT_SCAN_CONFIG` at generation time, instead of a hardcoded list that could drift out of sync
- `include` continues to replace engine defaults when provided (unchanged behavior — allows narrowing scan scope)

## [0.1.1] - 2026-08-02

### Fixed

- Fixed a crash in `hasCatchChain`'s AST parent-walk (double-increment bug) that caused real-world API files using `await fetch(...)` inside async functions to fail parsing entirely
- `scan()` parse-error diagnostics now include the underlying error message instead of repeating the filename

## [0.1.0] - 2026-08-01

### Added

- Initial public release: scan pipeline, `no-hardcoded-url` and `missing-error-handler` rules, OpenAPI v3 contract-mismatch detection (request body only), CLI with `init`/`scan` commands
