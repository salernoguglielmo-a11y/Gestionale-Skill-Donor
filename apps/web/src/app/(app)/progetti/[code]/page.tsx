import {
  formatDate,
  isOpen,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  relativeDeadline,
} from '@sdoh/core';
import { getDb, getProjectDetail, listProjects } from '@sdoh/db';
import { Badge, Card, CardHeader, OrganizationTypeBadge, ThreadStatusBadge } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TaskLineList } from '@/components/task-row';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: decodeURIComponent(code) };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ code: string }> }) {
  await requireUser();
  const { code } = await params;
  const now = new Date();

  const db = await getDb();
  const projects = await listProjects(db);
  const found = projects.find((p) => p.code === decodeURIComponent(code));
  if (!found) notFound();

  const detail = await getProjectDetail(db, found.id);
  if (!detail) notFound();

  const { project, organizations, tasks, documents, referent, threads } = detail;
  const openTasks = tasks.filter(isOpen);
  const closedTasks = tasks.filter((t) => !isOpen(t));

  return (
    <div className="space-y-3">
      <nav aria-label="Percorso" className="text-xs text-muted">
        <Link href="/progetti" className="hover:underline">
          Progetti
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{project.code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-strong">{project.title}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {PROJECT_TYPE_LABELS[project.type]} · {project.code}
            {project.startDate ? ` · avvio ${formatDate(project.startDate)}` : ''}
            {project.dueDate ? ` · scadenza ${formatDate(project.dueDate)} (${relativeDeadline(project.dueDate, now)})` : ''}
          </p>
        </div>
        <Badge tone="neutral">{PROJECT_STATUS_LABELS[project.status]}</Badge>
      </header>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <Card>
            <CardHeader title="Il progetto" />
            <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-faint">Descrizione</dt>
                <dd className="text-ink">{project.description ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Bisogno</dt>
                <dd className="text-ink">{project.need ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Deliverable</dt>
                <dd className="text-ink">{project.deliverable ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Prossimo passo</dt>
                <dd className={project.nextStep ? 'text-ink' : 'text-warning'}>{project.nextStep ?? 'Non definito'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Referente</dt>
                <dd className="text-ink">
                  {referent ? `${referent.firstName} ${referent.lastName}${referent.role ? ` — ${referent.role}` : ''}` : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title={`Attività aperte (${openTasks.length})`} />
            <TaskLineList tasks={openTasks} now={now} emptyLabel="Nessuna attività aperta su questo progetto." />
          </Card>

          {closedTasks.length > 0 ? (
            <Card>
              <CardHeader title={`Attività chiuse (${closedTasks.length})`} />
              <TaskLineList tasks={closedTasks} now={now} limit={10} emptyLabel="Nessuna attività chiusa." />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Corrispondenza collegata" description="Thread agganciati alle attività del progetto." />
            {threads.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessuna conversazione collegata.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {threads.map((thread) => (
                  <li key={thread.id} className="flex items-center gap-2 px-4 py-2">
                    <Link href={`/inbox/${thread.id}`} className="min-w-0 flex-1 truncate text-[12px] text-ink-strong hover:underline">
                      {thread.subject}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted">{thread.fromName ?? thread.fromEmail}</span>
                    <ThreadStatusBadge status={thread.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader title="Organizzazioni coinvolte" />
            {organizations.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessuna organizzazione collegata.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {organizations.map((org) => (
                  <li key={org.id} className="px-4 py-2">
                    <Link href={`/organizzazioni/${org.id}`} className="text-[13px] text-ink-strong hover:underline">
                      {org.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <OrganizationTypeBadge type={org.type} />
                      <span className="text-[11px] text-muted">ruolo: {org.role}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Metriche d’impatto" />
            {!project.impactMetrics || project.impactMetrics.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessuna metrica registrata.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {project.impactMetrics.map((metric) => (
                  <li key={metric.label} className="flex items-baseline justify-between gap-2 px-4 py-2">
                    <span className="text-[12px] text-ink">{metric.label}</span>
                    <span className="text-[14px] font-semibold tabular-nums text-ink-strong">{metric.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Documenti" />
            {documents.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun documento.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {documents.map((doc) => (
                  <li key={doc.id} className="px-4 py-2">
                    <p className="text-[12px] text-ink-strong">{doc.name}</p>
                    <p className="text-[11px] text-muted">
                      {doc.version} · {doc.status} · {doc.confidentiality}
                    </p>
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
