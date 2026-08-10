'use server';

import {
  bulkUpdateTaskSchema,
  createTaskSchema,
  nextTaskCode,
  quickUpdateTaskSchema,
  romeInstant,
  savedViewSchema,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@sdoh/core';
import { getDb, listTasks, recordAudit, recordTaskEvent, schema } from '@sdoh/db';
import { eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '../auth';

/**
 * Mutazioni sulle attività.
 *
 * Ogni azione: (1) verifica il permesso, (2) valida l'input con Zod lato server,
 * (3) scrive il dato, (4) registra un evento nella timeline dell'attività e una
 * riga nell'audit log con valore precedente e nuovo.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Errori per campo, usati dai form. */
  fieldErrors?: Record<string, string>;
  code?: string;
}

function fieldErrorsOf(error: unknown): Record<string, string> {
  const issues = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues ?? [];
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

function readForm(formData: FormData) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === 'string' ? raw : undefined;
  };
  return { value, has: (key: string) => formData.has(key) };
}

export async function createTaskAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const { value } = readForm(formData);

  const parsed = createTaskSchema.safeParse({
    title: value('title') ?? '',
    description: value('description') ?? '',
    status: value('status') || 'da_fare',
    priority: value('priority') || 'media',
    projectId: value('projectId') || null,
    dueDate: value('dueDate') ?? '',
    nextStep: value('nextStep') ?? '',
    waitingOnThirdParty: formData.get('waitingOnThirdParty') === 'on',
    waitingOn: value('waitingOn') ?? '',
    followUpDate: value('followUpDate') ?? '',
    blockedReason: value('blockedReason') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: 'Correggi i campi segnalati.', fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const db = await getDb();
  const existing = await listTasks(db);
  const code = nextTaskCode(existing.map((t) => t.code));
  const now = new Date();

  const [created] = await db
    .insert(schema.tasks)
    .values({
      code,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      projectId: parsed.data.projectId ?? null,
      ownerId: user.id,
      dueDate: parsed.data.dueDate ? romeInstant(parsed.data.dueDate, '18:00') : null,
      nextStep: parsed.data.nextStep ?? null,
      waitingOnThirdParty: parsed.data.waitingOnThirdParty,
      waitingOn: parsed.data.waitingOn ?? null,
      followUpDate: parsed.data.followUpDate ? romeInstant(parsed.data.followUpDate, '09:00') : null,
      blockedReason: parsed.data.blockedReason ?? null,
      source: 'manuale',
      lastUpdateAt: now,
      updatedByType: 'umano',
      updatedByLabel: user.name,
    })
    .returning({ id: schema.tasks.id });

  if (!created) return { ok: false, message: 'Creazione non riuscita.' };

  await recordTaskEvent(db, {
    taskId: created.id,
    kind: 'creazione',
    summary: `Attività ${code} creata manualmente`,
    actorType: 'umano',
    actorLabel: user.name,
  });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'task.create',
    entityType: 'task',
    entityId: created.id,
    newValue: { code, ...parsed.data },
    source: 'web:form',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/attivita');
  revalidatePath('/oggi');
  return { ok: true, message: `Attività ${code} creata.`, code };
}

export async function quickUpdateTaskAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const { value } = readForm(formData);

  const parsed = quickUpdateTaskSchema.safeParse({
    id: value('id') ?? '',
    ...(formData.has('status') ? { status: value('status') } : {}),
    ...(formData.has('priority') ? { priority: value('priority') } : {}),
    ...(formData.has('nextStep') ? { nextStep: value('nextStep') ?? '' } : {}),
    ...(formData.has('dueDate') ? { dueDate: value('dueDate') ?? '' } : {}),
  });

  if (!parsed.success) {
    return { ok: false, message: 'Valore non valido.', fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const db = await getDb();
  const before = await db.select().from(schema.tasks).where(eq(schema.tasks.id, parsed.data.id));
  const previous = before[0];
  if (!previous) return { ok: false, message: 'Attività non trovata.' };

  const patch: Partial<typeof schema.tasks.$inferInsert> = {
    lastUpdateAt: new Date(),
    updatedAt: new Date(),
    updatedByType: 'umano',
    updatedByLabel: user.name,
  };
  const changes: string[] = [];

  if (parsed.data.status && parsed.data.status !== previous.status) {
    patch.status = parsed.data.status;
    patch.completedAt = parsed.data.status === 'completata' ? new Date() : null;
    // Uscendo da "in attesa" il flag di dipendenza da terzi non ha più senso.
    if (previous.status === 'in_attesa' && parsed.data.status !== 'in_attesa') {
      patch.waitingOnThirdParty = false;
    }
    if (parsed.data.status === 'in_attesa') patch.waitingOnThirdParty = true;
    changes.push(
      `stato ${TASK_STATUS_LABELS[previous.status]} → ${TASK_STATUS_LABELS[parsed.data.status as TaskStatus]}`,
    );
  }
  if (parsed.data.priority && parsed.data.priority !== previous.priority) {
    patch.priority = parsed.data.priority;
    changes.push(
      `priorità ${TASK_PRIORITY_LABELS[previous.priority]} → ${TASK_PRIORITY_LABELS[parsed.data.priority]}`,
    );
  }
  if (parsed.data.nextStep !== undefined && parsed.data.nextStep !== previous.nextStep) {
    patch.nextStep = parsed.data.nextStep;
    changes.push('prossimo passo aggiornato');
  }
  if (parsed.data.dueDate !== undefined) {
    const next = parsed.data.dueDate ? romeInstant(parsed.data.dueDate, '18:00') : null;
    if (next?.getTime() !== previous.dueDate?.getTime()) {
      patch.dueDate = next;
      changes.push('scadenza aggiornata');
    }
  }

  if (changes.length === 0) return { ok: true, message: 'Nessuna modifica da salvare.' };

  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, parsed.data.id));

  await recordTaskEvent(db, {
    taskId: parsed.data.id,
    kind: 'modifica',
    summary: changes.join(' · '),
    detail: patch,
    actorType: 'umano',
    actorLabel: user.name,
  });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'task.update',
    entityType: 'task',
    entityId: parsed.data.id,
    previousValue: {
      status: previous.status,
      priority: previous.priority,
      nextStep: previous.nextStep,
      dueDate: previous.dueDate,
    },
    newValue: patch,
    source: 'web:quick-edit',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/attivita');
  revalidatePath('/oggi');
  revalidatePath(`/attivita/${previous.code}`);
  return { ok: true, message: `${previous.code}: ${changes.join(' · ')}.` };
}

