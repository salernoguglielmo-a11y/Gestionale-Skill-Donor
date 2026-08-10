import { romeInstant, romeMidnight } from '@sdoh/core';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { seedId } from './ids';
import * as t from './schema';
import {
  SEED_CONTACTS,
  SEED_DOCUMENTS,
  SEED_ORGANIZATIONS,
  SEED_PROJECTS,
  SEED_SAVED_VIEWS,
  SEED_TASKS,
  SEED_THREADS,
  SEED_TODAY,
  SEED_USER,
} from './seed-data';

/**
 * Seed idempotente dello snapshot del 10 agosto 2026.
 *
 * Ogni riga ha un id derivato da una chiave naturale (`SD-001`, `PRJ-CIMIC`,
 * slug…), quindi rieseguire il seed aggiorna e non duplica. Le tabelle di
 * collegamento vengono riscritte per le sole entità toccate dal seed, così le
 * modifiche fatte a mano su entità non presenti nello snapshot sopravvivono.
 */

export interface SeedResult {
  organizations: number;
  contacts: number;
  projects: number;
  tasks: number;
  threads: number;
  documents: number;
  savedViews: number;
}

/** Sottrae N giorni dalla data dello snapshot, restando alle 09:00 romane. */
function daysBeforeSnapshot(days: number): Date {
  const base = romeInstant(SEED_TODAY, '09:00');
  return new Date(base.getTime() - days * 86_400_000);
}

