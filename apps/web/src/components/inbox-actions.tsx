'use client';

import { THREAD_STATUSES, THREAD_STATUS_LABELS, type TaskSummary } from '@sdoh/core';
import { Button, Select } from '@sdoh/ui';
import * as React from 'react';
import { generateDraftAction } from '@/lib/actions/drafts';
import {
  classifyThreadAction,
  createTaskFromThreadAction,
  fetchBodyAction,
  linkThreadToTaskAction,
  setThreadStatusAction,
  syncInboxAction,
} from '@/lib/actions/inbox';
import type { ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

export function SyncButton() {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await syncInboxAction()))}
      >
        {pending ? 'Sincronizzazione…' : 'Sincronizza ora'}
      </Button>
      <ActionFeedback result={result} />
    </div>
  );
}

/**
 * Azioni su un thread. Nessuna di esse invia, archivia o modifica qualcosa in
 * Gmail: l'unica scrittura possibile verso Gmail è la creazione di una bozza,
 * che avviene altrove e solo dopo approvazione.
 */
export function ThreadActions({
  threadId,
  status,
  tasks,
  gmailUrl,
}: {
  threadId: string;
  status: string;
  tasks: TaskSummary[];
  gmailUrl: string;
}) {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [taskId, setTaskId] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const run = (fn: (formData: FormData) => Promise<ActionResult>, entries: Record<string, string>) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(entries)) formData.set(key, value);
    startTransition(async () => setResult(await fn(formData)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          aria-label="Attività a cui collegare la conversazione"
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          className="h-8 max-w-72 text-xs"
        >
          <option value="">Collega a un’attività…</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.code} — {task.title}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !taskId}
          onClick={() => run(linkThreadToTaskAction, { threadId, taskId })}
        >
          Collega
        </Button>

        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => run(createTaskFromThreadAction, { threadId })}
        >
          Crea nuova attività
        </Button>

        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(classifyThreadAction, { threadId })}>
          Classifica con AI
        </Button>

        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(generateDraftAction, { threadId })}>
          Genera bozza interna
        </Button>

        <Button asChild size="sm" variant="ghost">
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
            Apri in Gmail
          </a>
        </Button>

        <Select
          aria-label="Stato operativo della conversazione"
          value={status}
          disabled={pending}
          onChange={(event) => run(setThreadStatusAction, { threadId, status: event.target.value })}
          className="h-8 w-auto text-xs"
        >
          {THREAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {THREAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      <ActionFeedback result={result} />
    </div>
  );
}

export function FetchBodyButton({ messageId, hasBody }: { messageId: string; hasBody: boolean }) {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set('messageId', messageId);
          startTransition(async () => setResult(await fetchBodyAction(formData)));
        }}
      >
        {pending ? 'Recupero…' : hasBody ? 'Aggiorna il corpo' : 'Recupera il corpo'}
      </Button>
      <ActionFeedback result={result} />
    </div>
  );
}
