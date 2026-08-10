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
 * Adapter Gmail reale, basato su `googleapis` (SDK ufficiale Google).
 *
 * ⚠️ Questo adapter non è stato eseguito contro una casella reale: nell'ambiente
 * di sviluppo non erano disponibili credenziali Google. Il codice segue la
 * documentazione ufficiale delle API Gmail v1, ma va verificato al primo
 * collegamento (vedi `docs/gmail-oauth.md`, sezione "Verifica del collegamento").
 *
 * Comportamenti non negoziabili implementati qui:
 * - nessun metodo di invio;
 * - `format: 'metadata'` in sincronizzazione: i corpi non vengono mai scaricati
 *   di default, solo su chiamata esplicita di `fetchMessageBody`;
 * - gli allegati non vengono mai scaricati: si leggono soltanto nome, tipo e peso.
 */
export class GmailRealAdapter implements GmailAdapter {
  readonly kind = 'reale' as const;
  readonly available = true;
  readonly unavailableReason = null;

  constructor(
    private readonly credentials: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      accessToken?: string | null;
    },
  ) {}

  private async client() {
    const [{ google }, { OAuth2Client }] = await Promise.all([
      import('googleapis'),
      import('google-auth-library'),
    ]);
    const auth = new OAuth2Client({
      clientId: this.credentials.clientId,
      clientSecret: this.credentials.clientSecret,
    });
    auth.setCredentials({
      refresh_token: this.credentials.refreshToken,
      access_token: this.credentials.accessToken ?? undefined,
    });
    return google.gmail({ version: 'v1', auth });
  }

  async accountEmail(): Promise<string> {
    const gmail = await this.client();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return profile.data.emailAddress ?? '';
  }

  async syncThreads(options: {
    maxResults?: number;
    sinceHistoryId?: string | null;
    query?: string;
  }): Promise<SyncResult> {
    const gmail = await this.client();
    const warnings: string[] = [];
    const maxResults = Math.min(options.maxResults ?? 50, 200);

    let threadIds: string[] = [];
    let incremental = false;

    if (options.sinceHistoryId) {
      try {
        const history = await gmail.users.history.list({
          userId: 'me',
          startHistoryId: options.sinceHistoryId,
          historyTypes: ['messageAdded'],
          maxResults,
        });
        threadIds = [
          ...new Set(
            (history.data.history ?? []).flatMap((h) =>
              (h.messagesAdded ?? []).map((m) => m.message?.threadId ?? ''),
            ),
          ),
        ].filter(Boolean);
        incremental = true;
      } catch (error) {
        // Un historyId troppo vecchio viene invalidato da Google (404):
        // in quel caso si ricade sulla sincronizzazione completa.
        warnings.push(
          `Sincronizzazione incrementale non riuscita (${
            error instanceof Error ? error.message : 'errore sconosciuto'
          }): eseguita una sincronizzazione completa.`,
        );
      }
    }

    if (!incremental) {
      const list = await gmail.users.threads.list({
        userId: 'me',
        maxResults,
        q: options.query ?? 'in:inbox',
      });
      threadIds = (list.data.threads ?? []).map((t) => t.id ?? '').filter(Boolean);
    }

    const threads: GmailThreadMeta[] = [];
    const messages: GmailMessageMeta[] = [];

    for (const id of threadIds) {
      const detail = await gmail.users.threads.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
      });

      const rawMessages = detail.data.messages ?? [];
      if (rawMessages.length === 0) continue;

      const parsed = rawMessages.map((m) => parseMessageMeta(m, id));
      const first = parsed[0];
      const last = parsed[parsed.length - 1];
      if (!first || !last) continue;

      messages.push(...parsed);
      threads.push({
        gmailThreadId: id,
        subject: first.subject || '(senza oggetto)',
        fromName: last.fromName,
        fromEmail: last.fromEmail,
        toEmails: last.toEmails,
        ccEmails: [],
        firstMessageAt: first.sentAt,
        lastMessageAt: last.sentAt,
        labels: [...new Set(parsed.flatMap((m) => m.labels))],
        snippet: detail.data.snippet ?? last.snippet,
        messageCount: parsed.length,
        gmailUrl: gmailThreadUrl(id),
      });
    }

    const profile = await gmail.users.getProfile({ userId: 'me' });

    return { threads, messages, historyId: profile.data.historyId ?? null, incremental, warnings };
  }

  async fetchMessageBody(gmailMessageId: string): Promise<{ text: string; truncated: boolean }> {
    const gmail = await this.client();
    const message = await gmail.users.messages.get({ userId: 'me', id: gmailMessageId, format: 'full' });
    const text = extractPlainText(message.data.payload as MessagePart | undefined);
    const MAX = 50_000;
    return text.length > MAX ? { text: text.slice(0, MAX), truncated: true } : { text, truncated: false };
  }

  async createDraft(input: GmailDraftInput): Promise<GmailDraftResult> {
    const gmail = await this.client();
    const raw = buildRawMessage(input);

    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw,
          ...(input.threadId ? { threadId: input.threadId } : {}),
        },
      },
    });

    const draftId = draft.data.id ?? '';
    return {
      draftId,
      messageId: draft.data.message?.id ?? null,
      webUrl: `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`,
    };
  }
}

