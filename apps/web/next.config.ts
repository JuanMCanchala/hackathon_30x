import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const API_URL = process.env.API_URL ?? 'http://localhost:4100';

const config: NextConfig = {
  output: 'standalone',
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: ['@radar/core'],
  // fileURLToPath, not .pathname: on Windows the pathname reads /C:/… and the build fails.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  devIndicators: false,
  // The browser only ever talks to this origin; Next proxies the API.
  async rewrites() {
    return {
      // The OndAI landing is the front door; the app lives under /radar.
      beforeFiles: [{ source: '/', destination: '/ondai.html' }],
      afterFiles: [
        { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
        { source: '/openapi.json', destination: `${API_URL}/openapi.json` },
        { source: '/docs', destination: `${API_URL}/docs` },
      ],
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

export default config;
