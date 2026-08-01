import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'formatters/index': 'src/formatters/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@sentinel-scan/core', 'typescript'],
  treeshake: true,
})
