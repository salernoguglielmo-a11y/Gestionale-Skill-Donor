import { createDb } from '../client';
import { runMigrations } from '../migrate';

const handle = await createDb();
console.log(`▸ Database: ${handle.description} (driver: ${handle.driver})`);

try {
  const { applied, skipped } = await runMigrations(handle);
  if (applied.length === 0) {
    console.log(`✓ Nessuna migrazione da applicare (${skipped.length} già presenti).`);
  } else {
    console.log(`✓ Applicate ${applied.length} migrazioni: ${applied.join(', ')}`);
  }
} catch (error) {
  console.error('✗ Migrazione fallita:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await handle.close();
}
