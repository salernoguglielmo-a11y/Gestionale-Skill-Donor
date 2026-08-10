'use client';

import { Button, Input } from '@sdoh/ui';
import * as React from 'react';
import { generateDraftAction } from '@/lib/actions/drafts';
import { quickUpdateTaskAction, type ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

/**
 * Azioni controllate sul dettaglio attività.
 * Ogni pulsante corrisponde a una transizione di stato precisa e passa dalla
 * stessa Server Action validata usata dalla tabella.
 */
export function TaskQuickActions({ taskId, status }: { taskId: string; status: string }) {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [nextStep, setNextStep] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const setStatus = (value: string) => {
    const formData = new FormData();
    formData.set('id', taskId);
    formData.set('status', value);
    startTransition(async () => setResult(await quickUpdateTaskAction(formData)));
  };

  const saveNextStep = () => {
    const formData = new FormData();
    formData.set('id', taskId);
    formData.set('nextStep', nextStep);
    startTransition(async () => {
      setResult(await quickUpdateTaskAction(formData));
      setNextStep('');
    });
  };

  const draft = () => {
    const formData = new FormData();
    formData.set('taskId', taskId);
    startTransition(async () => setResult(await generateDraftAction(formData)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" disabled={pending || status === 'in_lavorazione'} onClick={() => setStatus('in_lavorazione')}>
          Metti in lavorazione
        </Button>
        <Button size="sm" variant="secondary" disabled={pending || status === 'in_attesa'} onClick={() => setStatus('in_attesa')}>
          Metti in attesa
        </Button>
        <Button size="sm" variant="secondary" disabled={pending || status === 'bloccata'} onClick={() => setStatus('bloccata')}>
          Segna bloccata
        </Button>
        <Button size="sm" variant="primary" disabled={pending || status === 'completata'} onClick={() => setStatus('completata')}>
          Completa
        </Button>
        <Button size="sm" variant="ghost" disabled={pending || status === 'archiviata'} onClick={() => setStatus('archiviata')}>
          Archivia
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-1.5">
        <div className="min-w-56 flex-1">
          <label htmlFor="next-step-quick" className="mb-1 block text-[11px] font-medium text-ink">
            Aggiorna il prossimo passo
          </label>
          <Input
            id="next-step-quick"
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
            placeholder="Es. Inviare il paper revisionato entro giovedì"
            className="h-8 text-xs"
          />
        </div>
        <Button size="sm" variant="secondary" disabled={pending || nextStep.trim().length === 0} onClick={saveNextStep}>
          Salva
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={draft}>
          Genera bozza interna
        </Button>
      </div>

      <ActionFeedback result={result} />
      <p className="text-[11px] text-faint">
        Le bozze restano interne finché non vengono approvate. Nessuna azione di questa pagina invia email.
      </p>
    </div>
  );
}
