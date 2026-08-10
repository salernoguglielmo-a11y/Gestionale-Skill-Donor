import { ACTOR_TYPE_LABELS, formatDateTime } from '@sdoh/core';
import { getDb, listAuditLog } from '@sdoh/db';
import { Badge, Card, CardHeader, EmptyState } from '@sdoh/ui';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { InfoNote } from '@/components/feedback';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requireUser();
  const db = await getDb();
  const entries = await listAuditLog(db, 300);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Audit log</h1>
        <p className="text-xs text-muted">
          Registro append-only di tutte le azioni con effetti: chi, cosa, quando, valore precedente e nuovo.
        </p>
      </header>

      <InfoNote>
        L’immutabilità è imposta dal database: un trigger PostgreSQL rifiuta <code className="font-mono">UPDATE</code> e{' '}
        <code className="font-mono">DELETE</code> su questa tabella. L’unica rimozione possibile passa dalla funzione di
        retention, che registra la purga prima di eseguirla. I valori sono redatti prima della scrittura: indirizzi
        email, numeri di telefono e token non compaiono mai per esteso.
      </InfoNote>

      <Card>
        <CardHeader title={`${entries.length} voci`} description="Dalla più recente. Ultime 300." />
        {entries.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Nessuna voce registrata"
            description="Le azioni con effetti compaiono qui automaticamente."
          />
        ) : (
          <div className="sd-scroll-x">
            <table className="sd-table">
              <caption className="sr-only">Registro delle azioni</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-40">Data</th>
                  <th scope="col" className="w-24">Attore</th>
                  <th scope="col" className="w-40">Autore</th>
                  <th scope="col" className="w-44">Azione</th>
                  <th scope="col" className="w-32">Entità</th>
                  <th scope="col">Valori</th>
                  <th scope="col" className="w-32">Origine</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-[11px] text-muted">{formatDateTime(entry.createdAt)}</td>
                    <td>
                      <Badge
                        tone={entry.actorType === 'ai' ? 'brand' : entry.actorType === 'sistema' ? 'outline' : 'neutral'}
                      >
                        {ACTOR_TYPE_LABELS[entry.actorType]}
                      </Badge>
                    </td>
                    <td className="max-w-40 truncate text-[11px] text-ink">{entry.actorLabel}</td>
                    <td className="font-mono text-[11px] text-ink">{entry.action}</td>
                    <td className="text-[11px] text-muted">{entry.entityType}</td>
                    <td className="max-w-lg">
                      {entry.previousValue ? (
                        <details>
                          <summary className="cursor-pointer text-[11px] text-muted">Valore precedente</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface-sunken p-1.5 text-[10px] text-ink">
                            {JSON.stringify(entry.previousValue, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                      {entry.newValue ? (
                        <details>
                          <summary className="cursor-pointer text-[11px] text-muted">Nuovo valore</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface-sunken p-1.5 text-[10px] text-ink">
                            {JSON.stringify(entry.newValue, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                      {!entry.previousValue && !entry.newValue ? <span className="text-[11px] text-faint">—</span> : null}
                    </td>
                    <td className="text-[11px] text-muted">
                      {entry.source}
                      {entry.sessionRef ? (
                        <span className="block font-mono text-[10px] text-faint">sess. {entry.sessionRef}</span>
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
