import type {
  AiActionEntry,
  AiClassification,
  ApprovalSummary,
  AuditEntry,
  ContactSummary,
  DocumentSummary,
  DraftSummary,
  EmailThreadSummary,
  OrganizationSummary,
  ProjectSummary,
  SourceRef,
  TaskSummary,
} from '@sdoh/core';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import * as t from './schema';

/**
 * Livello di lettura. Restituisce le forme di dominio di `@sdoh/core`, non le
 * righe grezze: l'interfaccia e il server MCP condividono così esattamente gli
 * stessi dati e le stesse regole di calcolo.
 */

export async function listTasks(db: Db): Promise<TaskSummary[]> {
  const rows = await db
    .select({
      id: t.tasks.id,
      code: t.tasks.code,
      title: t.tasks.title,
      description: t.tasks.description,
      status: t.tasks.status,
      priority: t.tasks.priority,
      dueDate: t.tasks.dueDate,
      nextStep: t.tasks.nextStep,
      lastUpdateAt: t.tasks.lastUpdateAt,
      waitingOnThirdParty: t.tasks.waitingOnThirdParty,
      waitingOn: t.tasks.waitingOn,
      followUpDate: t.tasks.followUpDate,
      blockedReason: t.tasks.blockedReason,
      source: t.tasks.source,
      updatedByType: t.tasks.updatedByType,
      aiConfidence: t.tasks.aiConfidence,
      projectId: t.tasks.projectId,
      projectTitle: t.projects.title,
      ownerName: t.users.name,
    })
    .from(t.tasks)
    .leftJoin(t.projects, eq(t.tasks.projectId, t.projects.id))
    .leftJoin(t.users, eq(t.tasks.ownerId, t.users.id))
    .orderBy(t.tasks.code);

  return rows as TaskSummary[];
}

export async function getTaskByCode(db: Db, code: string): Promise<TaskSummary | null> {
  const all = await listTasks(db);
  return all.find((task) => task.code === code) ?? null;
}

export async function getTaskById(db: Db, id: string): Promise<TaskSummary | null> {
  const all = await listTasks(db);
  return all.find((task) => task.id === id) ?? null;
}

export interface TaskDetail {
  task: TaskSummary;
  events: Array<{
    id: string;
    kind: string;
    summary: string;
    detail: unknown;
    actorType: 'umano' | 'ai' | 'sistema';
    actorLabel: string;
    createdAt: Date;
  }>;
  contacts: ContactSummary[];
  organizations: OrganizationSummary[];
  threads: EmailThreadSummary[];
  documents: DocumentSummary[];
  drafts: DraftSummary[];
  dependsOn: Array<{ code: string; title: string; status: string; note: string | null }>;
  blocks: Array<{ code: string; title: string; status: string }>;
  aiActions: AiActionEntry[];
  approvals: ApprovalSummary[];
}

