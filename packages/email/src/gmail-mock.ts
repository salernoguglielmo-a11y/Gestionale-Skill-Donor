import {
  gmailThreadUrl,
  type GmailAdapter,
  type GmailDraftInput,
  type GmailDraftResult,
  type GmailMessageMeta,
  type GmailThreadMeta,
  type SyncResult,
} from './gmail-types';

/**
 * Adapter Gmail mock.
 *
 * Non finge di essere Gmail: dichiara `kind: 'mock'`, e l'interfaccia mostra
 * l'etichetta "modalità demo" ovunque compaiano i suoi dati. Serve a rendere
 * percorribili tutti i flussi (sincronizzazione, recupero del corpo su richiesta,
 * creazione di una bozza dopo conferma) senza credenziali Google.
 *
 * Le "bozze Gmail" create qui restano nel database dell'Hub e non toccano alcuna
 * casella: l'identificativo restituito è marcato `mock-draft-…`.
 */
export class GmailMockAdapter implements GmailAdapter {
  readonly kind = 'mock' as const;
  readonly available = true;
  readonly unavailableReason = null;

  constructor(
    private readonly source: {
      threads: GmailThreadMeta[];
      messages: GmailMessageMeta[];
      bodies: Record<string, string>;
      email?: string;
    },
  ) {}

  async accountEmail(): Promise<string> {
    return this.source.email ?? 'demo@skilldonor.local';
  }

  async syncThreads(options: { maxResults?: number; sinceHistoryId?: string | null } = {}): Promise<SyncResult> {
    const max = options.maxResults ?? 50;
    const threads = [...this.source.threads]
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, max);
    const ids = new Set(threads.map((t) => t.gmailThreadId));

    return {
      threads,
      messages: this.source.messages.filter((m) => ids.has(m.gmailThreadId)),
      historyId: `mock-history-${threads.length}`,
      incremental: Boolean(options.sinceHistoryId),
      warnings: ['Dati dimostrativi: nessuna casella Gmail è stata contattata.'],
    };
  }

  async fetchMessageBody(gmailMessageId: string): Promise<{ text: string; truncated: boolean }> {
    const text = this.source.bodies[gmailMessageId];
    if (text === undefined) {
      throw new Error(`Nessun corpo dimostrativo disponibile per il messaggio ${gmailMessageId}.`);
    }
    return { text, truncated: false };
  }

  async createDraft(input: GmailDraftInput): Promise<GmailDraftResult> {
    const draftId = `mock-draft-${Date.now().toString(36)}`;
    return {
      draftId,
      messageId: null,
      // Il link punta al thread reale se noto, così il flusso resta verosimile.
      webUrl: input.threadId ? gmailThreadUrl(input.threadId) : 'https://mail.google.com/mail/u/0/#drafts',
    };
  }
}
