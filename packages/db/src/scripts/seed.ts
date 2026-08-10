import { createDb } from '../client';
import { runMigrations } from '../migrate';
import { seedDatabase } from '../seed';

const handle = await createDb();
console.log(`▸ Database: ${handle.description} (driver: ${handle.driver})`);

try {
  await runMigrations(handle);
  const result = await seedDatabase(handle.db);
  console.log('✓ Seed completato (idempotente, nessun duplicato creato):');
  console.log(
    [
      `  organizzazioni ${result.organizations}`,
      `contatti ${result.contacts}`,
      `progetti ${result.projects}`,
      `attività ${result.tasks}`,
      `thread email ${result.threads}`,
      `documenti ${result.documents}`,
      `viste ${result.savedViews}`,
    ].join(' · '),
  );
} catch (error) {
  console.error('✗ Seed fallito:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await handle.close();
}
