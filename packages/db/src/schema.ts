import {
  ACTOR_TYPES,
  AI_MODES,
  AI_PROVIDERS,
  APPROVAL_ACTION_TYPES,
  APPROVAL_STATUSES,
  CONFIDENTIALITY_LEVELS,
  DOCUMENT_TYPES,
  DRAFT_STATUSES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
  THREAD_STATUSES,
} from '@sdoh/core';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ enum */

export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES);
export const taskSourceEnum = pgEnum('task_source', TASK_SOURCES);
export const organizationTypeEnum = pgEnum('organization_type', ORGANIZATION_TYPES);
export const organizationStatusEnum = pgEnum('organization_status', ORGANIZATION_STATUSES);
export const projectStatusEnum = pgEnum('project_status', PROJECT_STATUSES);
export const projectTypeEnum = pgEnum('project_type', PROJECT_TYPES);
export const threadStatusEnum = pgEnum('thread_status', THREAD_STATUSES);
export const draftStatusEnum = pgEnum('draft_status', DRAFT_STATUSES);
export const approvalStatusEnum = pgEnum('approval_status', APPROVAL_STATUSES);
export const approvalActionEnum = pgEnum('approval_action_type', APPROVAL_ACTION_TYPES);
export const actorTypeEnum = pgEnum('actor_type', ACTOR_TYPES);
export const aiProviderEnum = pgEnum('ai_provider', AI_PROVIDERS);
export const aiModeEnum = pgEnum('ai_mode', AI_MODES);
export const documentTypeEnum = pgEnum('document_type', DOCUMENT_TYPES);
export const confidentialityEnum = pgEnum('confidentiality_level', CONFIDENTIALITY_LEVELS);

const now = sql`now()`;

/* ----------------------------------------------------------------- users */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull().default('owner'),
    timezone: text('timezone').notNull().default('Europe/Rome'),
    /** Permessi granulari, es. ["tasks:write","gmail:connect","mcp:read"]. */
    permissions: jsonb('permissions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
);

/* --------------------------------------------------------- organizzazioni */

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: organizationTypeEnum('type').notNull(),
    status: organizationStatusEnum('status').notNull().default('attiva'),
    website: text('website'),
    city: text('city'),
    /** Dati essenziali: P.IVA / codice fiscale, forma giuridica, settore. */
    fiscalCode: text('fiscal_code'),
    legalForm: text('legal_form'),
    sector: text('sector'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('organizations_slug_key').on(t.slug), index('organizations_type_idx').on(t.type)],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull().default(''),
    email: text('email'),
    phone: text('phone'),
    role: text('role'),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    notes: text('notes'),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('contacts_org_idx').on(t.organizationId),
    uniqueIndex('contacts_identity_key').on(sql`lower(${t.firstName})`, sql`lower(${t.lastName})`, t.organizationId),
  ],
);

/* -------------------------------------------------------------- progetti */

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    type: projectTypeEnum('type').notNull(),
    status: projectStatusEnum('status').notNull().default('in_corso'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    referentContactId: uuid('referent_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    /** Bisogno espresso dall'ETS e deliverable atteso: il cuore del matching. */
    need: text('need'),
    deliverable: text('deliverable'),
    nextStep: text('next_step'),
    startDate: timestamp('start_date', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    impactMetrics: jsonb('impact_metrics').$type<Array<{ label: string; value: string; note?: string }>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('projects_code_key').on(t.code), index('projects_status_idx').on(t.status)],
);

export const projectOrganizations = pgTable(
  'project_organizations',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Ruolo nel progetto: beneficiario, donor, partner esecutivo, finanziatore… */
    role: text('role').notNull().default('coinvolta'),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.organizationId] })],
);

/* -------------------------------------------------------------- attività */

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    status: taskStatusEnum('status').notNull().default('da_fare'),
    priority: taskPriorityEnum('priority').notNull().default('media'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    nextStep: text('next_step'),
    /** Distinta da `updated_at`: è l'ultimo aggiornamento *operativo*, non tecnico. */
    lastUpdateAt: timestamp('last_update_at', { withTimezone: true }).notNull().default(now),
    source: taskSourceEnum('source').notNull().default('manuale'),
    blockedReason: text('blocked_reason'),
    waitingOnThirdParty: boolean('waiting_on_third_party').notNull().default(false),
    waitingOn: text('waiting_on'),
    followUpDate: timestamp('follow_up_date', { withTimezone: true }),
    aiConfidence: real('ai_confidence'),
    updatedByType: actorTypeEnum('updated_by_type').notNull().default('umano'),
    updatedByLabel: text('updated_by_label'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('tasks_code_key').on(t.code),
    index('tasks_status_idx').on(t.status),
    index('tasks_priority_idx').on(t.priority),
    index('tasks_due_idx').on(t.dueDate),
    index('tasks_project_idx').on(t.projectId),
  ],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] })],
);

export const taskContacts = pgTable(
  'task_contacts',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.contactId] })],
);

