import { createDb, EMBEDDED_MIGRATIONS, resolveConnectionUrl } from '@sdoh/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { providerStatus } from '@/lib/ai-service';
import { getAuthMode } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Diagnostica del deployment.
 *
 * Serve a capire perché un'istanza appena messa online non funziona, quando non
 * si ha accesso ai log: dice quale driver è in uso, se il database risponde, se
 * le migrazioni sono state applicate e quali variabili d'ambiente mancano.
 *
 * **Non espone alcun valore riservato**: nessuna chiave, nessuna password,
 * nessun host o nome di database. Solo i *nomi* delle variabili mancanti e degli
 * indicatori booleani. È deliberatamente accessibile senza autenticazione,
 * perché il caso d'uso principale è proprio quello in cui l'accesso non funziona.
 */

interface HealthReport {
  stato: 'ok' | 'degradato' | 'errore';
  database: {
    driver: 'postgres' | 'pglite' | null;
    /** Nome della variabile d'ambiente da cui proviene la connessione. */
    variabile: string | null;
    raggiungibile: boolean;
    migrazioniApplicate: number | null;
    migrazioniAttese: number;
    errore: string | null;
  };
  configurazione: {
    variabiliMancanti: string[];
    piattaformaServerless: string | null;
    demoAttiva: boolean;
    demoNonDisponibilePerche: string | null;
  };
  integrazioni: {
    googleOAuth: boolean;
    gmailCollegata: boolean;
    openai: boolean;
    anthropic: boolean;
  };
  vincoli: string[];
}

function serverlessPlatform(): string | null {
  if (process.env.VERCEL) return 'Vercel';
  if (process.env.NETLIFY) return 'Netlify';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'AWS Lambda';
  if (process.env.CF_PAGES) return 'Cloudflare Pages';
  return null;
}

/** Solo i nomi, mai i valori. */
function missingVariables(): string[] {
  const missing: string[] = [];
  if (!process.env.TOKEN_ENCRYPTION_KEY) missing.push('TOKEN_ENCRYPTION_KEY');
  // Su serverless la connessione è obbligatoria, comunque si chiami la variabile.
  if (serverlessPlatform() && !resolveConnectionUrl().url) missing.push('DATABASE_URL');
  return missing;
}

export async function GET() {
  const authMode = getAuthMode();
  const platform = serverlessPlatform();

  // Le migrazioni sono incorporate nel bundle: il conteggio atteso è noto con
  // certezza anche in una funzione serverless, dove la directory non esiste.
  const expectedMigrations = EMBEDDED_MIGRATIONS.length;

  const database: HealthReport['database'] = {
    driver: null,
    variabile: resolveConnectionUrl().variabile,
    raggiungibile: false,
    migrazioniApplicate: null,
    migrazioniAttese: expectedMigrations,
    errore: null,
  };

  let handle: Awaited<ReturnType<typeof createDb>> | null = null;
  try {
    handle = await createDb();
    database.driver = handle.driver;

    const rows = await handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from __drizzle_migrations`,
    );
    const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<{ n: number }>;
    database.migrazioniApplicate = Number(list[0]?.n ?? 0);
    database.raggiungibile = true;
  } catch (error) {
    // Drizzle incapsula l'errore del driver: la causa vera sta in `cause`, ed è
    // lì che si trova il codice PostgreSQL. Senza guardarla, il caso più comune
    // — schema mai migrato — verrebbe riportato come guasto generico.
    const e = error as { message?: string; cause?: { message?: string; code?: string } };
    const message = [e.message, e.cause?.message].filter(Boolean).join(' — ') || 'errore sconosciuto';
    const code = e.cause?.code;

    // 42P01 = undefined_table: il database risponde, ma lo schema non c'è.
    const tableMissing = code === '42P01' || /relation .* does not exist|undefined_table/i.test(message);

    if (tableMissing) {
      database.raggiungibile = true;
      database.migrazioniApplicate = 0;
      database.errore =
        'Il database risponde ma lo schema non è stato creato. Eseguire una volta, ' +
        'puntando a questo database: DATABASE_URL="…" pnpm db:migrate';
    } else {
      database.errore = message.slice(0, 500);
    }
  } finally {
    // Con `createDb` diretto la connessione va chiusa: non è l'handle condiviso.
    if (handle && handle.driver === 'postgres') await handle.close().catch(() => {});
  }

  let ai: Awaited<ReturnType<typeof providerStatus>> | null = null;
  try {
    ai = await providerStatus();
  } catch {
    // Le impostazioni vivono nel database: se non risponde, si riportano solo
    // le variabili d'ambiente presenti.
  }

  const variabiliMancanti = missingVariables();
  const migrazioniIncomplete =
    database.migrazioniApplicate !== null && database.migrazioniApplicate < expectedMigrations;

  const stato: HealthReport['stato'] = !database.raggiungibile
    ? 'errore'
    : variabiliMancanti.length > 0 || migrazioniIncomplete
      ? 'degradato'
      : 'ok';

  const report: HealthReport = {
    stato,
    database,
    configurazione: {
      variabiliMancanti,
      piattaformaServerless: platform,
      demoAttiva: authMode.demoAllowed,
      demoNonDisponibilePerche: authMode.demoUnavailableReason,
    },
    integrazioni: {
      googleOAuth: authMode.googleConfigured,
      gmailCollegata: false,
      openai: ai?.openai.available ?? Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
      anthropic:
        ai?.anthropic.available ?? Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL),
    },
    vincoli: [
      'Questa applicazione non può inviare email: non esiste alcuna funzione di invio.',
      'Il server MCP usa il trasporto stdio e non gira su questo deployment web.',
    ],
  };

  return NextResponse.json(report, {
    status: stato === 'errore' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