export async function getTaskDetail(db: Db, taskId: string): Promise<TaskDetail | null> {
  const task = await getTaskById(db, taskId);
  if (!task) return null;

  const [events, contactRows, orgRows, threadRows, docRows, draftRows, dependsRows, blocksRows, aiRows, approvalRows] =
    await Promise.all([
      db
        .select()
        .from(t.taskEvents)
        .where(eq(t.taskEvents.taskId, taskId))
        .orderBy(desc(t.taskEvents.createdAt)),
      db
        .select({
          id: t.contacts.id,
          firstName: t.contacts.firstName,
          lastName: t.contacts.lastName,
          email: t.contacts.email,
          phone: t.contacts.phone,
          role: t.contacts.role,
          organizationId: t.contacts.organizationId,
          organizationName: t.organizations.name,
          notes: t.contacts.notes,
          lastContactAt: t.contacts.lastContactAt,
        })
        .from(t.taskContacts)
        .innerJoin(t.contacts, eq(t.taskContacts.contactId, t.contacts.id))
        .leftJoin(t.organizations, eq(t.contacts.organizationId, t.organizations.id))
        .where(eq(t.taskContacts.taskId, taskId)),
      db
        .select({
          id: t.organizations.id,
          name: t.organizations.name,
          type: t.organizations.type,
          status: t.organizations.status,
          website: t.organizations.website,
          notes: t.organizations.notes,
          city: t.organizations.city,
          fiscalCode: t.organizations.fiscalCode,
        })
        .from(t.taskOrganizations)
        .innerJoin(t.organizations, eq(t.taskOrganizations.organizationId, t.organizations.id))
        .where(eq(t.taskOrganizations.taskId, taskId)),
      db
        .select({ threadId: t.taskEmailThreads.threadId })
        .from(t.taskEmailThreads)
        .where(eq(t.taskEmailThreads.taskId, taskId)),
      db.select().from(t.documents).where(eq(t.documents.taskId, taskId)),
      db.select().from(t.aiDrafts).where(eq(t.aiDrafts.taskId, taskId)).orderBy(desc(t.aiDrafts.createdAt)),
      db
        .select({
          code: t.tasks.code,
          title: t.tasks.title,
          status: t.tasks.status,
          note: t.taskDependencies.note,
        })
        .from(t.taskDependencies)
        .innerJoin(t.tasks, eq(t.taskDependencies.dependsOnTaskId, t.tasks.id))
        .where(eq(t.taskDependencies.taskId, taskId)),
      db
        .select({ code: t.tasks.code, title: t.tasks.title, status: t.tasks.status })
        .from(t.taskDependencies)
        .innerJoin(t.tasks, eq(t.taskDependencies.taskId, t.tasks.id))
        .where(eq(t.taskDependencies.dependsOnTaskId, taskId)),
      db
        .select()
        .from(t.aiActions)
        .where(sql`${t.aiActions.sourceRefs}::text like ${`%${taskId}%`}`)
        .orderBy(desc(t.aiActions.createdAt))
        .limit(20),
      db
        .select()
        .from(t.approvals)
        .where(eq(t.approvals.entityId, taskId))
        .orderBy(desc(t.approvals.createdAt)),
    ]);

  const threadIds = threadRows.map((r) => r.threadId);
  const threads = threadIds.length ? await listThreads(db, threadIds) : [];

  return {
    task,
    events: events as TaskDetail['events'],
    contacts: contactRows as ContactSummary[],
    organizations: orgRows as OrganizationSummary[],
    threads,
    documents: docRows as unknown as DocumentSummary[],
    drafts: draftRows.map(toDraftSummary),
    dependsOn: dependsRows,
    blocks: blocksRows,
    aiActions: aiRows as unknown as AiActionEntry[],
    approvals: approvalRows.map(toApprovalSummary),
  };
}

/* ------------------------------------------------------------------ email */

export async function listThreads(db: Db, ids?: string[]): Promise<EmailThreadSummary[]> {
  const base = db
    .select({
      id: t.emailThreads.id,
      gmailThreadId: t.emailThreads.gmailThreadId,
      subject: t.emailThreads.subject,
      fromName: t.emailThreads.fromName,
      fromEmail: t.emailThreads.fromEmail,
      toEmails: t.emailThreads.toEmails,
      lastMessageAt: t.emailThreads.lastMessageAt,
      snippet: t.emailThreads.snippet,
      labels: t.emailThreads.labels,
      gmailUrl: t.emailThreads.gmailUrl,
      status: t.emailThreads.status,
      syncState: t.emailThreads.syncState,
      messageCount: t.emailThreads.messageCount,
      suggestedProjectId: t.emailThreads.suggestedProjectId,
      suggestedProjectTitle: t.projects.title,
      suggestedUrgency: t.emailThreads.suggestedUrgency,
      aiClassification: t.emailThreads.aiClassification,
      injectionFlagged: t.emailThreads.injectionFlagged,
      injectionReasons: t.emailThreads.injectionReasons,
    })
    .from(t.emailThreads)
    .leftJoin(t.projects, eq(t.emailThreads.suggestedProjectId, t.projects.id))
    .orderBy(desc(t.emailThreads.lastMessageAt));

  const rows = ids?.length ? await base.where(inArray(t.emailThreads.id, ids)) : await base;
  if (rows.length === 0) return [];

  const links = await db
    .select({ threadId: t.taskEmailThreads.threadId, code: t.tasks.code })
    .from(t.taskEmailThreads)
    .innerJoin(t.tasks, eq(t.taskEmailThreads.taskId, t.tasks.id))
    .where(
      inArray(
        t.taskEmailThreads.threadId,
        rows.map((r) => r.id),
      ),
    );

  const byThread = new Map<string, string[]>();
  for (const l of links) {
    byThread.set(l.threadId, [...(byThread.get(l.threadId) ?? []), l.code]);
  }

  return rows.map((r) => ({
    ...r,
    aiClassification: (r.aiClassification as AiClassification | null) ?? null,
    linkedTaskCodes: (byThread.get(r.id) ?? []).sort(),
  })) as EmailThreadSummary[];
}

