'use client';

import { AI_MODES, AI_MODE_LABELS } from '@sdoh/core';
import { Button, Field, Input, Select } from '@sdoh/ui';
import * as React from 'react';
import { applyRetentionAction, disconnectGmailAction, saveSettingsAction } from '@/lib/actions/settings';
import type { ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

export function SettingsForm({
  settings,
}: {
  settings: {
    aiMode: string;
    emailRetentionDays: number;
    auditRetentionDays: number;
    autoClassifyOnSync: boolean;
    requireApprovalForTaskCreation: boolean;
  };
}) {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();
  const errors = result?.fieldErrors ?? {};

  return (
    <form
      action={(formData) => startTransition(async () => setResult(await saveSettingsAction(null, formData)))}
      className="space-y-4"
    >
      <ActionFeedback result={result} />

      <Field
        label="Criterio di autonomia AI"
        htmlFor="aiMode"
        hint="Determina quali provider vengono interpellati. Nessun contenuto viene inviato a due provider contemporaneamente."
      >
        <Select id="aiMode" name="aiMode" defaultValue={settings.aiMode}>
          {AI_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {AI_MODE_LABELS[mode]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Retention dei corpi email (giorni)"
          htmlFor="emailRetentionDays"
          hint="0 = rimuovi al primo passaggio di manutenzione."
          error={errors.emailRetentionDays ?? null}
        >
          <Input
            id="emailRetentionDays"
            name="emailRetentionDays"
            type="number"
            min={0}
            max={3650}
            defaultValue={settings.emailRetentionDays}
          />
        </Field>

        <Field
          label="Retention dell’audit log (giorni)"
          htmlFor="auditRetentionDays"
          hint="Minimo 30 giorni: sotto questa soglia il registro perderebbe valore probatorio."
          error={errors.auditRetentionDays ?? null}
        >
          <Input
            id="auditRetentionDays"
            name="auditRetentionDays"
            type="number"
            min={30}
            max={3650}
            defaultValue={settings.auditRetentionDays}
          />
        </Field>
      </div>

      <fieldset className="space-y-2 rounded-md border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink">Comportamenti automatici</legend>
        <label className="flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            name="autoClassifyOnSync"
            defaultChecked={settings.autoClassifyOnSync}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
          />
          <span>
            Proponi una classificazione AI per le conversazioni nuove
            <span className="block text-[11px] text-muted">
              La classificazione resta un suggerimento: non collega né modifica nulla da sola.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-ink">
          <input
            type="checkbox"
            name="requireApprovalForTaskCreation"
            defaultChecked={settings.requireApprovalForTaskCreation}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
          />
          <span>
            Richiedi approvazione per le attività proposte da AI e MCP
            <span className="block text-[11px] text-muted">
              Consigliato. Disattivandolo le proposte esterne resterebbero comunque in coda, ma senza blocco esplicito.
            </span>
          </span>
        </label>
      </fieldset>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Salvataggio…' : 'Salva impostazioni'}
      </Button>
    </form>
  );
}

export function GmailDisconnectButton() {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="space-y-1.5">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await disconnectGmailAction()))}
      >
        Scollega e revoca
      </Button>
      <ActionFeedback result={result} />
    </div>
  );
}

export function RetentionButton() {
  const [result, setResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="space-y-1.5">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await applyRetentionAction()))}
      >
        Applica retention ora
      </Button>
      <ActionFeedback result={result} />
    </div>
  );
}
