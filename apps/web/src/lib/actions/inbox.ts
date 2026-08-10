'use server';

import { detectInjectionSignals, nextTaskCode, type TaskPriority } from '@sdoh/core';
import { getDb, listProjects, listTasks, recordAudit, recordTaskEvent, schema } from '@sdoh/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '../auth';
import { runClassification } from '../ai-service';
import { getGmailState } from '../gmail-service';
import { LIMITS, rateLimit } from '../rate-limit';
import type { ActionResult } from './tasks';

/**
 * Azioni sull'inbox operativa.
 *
 * Nessuna di queste azioni invia, archivia, etichetta o cancella qualcosa in
 * Gmail: la sincronizzazione è in sola lettura e lo stato operativo dei thread
 * vive nel database dell'Hub, non nella casella.
 */

export async function syncInboxAction(): Promise<ActionResult> {
  const user = await requirePermission('email:read');

  const limit = rateLimit(`sync:${user.id}`, LIMITS.gmailSync.limit, LIMITS.gmailSync.window);
  if (!limit.allowed) {
    return { ok: false, message: `Troppe sincronizzazioni. Riprova fra ${limit.retryAfterSeconds} secondi.` };
  }

  const db = await getDb();
  const state = await getGmailState();

  try {
    const result = await state.adapter.syncThreads({
      maxResults: 50,
      sinceHistoryId: state.lastHistoryId,
    });

    let imported = 0;
    for (const thread of result.threads) {
      const signals = detectInjectionSignals(`${thread.subject}\n${thread.snippet}`);
      const values = {
        gmailThreadId: thread.gmailThreadId,
        subject: thread.subject,
        fromName: thread.fromName,
        fromEmail: thread.fromEmail,
        toEmails: thread.toEmails,
        ccEmails: thread.ccEmails,
        firstMessageAt: thread.firstMessageAt,
        lastMessageAt: thread.lastMessageAt,
        labels: thread.labels,
        snippet: thread.snippet,
        messageCount: thread.messageCount,
        gmailUrl: thread.gmailUrl,
        syncState: state.connected ? 'sincronizzato' : 'mock',
        injectionFlagged: signals.suspicious,
        injectionReasons: signals.reasons,
        updatedAt: new Date(),
      };

      // `onConflictDoUpdate` sui metadati: lo stato operativo e la
      // classificazione non vengono toccati da una risincronizzazione.
      await db
        .insert(schema.emailThreads)
        .values(values)
        .onConflictDoUpdate({ target: schema.emailThreads.gmailThreadId, set: values });
      imported += 1;
    }

    const threadIdMap = new Map(
      (await db.select({ id: schema.emailThreads.id, gid: schema.emailThreads.gmailThreadId }).from(schema.emailThreads)).map(
        (r) => [r.gid, r.id],
      ),
    );

    for (const message of result.messages) {
      const threadId = threadIdMap.get(message.gmailThreadId);
      if (!threadId) continue;
      const values = {
        threadId,
        gmailMessageId: message.gmailMessageId,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        toEmails: message.toEmails,
        subject: message.subject,
        sentAt: message.sentAt,
        snippet: message.snippet,
        labels: message.labels,
        hasAttachments: message.hasAttachments,
        attachmentMeta: message.attachments,
      };
      await db
        .insert(schema.emailMessages)
        .values(values)
        .onConflictDoUpdate({ target: schema.emailMessages.gmailMessageId, set: values });
    }

    if (state.connected) {
      await db
        .update(schema.integrationTokens)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: 'ok',
          lastSyncError: null,
          lastHistoryId: result.historyId,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrationTokens.provider, 'gmail'));
    }

    await recordAudit(db, {
      actorType: 'umano',
      actorLabel: user.name,
      userId: user.id,
      action: 'gmail.sync',
      entityType: 'email_thread',
      newValue: {
        thread: imported,
        incrementale: result.incremental,
        adapter: state.adapter.kind,
        avvisi: result.warnings,
      },
      source: 'web:inbox',
      sessionRef: user.sessionRef,
    });

    revalidatePath('/inbox');
    return {
      ok: true,
      message:
        state.adapter.kind === 'mock'
          ? `${imported} thread dimostrativi ricaricati (nessuna casella Gmail contattata).`
          : `${imported} thread sincronizzati${result.incremental ? ' (incrementale)' : ''}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    if (state.connected) {
      await db
        .update(schema.integrationTokens)
        .set({ lastSyncAt: new Date(), lastSyncStatus: 'errore', lastSyncError: message })
        .where(eq(schema.integrationTokens.provider, 'gmail'));
    }
    await recordAudit(db, {
      actorType: 'sistema',
      actorLabel: 'gmail-sync',
      action: 'gmail.sync.error',
      entityType: 'email_thread',
      newValue: { errore: message },
      source: 'web:inbox',
    });
    revalidatePath('/inbox');
    return { ok: false, message: `Sincronizzazione non riuscita: ${message}` };
  }
}

export async function linkThreadToTaskAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const threadId = String(formData.get('threadId') ?? '');
  const taskId = String(formData.get('taskId') ?? '');
  if (!threadId || !taskId) return { ok: false, message: 'Seleziona un’attività.' };

  const db = await getDb();
  const [thread] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, threadId));
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!thread || !task) return { ok: false, message: 'Thread o attività non trovati.' };

  await db
    .insert(schema.taskEmailThreads)
    .values({ taskId, threadId, linkedByType: 'umano' })
    .onConflictDoNothing();

  await db
    .update(schema.emailThreads)
    .set({ status: 'collegata', updatedAt: new Date() })
    .where(eq(schema.emailThreads.id, threadId));

  await recordTaskEvent(db, {
    taskId,
    kind: 'email_collegata',
    summary: `Collegata la conversazione "${thread.subject}"`,
    detail: { gmailThreadId: thread.gmailThreadId },
    actorType: 'umano',
    actorLabel: user.name,
  });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'email.link_task',
    entityType: 'email_thread',
    entityId: threadId,
    newValue: { taskCode: task.code },
    source: 'web:inbox',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/inbox');
  revalidatePath(`/attivita/${task.code}`);
  return { ok: true, message: `Conversazione collegata a ${task.code}.` };
}

export async function createTaskFromThreadAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const threadId = String(formData.get('threadId') ?? '');
  if (!threadId) return { ok: false, message: 'Thread non indicato.' };

  const db = await getDb();
  const [thread] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, threadId));
  if (!thread) return { ok: false, message: 'Thread non trovato.' };

  const existing = await listTasks(db);
  const code = nextTaskCode(existing.map((t) => t.code));
  const classification = thread.aiClassification as { confidenza?: number; confidence?: number } | null;

  const [created] = await db
    .insert(schema.tasks)
    .values({
      code,
      title: thread.subject.slice(0, 280),
      description: `Attività creata dalla conversazione "${thread.subject}" ricevuta da ${thread.fromEmail}.`,
      status: 'da_fare',
      priority: (thread.suggestedUrgency as TaskPriority | null) ?? 'media',
      projectId: thread.suggestedProjectId,
      ownerId: user.id,
      nextStep: 'Leggere la conversazione e definire il prossimo passo.',
      source: 'email',
      lastUpdateAt: new Date(),
      aiConfidence: classification?.confidenza ?? classification?.confidence ?? null,
      updatedByType: 'umano',
      updatedByLabel: user.name,
    })
    .returning({ id: schema.tasks.id });

  if (!created) return { ok: false, message: 'Creazione non riuscita.' };

  await db.insert(schema.taskEmailThreads).values({ taskId: created.id, threadId, linkedByType: 'umano' });
  await db
    .update(schema.emailThreads)
    .set({ status: 'collegata', updatedAt: new Date() })
    .where(eq(schema.emailThreads.id, threadId));

  await recordTaskEvent(db, {
    taskId: created.id,
    kind: 'creazione',
    summary: `Attività ${code} creata da un’email`,
    detail: { gmailThreadId: thread.gmailThreadId },
    actorType: 'umano',
    actorLabel: user.name,
  });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'task.create_from_email',
    entityType: 'task',
    entityId: created.id,
    newValue: { code, threadId },
    source: 'web:inbox',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/inbox');
  revalidatePath('/attivita');
  return { ok: true, message: `Attività ${code} creata dalla conversazione.`, code };
}

export async function setThreadStatusAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('email:read');
  const threadId = String(formData.get('threadId') ?? '');
  const status = String(formData.get('status') ?? '');
  const allowed = ['da_classificare', 'collegata', 'risposta_da_preparare', 'in_attesa', 'chiusa', 'ignorata'];
  if (!threadId || !allowed.includes(status)) return { ok: false, message: 'Stato non valido.' };

  const db = await getDb();
  const [before] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, threadId));
  await db
    .update(schema.emailThreads)
    .set({ status: status as (typeof allowed)[number] as never, updatedAt: new Date() })
    .where(eq(schema.emailThreads.id, threadId));

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'email.set_status',
    entityType: 'email_thread',
    entityId: threadId,
    previousValue: { status: before?.status },
    newValue: { status },
    source: 'web:inbox',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/inbox');
  return { ok: true, message: 'Stato della conversazione aggiornato.' };
}

/**
 * Recupero del corpo su richiesta esplicita. È l'unico punto in cui un corpo
 * email entra nel database, e la retention configurata lo rimuove.
 */
export async function fetchBodyAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('email:read');
  const messageId = String(formData.get('messageId') ?? '');
  if (!messageId) return { ok: false, message: 'Messaggio non indicato.' };

  const db = await getDb();
  const [message] = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
  if (!message) return { ok: false, message: 'Messaggio non trovato.' };

  const state = await getGmailState();
  try {
    const { text, truncated } = await state.adapter.fetchMessageBody(message.gmailMessageId);
    const signals = detectInjectionSignals(text);

    await db
      .update(schema.emailMessages)
      .set({ bodyCachedText: text, bodyFetchedAt: new Date() })
      .where(eq(schema.emailMessages.id, messageId));

    if (signals.suspicious) {
      await db
        .update(schema.emailThreads)
        .set({ injectionFlagged: true, injectionReasons: signals.reasons, updatedAt: new Date() })
        .where(eq(schema.emailThreads.id, message.threadId));
    }

    await recordAudit(db, {
      actorType: 'umano',
      actorLabel: user.name,
      userId: user.id,
      action: 'email.fetch_body',
      entityType: 'email_message',
      entityId: messageId,
      // Il corpo non finisce nell'audit log: si registra solo il fatto.
      newValue: { lunghezza: text.length, troncato: truncated, sospetto: signals.suspicious },
      source: 'web:inbox',
      sessionRef: user.sessionRef,
    });

    revalidatePath('/inbox');
    return {
      ok: true,
      message: signals.suspicious
        ? 'Corpo recuperato. Attenzione: contiene formulazioni tipiche di un tentativo di manipolazione.'
        : 'Corpo recuperato.',
    };
  } catch (error) {
    return {
      ok: false,
      message: `Recupero non riuscito: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
    };
  }
}

