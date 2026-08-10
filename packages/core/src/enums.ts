/**
 * Vocabolario di dominio di Skill Donor.
 *
 * I valori tecnici restano in snake_case ASCII (stabili nel database e nei tool MCP);
 * le etichette mostrate all'utente sono in italiano e vivono qui, in un unico posto.
 */

export const TASK_STATUSES = [
  'da_fare',
  'in_lavorazione',
  'in_attesa',
  'bloccata',
  'da_verificare',
  'completata',
  'archiviata',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  da_fare: 'Da fare',
  in_lavorazione: 'In lavorazione',
  in_attesa: 'In attesa',
  bloccata: 'Bloccata',
  da_verificare: 'Da verificare',
  completata: 'Completata',
  archiviata: 'Archiviata',
};

/** Stati che rappresentano lavoro ancora aperto. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  'da_fare',
  'in_lavorazione',
  'in_attesa',
  'bloccata',
  'da_verificare',
];

/** Colonne della vista Kanban, nell'ordine operativo di lettura. */
export const KANBAN_COLUMNS: readonly TaskStatus[] = [
  'da_fare',
  'in_lavorazione',
  'in_attesa',
  'bloccata',
  'da_verificare',
  'completata',
];

export const TASK_PRIORITIES = ['critica', 'alta', 'media', 'bassa'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  critica: 'Critica',
  alta: 'Alta',
  media: 'Media',
  bassa: 'Bassa',
};

/** Peso per l'ordinamento: più basso = più urgente. */
export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  bassa: 3,
};

export const ORGANIZATION_TYPES = [
  'skill_donor',
  'ets',
  'donor',
  'partner',
  'fornitore',
  'istituzione',
  'altro',
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  skill_donor: 'Skill Donor',
  ets: 'ETS',
  donor: 'Donor',
  partner: 'Partner',
  fornitore: 'Fornitore',
  istituzione: 'Istituzione',
  altro: 'Altra organizzazione',
};

export const ORGANIZATION_STATUSES = ['attiva', 'in_valutazione', 'sospesa', 'archiviata'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_STATUS_LABELS: Record<OrganizationStatus, string> = {
  attiva: 'Attiva',
  in_valutazione: 'In valutazione',
  sospesa: 'Sospesa',
  archiviata: 'Archiviata',
};

export const PROJECT_STATUSES = [
  'in_esplorazione',
  'in_corso',
  'in_attesa',
  'concluso',
  'sospeso',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  in_esplorazione: 'In esplorazione',
  in_corso: 'In corso',
  in_attesa: 'In attesa',
  concluso: 'Concluso',
  sospeso: 'Sospeso',
};

export const PROJECT_TYPES = [
  'matching',
  'supporto_ets',
  'partnership',
  'istituzionale',
  'governance',
  'interno',
  'formazione',
  'comunicazione',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  matching: 'Matching donor–ETS',
  supporto_ets: 'Supporto ETS',
  partnership: 'Partnership',
  istituzionale: 'Istituzionale',
  governance: 'Governance',
  interno: 'Interno',
  formazione: 'Formazione',
  comunicazione: 'Comunicazione',
};

export const THREAD_STATUSES = [
  'da_classificare',
  'collegata',
  'risposta_da_preparare',
  'in_attesa',
  'chiusa',
  'ignorata',
] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const THREAD_STATUS_LABELS: Record<ThreadStatus, string> = {
  da_classificare: 'Da classificare',
  collegata: 'Collegata',
  risposta_da_preparare: 'Risposta da preparare',
  in_attesa: 'In attesa',
  chiusa: 'Chiusa',
  ignorata: 'Ignorata ai fini operativi',
};

export const DRAFT_STATUSES = [
  'generata',
  'in_revisione',
  'approvata',
  'rifiutata',
  'trasferita_gmail',
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  generata: 'Generata',
  in_revisione: 'In revisione',
  approvata: 'Approvata',
  rifiutata: 'Rifiutata',
  trasferita_gmail: 'Trasferita in Gmail',
};

export const APPROVAL_STATUSES = ['in_attesa', 'approvata', 'rifiutata', 'scaduta'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  in_attesa: 'In attesa di approvazione',
  approvata: 'Approvata',
  rifiutata: 'Rifiutata',
  scaduta: 'Scaduta',
};

/**
 * Tipi di azione che richiedono approvazione umana.
 * Nota: non esiste e non deve esistere un tipo "invio email".
 */
export const APPROVAL_ACTION_TYPES = [
  'crea_attivita',
  'aggiorna_attivita',
  'crea_bozza',
  'crea_bozza_gmail',
  'collega_email_attivita',
] as const;
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export const APPROVAL_ACTION_LABELS: Record<ApprovalActionType, string> = {
  crea_attivita: 'Creazione attività',
  aggiorna_attivita: 'Aggiornamento attività',
  crea_bozza: 'Generazione bozza interna',
  crea_bozza_gmail: 'Creazione bozza nella casella Gmail',
  collega_email_attivita: 'Collegamento email ↔ attività',
};

export const ACTOR_TYPES = ['umano', 'ai', 'sistema'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  umano: 'Umano',
  ai: 'AI',
  sistema: 'Sistema',
};

export const AI_PROVIDERS = ['openai', 'anthropic', 'mock'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  mock: 'Mock deterministico (demo)',
};

/** Criterio di autonomia AI configurabile dall'utente. */
export const AI_MODES = ['off', 'openai', 'anthropic', 'openai_con_revisione_anthropic'] as const;
export type AiMode = (typeof AI_MODES)[number];

export const AI_MODE_LABELS: Record<AiMode, string> = {
  off: 'Nessun utilizzo AI',
  openai: 'Solo OpenAI',
  anthropic: 'Solo Anthropic',
  openai_con_revisione_anthropic: 'OpenAI con revisione Anthropic',
};

export const DOCUMENT_TYPES = [
  'contratto',
  'proposta',
  'deliverable',
  'verbale',
  'presentazione',
  'nota',
  'amministrativo',
  'altro',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  contratto: 'Contratto',
  proposta: 'Proposta',
  deliverable: 'Deliverable',
  verbale: 'Verbale',
  presentazione: 'Presentazione',
  nota: 'Nota',
  amministrativo: 'Amministrativo',
  altro: 'Altro',
};

export const CONFIDENTIALITY_LEVELS = ['pubblico', 'interno', 'riservato', 'sensibile'] as const;
export type ConfidentialityLevel = (typeof CONFIDENTIALITY_LEVELS)[number];

export const CONFIDENTIALITY_LABELS: Record<ConfidentialityLevel, string> = {
  pubblico: 'Pubblico',
  interno: 'Interno',
  riservato: 'Riservato',
  sensibile: 'Sensibile',
};

export const TASK_SOURCES = ['manuale', 'email', 'ai', 'mcp', 'seed'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_SOURCE_LABELS: Record<TaskSource, string> = {
  manuale: 'Inserimento manuale',
  email: 'Da email',
  ai: 'Proposta AI',
  mcp: 'Proposta via MCP',
  seed: 'Snapshot iniziale',
};
