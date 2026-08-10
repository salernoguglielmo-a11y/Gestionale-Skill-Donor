/**
 * Contratto dell'adapter Gmail, indipendente dall'SDK.
 *
 * Nota deliberata: **non esiste alcun metodo di invio**. L'interfaccia espone
 * lettura di metadati, recupero del corpo su richiesta e creazione di bozze.
 * Un test automatico (`tests/no-send.test.ts`) fallisce se questo file, o
 * qualunque altro del repository, introduce uno scope o un metodo di invio.
 */

export interface GmailThreadMeta {
  gmailThreadId: string;
  subject: string;
  fromName: string | null;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  firstMessageAt: Date;
  lastMessageAt: Date;
  labels: string[];
  snippet: string;
  messageCount: number;
  gmailUrl: string;
}

export interface GmailMessageMeta {
  gmailMessageId: string;
  gmailThreadId: string;
  fromName: string | null;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  sentAt: Date;
  snippet: string;
  labels: string[];
  hasAttachments: boolean;
  /** Solo nome, tipo e dimensione: gli allegati non vengono mai scaricati. */
  attachments: Array<{ filename: string; mimeType: string; size: number }>;
}

export interface SyncResult {
  threads: GmailThreadMeta[];
  messages: GmailMessageMeta[];
  /** Cursore per la sincronizzazione incrementale successiva. */
  historyId: string | null;
  /** Vero quando è stata eseguita una sincronizzazione incrementale. */
  incremental: boolean;
  warnings: string[];
}

export interface GmailDraftInput {
  to: string[];
  subject: string;
  body: string;
  /** Thread a cui agganciare la bozza, per mantenerla nella conversazione. */
  threadId?: string | null;
  inReplyToMessageId?: string | null;
}

export interface GmailDraftResult {
  draftId: string;
  messageId: string | null;
  webUrl: string;
}

export interface GmailAdapter {
  readonly kind: 'reale' | 'mock';
  readonly available: boolean;
  readonly unavailableReason: string | null;

  /** Metadati dei thread. Non scarica corpi né allegati. */
  syncThreads(options: { maxResults?: number; sinceHistoryId?: string | null; query?: string }): Promise<SyncResult>;

  /** Corpo di un messaggio, recuperato solo su richiesta esplicita dell'utente. */
  fetchMessageBody(gmailMessageId: string): Promise<{ text: string; truncated: boolean }>;

  /** Crea una bozza nella casella. Richiede una conferma esplicita a monte. */
  createDraft(input: GmailDraftInput): Promise<GmailDraftResult>;

  /** Indirizzo dell'account collegato. */
  accountEmail(): Promise<string>;
}

/**
 * Scope OAuth richiesti. Elenco volutamente minimo:
 * - `gmail.readonly` per leggere metadati e corpi su richiesta;
 * - `gmail.compose` per creare bozze.
 *
 * `gmail.send`, `gmail.modify` e `mail.google.com` NON sono richiesti: il primo
 * consentirebbe l'invio, gli altri la modifica o la cancellazione dei messaggi.
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
] as const;

export const IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const;

export const ALL_SCOPES = [...IDENTITY_SCOPES, ...GMAIL_SCOPES];

export function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}
