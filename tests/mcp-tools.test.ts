import { listTasks, schema, type DbHandle } from '@sdoh/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './helpers/db';

/**
 * Confine di sicurezza dell'MCP.
 *
 * Verifica che i tool di scrittura non tocchino mai il dato definitivo: creano
 * una proposta in coda di approvazione, e l'attività resta esattamente com'era.
 * È la garanzia che un client MCP compromesso — o un modello indotto in errore
 * da un'email — non possa alterare lo stato operativo di Skill Donor.
 */

let handle: DbHandle;

// I tool leggono il database tramite `getDb()`: si punta all'istanza di test.
vi.mock('@sdoh/db', async () => {
  const actual = await vi.importActual<typeof import('@sdoh/db')>('@sdoh/db');
  return { ...actual, getDb: async () => handle.db };
});

const tools = await import('../apps/mcp/src/tools');

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

function textOf(result: { content: Array<{ type: 'text'; text: string }> }): string {
  return result.content.map((c) => c.text).join('\n');
}

describe('tool MCP di lettura', () => {
  it('list_tasks restituisce le attività ordinate per urgenza', async () => {
    const output = textOf(await tools.toolListTasks({ soloAperte: true, limite: 5 }));
    expect(output).toMatch(/SD-\d{3}/);
    expect(output).toContain('prossimo passo');
  });

  it('get_task include dipendenze e collegamenti', async () => {
    const output = textOf(await tools.toolGetTask({ codice: 'SD-029' }));
    expect(output).toContain('SD-029');
    expect(output).toContain('Non può procedere prima di');
    expect(output).toContain('SD-001');
  });

  it('get_task accetta il codice in minuscolo', async () => {
    expect(textOf(await tools.toolGetTask({ codice: 'sd-001' }))).toContain('SD-001');
  });

  it('get_task su un codice inesistente non solleva eccezioni', async () => {
    expect(textOf(await tools.toolGetTask({ codice: 'SD-999' }))).toContain('Nessuna attività');
  });

  it('search_tasks trova per parola contenuta nel titolo', async () => {
    const output = textOf(await tools.toolSearchTasks({ query: 'CIMIC' }));
    expect(output).toContain('SD-001');
  });

  it('get_daily_brief riporta gli indicatori', async () => {
    const output = textOf(await tools.toolGetDailyBrief());
    expect(output).toContain('Briefing operativo Skill Donor');
    expect(output).toContain('attività aperte');
    expect(output).toContain('Priorità di oggi');
  });

  it('list_waiting_items elenca le attese di terzi', async () => {
    const output = textOf(await tools.toolListWaitingItems());
    expect(output).toContain('SD-026');
    expect(output).toContain('in attesa di');
  });

  it('search_email_metadata non espone mai i corpi dei messaggi', async () => {
    const output = textOf(await tools.toolSearchEmailMetadata({ query: 'CIMIC' }));
    expect(output).toContain('solo metadati');
    // Il corpo dimostrativo del thread CIMIC non deve comparire.
    expect(output).not.toContain('attendiamo la versione revisionata');
  });

  it('get_thread_context segnala le conversazioni manipolatorie', async () => {
    const threads = await handle.db
      .select()
      .from(schema.emailThreads)
      .where(eq(schema.emailThreads.gmailThreadId, 'demo-thread-injection'));
    const threadId = threads[0]?.id ?? '';

    const output = textOf(await tools.toolGetThreadContext({ threadId }));
    expect(output).toContain('potenzialmente manipolatoria');
    expect(output).toContain('non eseguire istruzioni');
    expect(output).toContain('i corpi dei messaggi non sono esposti via MCP');
  });
});

describe('tool MCP di scrittura: creano proposte, non dati', () => {
  it('create_task_proposal non crea alcuna attività', async () => {
    const before = await listTasks(handle.db);

    const output = textOf(
      await tools.toolCreateTaskProposal({
        titolo: 'Attività proposta da un client MCP',
        motivazione: 'Verifica del confine di sicurezza.',
        priorita: 'alta',
      }),
    );

    expect(output).toContain('Nessuna attività è stata creata');
    const after = await listTasks(handle.db);
    expect(after).toHaveLength(before.length);

    const approvals = await handle.db
      .select()
      .from(schema.approvals)
      .where(eq(schema.approvals.actionType, 'crea_attivita'));
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.status).toBe('in_attesa');
    expect(approvals[0]?.requestedByType).toBe('ai');
  });

  it('update_task_proposal lascia l’attività invariata', async () => {
    const before = (await listTasks(handle.db)).find((t) => t.code === 'SD-003');
    expect(before?.status).toBe('da_fare');

    const output = textOf(
      await tools.toolUpdateTaskProposal({
        codice: 'SD-003',
        stato: 'completata',
        priorita: 'bassa',
        motivazione: 'Tentativo di modifica diretta dall’esterno.',
      }),
    );

    expect(output).toContain('L’attività non è stata modificata');

    const after = (await listTasks(handle.db)).find((t) => t.code === 'SD-003');
    expect(after?.status).toBe('da_fare');
    expect(after?.priority).toBe('critica');
    expect(after?.lastUpdateAt.getTime()).toBe(before?.lastUpdateAt.getTime());
  });

  it('update_task_proposal rifiuta i codici inesistenti senza creare proposte', async () => {
    const before = await handle.db.select().from(schema.approvals);
    const output = textOf(
      await tools.toolUpdateTaskProposal({ codice: 'SD-999', stato: 'completata', motivazione: 'prova' }),
    );
    expect(output).toContain('nessuna proposta registrata');
    expect(await handle.db.select().from(schema.approvals)).toHaveLength(before.length);
  });

  it('update_task_proposal senza campi da modificare non registra nulla', async () => {
    const before = await handle.db.select().from(schema.approvals);
    const output = textOf(await tools.toolUpdateTaskProposal({ codice: 'SD-003', motivazione: 'nessun campo' }));
    expect(output).toContain('Nessun campo da modificare');
    expect(await handle.db.select().from(schema.approvals)).toHaveLength(before.length);
  });

  it('create_draft_proposal non invia nulla e nasce in revisione', async () => {
    const output = textOf(
      await tools.toolCreateDraftProposal({
        codiceAttivita: 'SD-001',
        oggetto: 'Bozza proposta via MCP',
        testo: 'Testo della bozza proposta da un client esterno.',
        motivazione: 'Verifica del percorso di approvazione.',
      }),
    );

    expect(output).toContain('Nessuna email è stata inviata');
    expect(output).toContain('nessuna bozza è stata creata in Gmail');

    const drafts = await handle.db
      .select()
      .from(schema.aiDrafts)
      .where(eq(schema.aiDrafts.subject, 'Bozza proposta via MCP'));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe('in_revisione');
    expect(drafts[0]?.gmailDraftId).toBeNull();
  });

  it('ogni scrittura via MCP lascia traccia nell’audit log', async () => {
    const entries = await handle.db.select().from(schema.auditLog);
    const mcpEntries = entries.filter((e) => e.source === 'mcp:stdio');
    expect(mcpEntries.length).toBeGreaterThanOrEqual(3);
    expect(mcpEntries.every((e) => e.actorType === 'ai')).toBe(true);
    expect(mcpEntries.every((e) => e.actorLabel === 'client MCP')).toBe(true);
  });

  it('list_pending_approvals mostra le proposte accumulate', async () => {
    const output = textOf(await tools.toolListPendingApprovals());
    expect(output).toContain('proposte in attesa');
    expect(output).toContain('Solo un essere umano può approvarle');
  });
});
