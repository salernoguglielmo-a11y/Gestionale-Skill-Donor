'use client';

import {
  daysSince,
  formatDate,
  isOverdue,
  KANBAN_COLUMNS,
  relativeDeadline,
  staleLevel,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskSummary,
} from '@sdoh/core';
import { Button, cn, Select, StaleBadge, TaskPriorityBadge, TaskStatusBadge } from '@sdoh/ui';
import Link from 'next/link';
import * as React from 'react';
import { bulkUpdateTasksAction, quickUpdateTaskAction, type ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

/**
 * Tabella attività con modifica rapida e selezione multipla.
 *
 * Le modifiche passano dalle Server Action: la validazione e l'audit restano
 * lato server, il client si limita a inviare il form e mostrare l'esito.
 */
export function TaskTable({ tasks, now }: { tasks: TaskSummary[]; now: number }) {
  const nowDate = React.useMemo(() => new Date(now), [now]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  const allSelected = tasks.length > 0 && selected.size === tasks.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runQuickUpdate = (id: string, field: 'status' | 'priority', value: string) => {
    const formData = new FormData();
    formData.set('id', id);
    formData.set(field, value);
    startTransition(async () => setResult(await quickUpdateTaskAction(formData)));
  };

  const runBulk = (field: 'status' | 'priority', value: string) => {
    if (!value || selected.size === 0) return;
    const formData = new FormData();
    for (const id of selected) formData.append('ids', id);
    formData.set(field, value);
    startTransition(async () => {
      setResult(await bulkUpdateTasksAction(formData));
      setSelected(new Set());
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink-strong">Nessuna attività corrisponde ai filtri</p>
        <p className="mt-1 text-xs text-muted">Azzera i filtri o allarga la ricerca per vedere altre attività.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-border bg-brand-tint px-2.5 py-1.5">
          <span className="text-xs font-medium text-brand-deep">{selected.size} selezionate</span>
          <Select
            aria-label="Cambia stato delle attività selezionate"
            value=""
            disabled={pending}
            onChange={(event) => runBulk('status', event.target.value)}
            className="h-7 w-auto text-xs"
          >
            <option value="">Cambia stato…</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Cambia priorità delle attività selezionate"
            value=""
            disabled={pending}
            onChange={(event) => runBulk('priority', event.target.value)}
            className="h-7 w-auto text-xs"
          >
            <option value="">Cambia priorità…</option>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Deseleziona
          </Button>
        </div>
      ) : null}

      <ActionFeedback result={result} />

      <div className="sd-scroll-x rounded-lg border border-line bg-surface">
        <table className="sd-table">
          <caption className="sr-only">
            Elenco delle attività con stato, priorità, scadenza e prossimo passo modificabili
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-8">
                <input
                  type="checkbox"
                  aria-label="Seleziona tutte le attività visibili"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.id)))}
                  className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                />
              </th>
              <th scope="col" className="w-20">Codice</th>
              <th scope="col">Attività</th>
              <th scope="col" className="w-36">Stato</th>
              <th scope="col" className="w-28">Priorità</th>
              <th scope="col" className="w-32">Scadenza</th>
              <th scope="col" className="w-32">Aggiornata</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const overdue = isOverdue(task, nowDate);
              const stale = staleLevel(task, nowDate);
              return (
                <tr key={task.id} className={cn(selected.has(task.id) && 'bg-brand-tint')}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Seleziona ${task.code}`}
                      checked={selected.has(task.id)}
                      onChange={() => toggle(task.id)}
                      className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                    />
                  </td>
                  <td>
                    <Link
                      href={`/attivita/${task.code}`}
                      className="font-mono text-[11px] font-semibold text-brand-deep hover:underline"
                    >
                      {task.code}
                    </Link>
                  </td>
                  <td className="max-w-md">
                    <Link href={`/attivita/${task.code}`} className="block text-[13px] text-ink-strong hover:underline">
                      {task.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      {task.projectTitle ? <span>{task.projectTitle}</span> : null}
                      {task.nextStep ? (
                        <span className="truncate">→ {task.nextStep}</span>
                      ) : (
                        <span className="text-warning">Nessun prossimo passo</span>
                      )}
                      {task.waitingOnThirdParty ? (
                        <span className="text-info">In attesa: {task.waitingOn ?? 'terzi'}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <Select
                      aria-label={`Stato di ${task.code}`}
                      value={task.status}
                      disabled={pending}
                      onChange={(event) => runQuickUpdate(task.id, 'status', event.target.value)}
                      className="h-7 text-xs"
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {TASK_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Select
                      aria-label={`Priorità di ${task.code}`}
                      value={task.priority}
                      disabled={pending}
                      onChange={(event) => runQuickUpdate(task.id, 'priority', event.target.value)}
                      className="h-7 text-xs"
                    >
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className={cn('whitespace-nowrap text-[11px]', overdue ? 'font-medium text-danger' : 'text-muted')}>
                    {task.dueDate ? (
                      <>
                        <span className="block">{formatDate(task.dueDate)}</span>
                        <span className="block text-[10px]">{relativeDeadline(task.dueDate, nowDate)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[11px] text-muted">
                    {stale !== 'nessuno' ? (
                      <StaleBadge level={stale} days={daysSince(task.lastUpdateAt, nowDate)} />
                    ) : (
                      formatDate(task.lastUpdateAt)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Vista Kanban: una colonna per stato, con spostamento tramite menu accessibile. */
export function TaskKanban({ tasks, now }: { tasks: TaskSummary[]; now: number }) {
  const nowDate = React.useMemo(() => new Date(now), [now]);
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  const move = (id: string, status: string) => {
    const formData = new FormData();
    formData.set('id', id);
    formData.set('status', status);
    startTransition(async () => setResult(await quickUpdateTaskAction(formData)));
  };

  return (
    <div className="space-y-2">
      <ActionFeedback result={result} />
      <div className="sd-scroll-x pb-2">
        <div className="flex min-w-max gap-3">
          {KANBAN_COLUMNS.map((status) => {
            const column = tasks.filter((t) => t.status === status);
            return (
              <section key={status} className="w-72 shrink-0 rounded-lg border border-line bg-surface">
                <header className="flex items-center justify-between border-b border-line-soft px-3 py-2">
                  <h2 className="text-xs font-semibold text-ink-strong">{TASK_STATUS_LABELS[status]}</h2>
                  <span className="rounded bg-surface-sunken px-1.5 text-[11px] tabular-nums text-muted">
                    {column.length}
                  </span>
                </header>

                {column.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] text-muted">Nessuna attività.</p>
                ) : (
                  <ul className="max-h-[65vh] space-y-1.5 overflow-y-auto p-2">
                    {column.map((task) => {
                      const stale = staleLevel(task, nowDate);
                      return (
                        <li key={task.id} className="rounded-md border border-line-soft bg-surface p-2 hover:border-brand-border">
                          <div className="flex items-start justify-between gap-1">
                            <Link
                              href={`/attivita/${task.code}`}
                              className="font-mono text-[10px] font-semibold text-brand-deep hover:underline"
                            >
                              {task.code}
                            </Link>
                            <TaskPriorityBadge priority={task.priority} />
                          </div>
                          <Link
                            href={`/attivita/${task.code}`}
                            className="mt-1 block text-[12px] leading-snug text-ink-strong hover:underline sd-clamp-2"
                          >
                            {task.title}
                          </Link>
                          {task.dueDate ? (
                            <p
                              className={cn(
                                'mt-1 text-[10px]',
                                isOverdue(task, nowDate) ? 'font-medium text-danger' : 'text-muted',
                              )}
                            >
                              {relativeDeadline(task.dueDate, nowDate)}
                            </p>
                          ) : null}
                          {stale !== 'nessuno' ? (
                            <p className="mt-1">
                              <StaleBadge level={stale} days={daysSince(task.lastUpdateAt, nowDate)} />
                            </p>
                          ) : null}
                          <Select
                            aria-label={`Sposta ${task.code} in un’altra colonna`}
                            value={task.status}
                            disabled={pending}
                            onChange={(event) => move(task.id, event.target.value)}
                            className="mt-1.5 h-7 text-[11px]"
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                Sposta in: {TASK_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-faint">
        Lo spostamento avviene dal menu di ogni scheda: è utilizzabile da tastiera e da screen reader, cosa che il
        trascinamento con il mouse non garantirebbe. <TaskStatusBadge status="in_attesa" /> imposta anche il flag “in
        attesa di terzi”.
      </p>
    </div>
  );
}
