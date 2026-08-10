'use server';

import { PROMPT_TEMPLATES } from '@sdoh/ai';
import type { SourceRef } from '@sdoh/core';
import { getDb, recordAudit, recordTaskEvent, schema } from '@sdoh/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { runDraft } from '../ai-service';
import { requirePermission } from '../auth';
import { getGmailState } from '../gmail-service';
import { LIMITS, rateLimit } from '../rate-limit';
import type { ActionResult } from './tasks';

/**
 * Bozze e approvazioni.
 *
 * Percorso obbligato: generazione interna → revisione umana → approvazione →
 * (solo su azione esplicita) creazione della bozza nella casella Gmail.
 * Non esiste alcun passaggio che invii un messaggio.
 */

export async function generateDraftAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('ai:use');
  const threadId = formData.get('threadId') ? String(formData.get('threadId')) : null;
  const taskId = formData.get('taskId') ? String(formData.get('taskId')) : null;
  const instruction = formData.get('instruction') ? String(formData.get('instruction')).slice(0, 2_000) : null;

  if (!threadId && !taskId) return { ok: false, message: 'Indica una conversazione o un’attività.' };

  const limit = rateLimit(`ai:${user.id}`, LIMITS.ai.limit, LIMITS.ai.window);
  if (!limit.allowed) {
    return { ok: false, message: `Limite di chiamate AI raggiunto. Riprova fra ${limit.retryAfterSeconds} secondi.` };
  }

  const db = await getDb();
  const sources: SourceRef[] = [];
  const facts: string[] = [];

  let threadCtx = null;
  if (threadId) {
    const [thread] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, threadId));
    if (!thread) return { ok: false, message: 'Conversazione non trovata.' };
    const messages = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.threadId, threadId));
    threadCtx = {
      subject: thread.subject,
      fromName: thread.fromName,
      fromEmail: thread.fromEmail,
      receivedAt: thread.lastMessageAt.toISOString(),
      snippet: thread.snippet,
      body: messages.find((m) => m.bodyCachedText)?.bodyCachedText ?? null,
      projectHints: [],
    };
    sources.push({ kind: 'email_thread', id: thread.id, label: thread.subject });
  }

  let taskSummary: string | null = null;
  if (taskId) {
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) return { ok: false, message: 'Attività non trovata.' };
    taskSummary = `${task.code} — ${task.title} (stato: ${task.status}, priorità: ${task.priority})`;
    if (task.nextStep) facts.push(`Prossimo passo registrato su ${task.code}: ${task.nextStep}`);
    if (task.dueDate) facts.push(`Scadenza registrata su ${task.code}: ${task.dueDate.toISOString().slice(0, 10)}`);
    sources.push({ kind: 'task', id: task.id, label: task.code });
  }

  try {
    const { data, meta } = await runDraft(
      { thread: threadCtx, taskSummary, instruction, facts },
      sources,
    );

    const [created] = await db
      .insert(schema.aiDrafts)
      .values({
        provider: meta.provider,
        model: meta.model,
        promptTemplate: data.promptTemplate ?? PROMPT_TEMPLATES.bozza,
        sourceRefs: sources,
        subject: data.subject,
        body: data.body,
        status: data.review ? 'in_revisione' : 'generata',
        reviewNotes: data.reviewNotes,
        revisionProvider: data.review?.provider ?? null,
        revisionModel: data.review?.model ?? null,
        revisionBody: data.review?.correctedBody ?? null,
        revisionNotes: data.review
          ? [`Esito: ${data.review.outcome}`, ...data.review.findings, data.review.rationale].join('\n')
          : null,
        threadId,
        taskId,
      })
      .returning({ id: schema.aiDrafts.id });

    if (!created) return { ok: false, message: 'Salvataggio della bozza non riuscito.' };

    // La bozza è una proposta: nasce come approvazione in attesa, non come fatto.
    await db.insert(schema.approvals).values({
      actionType: 'crea_bozza',
      entityType: 'ai_draft',
      entityId: created.id,
      status: 'in_attesa',
      requestedByType: 'ai',
      requestedByLabel: `${meta.provider}/${meta.model}`,
      proposedPayload: { subject: data.subject, confidence: data.confidence },
      rationale: data.reviewNotes,
    });

    if (threadId) {
      await db
        .update(schema.emailThreads)
        .set({ status: 'risposta_da_preparare', updatedAt: new Date() })
        .where(eq(schema.emailThreads.id, threadId));
    }
    if (taskId) {
      await recordTaskEvent(db, {
        taskId,
        kind: 'bozza_generata',
        summary: `Bozza generata da ${meta.provider} (${meta.model})`,
        detail: { draftId: created.id, confidenza: data.confidence },
        actorType: 'ai',
        actorLabel: `${meta.provider}/${meta.model}`,
      });
    }

    await recordAudit(db, {
      actorType: 'ai',
      actorLabel: `${meta.provider}/${meta.model}`,
      userId: user.id,
      action: 'draft.generate',
      entityType: 'ai_draft',
      entityId: created.id,
      newValue: { subject: data.subject, degradato: meta.degraded, revisione: data.review?.outcome ?? null },
      source: 'web:drafts',
      sessionRef: user.sessionRef,
    });

    revalidatePath('/bozze');
    revalidatePath('/inbox');
    return {
      ok: true,
      message: `Bozza generata (${meta.description}). Va rivista e approvata prima di qualunque uso.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Generazione non riuscita: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
    };
  }
}

export async function decideDraftAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('approvals:decide');
  const draftId = String(formData.get('draftId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = formData.get('note') ? String(formData.get('note')).slice(0, 2_000) : null;

  if (!draftId || !['approva', 'rifiuta'].includes(decision)) {
    return { ok: false, message: 'Decisione non valida.' };
  }

  const db = await getDb();
  const [draft] = await db.select().from(schema.aiDrafts).where(eq(schema.aiDrafts.id, draftId));
  if (!draft) return { ok: false, message: 'Bozza non trovata.' };
  if (draft.status === 'trasferita_gmail') {
    return { ok: false, message: 'La bozza è già stata trasferita in Gmail: non è più modificabile.' };
  }

  const approved = decision === 'approva';

  await db
    .update(schema.aiDrafts)
    .set({
      status: approved ? 'approvata' : 'rifiutata',
      reviewNotes: note ?? draft.reviewNotes,
      approvedByUserId: approved ? user.id : null,
      approvedAt: approved ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiDrafts.id, draftId));

  await db
    .update(schema.approvals)
    .set({
      status: approved ? 'approvata' : 'rifiutata',
      approvedByUserId: user.id,
      decidedAt: new Date(),
      outcome: approved ? 'Bozza approvata dall’utente' : 'Bozza rifiutata dall’utente',
    })
    .where(eq(schema.approvals.entityId, draftId));

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: approved ? 'draft.approve' : 'draft.reject',
    entityType: 'ai_draft',
    entityId: draftId,
    previousValue: { status: draft.status },
    newValue: { status: approved ? 'approvata' : 'rifiutata', nota: note },
    source: 'web:drafts',
    sessionRef: user.sessionRef,
  });

  if (draft.taskId) {
    await recordTaskEvent(db, {
      taskId: draft.taskId,
      kind: approved ? 'bozza_approvata' : 'bozza_rifiutata',
      summary: approved ? 'Bozza approvata' : 'Bozza rifiutata',
      detail: { draftId, nota: note },
      actorType: 'umano',
      actorLabel: user.name,
    });
  }

  revalidatePath('/bozze');
  return { ok: true, message: approved ? 'Bozza approvata.' : 'Bozza rifiutata.' };
}

export async function updateDraftBodyAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('email:draft');
  const draftId = String(formData.get('draftId') ?? '');
  const subject = String(formData.get('subject') ?? '').slice(0, 300);
  const body = String(formData.get('body') ?? '').slice(0, 20_000);

  if (!draftId || subject.length < 1 || body.length < 10) {
    return { ok: false, message: 'Oggetto e corpo non possono essere vuoti.' };
  }

  const db = await getDb();
  const [draft] = await db.select().from(schema.aiDrafts).where(eq(schema.aiDrafts.id, draftId));
  if (!draft) return { ok: false, message: 'Bozza non trovata.' };
  if (draft.status === 'trasferita_gmail') {
    return { ok: false, message: 'La bozza è già in Gmail: modificala direttamente lì.' };
  }

  await db
    .update(schema.aiDrafts)
    .set({ subject, body, status: 'in_revisione', updatedAt: new Date() })
    .where(eq(schema.aiDrafts.id, draftId));

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'draft.edit',
    entityType: 'ai_draft',
    entityId: draftId,
    previousValue: { subject: draft.subject, lunghezzaCorpo: draft.body.length },
    newValue: { subject, lunghezzaCorpo: body.length },
    source: 'web:drafts',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/bozze');
  return { ok: true, message: 'Bozza aggiornata. Va riapprovata prima del trasferimento.' };
}

/**
 * Trasferimento in Gmail. Richiede: bozza approvata, conferma esplicita
 * dell'utente in questa richiesta, account collegato. Crea una BOZZA, mai un invio.
 */
export async function transferDraftToGmailAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('email:draft');
  const draftId = String(formData.get('draftId') ?? '');
  const confirmed = formData.get('conferma') === 'si';

  if (!draftId) return { ok: false, message: 'Bozza non indicata.' };
  if (!confirmed) {
    return { ok: false, message: 'Conferma esplicita mancante: la bozza non è stata trasferita.' };
  }

  const limit = rateLimit(`gmail-draft:${user.id}`, LIMITS.draftToGmail.limit, LIMITS.draftToGmail.window);
  if (!limit.allowed) {
    return { ok: false, message: `Troppi trasferimenti. Riprova fra ${limit.retryAfterSeconds} secondi.` };
  }

  const db = await getDb();
  const [draft] = await db.select().from(schema.aiDrafts).where(eq(schema.aiDrafts.id, draftId));
  if (!draft) return { ok: false, message: 'Bozza non trovata.' };
  if (draft.status !== 'approvata') {
    return { ok: false, message: 'Solo una bozza approvata può essere trasferita in Gmail.' };
  }

  const recipients: string[] = [];
  let gmailThreadId: string | null = null;
  if (draft.threadId) {
    const [thread] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, draft.threadId));
    if (thread) {
      recipients.push(thread.fromEmail);
      gmailThreadId = thread.gmailThreadId;
    }
  }
  if (recipients.length === 0) {
    return { ok: false, message: 'Nessun destinatario ricavabile: collega la bozza a una conversazione.' };
  }

  const state = await getGmailState();
  try {
    const result = await state.adapter.createDraft({
      to: recipients,
      subject: draft.subject,
      body: draft.body,
      threadId: gmailThreadId,
    });

    await db
      .update(schema.aiDrafts)
      .set({
        status: 'trasferita_gmail',
        gmailDraftId: result.draftId,
        gmailTransferredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.aiDrafts.id, draftId));

    await recordAudit(db, {
      actorType: 'umano',
      actorLabel: user.name,
      userId: user.id,
      action: 'draft.transfer_to_gmail',
      entityType: 'ai_draft',
      entityId: draftId,
      newValue: { gmailDraftId: result.draftId, adapter: state.adapter.kind },
      source: 'web:drafts',
      sessionRef: user.sessionRef,
    });

    revalidatePath('/bozze');
    return {
      ok: true,
      message:
        state.adapter.kind === 'mock'
          ? 'Trasferimento simulato in modalità demo: nessuna bozza è stata creata in Gmail. Il messaggio non è stato inviato.'
          : 'Bozza creata nella casella Gmail. Non è stata inviata: va aperta e spedita manualmente da Gmail.',
    };
  } catch (error) {
    return {
      ok: false,
      message: `Trasferimento non riuscito: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
    };
  }
}

