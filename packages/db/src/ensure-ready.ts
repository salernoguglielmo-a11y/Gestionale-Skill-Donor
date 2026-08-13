import { sql } from 'drizzle-orm';
import type { Db, DbHandle } from './client';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

/**
 * Preparazione automatica del database al primo utilizzo.
 *
 * Motivazione. Su una piattaforma gestita chi installa l'applicazione spesso non
 * ha un terminale: senza questo passaggio il database resta senza tabelle e
 * l'app è inutilizzabile, con un errore che non spiega cosa fare. Preparare lo
 * schema da soli, una volta, elimina l'unico passaggio che richiedeva strumenti
 * da sviluppatore.
 *
 * Perché è sicuro farlo automaticamente:
 *
 * - le migrazioni sono **additive e versionate**: nessuna cancella dati o
 *   colonne, e quelle già applicate vengono saltate;
 * - il seed parte **solo se non c'è nemmeno un'attività**, quindi non sovrascrive
 *   mai il lavoro reale: dopo il primo avvio non viene più eseguito;
 * - su PostgreSQL l'operazione è protetta da un **advisory lock**, così più
 *   istanze serverless che partono insieme non si sovrappongono: la prima
 *   migra, le altre attendono e poi trovano tutto già fatto;
 * - tutto avviene in **una sola transazione**: se qualcosa fallisce, il database
 *   resta esattamente com'era.
 *
 * Chi preferisce controllare manualmente le migrazioni disattiva il
 * comportamento con `AUTO_INIT_DB=off` e usa `pnpm db:migrate`.
 */

/** Chiave arbitraria ma stabile: identifica *questo* lock fra tutti quelli del database. */
const ADVISORY_LOCK_KEY = 4_610_825_001;

export interface EnsureReadyResult {
  eseguito: boolean;
  migrazioniApplicate: string[];
  seedEseguito: boolean;
  motivoSalto: string | null;
}

async function countTasks(db: Db): Promise<number | null> {
  try {
    const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from tasks`);
    const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<{ n: number }>;
    return Number(list[0]?.n ?? 0);
  } catch {
    // La tabella non esiste ancora: è il caso normale al primo avvio.
    return null;
  }
}

export async function ensureDatabaseReady(handle: DbHandle): Promise<EnsureReadyResult> {
  const skipped = (motivo: string): EnsureReadyResult => ({
    eseguito: false,
    migrazioniApplicate: [],
    seedEseguito: false,
    motivoSalto: motivo,
  });

  if (process.env.AUTO_INIT_DB === 'off') {
    return skipped('disattivata con AUTO_INIT_DB=off');
  }

  const prepara = async (db: Db): Promise<EnsureReadyResult> => {
    const { applied } = await runMigrations(db);

    // Il seed parte solo su un database vuoto: mai sopra dati reali.
    let seedEseguito = false;
    if (process.env.AUTO_SEED !== 'off') {
      const tasks = await countTasks(db);
      if (tasks === 0) {
        await seedDatabase(db);
        seedEseguito = true;
      }
    }

    return { eseguito: true, migrazioniApplicate: applied, seedEseguito, motivoSalto: null };
  };

  // PGlite gira in un solo processo: nessuna concorrenza da coordinare.
  if (handle.driver === 'pglite') {
    return prepara(handle.db);
  }

  // Su PostgreSQL più istanze possono avviarsi insieme. `pg_advisory_xact_lock`
  // serializza la preparazione e si rilascia da solo a fine transazione, anche
  // in caso di errore o di processo interrotto.
  return handle.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);
    return prepara(tx as unknown as Db);
  });
}
