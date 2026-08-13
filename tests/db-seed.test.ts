import { formatDate, isOverdue, isStale, needsFollowUp } from '@sdoh/core';
import {
  createDb,
  ensureDatabaseReady,
  listProjects,
  listTasks,
  listThreads,
  resolveConnectionUrl,
  seedDatabase,
  type DbHandle,
} from '@sdoh/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/db';

const SNAPSHOT = new Date('2026-08-10T09:00:00+02:00');

describe('seed dello snapshot 10 agosto 2026', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('carica esattamente le 32 attività SD-001…SD-032 con codici stabili', async () => {
    const tasks = await listTasks(handle.db);
    expect(tasks).toHaveLength(32);
    const codes = tasks.map((t) => t.code);
    for (let i = 1; i <= 32; i += 1) {
      expect(codes).toContain(`SD-${String(i).padStart(3, '0')}`);
    }
  });

  it('rispetta le priorità e gli stati dichiarati nello snapshot', async () => {
    const tasks = await listTasks(handle.db);
    const byCode = new Map(tasks.map((t) => [t.code, t]));

    for (const code of ['SD-001', 'SD-002', 'SD-003', 'SD-004']) {
      expect(byCode.get(code)?.priority, code).toBe('critica');
    }
    for (const code of ['SD-026', 'SD-027', 'SD-028', 'SD-029']) {
      expect(byCode.get(code)?.status, code).toBe('in_attesa');
    }
    expect(byCode.get('SD-030')?.status).toBe('da_verificare');
    expect(byCode.get('SD-031')?.status).toBe('da_verificare');
    expect(byCode.get('SD-032')?.status).toBe('in_lavorazione');
  });

  it('registra le scadenze richieste nel fuso Europe/Rome', async () => {
    const tasks = await listTasks(handle.db);
    const byCode = new Map(tasks.map((t) => [t.code, t]));
    expect(formatDate(byCode.get('SD-021')?.dueDate)).toBe('26/08/2026');
    expect(formatDate(byCode.get('SD-022')?.dueDate)).toBe('17/09/2026');
    expect(formatDate(byCode.get('SD-023')?.dueDate)).toBe('29/09/2026');
    expect(formatDate(byCode.get('SD-028')?.dueDate)).toBe('26/08/2026');
  });

  it('collega SD-029 a SD-001 e SD-021 a SD-028', async () => {
    const rows = await handle.db.execute<{ task: string; depends: string }>(sql`
      select a.code as task, b.code as depends
      from task_dependencies d
      join tasks a on a.id = d.task_id
      join tasks b on b.id = d.depends_on_task_id
      order by a.code
    `);
    const pairs = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<{
      task: string;
      depends: string;
    }>;
    expect(pairs).toContainEqual({ task: 'SD-021', depends: 'SD-028' });
    expect(pairs).toContainEqual({ task: 'SD-029', depends: 'SD-001' });
  });

  it('produce attività ferme, scadute e in attesa coerenti con lo snapshot', async () => {
    const tasks = await listTasks(handle.db);
    const stale = tasks.filter((t) => isStale(t, SNAPSHOT));
    const overdue = tasks.filter((t) => isOverdue(t, SNAPSHOT));
    const waiting = tasks.filter((t) => needsFollowUp(t, SNAPSHOT));

    expect(stale.length).toBeGreaterThan(0);
    expect(stale.map((t) => t.code)).toContain('SD-015'); // ferma da 21 giorni
    expect(overdue.length).toBeGreaterThanOrEqual(0);
    expect(waiting.map((t) => t.code)).toContain('SD-026');
  });

  it('crea progetti collegati a ogni attività', async () => {
    const [tasks, projects] = await Promise.all([listTasks(handle.db), listProjects(handle.db)]);
    expect(projects.length).toBeGreaterThanOrEqual(14);
    expect(tasks.every((t) => t.projectId !== null)).toBe(true);
  });

  it('importa i thread email demo con i collegamenti alle attività', async () => {
    const threads = await listThreads(handle.db);
    expect(threads.length).toBeGreaterThanOrEqual(10);
    const cimic = threads.find((t) => t.gmailThreadId === 'demo-thread-cimic-paper');
    expect(cimic?.linkedTaskCodes).toContain('SD-001');
    expect(cimic?.syncState).toBe('mock');
  });

  it('è idempotente: rieseguirlo non crea duplicati', async () => {
    await seedDatabase(handle.db);
    await seedDatabase(handle.db);
    const tasks = await listTasks(handle.db);
    expect(tasks).toHaveLength(32);

    const orgs = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from organizations`);
    const rows = (Array.isArray(orgs) ? orgs : (orgs as { rows: unknown[] }).rows) as Array<{ n: number }>;
    expect(Number(rows[0]?.n)).toBe(21);
  });
});

describe('audit log', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await createTestDb({ seed: false });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('rifiuta UPDATE e DELETE a livello di database', async () => {
    await handle.db.execute(sql`
      insert into audit_log (actor_type, actor_label, action, entity_type, source)
      values ('umano', 'test', 'test.action', 'task', 'test')
    `);

    // Drizzle incapsula l'errore del driver: il messaggio del trigger sta in `cause`.
    const messageOf = async (run: Promise<unknown>): Promise<string> => {
      try {
        await run;
        return '';
      } catch (error) {
        const e = error as { message?: string; cause?: { message?: string } };
        return `${e.message ?? ''} ${e.cause?.message ?? ''}`;
      }
    };

    expect(await messageOf(handle.db.execute(sql`update audit_log set action = 'manomesso'`))).toMatch(
      /append-only/i,
    );
    expect(await messageOf(handle.db.execute(sql`delete from audit_log`))).toMatch(/append-only/i);
  });

  it('consente la purga controllata entro la retention', async () => {
    const before = await handle.db.execute<{ n: number }>(sql`select count(*)::int as n from audit_log`);
    const beforeRows = (Array.isArray(before) ? before : (before as { rows: unknown[] }).rows) as Array<{ n: number }>;
    expect(Number(beforeRows[0]?.n)).toBeGreaterThan(0);

    // Nessuna riga è più vecchia della retention: la purga registra e non cancella nulla.
    await handle.db.execute(sql`select audit_log_purge(365)`);
    const after = await handle.db.execute<{ n: number }>(
      sql`select count(*)::int as n from audit_log where action = 'audit.purge'`,
    );
    const afterRows = (Array.isArray(after) ? after : (after as { rows: unknown[] }).rows) as Array<{ n: number }>;
    expect(Number(afterRows[0]?.n)).toBe(1);
  });
});

describe('PGlite su piattaforme serverless', () => {
  /**
   * PGlite scrive su disco e mantiene lo stato fra le richieste: su Vercel e
   * simili nessuna delle due cose è vera. Senza questo controllo il primo
   * accesso fallirebbe con un errore di filesystem a metà di una migrazione,
   * difficilissimo da diagnosticare da remoto.
   */
  it('si rifiuta di partire senza DATABASE_URL, spiegando cosa manca', async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = '1';
    try {
      await expect(createDb({ pgliteDir: 'memory://' })).rejects.toThrow(/DATABASE_URL non è impostata/);
      await expect(createDb({ pgliteDir: 'memory://' })).rejects.toThrow(/pnpm db:migrate/);
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it('consente comunque una deroga consapevole', async () => {
    const previousVercel = process.env.VERCEL;
    const previousOverride = process.env.ALLOW_PGLITE_ON_SERVERLESS;
    process.env.VERCEL = '1';
    process.env.ALLOW_PGLITE_ON_SERVERLESS = '1';
    try {
      const handle = await createDb({ pgliteDir: 'memory://' });
      expect(handle.driver).toBe('pglite');
      await handle.close();
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
      if (previousOverride === undefined) delete process.env.ALLOW_PGLITE_ON_SERVERLESS;
      else process.env.ALLOW_PGLITE_ON_SERVERLESS = previousOverride;
    }
  });

  it('un DATABASE_URL valido ha comunque la precedenza', async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = '1';
    try {
      // Non si connette davvero: `postgres-js` è pigro, quindi il costruttore
      // riesce anche senza un server in ascolto. Qui interessa solo che il
      // controllo su PGlite non venga applicato al driver PostgreSQL.
      const handle = await createDb({ url: 'postgres://utente@127.0.0.1:1/db' });
      expect(handle.driver).toBe('postgres');
      // La descrizione non deve mai contenere la password.
      expect(handle.description).not.toContain('utente:');
      await handle.close().catch(() => {});
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });
});

describe('risoluzione della stringa di connessione', () => {
  /**
   * Le integrazioni gestite creano la variabile con nomi diversi: Neon e Vercel
   * Postgres usano `POSTGRES_URL`, Supabase `DATABASE_URL`. Riconoscerli tutti
   * evita che l'app sembri "senza database" solo per un nome diverso.
   */
  it('preferisce DATABASE_URL quando è impostata a mano', () => {
    const resolved = resolveConnectionUrl({
      DATABASE_URL: 'postgres://a@host/manuale',
      POSTGRES_URL: 'postgres://b@host/integrazione',
    } as NodeJS.ProcessEnv);
    expect(resolved.variabile).toBe('DATABASE_URL');
    expect(resolved.url).toContain('/manuale');
  });

  it('accetta i nomi generati dalle integrazioni', () => {
    for (const name of ['POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING', 'NEON_DATABASE_URL']) {
      const resolved = resolveConnectionUrl({ [name]: 'postgresql://u@host/db' } as NodeJS.ProcessEnv);
      expect(resolved.variabile, name).toBe(name);
    }
  });

  it('ignora i valori che non sono stringhe di connessione PostgreSQL', () => {
    const resolved = resolveConnectionUrl({ DATABASE_URL: 'mysql://u@host/db' } as NodeJS.ProcessEnv);
    expect(resolved.variabile).toBeNull();
    expect(resolved.url).toBe('');
  });
});

describe('preparazione automatica del database', () => {
  /**
   * L'inizializzazione automatica elimina l'unico passaggio che richiedeva un
   * terminale. Ciò che non deve mai fare è toccare dati già presenti: queste
   * prove coprono esattamente quel confine.
   */
  it('prepara da zero uno schema assente e carica i dati iniziali', async () => {
    const handle = await createDb({ pgliteDir: 'memory://' });
    try {
      const esito = await ensureDatabaseReady(handle);
      expect(esito.eseguito).toBe(true);
      expect(esito.migrazioniApplicate.length).toBeGreaterThan(0);
      expect(esito.seedEseguito).toBe(true);
      expect(await listTasks(handle.db)).toHaveLength(32);
    } finally {
      await handle.close();
    }
  });

  it('non riesegue il seed su un database già popolato', async () => {
    const handle = await createDb({ pgliteDir: 'memory://' });
    try {
      await ensureDatabaseReady(handle);

      // Lavoro reale dell'utente: un'attività modificata e una creata da zero.
      await handle.db.execute(
        sql`update tasks set title = 'Modificata dall''utente' where code = 'SD-001'`,
      );
      await handle.db.execute(
        sql`insert into tasks (code, title, status, priority, last_update_at)
            values ('SD-099', 'Creata dall''utente', 'da_fare', 'alta', now())`,
      );

      const secondo = await ensureDatabaseReady(handle);
      expect(secondo.seedEseguito).toBe(false);
      expect(secondo.migrazioniApplicate).toEqual([]);

      const tasks = await listTasks(handle.db);
      expect(tasks).toHaveLength(33);
      expect(tasks.find((t) => t.code === 'SD-001')?.title).toBe('Modificata dall’utente'.replace('’', "'"));
      expect(tasks.find((t) => t.code === 'SD-099')).toBeDefined();
    } finally {
      await handle.close();
    }
  });

  it('rispetta AUTO_INIT_DB=off', async () => {
    const previous = process.env.AUTO_INIT_DB;
    process.env.AUTO_INIT_DB = 'off';
    const handle = await createDb({ pgliteDir: 'memory://' });
    try {
      const esito = await ensureDatabaseReady(handle);
      expect(esito.eseguito).toBe(false);
      expect(esito.motivoSalto).toContain('AUTO_INIT_DB=off');
    } finally {
      await handle.close();
      if (previous === undefined) delete process.env.AUTO_INIT_DB;
      else process.env.AUTO_INIT_DB = previous;
    }
  });

  it('rispetta AUTO_SEED=off: crea lo schema ma lascia il database vuoto', async () => {
    const previous = process.env.AUTO_SEED;
    process.env.AUTO_SEED = 'off';
    const handle = await createDb({ pgliteDir: 'memory://' });
    try {
      const esito = await ensureDatabaseReady(handle);
      expect(esito.eseguito).toBe(true);
      expect(esito.seedEseguito).toBe(false);
      expect(await listTasks(handle.db)).toHaveLength(0);
    } finally {
      await handle.close();
      if (previous === undefined) delete process.env.AUTO_SEED;
      else process.env.AUTO_SEED = previous;
    }
  });
});