export const taskOrganizations = pgTable(
  'task_organizations',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.organizationId] })],
);

/** Timeline dell'attività: ogni evento è una riga, umana o AI. */
export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    detail: jsonb('detail'),
    actorType: actorTypeEnum('actor_type').notNull().default('umano'),
    actorLabel: text('actor_label').notNull().default('Sistema'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('task_events_task_idx').on(t.taskId, t.createdAt)],
);

/* ------------------------------------------------------------------ email */

export const emailThreads = pgTable(
  'email_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gmailThreadId: text('gmail_thread_id').notNull(),
    subject: text('subject').notNull().default('(senza oggetto)'),
    fromName: text('from_name'),
    fromEmail: text('from_email').notNull(),
    toEmails: jsonb('to_emails').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ccEmails: jsonb('cc_emails').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    firstMessageAt: timestamp('first_message_at', { withTimezone: true }).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    labels: jsonb('labels').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    snippet: text('snippet').notNull().default(''),
    messageCount: integer('message_count').notNull().default(1),
    gmailUrl: text('gmail_url').notNull(),
    status: threadStatusEnum('status').notNull().default('da_classificare'),
    /** `mock` | `sincronizzato` | `metadati_parziali` | `errore`. */
    syncState: text('sync_state').notNull().default('sincronizzato'),
    suggestedProjectId: uuid('suggested_project_id').references(() => projects.id, { onDelete: 'set null' }),
    suggestedUrgency: taskPriorityEnum('suggested_urgency'),
    aiClassification: jsonb('ai_classification'),
    /** Segnalazione euristica di possibile prompt injection nel contenuto. */
    injectionFlagged: boolean('injection_flagged').notNull().default(false),
    injectionReasons: jsonb('injection_reasons').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('email_threads_gmail_key').on(t.gmailThreadId),
    index('email_threads_status_idx').on(t.status),
    index('email_threads_last_msg_idx').on(t.lastMessageAt),
  ],
);

/**
 * Solo metadati per impostazione predefinita. `bodyCachedText` resta NULL finché
 * l'utente non richiede esplicitamente il corpo, e viene ripulito dalla retention.
 */
export const emailMessages = pgTable(
  'email_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => emailThreads.id, { onDelete: 'cascade' }),
    gmailMessageId: text('gmail_message_id').notNull(),
    fromName: text('from_name'),
    fromEmail: text('from_email').notNull(),
    toEmails: jsonb('to_emails').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    subject: text('subject').notNull().default(''),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    snippet: text('snippet').notNull().default(''),
    labels: jsonb('labels').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    /** Solo nomi e dimensioni: gli allegati non vengono mai scaricati automaticamente. */
    attachmentMeta: jsonb('attachment_meta')
      .$type<Array<{ filename: string; mimeType: string; size: number }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bodyCachedText: text('body_cached_text'),
    bodyFetchedAt: timestamp('body_fetched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('email_messages_gmail_key').on(t.gmailMessageId),
    index('email_messages_thread_idx').on(t.threadId, t.sentAt),
  ],
);

export const taskEmailThreads = pgTable(
  'task_email_threads',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => emailThreads.id, { onDelete: 'cascade' }),
    linkedByType: actorTypeEnum('linked_by_type').notNull().default('umano'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.threadId] })],
);

/* ---------------------------------------------------------------- documenti */

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: documentTypeEnum('type').notNull().default('altro'),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    version: text('version').notNull().default('v1'),
    status: text('status').notNull().default('bozza'),
    source: text('source').notNull().default('interno'),
    /** Riferimento esterno (Drive, filesystem, URL): nessun file è ospitato dall'app. */
    locationRef: text('location_ref'),
    confidentiality: confidentialityEnum('confidentiality').notNull().default('interno'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('documents_project_idx').on(t.projectId), index('documents_task_idx').on(t.taskId)],
);

/* -------------------------------------------------------------- bozze e AI */

