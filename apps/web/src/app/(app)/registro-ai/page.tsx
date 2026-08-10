import { AI_PROVIDER_LABELS, formatDateTime } from '@sdoh/core';
import { getDb, listAiActions } from '@sdoh/db';
import { Badge, Card, CardHeader, EmptyState } from '@sdoh/ui';
import { History } from 'lucide-react';
import type { Metadata } from 'next';
import { InfoNote } from '@/components/feedback';
import { requireUser } from '@/lib/auth';
import { providerStatus } from '@/lib/ai-service';

export const metadata: Metadata = { title: 'Registro AI' };
export const dynamic = 'force-dynamic';

/**
 * Registro degli interventi AI: ogni chiamata a un provider lascia una riga,
 * riuscita o fallita, con modello, confidenza, token e fonti utilizzate.
 */
export default async function AiRegistryPage() {
  await requireUser();
  const db = await getDb();
  const [actions, status] = await Promise.all([listAiActions(db, 200), providerStatus()]);

  const totals = actions.reduce(
    (acc, action) => ({
      input: acc.input + (action.inputTokens ?? 0),
      output: acc.output + (action.outputTokens ?? 0),
      errori: acc.errori + (action.outcome === 'errore' ? 1 : 0),
    }),
    { input: 0, output: 0, errori: 0 },
  );

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Registro AI</h1>
        <p className="text-xs text-muted">
          Ogni chiamata a un provider, con modello, fonte, confidenza, token ed esito.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Interventi registrati" value={actions.length} />
        <Stat label="Token in ingresso" value={totals.input} />
        <Stat label="Token in uscita" value={totals.output} />
        <Stat label="Errori" value={totals.errori} tone={totals.errori > 0 ? 'danger' : 'neutral'} />
      </div>

      <Card>
        <CardHeader title="Stato dei provider" description="Configurazione corrente, senza effettuare chiamate." />
        <ul className="divide-y divide-line-soft">
          {(['openai', 'anthropic', 'mock'] as const).map((key) => {
            const provider = status[key];
            return (
              <li key={key} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[12px]">
                <span className="w-40 font-medium text-ink-strong">{AI_PROVIDER_LABELS[key]}</span>
                <Badge tone={provider.available ? 'success' : 'warning'}>
                  {provider.available ? 'Disponibile' : 'Non configurato'}
                </Badge>
                <span className="text-muted">{provider.model ? `Modello: ${provider.model}` : 'Modello non impostato'}</span>
                {provider.reason ? <span className="text-muted">{provider.reason}</span> : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <InfoNote>
        Il costo monetario non è calcolato: dipende dai listini dei provider, che cambiano nel tempo e non vanno
        codificati nell’applicazione. Vengono registrati i token effettivamente riportati dai provider, sufficienti a
        ricostruire la spesa a partire dal listino in vigore.
      </InfoNote>

      <Card>
        <CardHeader title="Interventi" description="Dal più recente. Ultimi 200." />
        {actions.length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="Nessun intervento AI registrato"
            description="Classifica una conversazione o genera una bozza per popolare il registro."
          />
        ) : (
          <div className="sd-scroll-x">
            <table className="sd-table">
              <caption className="sr-only">Registro degli interventi AI</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-40">Data</th>
                  <th scope="col" className="w-44">Azione</th>
                  <th scope="col" className="w-40">Provider e modello</th>
                  <th scope="col">Fonte</th>
                  <th scope="col" className="w-24">Confidenza</th>
                  <th scope="col" className="w-28">Token</th>
                  <th scope="col" className="w-24">Latenza</th>
                  <th scope="col" className="w-36">Esito</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action.id}>
                    <td className="whitespace-nowrap text-[11px] text-muted">{formatDateTime(action.createdAt)}</td>
                    <td className="text-[12px] text-ink">{action.action}</td>
                    <td className="text-[11px] text-muted">
                      {action.provider}
                      <span className="block font-mono text-[10px]">{action.model}</span>
                    </td>
                    <td className="max-w-sm truncate text-[11px] text-muted">{action.inputSummary}</td>
                    <td className="text-[11px] tabular-nums text-ink">
                      {action.confidence == null ? '—' : `${Math.round(action.confidence * 100)}%`}
                    </td>
                    <td className="text-[11px] tabular-nums text-muted">
                      {action.inputTokens == null && action.outputTokens == null
                        ? '—'
                        : `${action.inputTokens ?? 0} / ${action.outputTokens ?? 0}`}
                    </td>
                    <td className="text-[11px] tabular-nums text-muted">
                      {action.latencyMs == null ? '—' : `${action.latencyMs} ms`}
                    </td>
                    <td>
                      <Badge
                        tone={
                          action.outcome === 'errore'
                            ? 'danger'
                            : action.outcome.includes('degradata')
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {action.outcome}
                      </Badge>
                      {action.errorMessage ? (
                        <span className="mt-0.5 block text-[10px] text-danger">{action.errorMessage}</span>
                      ) : null}
                      {action.humanReview ? (
                        <span className="mt-0.5 block text-[10px] text-muted">Revisione: {action.humanReview}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'danger' }) {
  return (
    <Card className="px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-ink-strong'}`}>
        {value.toLocaleString('it-IT')}
      </p>
    </Card>
  );
}
