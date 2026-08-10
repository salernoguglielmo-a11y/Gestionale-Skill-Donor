'use client';

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type ProjectSummary,
  type TaskSummary,
} from '@sdoh/core';
import { Button, Field, Input, Select, Textarea } from '@sdoh/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { createTaskAction, updateTaskDetailsAction, type ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

/** Data ISO per gli input `type=date`, letta nel fuso di Roma. */
function isoDay(value: Date | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function TaskForm({
  projects,
  task,
  mode,
}: {
  projects: ProjectSummary[];
  task?: TaskSummary;
  mode: 'crea' | 'modifica';
}) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [waiting, setWaiting] = React.useState(task?.waitingOnThirdParty ?? false);
  const [pending, startTransition] = React.useTransition();

  const errors = result?.fieldErrors ?? {};

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const action = mode === 'crea' ? createTaskAction : updateTaskDetailsAction;
          const outcome = await action(null, formData);
          setResult(outcome);
          if (outcome.ok && mode === 'crea' && outcome.code) router.push(`/attivita/${outcome.code}`);
          if (outcome.ok && mode === 'modifica') router.refresh();
        });
      }}
      className="space-y-4"
    >
      {task ? <input type="hidden" name="id" value={task.id} /> : null}

      <ActionFeedback result={result} />

      <Field label="Titolo" htmlFor="title" required error={errors.title ?? null}>
        <Input
          id="title"
          name="title"
          defaultValue={task?.title ?? ''}
          required
          maxLength={300}
          aria-invalid={Boolean(errors.title)}
          placeholder="Es. Rispondere alla richiesta di Amici Invisibili"
        />
      </Field>

      <Field
        label="Descrizione"
        htmlFor="description"
        hint="Contesto utile a riprendere l’attività fra due settimane."
        error={errors.description ?? null}
      >
        <Textarea id="description" name="description" rows={4} defaultValue={task?.description ?? ''} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Stato" htmlFor="status">
          <Select id="status" name="status" defaultValue={task?.status ?? 'da_fare'}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priorità" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={task?.priority ?? 'media'}>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Progetto" htmlFor="projectId">
          <Select id="projectId" name="projectId" defaultValue={task?.projectId ?? ''}>
            <option value="">Nessun progetto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Scadenza" htmlFor="dueDate" error={errors.dueDate ?? null}>
          <Input id="dueDate" name="dueDate" type="date" defaultValue={isoDay(task?.dueDate)} />
        </Field>
      </div>

      <Field
        label="Prossimo passo"
        htmlFor="nextStep"
        hint="La singola azione concreta che sblocca l’attività."
        error={errors.nextStep ?? null}
      >
        <Input id="nextStep" name="nextStep" defaultValue={task?.nextStep ?? ''} maxLength={1000} />
      </Field>

      <fieldset className="space-y-3 rounded-md border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink">Dipendenze e blocchi</legend>

        <label className="flex items-center gap-2 text-xs text-ink">
          <input
            type="checkbox"
            name="waitingOnThirdParty"
            defaultChecked={task?.waitingOnThirdParty ?? false}
            onChange={(event) => setWaiting(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-brand)]"
          />
          In attesa di terzi
        </label>

        {waiting ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="In attesa di" htmlFor="waitingOn" hint="Chi o cosa stiamo aspettando.">
              <Input id="waitingOn" name="waitingOn" defaultValue={task?.waitingOn ?? ''} maxLength={300} />
            </Field>
            <Field label="Follow-up previsto" htmlFor="followUpDate" hint="Data in cui sollecitare.">
              <Input id="followUpDate" name="followUpDate" type="date" defaultValue={isoDay(task?.followUpDate)} />
            </Field>
          </div>
        ) : null}

        <Field label="Motivo del blocco" htmlFor="blockedReason" hint="Compila solo se lo stato è “Bloccata”.">
          <Input id="blockedReason" name="blockedReason" defaultValue={task?.blockedReason ?? ''} maxLength={1000} />
        </Field>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Salvataggio…' : mode === 'crea' ? 'Crea attività' : 'Salva modifiche'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