export async function getThreadDetail(db: Db, threadId: string) {
  const [thread] = await listThreads(db, [threadId]);
  if (!thread) return null;
  const messages = await db
    .select()
    .from(t.emailMessages)
    .where(eq(t.emailMessages.threadId, threadId))
    .orderBy(t.emailMessages.sentAt);
  const drafts = await db
    .select()
    .from(t.aiDrafts)
    .where(eq(t.aiDrafts.threadId, threadId))
    .orderBy(desc(t.aiDrafts.createdAt));
  const raw = await db.select().from(t.emailThreads).where(eq(t.emailThreads.id, threadId));
  return {
    thread,
    injectionFlagged: raw[0]?.injectionFlagged ?? false,
    injectionReasons: raw[0]?.injectionReasons ?? [],
    messages,
    drafts: drafts.map(toDraftSummary),
  };
}

/* ------------------------------------------------------- progetti e anagrafiche */

export async function listProjects(db: Db): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: t.projects.id,
      code: t.projects.code,
      title: t.projects.title,
      description: t.projects.description,
      type: t.projects.type,
      status: t.projects.status,
      nextStep: t.projects.nextStep,
      startDate: t.projects.startDate,
      dueDate: t.projects.dueDate,
      ownerName: t.users.name,
      impactMetrics: t.projects.impactMetrics,
      need: t.projects.need,
      deliverable: t.projects.deliverable,
    })
    .from(t.projects)
    .leftJoin(t.users, eq(t.projects.ownerId, t.users.id))
    .orderBy(t.projects.title);
  return rows as ProjectSummary[];
}

export async function getProjectDetail(db: Db, projectId: string) {
  const projects = await listProjects(db);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  const [orgs, tasks, docs, referent] = await Promise.all([
    db
      .select({
        id: t.organizations.id,
        name: t.organizations.name,
        type: t.organizations.type,
        status: t.organizations.status,
        website: t.organizations.website,
        notes: t.organizations.notes,
        city: t.organizations.city,
        fiscalCode: t.organizations.fiscalCode,
        role: t.projectOrganizations.role,
      })
      .from(t.projectOrganizations)
      .innerJoin(t.organizations, eq(t.projectOrganizations.organizationId, t.organizations.id))
      .where(eq(t.projectOrganizations.projectId, projectId)),
    listTasks(db).then((all) => all.filter((task) => task.projectId === projectId)),
    db.select().from(t.documents).where(eq(t.documents.projectId, projectId)),
    db
      .select({
        id: t.contacts.id,
        firstName: t.contacts.firstName,
        lastName: t.contacts.lastName,
        email: t.contacts.email,
        role: t.contacts.role,
      })
      .from(t.projects)
      .innerJoin(t.contacts, eq(t.projects.referentContactId, t.contacts.id))
      .where(eq(t.projects.id, projectId)),
  ]);

  const threads = await db
    .select({ threadId: t.taskEmailThreads.threadId })
    .from(t.taskEmailThreads)
    .innerJoin(t.tasks, eq(t.taskEmailThreads.taskId, t.tasks.id))
    .where(eq(t.tasks.projectId, projectId));

  return {
    project,
    organizations: orgs,
    tasks,
    documents: docs as unknown as DocumentSummary[],
    referent: referent[0] ?? null,
    threads: threads.length ? await listThreads(db, [...new Set(threads.map((x) => x.threadId))]) : [],
  };
}

