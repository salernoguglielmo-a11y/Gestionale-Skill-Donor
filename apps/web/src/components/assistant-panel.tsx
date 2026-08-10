'use client';

import { Badge, Button, Textarea } from '@sdoh/ui';
import * as React from 'react';
import type { AssistantResponse } from '@/app/api/assistant/route';
import { ActionFeedback } from './feedback';

const SUGGESTIONS = [
  'Cosa devo fare oggi?',
  'Quali attività sono ferme da più di dieci giorni?',
  'Mostrami tutto ciò che riguarda Amici Invisibili.',
  'Quali progetti non hanno un prossimo passo?',
  'Fammi un briefing operativo della settimana.',
];

export function AssistantPanel() {
  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState<AssistantResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    setPending(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? 'Richiesta non riuscita.');
      else setAnswer(data as AssistantResponse);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Errore di rete.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
            className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] text-muted hover:border-brand-border hover:bg-brand-tint hover:text-brand-deep"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="space-y-2"
      >
        <label htmlFor="assistant-question" className="sr-only">
          Domanda per l’assistente
        </label>
        <Textarea
          id="assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="Es. Quali attività sono ferme da più di dieci giorni?"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void ask(question);
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending || question.trim().length < 3}>
            {pending ? 'Elaborazione…' : 'Chiedi'}
          </Button>
          <span className="text-[11px] text-faint">⌘/Ctrl + Invio per inviare</span>
        </div>
      </form>

      {error ? <ActionFeedback result={{ ok: false, message: error }} /> : null}

      {pending ? (
        <div className="space-y-1.5" aria-live="polite">
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-sunken" />
          <div className="h-3 w-full animate-pulse rounded bg-surface-sunken" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-sunken" />
        </div>
      ) : null}

      {answer ? (
        <div className="space-y-3" aria-live="polite">
          {answer.deterministicAnswer ? (
            <section className="rounded-md border border-line bg-surface p-3">
              <h2 className="text-[12px] font-semibold text-ink-strong">
                Calcolo diretto sui dati registrati
                <Badge tone="success" className="ml-2">
                  Fatti
                </Badge>
              </h2>
              <pre className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink">
                {answer.deterministicAnswer}
              </pre>
              <p className="mt-1.5 text-[10px] text-faint">
                Questo elenco è calcolato dall’applicazione sui dati del database, non generato da un modello.
              </p>
            </section>
          ) : null}

          <section className="rounded-md border border-line bg-surface p-3">
            <h2 className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-ink-strong">
              Risposta dell’assistente
              <Badge tone={answer.degraded ? 'warning' : 'brand'}>
                {answer.provider} · {answer.model}
              </Badge>
            </h2>
            {answer.degraded && answer.degradedReason ? (
              <p className="mt-1 text-[11px] text-warning">{answer.degradedReason}</p>
            ) : null}
            <pre className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink">{answer.answer}</pre>
          </section>

          {answer.sources.length > 0 ? (
            <section className="rounded-md border border-line bg-surface p-3">
              <h2 className="text-[12px] font-semibold text-ink-strong">Fonti utilizzate</h2>
              <ul className="mt-1 flex flex-wrap gap-1">
                {answer.sources.map((source) => (
                  <li key={source}>
                    <Badge tone="outline">{source}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {answer.inferences.length > 0 ? (
            <section className="rounded-md border border-warning/25 bg-warning-tint p-3">
              <h2 className="text-[12px] font-semibold text-ink-strong">Inferenze (non verificate sui dati)</h2>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-ink">
                {answer.inferences.map((inference) => (
                  <li key={inference}>{inference}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {answer.proposedAction ? (
            <section className="rounded-md border border-brand-border bg-brand-tint p-3">
              <h2 className="text-[12px] font-semibold text-brand-deep">Azione proposta — non ancora applicata</h2>
              <p className="mt-1 text-[12px] text-ink">{answer.proposedAction.descrizione}</p>
              <pre className="mt-1.5 max-h-40 overflow-auto rounded border border-line bg-surface p-2 text-[11px] text-ink">
                {JSON.stringify(answer.proposedAction.payload, null, 2)}
              </pre>
              <p className="mt-1.5 text-[11px] text-ink">
                L’assistente non modifica dati. Per applicare questa proposta apri l’attività interessata e usa i
                pulsanti di aggiornamento, oppure la coda approvazioni.
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
