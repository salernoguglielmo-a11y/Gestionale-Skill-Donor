import { sql } from 'drizzle-orm';
import { createDb } from '../client';
import { runMigrations } from '../migrate';
import { seedDatabase } from '../seed';

/**
 * Ricrea lo schema da zero e riapplica il seed.
 * Operazione distruttiva: richiede `--force` per evitare esecuzioni accidentali,
 * ed è rifiutata se `DATABASE_URL` punta a un host che non sia locale.
 */

const force = process.argv.includes('--force');
if (!force) {
  console.error('✗ Operazione distruttiva. Rieseguire con --force per confermare.');
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? '';
if (url) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
    console.error(`✗ Reset rifiutato: DATABASE_URL punta a "${host}", che non è un host locale.`);
    process.exit(1);
  }
}

const handle = await createDb();
console.log(`▸ Database: ${handle.description} (driver: ${handle.driver})`);

try {
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`create schema public`);
  await runMigrations(handle);
  const result = await seedDatabase(handle.db);
  console.log(`✓ Database ricreato. Attività caricate: ${result.tasks}.`);
} catch (error) {
  console.error('✗ Reset fallito:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await handle.close();
}