/** Decisione su una proposta generica (incluse quelle arrivate via MCP). */
export async function decideApprovalAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('approvals:decide');
  const approvalId = String(formData.get('approvalId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!approvalId || !['approva', 'rifiuta'].includes(decision)) {
    return { ok: false, message: 'Decisione non valida.' };
  }

  const db = await getDb();
  const [approval] = await db.select().from(schema.approvals).where(eq(schema.approvals.id, approvalId));
  if (!approval) return { ok: false, message: 'Proposta non trovata.' };
  if (approval.status !== 'in_attesa') return { ok: false, message: 'Proposta già decisa.' };

  const approved = decision === 'approva';
  let outcome = approved ? 'Approvata' : 'Rifiutata';

  if (approved) {
    outcome = await applyApproval(approval, user.name);
  }

  await db
    .update(schema.approvals)
    .set({
      status: approved ? 'approvata' : 'rifiutata',
      approvedByUserId: user.id,
      decidedAt: new Date(),
      outcome,
    })
    .where(eq(schema.approvals.id, approvalId));

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: approved ? 'approval.approve' : 'approval.reject',
    entityType: 'approval',
    entityId: approvalId,
    previousValue: { status: 'in_attesa' },
    newValue: { status: approved ? 'approvata' : 'rifiutata', esito: outcome },
    source: 'web:approvals',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/bozze');
  revalidatePath('/attivita');
  revalidatePath('/oggi');
  return { ok: true, message: approved ? `Proposta approvata. ${outcome}` : 'Proposta rifiutata.' };
}

