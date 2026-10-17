import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// The browser only talks to this origin. With API_URL (Docker, `pnpm dev`, which defaults to the
// local API), Next proxies the API's paths to it. Without it (the Vercel build), the route
// handlers in app/api, app/docs and app/openapi.json serve the API in-process.
export default function config(phase: string): NextConfig {
  const apiUrl =
    process.env.API_URL ?? (phase === PHASE_DEVELOPMENT_SERVER ? 'http://localhost:4000' : null);
  // the embedded API's files, traced into its functions (paths from this app)
  const apiFiles = [
    '../api/drizzle/**/*',
    '../../packages/dataset/files/**/*',
    '../../packages/dataset/recordings/**/*',
    '../../node_modules/.pnpm/@electric-sql+pglite@*/node_modules/@electric-sql/pglite/dist/**/*',
  ];
  return {
    output: 'standalone',
    // The workspace packages are consumed as TypeScript source.
    transpilePackages: ['@recibido/domain', '@recibido/dataset', '@recibido/api'],
    // PGlite loads its WASM and data files next to itself at runtime.
    serverExternalPackages: ['@electric-sql/pglite'],
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
    outputFileTracingIncludes: apiUrl
      ? {}
      : { '/api/[...path]': apiFiles, '/docs': apiFiles, '/openapi.json': apiFiles },
    poweredByHeader: false,
    devIndicators: false,
    async rewrites() {
      if (!apiUrl) return [];
      return {
        // before the filesystem, so the embedded API's route handlers never answer
        beforeFiles: [
          { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
          { source: '/openapi.json', destination: `${apiUrl}/openapi.json` },
          { source: '/docs', destination: `${apiUrl}/docs` },
        ],
        afterFiles: [],
        fallback: [],
      };
    },
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          ],
        },
      ];
    },
  };
}
