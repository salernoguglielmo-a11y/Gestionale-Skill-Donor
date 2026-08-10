import { APPROVAL_ACTION_LABELS, formatDateTime } from '@sdoh/core';
import { getDb, listApprovals, listDrafts } from '@sdoh/db';
import { Badge, Card, CardHeader, DemoBadge, DraftStatusBadge, EmptyState } from '@sdoh/ui';
import { PenLine } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApprovalDecision, DraftReviewPanel } from '@/components/draft-actions';
import { DraftFeedbackProvider } from '@/components/draft-feedback-context';
import { InfoNote } from '@/components/feedback';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Bozze' };
export const dynamic = 'force-dynamic';

export default async function DraftsPage() {
  await requireUser();
  const db = await getDb();
  const [drafts, approvals] = await Promise.all([listDrafts(db), listApprovals(db)]);

  const pending = drafts.filter((d) => d.status === 'generata' || d.status === 'in_revisione');
  const decided = drafts.filter((d) => d.status !== 'generata' && d.status !== 'in_revisione');
  const openApprovals = approvals.filter((a) => a.status === 'in_attesa' && a.entityType !== 'ai_draft');

  return (
    <DraftFeedbackProvider>
      <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Bozze e approvazioni</h1>
        <p className="text-xs text-muted">
          Coda di revisione. Nulla lascia l’applicazione senza una decisione umana esplicita.
        </p>
      </header>

      <InfoNote>
        L’Hub non invia email. Una bozza approvata può, su conferma esplicita, essere copiata come <em>bozza</em> nella
        casella Gmail: da lì la spedizione resta un gesto manuale, fuori da questa applicazione.
      </InfoNote>

      {openApprovals.length > 0 ? (
        <Card>
          <CardHeader
            title={`Proposte in attesa (${openApprovals.length})`}
            description="Arrivano dall’assistente o dal server MCP. Diventano dati reali solo dopo approvazione."
          />
          <ul className="divide-y divide-line-soft">
            {openApprovals.map((approval) => (
              <li key={approval.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warning">{APPROVAL_ACTION_LABELS[approval.actionType]}</Badge>
                  <span className="text-[12px] text-muted">
                    richiesta da {approval.requestedByLabel} · {formatDateTime(approval.createdAt)}
                  </span>
                </div>
                {approval.rationale ? <p className="text-[12px] text-ink">{approval.rationale}</p> : null}
                <pre className="max-h-40 overflow-auto rounded border border-line bg-surface-sunken p-2 text-[11px] text-ink">
                  {JSON.stringify(approval.proposedPayload, null, 2)}
                </pre>
                <ApprovalDecision approvalId={approval.id} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`Bozze da rivedere (${pending.length})`}
          description="Modifica il testo, poi approva o rifiuta."
        />
        {pending.length === 0 ? (
          <EmptyState
            icon={<PenLine className="h-6 w-6" />}
            title="Nessuna bozza in attesa"
            description="Genera una bozza dall’inbox operativa o dal dettaglio di un’attività."
          />
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((draft) => (
              <li key={draft.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink-strong">{draft.subject}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span>
                        {draft.provider} · {draft.model}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>modello di prompt {draft.promptTemplate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateTime(draft.createdAt)}</span>
                      {draft.provider === 'mock' ? <DemoBadge label="Generata in modalità demo" /> : null}
                    </p>
                  </div>
                  <DraftStatusBadge status={draft.status} />
                </div>

                {draft.sourceRefs.length > 0 ? (
                  <p className="text-[11px] text-muted">
                    Contenuti di origine:{' '}
                    {draft.sourceRefs.map((ref) => (
                      <span key={`${ref.kind}-${ref.id}`} className="mr-1.5 rounded bg-surface-sunken px-1 py-0.5">
                        {ref.kind}: {ref.label}
                      </span>
                    ))}
                  </p>
                ) : null}

                {draft.reviewNotes ? (
                  <p className="rounded border border-warning/25 bg-warning-tint px-2.5 py-1.5 text-[11px] text-ink">
                    <strong>Note per la revisione:</strong> {draft.reviewNotes}
                  </p>
                ) : null}

                {draft.revisionNotes ? (
                  <details className="rounded border border-line bg-surface-sunken px-2.5 py-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-ink">
                      Secondo controllo: {draft.revisionProvider} ({draft.revisionModel})
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] text-ink">{draft.revisionNotes}</pre>
                    {draft.revisionBody ? (
                      <>
                        <p className="mt-2 text-[11px] font-medium text-ink">Testo corretto proposto dal revisore</p>
                        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface p-2 text-[11px] text-ink">
                          {draft.revisionBody}
                        </pre>
                      </>
                    ) : null}
                  </details>
                ) : null}

                {draft.taskCode ? (
                  <p className="text-[11px] text-muted">
                    Attività:{' '}
                    <Link href={`/attivita/${draft.taskCode}`} className="text-brand-deep hover:underline">
                      {draft.taskCode}
                    </Link>
                  </p>
                ) : null}
                {draft.threadSubject ? (
                  <p className="text-[11px] text-muted">Conversazione: {draft.threadSubject}</p>
                ) : null}

                <DraftReviewPanel draft={draft} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Storico (${decided.length})`} description="Bozze approvate, rifiutate o trasferite." />
        {decided.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">Nessuna bozza nello storico.</p>
        ) : (
          <div className="sd-scroll-x">
            <table className="sd-table">
              <caption className="sr-only">Storico delle bozze</caption>
              <thead>
                <tr>
                  <th scope="col">Oggetto</th>
                  <th scope="col" className="w-40">Provider</th>
                  <th scope="col" className="w-40">Stato</th>
                  <th scope="col" className="w-40">Approvata il</th>
                  <th scope="col" className="w-32">Attività</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((draft) => (
                  <tr key={draft.id}>
                    <td className="max-w-md truncate">{draft.subject}</td>
                    <td className="text-[11px] text-muted">
                      {draft.provider} · {draft.model}
                    </td>
                    <td>
                      <DraftStatusBadge status={draft.status} />
                    </td>
                    <td className="text-[11px] text-muted">
                      {draft.approvedAt ? formatDateTime(draft.approvedAt) : '—'}
                    </td>
                    <td className="text-[11px]">
                      {draft.taskCode ? (
                        <Link href={`/attivita/${draft.taskCode}`} className="text-brand-deep hover:underline">
                          {draft.taskCode}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
    </DraftFeedbackProvider>
  );
}
