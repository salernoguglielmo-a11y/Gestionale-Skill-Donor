import { timingSafeEqual } from 'node:crypto';
import { createDb, recordAudit, runMigrations, seedDatabase } from '@sdoh/db';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Creazione dello schema su un database remoto, senza terminale.
 *
 * Esiste per un motivo pratico: chi mette online l'applicazione può non avere
 * Node e pnpm sul proprio computer, e senza schema il database resta vuoto e
 * l'app inutilizzabile. Questo endpoint esegue le stesse migrazioni versionate
 * del comando `pnpm db:migrate`, e facoltativamente il seed.
 *
 * Precauzioni, in ordine di importanza:
 *
 * 1. **È disattivato per default.** Senza la variabile `MIGRATION_TOKEN`
 *    risponde 404, come se la rotta non esistesse.
 * 2. **Richiede il token** nell'intestazione `x-migration-token`, confrontato a
 *    tempo costante. Il token è l'approvazione umana esplicita all'operazione.
 * 3. **Non è distruttivo.** Applica solo migrazioni non ancora applicate; il
 *    seed è idempotente. Non esiste alcun percorso che cancelli tabelle o dati.
 * 4. **Lascia traccia** nell'audit log, che è append-only.
 *
 * Terminata la configurazione, rimuovere `MIGRATION_TOKEN` dalle variabili
 * d'ambiente: la rotta torna a rispondere 404.
 */

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.MIGRATION_TOKEN ?? '';

  // Disattivato: la rotta non deve nemmeno rivelare di esistere.
  if (!expected) {
    return NextResponse.json({ errore: 'Not found' }, { status: 404 });
  }
  if (expected.length < 16) {
    return NextResponse.json(
      { errore: 'MIGRATION_TOKEN troppo corto: servono almeno 16 caratteri.' },
      { status: 500 },
    );
  }

  const provided = request.headers.get('x-migration-token') ?? '';
  if (!provided || !tokenMatches(provided, expected)) {
    return NextResponse.json({ errore: 'Token non valido.' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        errore: 'DATABASE_URL non è impostata: non c’è alcun database su cui applicare le migrazioni.',
      },
      { status: 400 },
    );
  }

  const conSeed = request.nextUrl.searchParams.get('seed') === '1';
  const handle = await createDb();

  try {
    const { applied, skipped } = await runMigrations(handle);

    let seedEseguito: Record<string, number> | null = null;
    if (conSeed) {
      seedEseguito = { ...(await seedDatabase(handle.db)) };
    }

    await recordAudit(handle.db, {
      actorType: 'sistema',
      actorLabel: 'endpoint di configurazione',
      action: 'schema.migrate',
      entityType: 'database',
      newValue: { applicate: applied, giaPresenti: skipped.length, seed: Boolean(seedEseguito) },
      source: 'api:admin/migrate',
    });

    return NextResponse.json({
      stato: 'ok',
      migrazioniApplicate: applied,
      migrazioniGiaPresenti: skipped.length,
      seed: seedEseguito,
      prossimoPasso: conSeed
        ? 'Configurazione completata. Rimuovi ora MIGRATION_TOKEN dalle variabili d’ambiente.'
        : 'Schema creato. Per caricare lo snapshot iniziale ripeti la chiamata con ?seed=1.',
    });
  } catch (error) {
    return NextResponse.json(
      { stato: 'errore', dettaglio: error instanceof Error ? error.message.slice(0, 500) : 'errore sconosciuto' },
      { status: 500 },
    );
  } finally {
    await handle.close().catch(() => {});
  }
}

/** Solo POST: una GET accidentale dal browser non deve modificare lo schema. */
export async function GET() {
  return NextResponse.json(
    { errore: 'Usa POST con l’intestazione x-migration-token.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
