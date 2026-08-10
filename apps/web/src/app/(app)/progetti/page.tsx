import {
  formatDate,
  isOpen,
  isOverdue,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  relativeDeadline,
} from '@sdoh/core';
import { getDb, listProjects, listTasks } from '@sdoh/db';
import { Badge, Card, CardHeader } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Progetti e matching' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  await requireUser();
  const now = new Date();
  const db = await getDb();
  const [projects, tasks] = await Promise.all([listProjects(db), listTasks(db)]);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Progetti e matching</h1>
        <p className="text-xs text-muted">
          Bisogni degli ETS, professionisti attivati, deliverable e metriche d’impatto.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {projects.map((project) => {
          const projectTasks = tasks.filter((t) => t.projectId === project.id);
          const openTasks = projectTasks.filter(isOpen);
          const overdue = openTasks.filter((t) => isOverdue(t, now));

          return (
            <Card key={project.id} className="flex min-w-0 flex-col">
              <CardHeader
                title={
                  <Link href={`/progetti/${project.code}`} className="hover:underline">
                    {project.title}
                  </Link>
                }
                description={`${PROJECT_TYPE_LABELS[project.type]} · ${project.code}`}
                action={<Badge tone="neutral">{PROJECT_STATUS_LABELS[project.status]}</Badge>}
              />

              <div className="flex-1 space-y-2 px-4 py-3 text-[12px]">
                {project.need ? (
                  <p>
                    <span className="text-[11px] uppercase tracking-wide text-faint">Bisogno</span>
                    <br />
                    <span className="text-ink">{project.need}</span>
                  </p>
                ) : null}
                {project.deliverable ? (
                  <p>
                    <span className="text-[11px] uppercase tracking-wide text-faint">Deliverable</span>
                    <br />
                    <span className="text-ink">{project.deliverable}</span>
                  </p>
                ) : null}
                <p>
                  <span className="text-[11px] uppercase tracking-wide text-faint">Prossimo passo</span>
                  <br />
                  <span className={project.nextStep ? 'text-ink' : 'text-warning'}>
                    {project.nextStep ?? 'Non definito'}
                  </span>
                </p>

                {project.impactMetrics && project.impactMetrics.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {project.impactMetrics.map((metric) => (
                      <li
                        key={metric.label}
                        className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 text-[11px]"
                        title={metric.note ?? undefined}
                      >
                        <span className="text-muted">{metric.label}: </span>
                        <span className="font-medium text-ink-strong">{metric.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2 text-[11px] text-muted">
                <span>
                  <strong className="text-ink-strong tabular-nums">{openTasks.length}</strong> attività aperte
                </span>
                {overdue.length > 0 ? (
                  <span className="text-danger">
                    <strong className="tabular-nums">{overdue.length}</strong> scadute
                  </span>
                ) : null}
                {project.dueDate ? <span>Scadenza {formatDate(project.dueDate)} · {relativeDeadline(project.dueDate, now)}</span> : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