export async function listOrganizations(db: Db): Promise<Array<OrganizationSummary & { contactCount: number; projectCount: number }>> {
  const rows = await db
    .select({
      id: t.organizations.id,
      name: t.organizations.name,
      type: t.organizations.type,
      status: t.organizations.status,
      website: t.organizations.website,
      notes: t.organizations.notes,
      city: t.organizations.city,
      fiscalCode: t.organizations.fiscalCode,
      sector: t.organizations.sector,
    })
    .from(t.organizations)
    .orderBy(t.organizations.name);

  const [contactCounts, projectCounts] = await Promise.all([
    db
      .select({ organizationId: t.contacts.organizationId, n: sql<number>`count(*)::int` })
      .from(t.contacts)
      .groupBy(t.contacts.organizationId),
    db
      .select({ organizationId: t.projectOrganizations.organizationId, n: sql<number>`count(*)::int` })
      .from(t.projectOrganizations)
      .groupBy(t.projectOrganizations.organizationId),
  ]);

  const cMap = new Map(contactCounts.map((r) => [r.organizationId, Number(r.n)]));
  const pMap = new Map(projectCounts.map((r) => [r.organizationId, Number(r.n)]));

  return rows.map((r) => ({
    ...r,
    contactCount: cMap.get(r.id) ?? 0,
    projectCount: pMap.get(r.id) ?? 0,
  })) as Array<OrganizationSummary & { contactCount: number; projectCount: number }>;
}

export async function getOrganizationDetail(db: Db, organizationId: string) {
  const orgs = await listOrganizations(db);
  const organization = orgs.find((o) => o.id === organizationId);
  if (!organization) return null;

  const [contacts, projectRows, taskRows] = await Promise.all([
    db
      .select({
        id: t.contacts.id,
        firstName: t.contacts.firstName,
        lastName: t.contacts.lastName,
        email: t.contacts.email,
        phone: t.contacts.phone,
        role: t.contacts.role,
        organizationId: t.contacts.organizationId,
        organizationName: sql<string>`${organization.name}`,
        notes: t.contacts.notes,
        lastContactAt: t.contacts.lastContactAt,
      })
      .from(t.contacts)
      .where(eq(t.contacts.organizationId, organizationId)),
    db
      .select({ projectId: t.projectOrganizations.projectId, role: t.projectOrganizations.role })
      .from(t.projectOrganizations)
      .where(eq(t.projectOrganizations.organizationId, organizationId)),
    db
      .select({ taskId: t.taskOrganizations.taskId })
      .from(t.taskOrganizations)
      .where(eq(t.taskOrganizations.organizationId, organizationId)),
  ]);

  const [allProjects, allTasks] = await Promise.all([listProjects(db), listTasks(db)]);
  const projectIds = new Set(projectRows.map((r) => r.projectId));
  const taskIds = new Set(taskRows.map((r) => r.taskId));

  return {
    organization,
    contacts: contacts as unknown as ContactSummary[],
    projects: allProjects.filter((p) => projectIds.has(p.id)),
    tasks: allTasks.filter((task) => taskIds.has(task.id) || (task.projectId && projectIds.has(task.projectId))),
  };
}

export async function listContacts(db: Db): Promise<ContactSummary[]> {
  const rows = await db
    .select({
      id: t.contacts.id,
      firstName: t.contacts.firstName,
      lastName: t.contacts.lastName,
      email: t.contacts.email,
      phone: t.contacts.phone,
      role: t.contacts.role,
      organizationId: t.contacts.organizationId,
      organizationName: t.organizations.name,
      notes: t.contacts.notes,
      lastContactAt: t.contacts.lastContactAt,
    })
    .from(t.contacts)
    .leftJoin(t.organizations, eq(t.contacts.organizationId, t.organizations.id))
    .orderBy(t.contacts.lastName, t.contacts.firstName);
  return rows as ContactSummary[];
}

/* -------------------------------------------------------- bozze, audit, AI */

function toDraftSummary(row: typeof t.aiDrafts.$inferSelect): DraftSummary {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    promptTemplate: row.promptTemplate,
    subject: row.subject,
    body: row.body,
    status: row.status,
    reviewNotes: row.reviewNotes,
    revisionProvider: row.revisionProvider,
    revisionModel: row.revisionModel,
    revisionBody: row.revisionBody,
    revisionNotes: row.revisionNotes,
    sourceRefs: (row.sourceRefs ?? []) as SourceRef[],
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    gmailDraftId: row.gmailDraftId,
    threadId: row.threadId,
    taskId: row.taskId,
  };
}

