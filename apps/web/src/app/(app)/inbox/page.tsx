import { formatDateTime, TASK_PRIORITY_LABELS, THREAD_STATUS_LABELS, type ThreadStatus } from '@sdoh/core';
import { getDb, listThreads } from '@sdoh/db';
import { Badge, Card, CardHeader, DemoBadge, EmptyState, ThreadStatusBadge } from '@sdoh/ui';
import { AlertTriangle, Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SyncButton } from '@/components/inbox-actions';
import { InfoNote } from '@/components/feedback';
import { requireUser } from '@/lib/auth';
import { getGmailState } from '@/lib/gmail-service';

export const metadata: Metadata = { title: 'Inbox operativa' };
export const dynamic = 'force-dynamic';

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'tutte', label: 'Tutte' },
  ...(['da_classificare', 'risposta_da_preparare', 'collegata', 'in_attesa', 'chiusa', 'ignorata'] as ThreadStatus[]).map(
    (s) => ({ value: s, label: THREAD_STATUS_LABELS[s] }),
  ),
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const active = typeof params.stato === 'string' ? params.stato : 'tutte';

  const db = await getDb();
  const [threads, gmail] = await Promise.all([listThreads(db), getGmailState()]);
  const filtered = active === 'tutte' ? threads : threads.filter((t) => t.status === active);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-strong">Inbox operativa</h1>
          <p className="text-xs text-muted">
            Metadati delle conversazioni Gmail. I corpi dei messaggi vengono recuperati solo su richiesta esplicita.
          </p>
        </div>
        <SyncButton />
      </header>

      <Card className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span className="font-medium text-ink">Stato del collegamento</span>
          {gmail.connected ? (
            <>
              <Badge tone="success">Gmail collegata</Badge>
              <span className="text-muted">Account: {gmail.accountEmail}</span>
              <span className="text-muted">
                Ultima sincronizzazione: {gmail.lastSyncAt ? formatDateTime(gmail.lastSyncAt) : 'mai'}
              </span>
              {gmail.lastSyncError ? <span className="text-danger">Errore: {gmail.lastSyncError}</span> : null}
            </>
          ) : (
            <>
              <DemoBadge label="Modalità demo" />
              <span className="text-muted">
                Nessuna casella collegata: i thread mostrati sono dati dimostrativi.{' '}
                <Link href="/impostazioni" className="text-brand-deep hover:underline">
                  Collega Gmail
                </Link>
              </span>
            </>
          )}
        </div>
      </Card>

      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-1">
        {FILTERS.map((filter) => {
          const count =
            filter.value === 'tutte' ? threads.length : threads.filter((t) => t.status === filter.value).length;
          const isActive = active === filter.value;
          return (
            <Link
              key={filter.value}
              href={filter.value === 'tutte' ? '/inbox' : `/inbox?stato=${filter.value}`}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                isActive
                  ? 'border-brand bg-brand-tint font-medium text-brand-deep'
                  : 'border-line bg-surface text-muted hover:border-brand-border hover:bg-brand-tint'
              }`}
            >
              {filter.label} <span className="tabular-nums">({count})</span>
            </Link>
          );
        })}
      </nav>

      <Card>
        <CardHeader
          title={`${filtered.length} conversazioni`}
          description="Ordinate dalla più recente. Apri una conversazione per collegarla, classificarla o preparare una bozza."
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" />}
            title="Nessuna conversazione in questo stato"
            description="Cambia filtro oppure avvia una sincronizzazione per importare nuovi metadati."
          />
        ) : (
          <div className="sd-scroll-x">
            <table className="sd-table">
              <caption className="sr-only">Conversazioni email sincronizzate</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-44">Mittente</th>
                  <th scope="col">Oggetto e anteprima</th>
                  <th scope="col" className="w-40">Classificazione AI</th>
                  <th scope="col" className="w-36">Progetto proposto</th>
                  <th scope="col" className="w-28">Attività</th>
                  <th scope="col" className="w-36">Stato</th>
                  <th scope="col" className="w-28">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((thread) => (
                  <tr key={thread.id}>
                    <td className="max-w-44">
                      <span className="block truncate text-[12px] text-ink-strong">
                        {thread.fromName ?? thread.fromEmail}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{thread.fromEmail}</span>
                    </td>
                    <td className="max-w-lg">
                      <Link href={`/inbox/${thread.id}`} className="block truncate text-[13px] text-ink-strong hover:underline">
                        {thread.subject}
                      </Link>
                      <span className="mt-0.5 block truncate text-[11px] text-muted">{thread.snippet}</span>
                      {thread.messageCount > 1 ? (
                        <span className="text-[10px] text-faint">{thread.messageCount} messaggi</span>
                      ) : null}
                    </td>
                    <td>
                      {thread.aiClassification ? (
                        <>
                          <span className="block text-[11px] text-ink">{thread.aiClassification.category}</span>
                          <span className="block text-[10px] text-muted">
                            {thread.aiClassification.provider} · {Math.round(thread.aiClassification.confidence * 100)}%
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-faint">Non classificata</span>
                      )}
                      {thread.injectionFlagged ? (
                        <Badge tone="danger" className="mt-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Contenuto sospetto
                        </Badge>
                      ) : null}
                    </td>
                    <td className="max-w-36 truncate text-[11px] text-muted">
                      {thread.suggestedProjectTitle ?? '—'}
                      {thread.suggestedUrgency ? (
                        <span className="block text-[10px] text-faint">
                          Urgenza: {TASK_PRIORITY_LABELS[thread.suggestedUrgency]}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {thread.linkedTaskCodes.length === 0 ? (
                        <span className="text-[11px] text-faint">—</span>
                      ) : (
                        thread.linkedTaskCodes.map((code) => (
                          <Link
                            key={code}
                            href={`/attivita/${code}`}
                            className="mr-1 font-mono text-[11px] text-brand-deep hover:underline"
                          >
                            {code}
                          </Link>
                        ))
                      )}
                    </td>
                    <td>
                      <ThreadStatusBadge status={thread.status} />
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-muted">{formatDateTime(thread.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InfoNote>
        L’Hub non invia, archivia, etichetta né cancella nulla in Gmail. La sincronizzazione è in sola lettura; lo stato
        operativo delle conversazioni vive solo qui. L’unica scrittura possibile verso Gmail è la creazione di una bozza,
        dopo approvazione esplicita.
      </InfoNote>
    </div>
  );
}
