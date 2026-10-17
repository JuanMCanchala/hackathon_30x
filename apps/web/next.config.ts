import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  // The domain package is consumed as TypeScript source.
  transpilePackages: ['@recibido/domain'],
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  devIndicators: false,
  // The browser only talks to this origin; Next proxies the API.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/openapi.json', destination: `${API_URL}/openapi.json` },
      { source: '/docs', destination: `${API_URL}/docs` },
    ];
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
