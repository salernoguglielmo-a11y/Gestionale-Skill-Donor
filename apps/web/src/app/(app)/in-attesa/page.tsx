import { daysSince, formatDate, isOpen, needsFollowUp, relativeDeadline, relativeSince } from '@sdoh/core';
import { getDb, listTasks } from '@sdoh/db';
import { Badge, Card, CardHeader, EmptyState, TaskPriorityBadge, TaskStatusBadge } from '@sdoh/ui';
import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'In attesa' };
export const dynamic = 'force-dynamic';

/**
 * Vista dedicata alle attività dipendenti da terzi.
 * Separata dall'elenco generale perché richiede una decisione diversa: non
 * "cosa faccio", ma "chi devo sollecitare e da quanto tempo".
 */
export default async function WaitingPage() {
  await requireUser();
  const now = new Date();
  const db = await getDb();
  const tasks = (await listTasks(db)).filter(isOpen);

  const waiting = tasks
    .filter((t) => t.waitingOnThirdParty || t.status === 'in_attesa' || t.status === 'bloccata')
    .sort((a, b) => a.lastUpdateAt.getTime() - b.lastUpdateAt.getTime());

  const due = waiting.filter((t) => needsFollowUp(t, now));
  const scheduled = waiting.filter((t) => !needsFollowUp(t, now));

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">In attesa di terzi</h1>
        <p className="text-xs text-muted">
          Attività ferme per una dipendenza esterna, ordinate dalla più silenziosa. Il follow-up è dovuto quando la data
          di richiamo è raggiunta oppure, se non è stata fissata, dopo 7 giorni di silenzio.
        </p>
      </header>

      <Card>
        <CardHeader
          title={`Follow-up dovuto (${due.length})`}
          description="Da sollecitare oggi."
        />
        {due.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-6 w-6" />}
            title="Nessun follow-up dovuto"
            description="Tutte le attese hanno una data di richiamo ancora futura."
          />
        ) : (
          <WaitingTable tasks={due} now={now} />
        )}
      </Card>

      <Card>
        <CardHeader title={`Attese programmate (${scheduled.length})`} description="Con richiamo già pianificato." />
        {scheduled.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">Nessuna attesa programmata.</p>
        ) : (
          <WaitingTable tasks={scheduled} now={now} />
        )}
      </Card>
    </div>
  );
}

function WaitingTable({
  tasks,
  now,
}: {
  tasks: Awaited<ReturnType<typeof listTasks>>;
  now: Date;
}) {
  return (
    <div className="sd-scroll-x">
      <table className="sd-table">
        <caption className="sr-only">Attività in attesa di terzi</caption>
        <thead>
          <tr>
            <th scope="col" className="w-20">Codice</th>
            <th scope="col">Attività</th>
            <th scope="col" className="w-56">In attesa di</th>
            <th scope="col" className="w-36">Ultimo aggiornamento</th>
            <th scope="col" className="w-36">Follow-up</th>
            <th scope="col" className="w-32">Stato</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <Link
                  href={`/attivita/${task.code}`}
                  className="font-mono text-[11px] font-semibold text-brand-deep hover:underline"
                >
                  {task.code}
                </Link>
              </td>
              <td className="max-w-md">
                <Link href={`/attivita/${task.code}`} className="block text-[13px] text-ink-strong hover:underline">
                  {task.title}
                </Link>
                <span className="text-[11px] text-muted">{task.projectTitle ?? 'Senza progetto'}</span>
              </td>
              <td className="text-[12px] text-ink">
                {task.waitingOn ?? (task.blockedReason ? `Bloccata: ${task.blockedReason}` : 'Terzi non specificati')}
              </td>
              <td className="whitespace-nowrap text-[11px]">
                <span className="block text-ink">{formatDate(task.lastUpdateAt)}</span>
                <span
                  className={`block ${daysSince(task.lastUpdateAt, now) >= 10 ? 'font-medium text-danger' : 'text-muted'}`}
                >
                  {relativeSince(task.lastUpdateAt, now)}
                </span>
              </td>
              <td className="whitespace-nowrap text-[11px]">
                {task.followUpDate ? (
                  <>
                    <span className="block text-ink">{formatDate(task.followUpDate)}</span>
                    <span className="block text-muted">{relativeDeadline(task.followUpDate, now)}</span>
                  </>
                ) : (
                  <Badge tone="warning">Non pianificato</Badge>
                )}
              </td>
              <td>
                <div className="flex flex-col gap-1">
                  <TaskStatusBadge status={task.status} />
                  <TaskPriorityBadge priority={task.priority} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
