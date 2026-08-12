import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Un solo tipo `Db` per due driver.
 *
 * - `postgres-js` verso un PostgreSQL reale (`DATABASE_URL=postgres://…`);
 * - **PGlite**, cioè PostgreSQL compilato in WASM ed eseguito nel processo Node,
 *   quando non c'è alcun database configurato.
 *
 * PGlite non è un mock: esegue le stesse migrazioni e lo stesso SQL. È ciò che
 * rende l'applicazione avviabile e testabile senza Docker e senza credenziali,
 * senza introdurre un secondo dialetto da mantenere.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type DbDriver = 'postgres' | 'pglite';

export interface DbHandle {
  db: Db;
  driver: DbDriver;
  /** Descrizione sicura da mostrare in interfaccia (mai con la password). */
  description: string;
  close: () => Promise<void>;
  /** Presente solo con PGlite: usato dal migratore dedicato. */
  pgliteClient?: unknown;
}

export interface DbOptions {
  /** URL di connessione. Se assente si usa PGlite. */
  url?: string | undefined;
  /** Directory dati PGlite; `memory://` per un database effimero (test). */
  pgliteDir?: string | undefined;
}

/** Radice del monorepo, dedotta dalla posizione di questo file: packages/db/src → ../../.. */
const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * I percorsi relativi sono ancorati alla radice del monorepo, non a `process.cwd()`:
 * `pnpm db:seed`, `next dev` e i test partono da directory diverse ma devono
 * vedere lo stesso database.
 */
function resolvePgliteDir(dir: string): string {
  if (dir === 'memory://') return dir;
  return isAbsolute(dir) ? dir : join(WORKSPACE_ROOT, dir);
}

function safeDescription(url: string): string {
  try {
    const u = new URL(url);
    u.password = '';
    u.username = u.username ? `${u.username}` : '';
    return `${u.protocol}//${u.username ? `${u.username}@` : ''}${u.host}${u.pathname}`;
  } catch {
    return 'postgres (URL non analizzabile)';
  }
}

/**
 * PGlite scrive su disco e mantiene lo stato fra una richiesta e l'altra: su una
 * piattaforma serverless nessuna delle due cose è vera. Il filesystem è di sola
 * lettura (tranne `/tmp`) e ogni invocazione può girare su un'istanza diversa,
 * quindi i dati sparirebbero fra una schermata e la successiva.
 *
 * Senza questo controllo il primo accesso fallirebbe con un `EROFS` opaco a metà
 * di una migrazione. Meglio fermarsi subito dicendo esattamente cosa manca.
 */
export class PgliteNotAvailableError extends Error {
  constructor(platform: string) {
    super(
      [
        `DATABASE_URL non è impostata e su ${platform} non è possibile usare PGlite.`,
        'PGlite richiede un filesystem scrivibile e persistente, che le piattaforme',
        'serverless non offrono: i dati andrebbero persi a ogni richiesta.',
        '',
        'Per procedere serve un PostgreSQL gestito (Vercel Postgres, Neon, Supabase…):',
        '  1. imposta DATABASE_URL fra le variabili d’ambiente del progetto;',
        '  2. esegui una volta le migrazioni verso quel database:',
        '     DATABASE_URL="postgres://…" pnpm db:migrate',
        '     DATABASE_URL="postgres://…" pnpm db:seed   # facoltativo: snapshot iniziale',
        '',
        'Dettagli in docs/deployment.md § Vercel e piattaforme serverless.',
      ].join('\n'),
    );
    this.name = 'PgliteNotAvailableError';
  }
}

/** Riconosce le piattaforme serverless più comuni dalle variabili che iniettano. */
function detectServerlessPlatform(): string | null {
  if (process.env.VERCEL) return 'Vercel';
  if (process.env.NETLIFY) return 'Netlify';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'AWS Lambda';
  if (process.env.CF_PAGES) return 'Cloudflare Pages';
  return null;
}

function assertPgliteIsUsable(): void {
  const platform = detectServerlessPlatform();
  // `ALLOW_PGLITE_ON_SERVERLESS=1` resta come via di fuga consapevole, per chi
  // stia sperimentando sapendo che i dati non sopravvivono alla richiesta.
  if (platform && process.env.ALLOW_PGLITE_ON_SERVERLESS !== '1') {
    throw new PgliteNotAvailableError(platform);
  }
}

/**
 * Le integrazioni gestite non usano tutte lo stesso nome per la stringa di
 * connessione: Neon e Vercel Postgres impostano `POSTGRES_URL` e varianti,
 * Supabase `DATABASE_URL`. Accettarli tutti evita di dover rinominare a mano una
 * variabile creata automaticamente — un passaggio facile da dimenticare e
 * difficile da diagnosticare, perché l'app sembrerebbe semplicemente senza database.
 *
 * L'ordine è deliberato: una `DATABASE_URL` impostata a mano vince sempre sulle
 * variabili generate dall'integrazione.
 */
const CONNECTION_URL_VARIABLES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'NEON_DATABASE_URL',
] as const;

export function resolveConnectionUrl(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  variabile: string | null;
} {
  for (const name of CONNECTION_URL_VARIABLES) {
    const value = env[name];
    if (value && (value.startsWith('postgres://') || value.startsWith('postgresql://'))) {
      return { url: value, variabile: name };
    }
  }
  return { url: '', variabile: null };
}

export async function createDb(options: DbOptions = {}): Promise<DbHandle> {
  const url = options.url ?? resolveConnectionUrl().url;

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const [{ default: postgres }, { drizzle }] = await Promise.all([
      import('postgres'),
      import('drizzle-orm/postgres-js'),
    ]);
    const sqlClient = postgres(url, { max: 10, prepare: false, onnotice: () => {} });
    const db = drizzle(sqlClient, { schema, casing: 'snake_case' }) as unknown as Db;
    return {
      db,
      driver: 'postgres',
      description: safeDescription(url),
      close: async () => {
        await sqlClient.end({ timeout: 5 });
      },
    };
  }

  assertPgliteIsUsable();

  const dir = resolvePgliteDir(options.pgliteDir ?? process.env.PGLITE_DIR ?? '.data/pglite');
  const [{ PGlite }, { drizzle }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
  ]);
  if (dir !== 'memory://') await mkdir(dir, { recursive: true });
  const client = dir === 'memory://' ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db;
  return {
    db,
    driver: 'pglite',
    description: dir === 'memory://' ? 'PGlite in memoria' : `PGlite (${dir})`,
    pgliteClient: client,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Handle condiviso per il processo. In sviluppo sopravvive all'HMR di Next,
 * altrimenti ogni ricompilazione aprirebbe una nuova istanza PGlite sulla stessa
 * directory e la seconda fallirebbe sul lock.
 */
const globalRef = globalThis as unknown as { __sdohDb?: Promise<DbHandle> };

export function getDbHandle(): Promise<DbHandle> {
  globalRef.__sdohDb ??= createDb();
  return globalRef.__sdohDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
