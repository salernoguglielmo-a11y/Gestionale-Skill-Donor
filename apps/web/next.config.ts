import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // I package interni sono sorgenti TypeScript senza step di build: Next li compila.
  transpilePackages: ['@sdoh/core', '@sdoh/db', '@sdoh/ai', '@sdoh/email', '@sdoh/ui'],

  // PGlite e gli SDK Google/OpenAI/Anthropic sono moduli Node: non vanno inclusi
  // nel bundle server, altrimenti i binari WASM e i require dinamici si rompono.
  serverExternalPackages: [
    '@electric-sql/pglite',
    'postgres',
    'googleapis',
    'google-auth-library',
    'openai',
    '@anthropic-ai/sdk',
  ],

  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,

  typedRoutes: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // L'app è privata e servita su HTTPS dietro proxy: HSTS è appropriato.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