export async function updateTaskDetailsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const { value } = readForm(formData);
  const id = value('id') ?? '';

  const parsed = createTaskSchema.safeParse({
    title: value('title') ?? '',
    description: value('description') ?? '',
    status: value('status') || 'da_fare',
    priority: value('priority') || 'media',
    projectId: value('projectId') || null,
    dueDate: value('dueDate') ?? '',
    nextStep: value('nextStep') ?? '',
    waitingOnThirdParty: formData.get('waitingOnThirdParty') === 'on',
    waitingOn: value('waitingOn') ?? '',
    followUpDate: value('followUpDate') ?? '',
    blockedReason: value('blockedReason') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: 'Correggi i campi segnalati.', fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const db = await getDb();
  const before = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  const previous = before[0];
  if (!previous) return { ok: false, message: 'Attività non trovata.' };

  await db
    .update(schema.tasks)
    .set({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      projectId: parsed.data.projectId ?? null,
      dueDate: parsed.data.dueDate ? romeInstant(parsed.data.dueDate, '18:00') : null,
      nextStep: parsed.data.nextStep ?? null,
      waitingOnThirdParty: parsed.data.waitingOnThirdParty,
      waitingOn: parsed.data.waitingOn ?? null,
      followUpDate: parsed.data.followUpDate ? romeInstant(parsed.data.followUpDate, '09:00') : null,
      blockedReason: parsed.data.blockedReason ?? null,
      completedAt: parsed.data.status === 'completata' ? (previous.completedAt ?? new Date()) : null,
      lastUpdateAt: new Date(),
      updatedAt: new Date(),
      updatedByType: 'umano',
      updatedByLabel: user.name,
    })
    .where(eq(schema.tasks.id, id));

  await recordTaskEvent(db, {
    taskId: id,
    kind: 'modifica',
    summary: 'Dettagli aggiornati dal modulo di modifica',
    detail: parsed.data,
    actorType: 'umano',
    actorLabel: user.name,
  });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'task.update',
    entityType: 'task',
    entityId: id,
    previousValue: previous,
    newValue: parsed.data,
    source: 'web:form',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/attivita');
  revalidatePath(`/attivita/${previous.code}`);
  revalidatePath('/oggi');
  return { ok: true, message: 'Attività aggiornata.' };
}

export async function bulkUpdateTasksAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');

  const parsed = bulkUpdateTaskSchema.safeParse({
    ids: formData.getAll('ids').map(String),
    ...(formData.get('status') ? { status: String(formData.get('status')) } : {}),
    ...(formData.get('priority') ? { priority: String(formData.get('priority')) } : {}),
  });

  if (!parsed.success) {
    return { ok: false, message: 'Selezione o valori non validi.', fieldErrors: fieldErrorsOf(parsed.error) };
  }
  if (!parsed.data.status && !parsed.data.priority) {
    return { ok: false, message: 'Scegli un nuovo stato o una nuova priorità.' };
  }

  const db = await getDb();
  const before = await db.select().from(schema.tasks).where(inArray(schema.tasks.id, parsed.data.ids));

  await db
    .update(schema.tasks)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
      lastUpdateAt: new Date(),
      updatedAt: new Date(),
      updatedByType: 'umano',
      updatedByLabel: user.name,
    })
    .where(inArray(schema.tasks.id, parsed.data.ids));

  for (const task of before) {
    await recordTaskEvent(db, {
      taskId: task.id,
      kind: 'modifica_multipla',
      summary: [
        parsed.data.status ? `stato → ${TASK_STATUS_LABELS[parsed.data.status]}` : null,
        parsed.data.priority ? `priorità → ${TASK_PRIORITY_LABELS[parsed.data.priority]}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      actorType: 'umano',
      actorLabel: user.name,
    });
  }

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'task.bulk_update',
    entityType: 'task',
    newValue: { ids: parsed.data.ids, status: parsed.data.status, priority: parsed.data.priority },
    source: 'web:bulk',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/attivita');
  revalidatePath('/oggi');
  return { ok: true, message: `${parsed.data.ids.length} attività aggiornate.` };
}

export async function saveViewAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const raw = formData.get('filter');

  let filter: unknown;
  try {
    filter = JSON.parse(typeof raw === 'string' ? raw : '{}');
  } catch {
    return { ok: false, message: 'Filtro non valido.' };
  }

  const parsed = savedViewSchema.safeParse({
    name: formData.get('name') ?? '',
    layout: formData.get('layout') ?? 'tabella',
    filter,
  });
  if (!parsed.success) {
    return { ok: false, message: 'Nome vista non valido.', fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const db = await getDb();
  await db
    .insert(schema.savedViews)
    .values({
      userId: user.id,
      name: parsed.data.name,
      layout: parsed.data.layout,
      filter: parsed.data.filter,
    })
    .onConflictDoUpdate({
      target: [schema.savedViews.userId, schema.savedViews.name],
      set: { filter: parsed.data.filter, layout: parsed.data.layout },
    });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'saved_view.upsert',
    entityType: 'saved_view',
    newValue: parsed.data,
    source: 'web:form',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/attivita');
  return { ok: true, message: `Vista "${parsed.data.name}" salvata.` };
}

export async function deleteViewAction(formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('tasks:write');
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, message: 'Vista non indicata.' };

  const db = await getDb();
  await db.delete(schema.savedViews).where(eq(schema.savedViews.id, id));
  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'saved_view.delete',
    entityType: 'saved_view',
    entityId: id,
    source: 'web:form',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/attivita');
  return { ok: true, message: 'Vista eliminata.' };
}
