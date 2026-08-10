import { createDb, runMigrations, seedDatabase, type DbHandle } from '@sdoh/db';

/**
 * Database di test: PGlite in memoria, migrazioni reali, seed reale.
 * Nessun mock del database — quello che i test verificano è lo stesso SQL che
 * gira in produzione.
 */
export async function createTestDb(options: { seed?: boolean } = {}): Promise<DbHandle> {
  const handle = await createDb({ pgliteDir: 'memory://' });
  await runMigrations(handle);
  if (options.seed !== false) await seedDatabase(handle.db);
  return handle;
}
