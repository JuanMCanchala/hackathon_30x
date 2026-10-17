// Bundles the API and the workspace packages it imports as TypeScript source.
// Third-party dependencies stay external: PGlite ships WASM assets resolved at runtime.
import { build } from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import pkg from './package.json' with { type: 'json' };

const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@recibido/'));
const scripts = existsSync('src/scripts')
  ? readdirSync('src/scripts')
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `src/scripts/${f}`)
  : [];

await build({
  entryPoints: ['src/index.ts', ...scripts],
  outdir: 'dist',
  outbase: 'src',
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
// The demo company's documents and the recorded model answers travel with the bundle.
const dataset = new URL('../../packages/dataset/', import.meta.url);
for (const dir of ['files', 'recordings']) {
  const source = new URL(dir, dataset);
  if (existsSync(source)) await cp(source, `dist/dataset/${dir}`, { recursive: true });
}
console.info('API bundled into dist/');