function toApprovalSummary(row: typeof t.approvals.$inferSelect): ApprovalSummary {
  return {
    id: row.id,
    actionType: row.actionType,
    entityType: row.entityType,
    entityId: row.entityId,
    status: row.status,
    requestedByType: row.requestedByType,
    requestedByLabel: row.requestedByLabel,
    approvedByUserId: row.approvedByUserId,
    proposedPayload: row.proposedPayload,
    rationale: row.rationale,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    outcome: row.outcome,
  };
}

export async function listDrafts(db: Db): Promise<Array<DraftSummary & { threadSubject: string | null; taskCode: string | null }>> {
  const rows = await db
    .select({
      draft: t.aiDrafts,
      threadSubject: t.emailThreads.subject,
      taskCode: t.tasks.code,
    })
    .from(t.aiDrafts)
    .leftJoin(t.emailThreads, eq(t.aiDrafts.threadId, t.emailThreads.id))
    .leftJoin(t.tasks, eq(t.aiDrafts.taskId, t.tasks.id))
    .orderBy(desc(t.aiDrafts.createdAt));
  return rows.map((r) => ({ ...toDraftSummary(r.draft), threadSubject: r.threadSubject, taskCode: r.taskCode }));
}

export async function getDraft(db: Db, id: string): Promise<DraftSummary | null> {
  const rows = await db.select().from(t.aiDrafts).where(eq(t.aiDrafts.id, id));
  return rows[0] ? toDraftSummary(rows[0]) : null;
}

export async function listApprovals(db: Db, onlyPending = false): Promise<ApprovalSummary[]> {
  const rows = onlyPending
    ? await db
        .select()
        .from(t.approvals)
        .where(eq(t.approvals.status, 'in_attesa'))
        .orderBy(desc(t.approvals.createdAt))
    : await db.select().from(t.approvals).orderBy(desc(t.approvals.createdAt));
  return rows.map(toApprovalSummary);
}

export async function listAuditLog(db: Db, limit = 200): Promise<AuditEntry[]> {
  const rows = await db.select().from(t.auditLog).orderBy(desc(t.auditLog.createdAt)).limit(limit);
  return rows as unknown as AuditEntry[];
}

export async function listAiActions(db: Db, limit = 200): Promise<AiActionEntry[]> {
  const rows = await db.select().from(t.aiActions).orderBy(desc(t.aiActions.createdAt)).limit(limit);
  return rows as unknown as AiActionEntry[];
}

export async function listDocuments(db: Db): Promise<Array<DocumentSummary & { projectTitle: string | null; taskCode: string | null }>> {
  const rows = await db
    .select({
      doc: t.documents,
      projectTitle: t.projects.title,
      taskCode: t.tasks.code,
    })
    .from(t.documents)
    .leftJoin(t.projects, eq(t.documents.projectId, t.projects.id))
    .leftJoin(t.tasks, eq(t.documents.taskId, t.tasks.id))
    .orderBy(t.documents.name);
  return rows.map((r) => ({ ...(r.doc as unknown as DocumentSummary), projectTitle: r.projectTitle, taskCode: r.taskCode }));
}

export async function listSavedViews(db: Db) {
  return db.select().from(t.savedViews).orderBy(t.savedViews.name);
}

export async function getSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.select().from(t.appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(t.appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: t.appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getOwnerUser(db: Db) {
  const rows = await db.select().from(t.users).orderBy(t.users.createdAt).limit(1);
  return rows[0] ?? null;
}

export async function getIntegrationStatus(db: Db, provider = 'gmail') {
  const rows = await db.select().from(t.integrationTokens).where(eq(t.integrationTokens.provider, provider));
  return rows[0] ?? null;
}

export async function countPending(db: Db) {
  const [drafts, approvals, unclassified] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.aiDrafts)
      .where(inArray(t.aiDrafts.status, ['generata', 'in_revisione'])),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.approvals)
      .where(eq(t.approvals.status, 'in_attesa')),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.emailThreads)
      .where(and(eq(t.emailThreads.status, 'da_classificare'))),
  ]);
  return {
    drafts: Number(drafts[0]?.n ?? 0),
    approvals: Number(approvals[0]?.n ?? 0),
    unclassifiedThreads: Number(unclassified[0]?.n ?? 0),
  };
}