/* --------------------------------------------------------------- utilità */

interface MessagePart {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; size?: number | null; attachmentId?: string | null } | null;
  parts?: MessagePart[] | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
}

function header(headers: MessagePart['headers'], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function parseAddress(value: string): { name: string | null; email: string } {
  const match = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { name: match[1]?.trim() || null, email: (match[2] ?? '').trim().toLowerCase() };
  return { name: null, email: value.trim().toLowerCase() };
}

export function parseAddressList(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => parseAddress(part).email)
    .filter(Boolean);
}

function parseMessageMeta(message: unknown, threadId: string): GmailMessageMeta {
  const m = message as {
    id?: string | null;
    labelIds?: string[] | null;
    snippet?: string | null;
    internalDate?: string | null;
    payload?: MessagePart | null;
  };
  const headers = m.payload?.headers ?? [];
  const from = parseAddress(header(headers, 'From'));
  const dateHeader = header(headers, 'Date');
  const sentAt = m.internalDate
    ? new Date(Number(m.internalDate))
    : dateHeader
      ? new Date(dateHeader)
      : new Date();

  return {
    gmailMessageId: m.id ?? '',
    gmailThreadId: threadId,
    fromName: from.name,
    fromEmail: from.email,
    toEmails: parseAddressList(header(headers, 'To')),
    subject: header(headers, 'Subject'),
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
    snippet: m.snippet ?? '',
    labels: m.labelIds ?? [],
    hasAttachments: hasAttachments(m.payload ?? undefined),
    attachments: collectAttachmentMeta(m.payload ?? undefined),
  };
}

function hasAttachments(part?: MessagePart): boolean {
  return collectAttachmentMeta(part).length > 0;
}

/** Solo metadati degli allegati: nessun `attachmentId` viene mai scaricato. */
function collectAttachmentMeta(part?: MessagePart): Array<{ filename: string; mimeType: string; size: number }> {
  if (!part) return [];
  const out: Array<{ filename: string; mimeType: string; size: number }> = [];
  const walk = (p: MessagePart) => {
    if (p.filename && p.body?.attachmentId) {
      out.push({
        filename: p.filename,
        mimeType: p.mimeType ?? 'application/octet-stream',
        size: p.body.size ?? 0,
      });
    }
    for (const child of p.parts ?? []) walk(child);
  };
  walk(part);
  return out;
}

export function extractPlainText(part?: MessagePart): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8');
  }
  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text) return text;
  }
  // Nessuna parte testuale: si degrada sull'HTML, ripulito dai tag.
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url')
      .toString('utf8')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

/** Costruisce un messaggio RFC 5322 codificato base64url, come richiesto da Gmail. */
export function buildRawMessage(input: GmailDraftInput): string {
  const headers = [
    `To: ${input.to.join(', ')}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (input.inReplyToMessageId) {
    headers.push(`In-Reply-To: ${input.inReplyToMessageId}`, `References: ${input.inReplyToMessageId}`);
  }
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${input.body}`, 'utf8').toString('base64url');
}

/** Gli header non ASCII vanno codificati (RFC 2047), altrimenti gli accenti si rompono. */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}
