import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Db, DbHandle } from './client';
import { EMBEDDED_MIGRATIONS } from './migrations-bundle';

/**
 * Percorso dei file `.sql`, fonte di verità delle migrazioni.
 *
 * Serve agli strumenti da riga di comando (drizzle-kit) e ai test che
 * verificano l'allineamento del bundle. **Non va usato a runtime**: dentro una
 * funzione serverless questa directory non esiste, perché il bundler include
 * solo i file visibili all'analisi statica del codice.
 */
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Migratore unico per entrambi i driver.
 *
 * I migratori ufficiali di Drizzle sono specifici per driver; qui serve invece un
 * percorso identico per PostgreSQL e PGlite, perché le migrazioni devono essere
 * *le stesse* verificate in test. Le istruzioni sono applicate in ordine di nome
 * file, dentro una transazione per file, e registrate in `__drizzle_migrations`.
 *
 * L'SQL arriva da `migrations-bundle.ts`, generato dai file `.sql` e incorporato
 * nel bundle JavaScript: leggerlo dal disco funzionava in sviluppo ma falliva in
 * produzione con `ENOENT … scandir '/var/task/packages/db/migrations'`.
 */
export async function runMigrations(handle: DbHandle | Db): Promise<{ applied: string[]; skipped: string[] }> {
  const db: Db = 'db' in (handle as DbHandle) ? (handle as DbHandle).db : (handle as Db);

  await db.execute(sql`
    create table if not exists __drizzle_migrations (
      id serial primary key,
      hash text not null unique,
      created_at timestamptz not null default now()
    )
  `);

  const rows = await db.execute<{ hash: string }>(sql`select hash from __drizzle_migrations`);
  const done = new Set((rowsOf(rows) as Array<{ hash: string }>).map((r) => r.hash));

  const files = [...EMBEDDED_MIGRATIONS].sort((a, b) => a.name.localeCompare(b.name));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const { name, sql: raw } of files) {
    if (done.has(name)) {
      skipped.push(name);
      continue;
    }
    for (const statement of splitStatements(raw)) {
      await db.execute(sql.raw(statement));
    }
    await db.execute(sql`insert into __drizzle_migrations (hash) values (${name})`);
    applied.push(name);
  }

  return { applied, skipped };
}

/** I due driver restituiscono le righe in forma diversa: `rows` oppure l'array stesso. */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

/**
 * drizzle-kit separa le istruzioni con `--> statement-breakpoint`.
 * Non serve un parser SQL: il marcatore è generato dal tool stesso.
 */
export function splitStatements(sqlText: string): string[] {
  return sqlText
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\n?)*$/.test(s));
}
