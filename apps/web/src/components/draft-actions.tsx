'use client';

import type { DraftSummary } from '@sdoh/core';
import { Button, Input, Textarea } from '@sdoh/ui';
import * as React from 'react';
import {
  decideApprovalAction,
  decideDraftAction,
  transferDraftToGmailAction,
  updateDraftBodyAction,
} from '@/lib/actions/drafts';
import type { ActionResult } from '@/lib/actions/tasks';
import { useDraftFeedback } from './draft-feedback-context';
import { ActionFeedback } from './feedback';

/**
 * Revisione e approvazione di una bozza.
 *
 * Il trasferimento in Gmail richiede due passaggi distinti: bozza approvata e
 * spunta di conferma esplicita in questa richiesta. Nessun pulsante invia.
 */
export function DraftReviewPanel({ draft }: { draft: DraftSummary }) {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [confirmTransfer, setConfirmTransfer] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const publishFeedback = useDraftFeedback();
  const readOnly = draft.status === 'trasferita_gmail';

  /**
   * Una decisione sposta la bozza nello storico e smonta questo riquadro: il
   * messaggio va pubblicato più in alto, altrimenti sparirebbe insieme alla riga.
   */
  const decide = (decision: 'approva' | 'rifiuta') => {
    const formData = new FormData();
    formData.set('draftId', draft.id);
    formData.set('decision', decision);
    startTransition(async () => {
      const outcome = await decideDraftAction(formData);
      if (publishFeedback) publishFeedback(outcome);
      else setResult(outcome);
    });
  };

  const transfer = () => {
    const formData = new FormData();
    formData.set('draftId', draft.id);
    formData.set('conferma', confirmTransfer ? 'si' : 'no');
    startTransition(async () => {
      const outcome = await transferDraftToGmailAction(formData);
      if (publishFeedback) publishFeedback(outcome);
      else setResult(outcome);
    });
  };

  return (
    <div className="space-y-3">
      <form
        action={(formData) => {
          formData.set('draftId', draft.id);
          startTransition(async () => setResult(await updateDraftBodyAction(formData)));
        }}
        className="space-y-2"
      >
        <div>
          <label htmlFor={`subject-${draft.id}`} className="mb-1 block text-[11px] font-medium text-ink">
            Oggetto
          </label>
          <Input id={`subject-${draft.id}`} name="subject" defaultValue={draft.subject} disabled={readOnly} />
        </div>
        <div>
          <label htmlFor={`body-${draft.id}`} className="mb-1 block text-[11px] font-medium text-ink">
            Testo della bozza
          </label>
          <Textarea
            id={`body-${draft.id}`}
            name="body"
            rows={12}
            defaultValue={draft.body}
            disabled={readOnly}
            className="font-mono text-[12px]"
          />
        </div>
        {!readOnly ? (
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            Salva modifiche al testo
          </Button>
        ) : null}
      </form>

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3">
          <Button size="sm" variant="primary" disabled={pending || draft.status === 'approvata'} onClick={() => decide('approva')}>
            Approva
          </Button>
          <Button size="sm" variant="danger" disabled={pending || draft.status === 'rifiutata'} onClick={() => decide('rifiuta')}>
            Rifiuta
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2.5">
        <p className="text-[12px] font-medium text-ink">Trasferimento in Gmail</p>
        <p className="mt-0.5 text-[11px] text-muted">
          Crea una <strong>bozza</strong> nella casella collegata. Il messaggio non viene inviato: va aperto e spedito a
          mano da Gmail. Richiede una bozza già approvata.
        </p>
        {readOnly ? (
          <p className="mt-1.5 text-[11px] text-success">
            Bozza già trasferita{draft.gmailDraftId ? ` (id ${draft.gmailDraftId})` : ''}.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-ink">
              <input
                type="checkbox"
                checked={confirmTransfer}
                onChange={(event) => setConfirmTransfer(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-brand)]"
              />
              Confermo di voler creare questa bozza in Gmail
            </label>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !confirmTransfer || draft.status !== 'approvata'}
              onClick={transfer}
            >
              Crea bozza in Gmail
            </Button>
          </div>
        )}
      </div>

      <ActionFeedback result={result} />
    </div>
  );
}

export function ApprovalDecision({ approvalId }: { approvalId: string }) {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();
  const publishFeedback = useDraftFeedback();

  const decide = (decision: 'approva' | 'rifiuta') => {
    const formData = new FormData();
    formData.set('approvalId', approvalId);
    formData.set('decision', decision);
    startTransition(async () => {
      const outcome = await decideApprovalAction(formData);
      if (publishFeedback) publishFeedback(outcome);
      else setResult(outcome);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => decide('approva')}>
          Approva e applica
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide('rifiuta')}>
          Rifiuta
        </Button>
      </div>
      <ActionFeedback result={result} />
    </div>
  );
}
