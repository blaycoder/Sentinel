# Releasing to npm

This document covers manual publishing of `@sentinel/core` and `@sentinel/cli`. Release automation (Changesets, etc.) is not yet set up.

## Publish order

**Always publish `@sentinel/core` before `@sentinel/cli`.**

The CLI declares `@sentinel/core` as a runtime dependency. If CLI is published first, `npm install @sentinel/cli` will fail to resolve core until core is on the registry.

## Version coupling

When you bump `@sentinel/core`'s version in [packages/core/package.json](packages/core/package.json), update the semver range in [packages/cli/package.json](packages/cli/package.json):

```json
"dependencies": {
  "@sentinel/core": "^X.Y.Z"
}
```

Set `^X.Y.Z` to the new core version (or the minimum compatible version if you need a wider range). Bump this whenever core changes in a way that affects CLI compatibility.

Keep `@sentinel/core` and `@sentinel/cli` version numbers aligned unless you have a deliberate reason to diverge.

## Pre-publish checklist

1. Ensure all changes are committed and tests pass:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

2. Build both packages:

   ```bash
   npm run build -w @sentinel/core
   npm run build -w @sentinel/cli
   ```

3. Verify tarball contents (no `src/`, tests, or configs should appear):

   ```bash
   cd packages/core && npm pack --dry-run
   cd ../cli && npm pack --dry-run
   ```

   Each tarball should contain only: `package.json`, `README.md`, `LICENSE`, and `dist/`.

4. Publish (when ready):

   ```bash
   cd packages/core && npm publish
   cd ../cli && npm publish
   ```

   Both packages have `"publishConfig": { "access": "public" }` for the scoped `@sentinel` namespace.

   `prepublishOnly` runs `npm run build` automatically on `npm publish`, but running build explicitly in step 2 is recommended so you can inspect `dist/` before publishing.

## Do not publish

These packages are marked `"private": true` and must stay off npm until they are implemented:

- `@sentinel/ai`
- `@sentinel/cloud-sdk`
- `sentinel-vscode`
- `sentinel-action`
