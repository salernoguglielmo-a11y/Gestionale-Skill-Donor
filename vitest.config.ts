import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sdoh/core': r('./packages/core/src/index.ts'),
      '@sdoh/db': r('./packages/db/src/index.ts'),
      '@sdoh/ai': r('./packages/ai/src/index.ts'),
      '@sdoh/email': r('./packages/email/src/index.ts'),
      // Stesso alias di `apps/web/tsconfig.json`: serve ai test che verificano la
      // logica di accesso senza dover avviare Next.
      '@/': r('./apps/web/src/'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // PGlite carica un runtime WASM: l'avvio del primo test è più lento del solito.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    reporters: ['default'],
  },
});
