// Bundles the API and the workspace packages it imports as TypeScript source (ADR-0008).
// Third-party dependencies stay external: PGlite ships WASM assets resolved at runtime.
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
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
// The demo company's documents and Claude's recorded readings travel with the bundle.
const dataset = new URL('../../packages/dataset/', import.meta.url);
for (const dir of ['files', 'extractions']) {
  const source = new URL(dir, dataset);
  if (existsSync(source)) await cp(source, `dist/dataset/${dir}`, { recursive: true });
}
console.info('API bundled into dist/');