export async function seedDatabase(db: Db): Promise<SeedResult> {
  const userId = seedId.user(SEED_USER.email);
  const snapshotAt = romeInstant(SEED_TODAY, '09:00');

  await db
    .insert(t.users)
    .values({
      id: userId,
      email: SEED_USER.email,
      name: SEED_USER.name,
      role: SEED_USER.role,
      timezone: 'Europe/Rome',
      permissions: SEED_USER.permissions,
    })
    .onConflictDoUpdate({
      target: t.users.id,
      set: { name: SEED_USER.name, role: SEED_USER.role, permissions: SEED_USER.permissions },
    });

  /* ------------------------------------------------------- organizzazioni */

  for (const org of SEED_ORGANIZATIONS) {
    const values = {
      id: seedId.organization(org.slug),
      slug: org.slug,
      name: org.name,
      type: org.type,
      status: org.status ?? ('attiva' as const),
      website: org.website ?? null,
      city: org.city ?? null,
      fiscalCode: org.fiscalCode ?? null,
      legalForm: org.legalForm ?? null,
      sector: org.sector ?? null,
      notes: org.notes ?? null,
      updatedAt: snapshotAt,
    };
    await db.insert(t.organizations).values(values).onConflictDoUpdate({
      target: t.organizations.id,
      set: values,
    });
  }

  /* -------------------------------------------------------------- contatti */

  for (const c of SEED_CONTACTS) {
    const values = {
      id: seedId.contact(c.key),
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? null,
      phone: c.phone ?? null,
      role: c.role ?? null,
      organizationId: c.organizationSlug ? seedId.organization(c.organizationSlug) : null,
      notes: c.notes ?? null,
      lastContactAt: c.lastContactDate ? romeInstant(c.lastContactDate, '10:00') : null,
      updatedAt: snapshotAt,
    };
    await db.insert(t.contacts).values(values).onConflictDoUpdate({
      target: t.contacts.id,
      set: values,
    });
  }

  /* -------------------------------------------------------------- progetti */

  for (const p of SEED_PROJECTS) {
    const id = seedId.project(p.code);
    const values = {
      id,
      code: p.code,
      title: p.title,
      description: p.description,
      type: p.type,
      status: p.status,
      ownerId: userId,
      referentContactId: p.referentKey ? seedId.contact(p.referentKey) : null,
      need: p.need ?? null,
      deliverable: p.deliverable ?? null,
      nextStep: p.nextStep ?? null,
      startDate: p.startDate ? romeMidnight(p.startDate) : null,
      dueDate: p.dueDate ? romeInstant(p.dueDate, '18:00') : null,
      impactMetrics: p.impactMetrics ?? null,
      updatedAt: snapshotAt,
    };
    await db.insert(t.projects).values(values).onConflictDoUpdate({ target: t.projects.id, set: values });

    await db.delete(t.projectOrganizations).where(sql`${t.projectOrganizations.projectId} = ${id}`);
    if (p.organizations?.length) {
      await db.insert(t.projectOrganizations).values(
        p.organizations.map((o) => ({
          projectId: id,
          organizationId: seedId.organization(o.slug),
          role: o.role,
        })),
      );
    }
  }

  /* -------------------------------------------------------------- attività */

  for (const task of SEED_TASKS) {
    const id = seedId.task(task.code);
    const lastUpdateAt = daysBeforeSnapshot(task.staleDays);
    const values = {
      id,
      code: task.code,
      title: task.title,
      description: task.description,
      projectId: seedId.project(task.projectCode),
      ownerId: userId,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? romeInstant(task.dueDate, '18:00') : null,
      nextStep: task.nextStep ?? null,
      lastUpdateAt,
      source: 'seed' as const,
      blockedReason: task.blockedReason ?? null,
      waitingOnThirdParty: task.waitingOnThirdParty ?? false,
      waitingOn: task.waitingOn ?? null,
      followUpDate: task.followUpDate ? romeInstant(task.followUpDate, '09:00') : null,
      aiConfidence: null,
      updatedByType: 'umano' as const,
      updatedByLabel: SEED_USER.name,
      completedAt: null,
      updatedAt: snapshotAt,
    };
    await db.insert(t.tasks).values(values).onConflictDoUpdate({ target: t.tasks.id, set: values });

    await db.delete(t.taskContacts).where(sql`${t.taskContacts.taskId} = ${id}`);
    if (task.contactKeys?.length) {
      await db
        .insert(t.taskContacts)
        .values(task.contactKeys.map((k) => ({ taskId: id, contactId: seedId.contact(k) })));
    }

    await db.delete(t.taskOrganizations).where(sql`${t.taskOrganizations.taskId} = ${id}`);
    if (task.organizationSlugs?.length) {
      await db
        .insert(t.taskOrganizations)
        .values(task.organizationSlugs.map((s) => ({ taskId: id, organizationId: seedId.organization(s) })));
    }

    // La timeline del seed è la riga zero: l'attività esiste da questo snapshot.
    await db.delete(t.taskEvents).where(sql`${t.taskEvents.taskId} = ${id} and ${t.taskEvents.kind} = 'seed'`);
    await db.insert(t.taskEvents).values({
      id: seedId.task(`${task.code}:event`),
      taskId: id,
      kind: 'seed',
      summary: `Attività importata dallo snapshot del ${SEED_TODAY}`,
      detail: { status: task.status, priority: task.priority },
      actorType: 'sistema',
      actorLabel: 'Snapshot iniziale',
      createdAt: lastUpdateAt,
    });
  }

  // Dipendenze: dopo aver creato tutte le attività, così i riferimenti esistono.
  for (const task of SEED_TASKS) {
    const id = seedId.task(task.code);
    await db.delete(t.taskDependencies).where(sql`${t.taskDependencies.taskId} = ${id}`);
    if (task.dependsOn?.length) {
      await db.insert(t.taskDependencies).values(
        task.dependsOn.map((code) => ({
          taskId: id,
          dependsOnTaskId: seedId.task(code),
          note: `${task.code} non può procedere prima di ${code}.`,
        })),
      );
    }
  }

  /* ----------------------------------------------------------------- email */

  for (const th of SEED_THREADS) {
    const id = seedId.thread(th.key);
    const lastMessageAt = daysBeforeSnapshot(th.daysAgo);
    const firstMessageAt = daysBeforeSnapshot(th.daysAgo + th.messageCount - 1);
    const values = {
      id,
      gmailThreadId: th.gmailThreadId,
      subject: th.subject,
      fromName: th.fromName,
      fromEmail: th.fromEmail,
      toEmails: th.toEmails,
      ccEmails: [],
      firstMessageAt,
      lastMessageAt,
      labels: th.labels,
      snippet: th.snippet,
      messageCount: th.messageCount,
      gmailUrl: `https://mail.google.com/mail/u/0/#all/${th.gmailThreadId}`,
      status: th.status,
      syncState: 'mock',
      suggestedProjectId: th.suggestedProjectCode ? seedId.project(th.suggestedProjectCode) : null,
      suggestedUrgency: th.suggestedUrgency ?? null,
      aiClassification: th.classification
        ? { ...th.classification, classifiedAt: lastMessageAt.toISOString() }
        : null,
      injectionFlagged: th.injectionDemo ?? false,
      injectionReasons: th.injectionDemo
        ? ['richiesta di ignorare le istruzioni', 'tentativo di riassegnare il ruolo', 'richiesta di invio automatico']
        : [],
      updatedAt: snapshotAt,
    };
    await db.insert(t.emailThreads).values(values).onConflictDoUpdate({ target: t.emailThreads.id, set: values });

    // Un messaggio per thread nei dati demo: metadati completi, corpo assente.
    // Il corpo viene recuperato solo su richiesta esplicita dell'utente.
    const msgValues = {
      id: seedId.message(th.key),
      threadId: id,
      gmailMessageId: `${th.gmailThreadId}-m1`,
      fromName: th.fromName,
      fromEmail: th.fromEmail,
      toEmails: th.toEmails,
      subject: th.subject,
      sentAt: lastMessageAt,
      snippet: th.snippet,
      labels: th.labels,
      hasAttachments: false,
      attachmentMeta: [],
      bodyCachedText: null,
      bodyFetchedAt: null,
    };
    await db
      .insert(t.emailMessages)
      .values(msgValues)
      .onConflictDoUpdate({ target: t.emailMessages.id, set: msgValues });

    await db.delete(t.taskEmailThreads).where(sql`${t.taskEmailThreads.threadId} = ${id}`);
    if (th.linkedTaskCodes?.length) {
      await db.insert(t.taskEmailThreads).values(
        th.linkedTaskCodes.map((code) => ({
          taskId: seedId.task(code),
          threadId: id,
          linkedByType: 'umano' as const,
          createdAt: lastMessageAt,
        })),
      );
    }
  }

  /* ------------------------------------------------------------- documenti */

  for (const d of SEED_DOCUMENTS) {
    const values = {
      id: seedId.document(d.key),
      name: d.name,
      type: d.type,
      projectId: d.projectCode ? seedId.project(d.projectCode) : null,
      taskId: d.taskCode ? seedId.task(d.taskCode) : null,
      version: d.version,
      status: d.status,
      source: d.source,
      locationRef: d.locationRef ?? null,
      confidentiality: d.confidentiality,
      notes: d.notes ?? null,
      updatedAt: snapshotAt,
    };
    await db.insert(t.documents).values(values).onConflictDoUpdate({ target: t.documents.id, set: values });
  }

  /* ---------------------------------------------------------- viste salvate */

  for (const v of SEED_SAVED_VIEWS) {
    const values = {
      id: seedId.savedView(v.name),
      userId,
      name: v.name,
      layout: v.layout,
      filter: v.filter,
    };
    await db.insert(t.savedViews).values(values).onConflictDoUpdate({ target: t.savedViews.id, set: values });
  }

  /* ------------------------------------------------- impostazioni iniziali */

  const defaults: Array<[string, unknown]> = [
    ['ai.mode', 'mock'],
    ['retention.emailDays', 180],
    ['retention.auditDays', 730],
    ['sync.autoClassify', true],
    ['approvals.requireForTaskCreation', true],
    ['seed.snapshotDate', SEED_TODAY],
  ];
  for (const [key, value] of defaults) {
    await db
      .insert(t.appSettings)
      .values({ key, value })
      .onConflictDoNothing({ target: t.appSettings.key });
  }

  await db.insert(t.auditLog).values({
    actorType: 'sistema',
    actorLabel: 'seed',
    action: 'seed.run',
    entityType: 'database',
    source: 'script:seed',
    newValue: {
      snapshot: SEED_TODAY,
      tasks: SEED_TASKS.length,
      projects: SEED_PROJECTS.length,
      organizations: SEED_ORGANIZATIONS.length,
    },
  });

  return {
    organizations: SEED_ORGANIZATIONS.length,
    contacts: SEED_CONTACTS.length,
    projects: SEED_PROJECTS.length,
    tasks: SEED_TASKS.length,
    threads: SEED_THREADS.length,
    documents: SEED_DOCUMENTS.length,
    savedViews: SEED_SAVED_VIEWS.length,
  };
}
