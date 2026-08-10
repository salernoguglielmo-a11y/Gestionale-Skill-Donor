import type {
  ActorType,
  AiProvider,
  ApprovalActionType,
  ApprovalStatus,
  ConfidentialityLevel,
  DocumentType,
  DraftStatus,
  OrganizationStatus,
  OrganizationType,
  ProjectStatus,
  ProjectType,
  TaskPriority,
  TaskSource,
  TaskStatus,
  ThreadStatus,
} from './enums';

/**
 * Forme di dominio indipendenti dal database. Il package `@sdoh/db` produce
 * righe compatibili con queste interfacce; l'UI e l'MCP dipendono solo da qui.
 */

export interface TaskSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  nextStep: string | null;
  lastUpdateAt: Date;
  waitingOnThirdParty: boolean;
  waitingOn: string | null;
  followUpDate: Date | null;
  blockedReason: string | null;
  source: TaskSource;
  updatedByType: ActorType;
  aiConfidence: number | null;
  projectId: string | null;
  projectTitle: string | null;
  ownerName: string | null;
}

export interface ProjectSummary {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  nextStep: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  ownerName: string | null;
  impactMetrics: ImpactMetric[] | null;
  need: string | null;
  deliverable: string | null;
}

export interface ImpactMetric {
  label: string;
  value: string;
  note?: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;
  website: string | null;
  notes: string | null;
  city: string | null;
  fiscalCode: string | null;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  organizationId: string | null;
  organizationName: string | null;
  notes: string | null;
  lastContactAt: Date | null;
}

export interface EmailThreadSummary {
  id: string;
  gmailThreadId: string;
  subject: string;
  fromName: string | null;
  fromEmail: string;
  toEmails: string[];
  lastMessageAt: Date;
  snippet: string;
  labels: string[];
  gmailUrl: string;
  status: ThreadStatus;
  syncState: string;
  messageCount: number;
  suggestedProjectId: string | null;
  suggestedProjectTitle: string | null;
  suggestedUrgency: TaskPriority | null;
  aiClassification: AiClassification | null;
  linkedTaskCodes: string[];
  /** Segnalazione euristica di possibile prompt injection nel contenuto. */
  injectionFlagged: boolean;
  injectionReasons: string[];
}

export interface AiClassification {
  provider: AiProvider;
  model: string;
  classifiedAt: string;
  category: string;
  rationale: string;
  confidence: number;
  sources: string[];
  suggestedTaskTitle?: string | null;
  suggestedProjectCode?: string | null;
  suggestedPriority?: TaskPriority | null;
  suggestedDueDate?: string | null;
  reviewedBy?: string | null;
}

export interface DocumentSummary {
  id: string;
  name: string;
  type: DocumentType;
  version: string;
  status: string;
  source: string;
  locationRef: string | null;
  confidentiality: ConfidentialityLevel;
  projectId: string | null;
  taskId: string | null;
  updatedAt: Date;
}

export interface DraftSummary {
  id: string;
  provider: AiProvider;
  model: string;
  promptTemplate: string;
  subject: string;
  body: string;
  status: DraftStatus;
  reviewNotes: string | null;
  revisionProvider: AiProvider | null;
  revisionModel: string | null;
  revisionBody: string | null;
  revisionNotes: string | null;
  sourceRefs: SourceRef[];
  createdAt: Date;
  approvedAt: Date | null;
  gmailDraftId: string | null;
  threadId: string | null;
  taskId: string | null;
}

/** Riferimento verificabile a un dato registrato, usato per le citazioni. */
export interface SourceRef {
  kind: 'task' | 'project' | 'email_thread' | 'document' | 'contact' | 'organization';
  id: string;
  label: string;
}

export interface ApprovalSummary {
  id: string;
  actionType: ApprovalActionType;
  entityType: string;
  entityId: string | null;
  status: ApprovalStatus;
  requestedByType: ActorType;
  requestedByLabel: string;
  approvedByUserId: string | null;
  proposedPayload: unknown;
  rationale: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  outcome: string | null;
}

export interface AuditEntry {
  id: string;
  actorType: ActorType;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  source: string;
  correlationId: string | null;
  sessionRef: string | null;
  createdAt: Date;
}

export interface AiActionEntry {
  id: string;
  action: string;
  provider: AiProvider;
  model: string;
  inputSummary: string;
  confidence: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  outcome: string;
  errorMessage: string | null;
  humanReview: string | null;
  correlationId: string | null;
  createdAt: Date;
}
