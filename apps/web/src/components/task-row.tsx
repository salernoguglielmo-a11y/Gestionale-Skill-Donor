import {
  daysSince,
  formatDate,
  isOverdue,
  relativeDeadline,
  staleLevel,
  type TaskSummary,
} from '@sdoh/core';
import { cn, StaleBadge, TaskPriorityBadge, TaskStatusBadge } from '@sdoh/ui';
import Link from 'next/link';

/**
 * Riga compatta di attività, usata nelle liste della dashboard.
 * Ogni segnale (scaduta, ferma, in attesa) è sempre accompagnato da testo:
 * il colore non è mai l'unico veicolo dell'informazione.
 */
export function TaskLine({ task, now = new Date() }: { task: TaskSummary; now?: Date }) {
  const overdue = isOverdue(task, now);
  const stale = staleLevel(task, now);

  return (
    <li className="flex items-start gap-2 border-b border-line-soft px-3 py-2 last:border-0 hover:bg-brand-tint">
      <Link
        href={`/attivita/${task.code}`}
        className="shrink-0 font-mono text-[11px] font-semibold text-brand-deep hover:underline"
      >
        {task.code}
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/attivita/${task.code}`} className="block truncate text-[13px] text-ink-strong hover:underline">
          {task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          {task.projectTitle ? <span className="truncate">{task.projectTitle}</span> : null}
          {task.nextStep ? (
            <span className="truncate text-muted">→ {task.nextStep}</span>
          ) : (
            <span className="text-warning">Nessun prossimo passo</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {task.dueDate ? (
          <span
            className={cn(
              'whitespace-nowrap text-[11px]',
              overdue ? 'font-medium text-danger' : 'text-muted',
            )}
            title={formatDate(task.dueDate)}
          >
            {relativeDeadline(task.dueDate, now)}
          </span>
        ) : null}
        {stale !== 'nessuno' ? <StaleBadge level={stale} days={daysSince(task.lastUpdateAt, now)} /> : null}
        <TaskPriorityBadge priority={task.priority} />
        <TaskStatusBadge status={task.status} />
      </div>
    </li>
  );
}

export function TaskLineList({
  tasks,
  now,
  emptyLabel,
  limit,
}: {
  tasks: TaskSummary[];
  now?: Date;
  emptyLabel: string;
  limit?: number;
}) {
  const shown = limit ? tasks.slice(0, limit) : tasks;
  if (shown.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted">{emptyLabel}</p>;
  }
  return (
    <>
      <ul>
        {shown.map((task) => (
          <TaskLine key={task.id} task={task} {...(now ? { now } : {})} />
        ))}
      </ul>
      {limit && tasks.length > limit ? (
        <p className="border-t border-line-soft px-3 py-1.5 text-[11px] text-muted">
          e altre {tasks.length - limit} attività.
        </p>
      ) : null}
    </>
  );
}
