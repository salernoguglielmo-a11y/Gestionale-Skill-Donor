import {
  computeBriefCounts,
  formatDateLong,
  formatDateTime,
  isDueSoon,
  isOpen,
  isOverdue,
  needsFollowUp,
  relativeDeadline,
  rollupByProject,
  sortTasks,
  staleLevel,
  STALE_CRITICAL_DAYS,
  STALE_WARNING_DAYS,
  urgencyScore,
} from '@sdoh/core';
import { countPending, getDb, listApprovals, listDrafts, listTasks, listThreads } from '@sdoh/db';
import { Badge, Button, Card, CardHeader, DemoBadge, ThreadStatusBadge } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TaskLineList } from '@/components/task-row';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Oggi' };
export const dynamic = 'force-dynamic';

/**
 * Dashboard "Oggi".
 *
 * Impostata per densità e non per estetica: una riga di indicatori numerici
 * cliccabili in alto, poi tre colonne di elenchi operativi. Niente card grandi
 * con un numero al centro — a parità di spazio mostrerebbero un decimo dei dati.
 */
export default async function TodayPage() {
  const user = await requireUser();
  const now = new Date();
  const db = await getDb();

  const [tasks, threads, drafts, approvals, pending] = await Promise.all([
    listTasks(db),
    listThreads(db),
    listDrafts(db),
    listApprovals(db, true),
    countPending(db),
  ]);

  const counts = computeBriefCounts(tasks, now);
  const open = tasks.filter(isOpen);

  const overdue = sortTasks(open.filter((t) => isOverdue(t, now)), 'urgenza', 'asc', now);
  const dueSoon = sortTasks(open.filter((t) => isDueSoon(t, now)), 'scadenza', 'asc', now);
  const critical = sortTasks(
    open.filter((t) => t.priority === 'critica' || t.priority === 'alta'),
    'urgenza',
    'asc',
    now,
  );
  const stale = open
    .filter((t) => staleLevel(t, now) !== 'nessuno')
    .sort((a, b) => a.lastUpdateAt.getTime() - b.lastUpdateAt.getTime());
  const followUps = sortTasks(open.filter((t) => needsFollowUp(t, now)), 'urgenza', 'asc', now);
  const unclassified = threads.filter((t) => t.status === 'da_classificare');
  const pendingDrafts = drafts.filter((d) => d.status === 'generata' || d.status === 'in_revisione');
  const rollup = rollupByProject(tasks, now);

  const indicators = [
    { label: 'Scadute', value: counts.scadute, href: '/attivita?quick=scadute', tone: 'danger' as const },
    { label: 'In scadenza (7 gg)', value: counts.inScadenza, href: '/attivita?quick=aperte&sort=scadenza', tone: 'warning' as const },
    { label: 'Critiche', value: counts.prioritaCritiche, href: '/attivita?priority=critica', tone: 'danger' as const },
    { label: 'Alte', value: counts.prioritaAlte, href: '/attivita?priority=alta', tone: 'warning' as const },
    { label: `Ferme da ${STALE_WARNING_DAYS}+ gg`, value: counts.ferme7, href: '/attivita?quick=ferme', tone: 'warning' as const },
    { label: `Ferme da ${STALE_CRITICAL_DAYS}+ gg`, value: counts.ferme10, href: '/attivita?quick=ferme', tone: 'danger' as const },
    { label: 'Follow-up dovuto', value: counts.inAttesaConFollowUp, href: '/in-attesa', tone: 'info' as const },
    { label: 'Senza prossimo passo', value: counts.senzaProssimoPasso, href: '/attivita?quick=senza_prossimo_passo', tone: 'neutral' as const },
    { label: 'Email da classificare', value: pending.unclassifiedThreads, href: '/inbox', tone: 'neutral' as const },
    { label: 'Bozze da approvare', value: pending.drafts, href: '/bozze', tone: 'brand' as const },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-strong">Oggi</h1>
          <p className="text-xs text-muted">
            {formatDateLong(now)} · fuso Europe/Rome · {open.length} attività aperte su {tasks.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.mode === 'demo' ? <DemoBadge label="Snapshot dimostrativo" /> : null}
          <Button asChild variant="primary" size="sm">
            <Link href="/attivita/nuova">Nuova attività</Link>
          </Button>
        </div>
      </header>

      {/* Indicatori: densi, cliccabili, ciascuno porta alla lista filtrata. */}
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {indicators.map((item) => (
          <li key={item.label} className="bg-surface">
            <Link
              href={item.href}
              className="flex h-full flex-col justify-between gap-0.5 px-3 py-2 hover:bg-brand-tint"
            >
              <span className="text-[11px] leading-tight text-muted">{item.label}</span>
              <span
                className={`text-xl font-semibold tabular-nums ${
                  item.value === 0
                    ? 'text-faint'
                    : item.tone === 'danger'
                      ? 'text-danger'
                      : item.tone === 'warning'
                        ? 'text-warning'
                        : item.tone === 'brand'
                          ? 'text-brand-deep'
                          : 'text-ink-strong'
                }`}
              >
                {item.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Scadute e in scadenza"
              description="Ordinate per urgenza: scadenza superata, poi priorità."
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/attivita?quick=aperte&sort=scadenza">Apri elenco</Link>
                </Button>
              }
            />
            <TaskLineList
              tasks={[...overdue, ...dueSoon]}
              now={now}
              limit={10}
              emptyLabel="Nessuna attività scaduta o in scadenza nei prossimi 7 giorni."
            />
          </Card>

          <Card>
            <CardHeader
              title="Priorità critiche e alte"
              description="Il lavoro che non può slittare."
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/attivita?priority=critica&priority=alta">Apri elenco</Link>
                </Button>
              }
            />
            <TaskLineList tasks={critical} now={now} limit={10} emptyLabel="Nessuna attività critica o alta aperta." />
          </Card>

          <Card>
            <CardHeader
              title={`Ferme da oltre ${STALE_WARNING_DAYS} giorni`}
              description={`Nessun aggiornamento operativo registrato. Oltre ${STALE_CRITICAL_DAYS} giorni l’indicatore diventa critico.`}
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/attivita?quick=ferme">Apri elenco</Link>
                </Button>
              }
            />
            <TaskLineList tasks={stale} now={now} limit={8} emptyLabel="Nessuna attività ferma. Tutto aggiornato." />
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Follow-up dovuti"
              description="In attesa di terzi, con data di richiamo raggiunta."
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/in-attesa">Apri</Link>
                </Button>
              }
            />
            {followUps.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">Nessun follow-up dovuto oggi.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {followUps.slice(0, 6).map((task) => (
                  <li key={task.id} className="px-3 py-2">
                    <Link
                      href={`/attivita/${task.code}`}
                      className="text-[13px] font-medium text-ink-strong hover:underline"
                    >
                      {task.code} — {task.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {task.waitingOn ?? 'In attesa di terzi'} ·{' '}
                      {task.followUpDate ? relativeDeadline(task.followUpDate, now) : 'senza data di richiamo'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Email da classificare"
              description="Conversazioni sincronizzate non ancora collegate."
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/inbox">Apri inbox</Link>
                </Button>
              }
            />
            {unclassified.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">Nessuna conversazione da classificare.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {unclassified.slice(0, 6).map((thread) => (
                  <li key={thread.id} className="px-3 py-2">
                    <Link href={`/inbox/${thread.id}`} className="block truncate text-[13px] text-ink-strong hover:underline">
                      {thread.subject}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="truncate text-[11px] text-muted">{thread.fromName ?? thread.fromEmail}</span>
                      <ThreadStatusBadge status={thread.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Bozze e proposte in attesa"
              description="Nulla viene applicato senza approvazione."
              action={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/bozze">Apri coda</Link>
                </Button>
              }
            />
            {pendingDrafts.length === 0 && approvals.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">Nessuna bozza o proposta in attesa.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {pendingDrafts.slice(0, 4).map((draft) => (
                  <li key={draft.id} className="px-3 py-2">
                    <p className="truncate text-[13px] text-ink-strong">{draft.subject}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {draft.provider} · {draft.model} · {formatDateTime(draft.createdAt)}
                    </p>
                  </li>
                ))}
                {approvals.slice(0, 3).map((approval) => (
                  <li key={approval.id} className="flex items-center gap-2 px-3 py-2">
                    <Badge tone="warning">Proposta</Badge>
                    <span className="truncate text-[12px] text-ink">{approval.actionType}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{approval.requestedByLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Riepilogo per progetto"
          description="Solo attività aperte. Ordinato per attività scadute, poi critiche."
        />
        <div className="sd-scroll-x">
          <table className="sd-table">
            <thead>
              <tr>
                <th scope="col">Progetto</th>
                <th scope="col" className="text-right">Aperte</th>
                <th scope="col" className="text-right">Scadute</th>
                <th scope="col" className="text-right">Critiche</th>
                <th scope="col" className="text-right">Ferme</th>
                <th scope="col">Prossima scadenza</th>
              </tr>
            </thead>
            <tbody>
              {rollup.map((row) => (
                <tr key={row.projectId ?? 'nessuno'}>
                  <td className="max-w-xs truncate">
                    {row.projectId ? (
                      <Link href={`/progetti`} className="text-ink-strong hover:underline">
                        {row.projectTitle}
                      </Link>
                    ) : (
                      <span className="text-muted">{row.projectTitle}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{row.aperte}</td>
                  <td className={`text-right tabular-nums ${row.scadute > 0 ? 'font-medium text-danger' : 'text-faint'}`}>
                    {row.scadute}
                  </td>
                  <td className={`text-right tabular-nums ${row.critiche > 0 ? 'font-medium text-warning' : 'text-faint'}`}>
                    {row.critiche}
                  </td>
                  <td className={`text-right tabular-nums ${row.ferme > 0 ? 'text-ink' : 'text-faint'}`}>{row.ferme}</td>
                  <td className="whitespace-nowrap text-muted">
                    {row.prossimaScadenza ? relativeDeadline(row.prossimaScadenza, now) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-faint">
        Urgenza calcolata combinando priorità, scadenza e giorni di inattività (
        <span className="font-mono">urgencyScore</span> in <span className="font-mono">@sdoh/core</span>): gli stessi
        numeri sono restituiti dall’assistente e dal server MCP. Attività con punteggio più basso in cima
        {open.length > 0 ? ` (attuale minimo: ${Math.round(Math.min(...open.map((t) => urgencyScore(t, now))))})` : ''}.
      </p>
    </div>
  );
}
