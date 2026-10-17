// Bundles the API and the workspace packages it imports as TypeScript source (ADR-0008).
// Third-party dependencies stay external: PGlite ships WASM assets resolved at runtime.
import { build } from 'esbuild';
import { cp } from 'node:fs/promises';
import pkg from './package.json' with { type: 'json' };

const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@mandato/'));

await build({
  entryPoints: ['src/index.ts', 'src/scripts/eval.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
await cp('drizzle', 'dist/drizzle', { recursive: true });
console.info('API bundled into dist/');
