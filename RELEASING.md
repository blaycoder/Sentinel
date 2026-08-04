# Releasing to npm

This document covers manual publishing of `@sentinel-scan/core` and `@sentinel-scan/cli`. Release automation (Changesets, etc.) is not yet set up.

## Publish order

**Always publish `@sentinel-scan/core` before `@sentinel-scan/cli`.**

The CLI declares `@sentinel-scan/core` as a runtime dependency. If CLI is published first, `npm install @sentinel-scan/cli` will fail to resolve core until core is on the registry.

## Version coupling

When you bump `@sentinel-scan/core`'s version in [packages/core/package.json](packages/core/package.json), update the semver range in [packages/cli/package.json](packages/cli/package.json):

```json
"dependencies": {
  "@sentinel-scan/core": "^X.Y.Z"
}
```

Set `^X.Y.Z` to the new core version (or the minimum compatible version if you need a wider range). Bump this whenever core changes in a way that affects CLI compatibility.

Keep `@sentinel-scan/core` and `@sentinel-scan/cli` version numbers aligned unless you have a deliberate reason to diverge.

## Changelog

Every release must update [CHANGELOG.md](CHANGELOG.md) before publishing.

- Follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format already used in that file
- Add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top with `Added`, `Fixed`, `Changed`, and `Removed` subsections as appropriate
- Document user-visible changes to `@sentinel-scan/core` and `@sentinel-scan/cli` only

Automated changelog generation (Changesets, etc.) is deferred — maintain the changelog manually for now.

## Pre-publish checklist

1. Ensure all changes are committed and tests pass:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

2. Build both packages:

   ```bash
   npm run build -w @sentinel-scan/core
   npm run build -w @sentinel-scan/cli
   ```

3. Verify tarball contents (no `src/`, tests, or configs should appear):

   ```bash
   cd packages/core && npm pack --dry-run
   cd ../cli && npm pack --dry-run
   ```

   Each tarball should contain only: `package.json`, `README.md`, `LICENSE`, and `dist/`.

4. Update [CHANGELOG.md](CHANGELOG.md) with the new version section and today's date.

5. Publish (when ready):

   ```bash
   cd packages/core && npm publish
   cd ../cli && npm publish
   ```

   Both packages have `"publishConfig": { "access": "public" }` for the scoped `@sentinel-scan` namespace.

   `prepublishOnly` runs `npm run build` automatically on `npm publish`, but running build explicitly in step 2 is recommended so you can inspect `dist/` before publishing.

## Do not publish

These packages are marked `"private": true` and must stay off npm until they are implemented:

- `@sentinel-scan/ai`
- `@sentinel-scan/cloud-sdk`
- `sentinel-vscode`
- `sentinel-action`
