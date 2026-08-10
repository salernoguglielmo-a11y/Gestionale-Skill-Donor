import { formatDateTime, isOpen } from '@sdoh/core';
import { getDb, getThreadDetail, listTasks } from '@sdoh/db';
import { Badge, Card, CardHeader, DemoBadge, DraftStatusBadge, ThreadStatusBadge } from '@sdoh/ui';
import { AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FetchBodyButton, ThreadActions } from '@/components/inbox-actions';
import { requireUser } from '@/lib/auth';
import { safeExternalUrl } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Conversazione' };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const db = await getDb();
  const detail = await getThreadDetail(db, id);
  if (!detail) notFound();

  const { thread, messages, drafts, injectionFlagged, injectionReasons } = detail;
  const tasks = (await listTasks(db)).filter(isOpen);
  const gmailUrl = safeExternalUrl(thread.gmailUrl) ?? 'https://mail.google.com/mail/u/0/';

  return (
    <div className="space-y-3">
      <nav aria-label="Percorso" className="text-xs text-muted">
        <Link href="/inbox" className="hover:underline">
          Inbox operativa
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Conversazione</span>
      </nav>

      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink-strong">{thread.subject}</h1>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>
            Da {thread.fromName ?? thread.fromEmail} &lt;{thread.fromEmail}&gt;
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatDateTime(thread.lastMessageAt)}</span>
          <ThreadStatusBadge status={thread.status} />
          {thread.syncState === 'mock' ? <DemoBadge label="Conversazione dimostrativa" /> : null}
          {thread.labels.map((label) => (
            <Badge key={label} tone="outline">
              {label}
            </Badge>
          ))}
        </div>
      </header>

      {injectionFlagged ? (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Contenuto potenzialmente manipolatorio
          </p>
          <p className="mt-1 text-xs text-ink">
            Il testo di questa conversazione contiene formulazioni tipiche di un tentativo di prompt injection
            {injectionReasons.length > 0 ? `: ${injectionReasons.join(', ')}` : ''}. Il contenuto viene trattato come
            dato non affidabile: non viene mai eseguito né interpretato come istruzione dall’assistente o dai provider AI.
            Verifica il mittente prima di agire.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Azioni" description="Collega, classifica o prepara una bozza. Nessun invio è possibile." />
        <div className="px-4 py-3">
          <ThreadActions threadId={thread.id} status={thread.status} tasks={tasks} gmailUrl={gmailUrl} />
        </div>
      </Card>

      {thread.aiClassification ? (
        <Card>
          <CardHeader title="Classificazione AI" description="Con modello, data, motivazione, confidenza e fonti." />
          <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-faint">Categoria</dt>
              <dd className="text-ink">{thread.aiClassification.category}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-faint">Provider e modello</dt>
              <dd className="text-ink">
                {thread.aiClassification.provider} · {thread.aiClassification.model}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-faint">Data</dt>
              <dd className="text-ink">{formatDateTime(thread.aiClassification.classifiedAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-faint">Confidenza</dt>
              <dd className="text-ink">{Math.round(thread.aiClassification.confidence * 100)}%</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-faint">Dati di origine</dt>
              <dd className="text-ink">{thread.aiClassification.sources.join(', ') || '—'}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-[11px] uppercase tracking-wide text-faint">Motivazione</dt>
              <dd className="text-ink">{thread.aiClassification.rationale}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`Messaggi (${messages.length})`}
          description="Il corpo non è conservato per impostazione predefinita: va recuperato esplicitamente."
        />
        <ul className="divide-y divide-line-soft">
          {messages.map((message) => (
            <li key={message.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-ink-strong">
                  {message.fromName ?? message.fromEmail} <span className="font-normal text-muted">&lt;{message.fromEmail}&gt;</span>
                </p>
                <p className="text-[11px] text-muted">{formatDateTime(message.sentAt)}</p>
              </div>
              <p className="mt-1 text-[12px] text-muted">{message.snippet}</p>

              {message.hasAttachments ? (
                <div className="mt-1.5">
                  <p className="text-[11px] font-medium text-ink">Allegati (solo metadati, mai scaricati)</p>
                  <ul className="text-[11px] text-muted">
                    {message.attachmentMeta.map((attachment) => (
                      <li key={attachment.filename}>
                        {attachment.filename} · {attachment.mimeType} · {Math.round(attachment.size / 1024)} KB
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-2">
                {message.bodyCachedText ? (
                  <details open>
                    <summary className="cursor-pointer text-[11px] font-medium text-brand-deep">
                      Corpo del messaggio (recuperato il {formatDateTime(message.bodyFetchedAt)})
                    </summary>
                    {/* Testo semplice: React fa l'escaping, nessun HTML esterno viene renderizzato. */}
                    <pre className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface-sunken p-2.5 text-[12px] leading-relaxed text-ink">
                      {message.bodyCachedText}
                    </pre>
                  </details>
                ) : (
                  <p className="text-[11px] text-muted">
                    Corpo non conservato. La retention configurata rimuove i corpi recuperati oltre la finestra impostata.
                  </p>
                )}
                <div className="mt-1.5">
                  <FetchBodyButton messageId={message.id} hasBody={Boolean(message.bodyCachedText)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {drafts.length > 0 ? (
        <Card>
          <CardHeader title="Bozze collegate" />
          <ul className="divide-y divide-line-soft">
            {drafts.map((draft) => (
              <li key={draft.id} className="px-4 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] text-ink-strong">{draft.subject}</p>
                  <DraftStatusBadge status={draft.status} />
                </div>
                <p className="text-[11px] text-muted">
                  {draft.provider} · {draft.model} · {formatDateTime(draft.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-line-soft px-4 py-2">
            <Link href="/bozze" className="text-[12px] text-brand-deep hover:underline">
              Apri la coda bozze per rivedere e approvare
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