export const aiDrafts = pgTable(
  'ai_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: aiProviderEnum('provider').notNull(),
    model: text('model').notNull(),
    promptTemplate: text('prompt_template').notNull(),
    /** Riferimenti verificabili ai dati usati: nessuna citazione inventata. */
    sourceRefs: jsonb('source_refs')
      .$type<Array<{ kind: string; id: string; label: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull(),
    status: draftStatusEnum('status').notNull().default('generata'),
    reviewNotes: text('review_notes'),
    revisionProvider: aiProviderEnum('revision_provider'),
    revisionModel: text('revision_model'),
    revisionBody: text('revision_body'),
    revisionNotes: text('revision_notes'),
    threadId: uuid('thread_id').references(() => emailThreads.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** Popolato solo dopo che l'utente ha esplicitamente creato la bozza in Gmail. */
    gmailDraftId: text('gmail_draft_id'),
    gmailTransferredAt: timestamp('gmail_transferred_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('ai_drafts_status_idx').on(t.status), index('ai_drafts_thread_idx').on(t.threadId)],
);

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actionType: approvalActionEnum('action_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    status: approvalStatusEnum('status').notNull().default('in_attesa'),
    requestedByType: actorTypeEnum('requested_by_type').notNull(),
    requestedByLabel: text('requested_by_label').notNull(),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    proposedPayload: jsonb('proposed_payload').notNull(),
    rationale: text('rationale'),
    outcome: text('outcome'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('approvals_status_idx').on(t.status, t.createdAt)],
);

/** Registro AI: ogni chiamata a un provider lascia una riga, anche in errore. */
export const aiActions = pgTable(
  'ai_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    provider: aiProviderEnum('provider').notNull(),
    model: text('model').notNull(),
    inputSummary: text('input_summary').notNull(),
    sourceRefs: jsonb('source_refs')
      .$type<Array<{ kind: string; id: string; label: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidence: real('confidence'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    outcome: text('outcome').notNull(),
    errorMessage: text('error_message'),
    humanReview: text('human_review'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('ai_actions_created_idx').on(t.createdAt)],
);

/**
 * Audit log append-only. Una migrazione installa una regola che blocca
 * UPDATE e DELETE a livello di database: l'immutabilità non dipende dal codice.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorLabel: text('actor_label').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    source: text('source').notNull(),
    sessionRef: text('session_ref'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index('audit_log_created_idx').on(t.createdAt),
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

/* ------------------------------------------------------- viste e impostazioni */

export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    layout: text('layout').notNull().default('tabella'),
    filter: jsonb('filter').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('saved_views_name_key').on(t.userId, sql`lower(${t.name})`)],
);

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
});

/**
 * Token OAuth cifrati at rest (AES-256-GCM). Il testo in chiaro non esiste
 * a riposo; la chiave sta solo in `TOKEN_ENCRYPTION_KEY`, mai nel database.
 */
export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    accountEmail: text('account_email').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    encryptedPayload: text('encrypted_payload').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Cursore per la sincronizzazione incrementale Gmail. */
    lastHistoryId: text('last_history_id'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status'),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('integration_tokens_provider_key').on(t.provider, sql`lower(${t.accountEmail})`)],
);

/* ------------------------------------------------------------------ relazioni */

export const projectsRelations = relations(projects, ({ many, one }) => ({
  tasks: many(tasks),
  organizations: many(projectOrganizations),
  documents: many(documents),
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  referent: one(contacts, { fields: [projects.referentContactId], references: [contacts.id] }),
}));

export const tasksRelations = relations(tasks, ({ many, one }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  owner: one(users, { fields: [tasks.ownerId], references: [users.id] }),
  events: many(taskEvents),
  contacts: many(taskContacts),
  organizations: many(taskOrganizations),
  threads: many(taskEmailThreads),
  documents: many(documents),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
  projects: many(projectOrganizations),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
}));

export const emailThreadsRelations = relations(emailThreads, ({ many, one }) => ({
  messages: many(emailMessages),
  tasks: many(taskEmailThreads),
  suggestedProject: one(projects, {
    fields: [emailThreads.suggestedProjectId],
    references: [projects.id],
  }),
}));

export const emailMessagesRelations = relations(emailMessages, ({ one }) => ({
  thread: one(emailThreads, { fields: [emailMessages.threadId], references: [emailThreads.id] }),
}));

export const taskEmailThreadsRelations = relations(taskEmailThreads, ({ one }) => ({
  task: one(tasks, { fields: [taskEmailThreads.taskId], references: [tasks.id] }),
  thread: one(emailThreads, { fields: [taskEmailThreads.threadId], references: [emailThreads.id] }),
}));

export const taskContactsRelations = relations(taskContacts, ({ one }) => ({
  task: one(tasks, { fields: [taskContacts.taskId], references: [tasks.id] }),
  contact: one(contacts, { fields: [taskContacts.contactId], references: [contacts.id] }),
}));

export const taskOrganizationsRelations = relations(taskOrganizations, ({ one }) => ({
  task: one(tasks, { fields: [taskOrganizations.taskId], references: [tasks.id] }),
  organization: one(organizations, {
    fields: [taskOrganizations.organizationId],
    references: [organizations.id],
  }),
}));

export const projectOrganizationsRelations = relations(projectOrganizations, ({ one }) => ({
  project: one(projects, { fields: [projectOrganizations.projectId], references: [projects.id] }),
  organization: one(organizations, {
    fields: [projectOrganizations.organizationId],
    references: [organizations.id],
  }),
}));

export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, { fields: [taskEvents.taskId], references: [tasks.id] }),
}));

export const aiDraftsRelations = relations(aiDrafts, ({ one }) => ({
  thread: one(emailThreads, { fields: [aiDrafts.threadId], references: [emailThreads.id] }),
  task: one(tasks, { fields: [aiDrafts.taskId], references: [tasks.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [documents.taskId], references: [tasks.id] }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, { fields: [taskDependencies.taskId], references: [tasks.id] }),
  dependsOn: one(tasks, { fields: [taskDependencies.dependsOnTaskId], references: [tasks.id] }),
}));
