import { defineConfig } from 'drizzle-kit';

/**
 * Le migrazioni SQL sono generate per PostgreSQL e applicate identiche sia a un
 * PostgreSQL reale sia a PGlite: un solo dialetto, un solo set di file.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://sdoh:sdoh_local_dev@localhost:5433/sdoh',
  },
});
