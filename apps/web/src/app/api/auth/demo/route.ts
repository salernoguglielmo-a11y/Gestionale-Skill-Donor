import { getDb, recordAudit, runMigrations, seedDatabase } from '@sdoh/db';
import { NextResponse, type NextRequest } from 'next/server';
import { absoluteUrl } from '@/lib/absolute-url';
import { demoUserIdentity, getAuthMode } from '@/lib/auth';
import { createSession } from '@/lib/session';

/**
 * Ingresso in modalità demo.
 *
 * Disponibile solo se `DEMO_MODE` non è `off`. Prepara il database (migrazioni +
 * seed idempotente) così che l'applicazione sia utilizzabile al primo avvio senza
 * alcun comando manuale, e apre una sessione marcata `demo`: l'interfaccia mostra
 * l'etichetta ovunque e nessuna operazione raggiunge servizi esterni.
 */
export async function POST(request: NextRequest) {
  const mode = getAuthMode();
  if (!mode.demoAllowed) {
    // Il motivo è già calcolato: riportarlo evita di attribuire a `DEMO_MODE` un
    // rifiuto che dipende invece dal database o dalla chiave di sessione.
    return NextResponse.json(
      { error: mode.demoUnavailableReason ?? 'La modalità demo non è disponibile.' },
      { status: 403 },
    );
  }

  const identity = demoUserIdentity();

  try {
    const { getDbHandle } = await import('@sdoh/db');
    const handle = await getDbHandle();
    await runMigrations(handle);
    await seedDatabase(handle.db);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Preparazione del database non riuscita.',
        detail: error instanceof Error ? error.message : 'errore sconosciuto',
      },
      { status: 500 },
    );
  }

  await createSession({ ...identity, mode: 'demo' });

  const db = await getDb();
  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: identity.name,
    userId: identity.userId,
    action: 'auth.login',
    entityType: 'user',
    entityId: identity.userId,
    newValue: { modalita: 'demo' },
    source: 'web:demo',
  });

  return NextResponse.redirect(absoluteUrl(request, '/oggi'), { status: 303 });
}
