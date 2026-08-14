import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EMBEDDED_MIGRATIONS, MIGRATIONS_DIR } from '@sdoh/db';
import { describe, expect, it } from 'vitest';

/**
 * Le migrazioni vengono applicate a runtime leggendo `EMBEDDED_MIGRATIONS`, non
 * il disco: dentro una funzione serverless la directory `migrations/` non esiste
 * (il bundler include solo i file visibili all'analisi statica) e la lettura
 * falliva con `ENOENT … scandir '/var/task/packages/db/migrations'`.
 *
 * Il rischio residuo è di disallineamento: qualcuno aggiunge o modifica un file
 * `.sql` e dimentica `pnpm db:bundle`. Il codice continuerebbe a funzionare in
 * sviluppo — dove i test PGlite girano sullo stesso bundle — e la migrazione
 * mancante si scoprirebbe solo in produzione.
 *
 * Questi test confrontano il bundle con i file `.sql`, che restano la fonte di
 * verità, e falliscono con l'istruzione per rimediare.
 */

const RIGENERA = 'Rigenera il bundle con `pnpm db:bundle` e committa il risultato.';

async function fileMigrations(): Promise<Array<{ name: string; sql: string }>> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => ({ name, sql: await readFile(join(MIGRATIONS_DIR, name), 'utf8') })),
  );
}

describe('bundle delle migrazioni', () => {
  it('contiene esattamente i file .sql presenti su disco', async () => {
    const attesi = (await fileMigrations()).map((m) => m.name);
    const presenti = EMBEDDED_MIGRATIONS.map((m) => m.name);

    expect(presenti, RIGENERA).toEqual(attesi);
  });

  it('riporta l’SQL identico, carattere per carattere', async () => {
    for (const { name, sql } of await fileMigrations()) {
      const incorporata = EMBEDDED_MIGRATIONS.find((m) => m.name === name);
      expect(incorporata, `${name} manca nel bundle. ${RIGENERA}`).toBeDefined();
      expect(incorporata?.sql, `${name} è cambiata su disco. ${RIGENERA}`).toBe(sql);
    }
  });

  it('non è vuoto: uno schema senza migrazioni renderebbe l’app inutilizzabile', () => {
    expect(EMBEDDED_MIGRATIONS.length).toBeGreaterThan(0);
  });

  it('è ordinato per nome: l’ordine di applicazione non può dipendere dal filesystem', () => {
    const nomi = EMBEDDED_MIGRATIONS.map((m) => m.name);
    expect(nomi).toEqual([...nomi].sort());
  });
});

describe('il codice applicato a runtime non legge il filesystem', () => {
  it('migrate.ts non usa readdir né readFile', async () => {
    const sorgente = await readFile(join(MIGRATIONS_DIR, '..', 'src', 'migrate.ts'), 'utf8');

    // La regressione da impedire: tornare a leggere le migrazioni dal disco,
    // che funziona in sviluppo e fallisce solo una volta in produzione.
    expect(sorgente).not.toMatch(/\breaddir\b/);
    expect(sorgente).not.toMatch(/\breadFile\b/);
  });
});