export async function classifyThreadAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('ai:use');
  const threadId = String(formData.get('threadId') ?? '');
  if (!threadId) return { ok: false, message: 'Thread non indicato.' };

  const limit = rateLimit(`ai:${user.id}`, LIMITS.ai.limit, LIMITS.ai.window);
  if (!limit.allowed) {
    return { ok: false, message: `Limite di chiamate AI raggiunto. Riprova fra ${limit.retryAfterSeconds} secondi.` };
  }

  const db = await getDb();
  const [thread] = await db.select().from(schema.emailThreads).where(eq(schema.emailThreads.id, threadId));
  if (!thread) return { ok: false, message: 'Thread non trovato.' };

  const messages = await db.select().from(schema.emailMessages).where(eq(schema.emailMessages.threadId, threadId));
  const projects = await listProjects(db);

  try {
    const { data, meta } = await runClassification(
      {
        subject: thread.subject,
        fromName: thread.fromName,
        fromEmail: thread.fromEmail,
        receivedAt: thread.lastMessageAt.toISOString(),
        snippet: thread.snippet,
        body: messages.find((m) => m.bodyCachedText)?.bodyCachedText ?? null,
        projectHints: projects.map((p) => ({ code: p.code, title: p.title })),
      },
      [{ kind: 'email_thread', id: threadId, label: thread.subject }],
    );

    const project = projects.find((p) => p.code === data.progetto_suggerito);

    await db
      .update(schema.emailThreads)
      .set({
        suggestedProjectId: project?.id ?? null,
        suggestedUrgency: data.priorita,
        aiClassification: {
          provider: meta.provider,
          model: meta.model,
          classifiedAt: new Date().toISOString(),
          category: data.categoria,
          rationale: data.motivazione,
          confidence: data.confidenza,
          sources: [`thread:${thread.gmailThreadId}`],
          suggestedTaskTitle: data.attivita_suggerita,
          suggestedProjectCode: data.progetto_suggerito,
          suggestedPriority: data.priorita,
          suggestedDueDate: data.scadenza_suggerita,
        },
        injectionFlagged: thread.injectionFlagged || data.contiene_istruzioni_sospette,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailThreads.id, threadId));

    await recordAudit(db, {
      actorType: 'ai',
      actorLabel: `${meta.provider}/${meta.model}`,
      userId: user.id,
      action: 'email.classify',
      entityType: 'email_thread',
      entityId: threadId,
      newValue: { categoria: data.categoria, priorita: data.priorita, confidenza: data.confidenza },
      source: 'web:inbox',
      sessionRef: user.sessionRef,
    });

    revalidatePath('/inbox');
    return {
      ok: true,
      message: `Classificata come "${data.categoria}" (confidenza ${Math.round(data.confidenza * 100)}%) — ${meta.description}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Classificazione non riuscita: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
    };
  }
}
