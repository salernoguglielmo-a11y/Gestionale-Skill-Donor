import { applyTaskFilter } from '@sdoh/core';
import { getDb, listProjects, listSavedViews, listTasks } from '@sdoh/db';
import { Badge, Button, Card, CardHeader } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TaskFilters } from '@/components/task-filters';
import { TaskKanban, TaskTable } from '@/components/task-table';
import { requireUser } from '@/lib/auth';
import { parseTaskFilter, toSearchParams } from '@/lib/task-query';

export const metadata: Metadata = { title: 'Attività' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = toSearchParams(await searchParams);
  const filter = parseTaskFilter(params);
  const now = new Date();

  const db = await getDb();
  const [tasks, projects, savedViews] = await Promise.all([listTasks(db), listProjects(db), listSavedViews(db)]);
  const filtered = applyTaskFilter(tasks, filter, now);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-strong">Attività</h1>
          <p className="text-xs text-muted">
            Tutte le attività registrate, con modifica rapida di stato, priorità e scadenza.
          </p>
        </div>
        <Button asChild variant="primary" size="sm">
          <Link href="/attivita/nuova">Nuova attività</Link>
        </Button>
      </header>

      {savedViews.length > 0 ? (
        <Card className="px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Viste salvate</span>
            {savedViews.map((view) => {
              const viewParams = new URLSearchParams();
              const f = view.filter as Record<string, unknown>;
              if (typeof f.query === 'string') viewParams.set('q', f.query);
              for (const s of (f.status as string[]) ?? []) viewParams.append('status', s);
              for (const p of (f.priority as string[]) ?? []) viewParams.append('priority', p);
              for (const p of (f.projectId as string[]) ?? []) viewParams.append('project', p);
              for (const q of (f.quick as string[]) ?? []) viewParams.append('quick', q);
              if (typeof f.sort === 'string') viewParams.set('sort', f.sort);
              if (typeof f.direction === 'string') viewParams.set('dir', f.direction);
              viewParams.set('vista', view.layout);
              return (
                <Link
                  key={view.id}
                  href={`/attivita?${viewParams.toString()}`}
                  className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink hover:border-brand-border hover:bg-brand-tint"
                >
                  {view.name}
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}

      <TaskFilters projects={projects} layout={filter.layout} total={tasks.length} shown={filtered.length} />

      {filter.layout === 'kanban' ? (
        <TaskKanban tasks={filtered} now={now.getTime()} />
      ) : (
        <TaskTable tasks={filtered} now={now.getTime()} />
      )}

      <Card>
        <CardHeader title="Legenda" description="Come leggere gli indicatori della tabella." />
        <div className="flex flex-wrap gap-4 px-4 py-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <Badge tone="danger">Ferma da 10+ giorni</Badge> nessun aggiornamento operativo da almeno 10 giorni
          </span>
          <span className="flex items-center gap-1.5">
            <Badge tone="warning">Ferma da 7+ giorni</Badge> soglia di attenzione
          </span>
          <span>
            <strong className="text-danger">Scadenza in rosso</strong>: termine superato con attività ancora aperta
          </span>
          <span>“Nessun prossimo passo”: l’attività è aperta ma non indica cosa fare dopo</span>
        </div>
      </Card>
    </div>
  );
}