/**
 * Applica una proposta approvata. Le proposte MCP diventano dati reali solo qui,
 * dopo una decisione umana esplicita.
 */
async function applyApproval(
  approval: typeof schema.approvals.$inferSelect,
  actorName: string,
): Promise<string> {
  const db = await getDb();
  const payload = approval.proposedPayload as Record<string, unknown>;

  if (approval.actionType === 'crea_attivita') {
    const { listTasks } = await import('@sdoh/db');
    const { nextTaskCode, romeInstant } = await import('@sdoh/core');
    const existing = await listTasks(db);
    const code = nextTaskCode(existing.map((t) => t.code));
    const dueDate = typeof payload.dueDate === 'string' && payload.dueDate ? romeInstant(payload.dueDate, '18:00') : null;

    const [created] = await db
      .insert(schema.tasks)
      .values({
        code,
        title: String(payload.title ?? 'Attività senza titolo').slice(0, 300),
        description: payload.description ? String(payload.description) : null,
        status: 'da_fare',
        priority: (payload.priority as 'critica' | 'alta' | 'media' | 'bassa') ?? 'media',
        nextStep: payload.nextStep ? String(payload.nextStep) : null,
        dueDate,
        source: 'mcp',
        lastUpdateAt: new Date(),
        aiConfidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        updatedByType: 'ai',
        updatedByLabel: approval.requestedByLabel,
      })
      .returning({ id: schema.tasks.id });

    if (created) {
      await recordTaskEvent(db, {
        taskId: created.id,
        kind: 'creazione',
        summary: `Attività ${code} creata da una proposta approvata (${approval.requestedByLabel})`,
        actorType: 'umano',
        actorLabel: actorName,
      });
    }
    return `Creata l’attività ${code}.`;
  }

  if (approval.actionType === 'aggiorna_attivita' && approval.entityId) {
    const patch: Record<string, unknown> = {
      lastUpdateAt: new Date(),
      updatedAt: new Date(),
      updatedByType: 'ai',
      updatedByLabel: approval.requestedByLabel,
    };
    if (payload.status) patch.status = payload.status;
    if (payload.priority) patch.priority = payload.priority;
    if (payload.nextStep !== undefined) patch.nextStep = payload.nextStep;
    if (typeof payload.waitingOnThirdParty === 'boolean') patch.waitingOnThirdParty = payload.waitingOnThirdParty;
    if (typeof payload.dueDate === 'string' && payload.dueDate) {
      const { romeInstant } = await import('@sdoh/core');
      patch.dueDate = romeInstant(payload.dueDate, '18:00');
    }

    await db.update(schema.tasks).set(patch as never).where(eq(schema.tasks.id, approval.entityId));
    await recordTaskEvent(db, {
      taskId: approval.entityId,
      kind: 'modifica',
      summary: `Aggiornamento da proposta approvata (${approval.requestedByLabel})`,
      detail: payload,
      actorType: 'umano',
      actorLabel: actorName,
    });
    return 'Attività aggiornata.';
  }

  return 'Proposta approvata: nessuna azione automatica prevista per questo tipo.';
}
