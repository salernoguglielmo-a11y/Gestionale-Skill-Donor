import {
  ACTOR_TYPE_LABELS,
  daysSince,
  formatDate,
  formatDateTime,
  relativeDeadline,
  staleLevel,
  TASK_SOURCE_LABELS,
} from '@sdoh/core';
import { getDb, getTaskByCode, getTaskDetail, listProjects } from '@sdoh/db';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DraftStatusBadge,
  StaleBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
  ThreadStatusBadge,
} from '@sdoh/ui';
import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TaskForm } from '@/components/task-form';
import { TaskQuickActions } from '@/components/task-quick-actions';
import { requireUser } from '@/lib/auth';
import { safeExternalUrl } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: decodeURIComponent(code).toUpperCase() };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ code: string }> }) {
  await requireUser();
  const { code } = await params;
  const now = new Date();

  const db = await getDb();
  const summary = await getTaskByCode(db, decodeURIComponent(code).toUpperCase());
  if (!summary) notFound();

  const [detail, projects] = await Promise.all([getTaskDetail(db, summary.id), listProjects(db)]);
  if (!detail) notFound();

  const { task, events, contacts, organizations, threads, documents, drafts, dependsOn, blocks, aiActions } = detail;
  const stale = staleLevel(task, now);

  return (
    <div className="space-y-3">
      <nav aria-label="Percorso" className="text-xs text-muted">
        <Link href="/attivita" className="hover:underline">
          Attività
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="font-mono text-ink">{task.code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-strong">{task.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            {stale !== 'nessuno' ? <StaleBadge level={stale} days={daysSince(task.lastUpdateAt, now)} /> : null}
            {task.waitingOnThirdParty ? <Badge tone="info">In attesa di terzi</Badge> : null}
            <Badge tone="outline">{TASK_SOURCE_LABELS[task.source]}</Badge>
            {task.aiConfidence != null ? (
              <Badge tone="brand">Confidenza AI {Math.round(task.aiConfidence * 100)}%</Badge>
            ) : null}
          </div>
        </div>
        {task.projectTitle ? (
          <Badge tone="neutral" className="shrink-0">
            {task.projectTitle}
          </Badge>
        ) : null}
      </header>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <Card>
            <CardHeader title="Azioni" description="Ogni modifica è registrata nella timeline e nell’audit log." />
            <div className="px-4 py-3">
              <TaskQuickActions taskId={task.id} status={task.status} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Prossimo passo e scadenza" />
            <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Prossimo passo</dt>
                <dd className={task.nextStep ? 'text-ink' : 'text-warning'}>
                  {task.nextStep ?? 'Non definito — l’attività è aperta ma non indica cosa fare dopo.'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Scadenza</dt>
                <dd className="text-ink">
                  {task.dueDate ? `${formatDate(task.dueDate)} · ${relativeDeadline(task.dueDate, now)}` : 'Nessuna'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Ultimo aggiornamento operativo</dt>
                <dd className="text-ink">
                  {formatDateTime(task.lastUpdateAt)} · {ACTOR_TYPE_LABELS[task.updatedByType]}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Responsabile</dt>
                <dd className="text-ink">{task.ownerName ?? '—'}</dd>
              </div>
              {task.waitingOnThirdParty ? (
                <>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-faint">In attesa di</dt>
                    <dd className="text-ink">{task.waitingOn ?? 'Terzi non specificati'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-faint">Follow-up previsto</dt>
                    <dd className="text-ink">
                      {task.followUpDate
                        ? `${formatDate(task.followUpDate)} · ${relativeDeadline(task.followUpDate, now)}`
                        : 'Non pianificato'}
                    </dd>
                  </div>
                </>
              ) : null}
              {task.blockedReason ? (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-faint">Motivo del blocco</dt>
                  <dd className="text-danger">{task.blockedReason}</dd>
                </div>
              ) : null}
              {task.description ? (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-faint">Descrizione</dt>
                  <dd className="whitespace-pre-wrap text-ink">{task.description}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Timeline" description="Cronologia completa, azioni umane e AI insieme." />
            {events.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun evento registrato.</p>
            ) : (
              <ol className="px-4 py-3">
                {events.map((event) => (
                  <li key={event.id} className="relative border-l border-line pb-3 pl-4 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full ${
                        event.actorType === 'ai' ? 'bg-brand' : 'bg-faint'
                      }`}
                    />
                    <p className="text-[13px] text-ink">{event.summary}</p>
                    <p className="text-[11px] text-muted">
                      {formatDateTime(event.createdAt)} · {ACTOR_TYPE_LABELS[event.actorType]} · {event.actorLabel}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Modifica dettagli" />
            <div className="px-4 py-3">
              <TaskForm projects={projects} task={task} mode="modifica" />
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          {(dependsOn.length > 0 || blocks.length > 0) && (
            <Card>
              <CardHeader title="Dipendenze" />
              <div className="space-y-2 px-4 py-3 text-[12px]">
                {dependsOn.length > 0 ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-faint">Non può procedere prima di</p>
                    <ul className="mt-1 space-y-1">
                      {dependsOn.map((dep) => (
                        <li key={dep.code}>
                          <Link href={`/attivita/${dep.code}`} className="text-brand-deep hover:underline">
                            {dep.code}
                          </Link>{' '}
                          <span className="text-ink">{dep.title}</span>
                          {dep.note ? <span className="block text-[11px] text-muted">{dep.note}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {blocks.length > 0 ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-faint">Blocca</p>
                    <ul className="mt-1 space-y-1">
                      {blocks.map((dep) => (
                        <li key={dep.code}>
                          <Link href={`/attivita/${dep.code}`} className="text-brand-deep hover:underline">
                            {dep.code}
                          </Link>{' '}
                          <span className="text-ink">{dep.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Persone e organizzazioni" />
            {contacts.length === 0 && organizations.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun collegamento registrato.</p>
            ) : (
              <div className="space-y-2 px-4 py-3 text-[12px]">
                {contacts.map((contact) => (
                  <div key={contact.id}>
                    <p className="text-ink-strong">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-[11px] text-muted">
                      {[contact.role, contact.organizationName].filter(Boolean).join(' · ')}
                      {contact.lastContactAt ? ` · ultimo contatto ${formatDate(contact.lastContactAt)}` : ''}
                    </p>
                  </div>
                ))}
                {organizations.map((org) => (
                  <div key={org.id}>
                    <Link href={`/organizzazioni/${org.id}`} className="text-ink-strong hover:underline">
                      {org.name}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Email collegate" />
            {threads.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessuna conversazione collegata.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {threads.map((thread) => {
                  const href = safeExternalUrl(thread.gmailUrl);
                  return (
                    <li key={thread.id} className="px-4 py-2">
                      <Link href={`/inbox/${thread.id}`} className="block truncate text-[12px] text-ink-strong hover:underline">
                        {thread.subject}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted">{thread.fromName ?? thread.fromEmail}</span>
                        <ThreadStatusBadge status={thread.status} />
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[11px] text-brand-deep hover:underline"
                          >
                            Apri in Gmail
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Documenti" />
            {documents.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun documento collegato.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {documents.map((doc) => (
                  <li key={doc.id} className="px-4 py-2">
                    <p className="text-[12px] text-ink-strong">{doc.name}</p>
                    <p className="text-[11px] text-muted">
                      {doc.version} · {doc.status} · riservatezza {doc.confidentiality}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Bozze" />
            {drafts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessuna bozza generata.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {drafts.map((draft) => (
                  <li key={draft.id} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] text-ink-strong">{draft.subject}</p>
                      <DraftStatusBadge status={draft.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {draft.provider} · {draft.model} · {formatDateTime(draft.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line-soft px-4 py-2">
              <Button asChild size="sm" variant="ghost">
                <Link href="/bozze">Apri la coda bozze</Link>
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Interventi AI" description="Ogni chiamata a un provider, riuscita o fallita." />
            {aiActions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun intervento AI su questa attività.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {aiActions.map((action) => (
                  <li key={action.id} className="px-4 py-2">
                    <p className="text-[12px] text-ink-strong">{action.action}</p>
                    <p className="text-[11px] text-muted">
                      {action.provider} · {action.model} · esito {action.outcome}
                      {action.confidence != null ? ` · confidenza ${Math.round(action.confidence * 100)}%` : ''}
                    </p>
                    <p className="text-[10px] text-faint">{formatDateTime(action.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
