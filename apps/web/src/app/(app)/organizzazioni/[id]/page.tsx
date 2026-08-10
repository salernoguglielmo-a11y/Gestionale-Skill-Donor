import { formatDate, isOpen, ORGANIZATION_STATUS_LABELS } from '@sdoh/core';
import { getDb, getOrganizationDetail } from '@sdoh/db';
import { Badge, Card, CardHeader, OrganizationTypeBadge } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TaskLineList } from '@/components/task-row';
import { requireUser } from '@/lib/auth';
import { safeExternalUrl } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organizzazione' };

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const now = new Date();

  const db = await getDb();
  const detail = await getOrganizationDetail(db, id);
  if (!detail) notFound();

  const { organization, contacts, projects, tasks } = detail;
  const site = safeExternalUrl(organization.website);

  return (
    <div className="space-y-3">
      <nav aria-label="Percorso" className="text-xs text-muted">
        <Link href="/organizzazioni" className="hover:underline">
          Organizzazioni
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{organization.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink-strong">{organization.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <OrganizationTypeBadge type={organization.type} />
            <Badge tone="outline">{ORGANIZATION_STATUS_LABELS[organization.status]}</Badge>
            {organization.city ? <span className="text-xs text-muted">{organization.city}</span> : null}
          </div>
        </div>
        {site ? (
          <a href={site} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-deep hover:underline">
            {new URL(site).hostname}
          </a>
        ) : null}
      </header>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <Card>
            <CardHeader title="Dati essenziali" />
            <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Forma giuridica</dt>
                <dd className="text-ink">{(organization as { legalForm?: string }).legalForm ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Settore</dt>
                <dd className="text-ink">{(organization as { sector?: string }).sector ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-faint">Codice fiscale / P. IVA</dt>
                <dd className="text-ink">{organization.fiscalCode ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-faint">Note</dt>
                <dd className="text-ink">{organization.notes ?? '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title={`Attività collegate (${tasks.filter(isOpen).length} aperte)`} />
            <TaskLineList tasks={tasks} now={now} limit={15} emptyLabel="Nessuna attività collegata." />
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader title={`Referenti (${contacts.length})`} />
            {contacts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun referente registrato.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {contacts.map((contact) => (
                  <li key={contact.id} className="px-4 py-2">
                    <p className="text-[13px] text-ink-strong">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-[11px] text-muted">{contact.role ?? 'Ruolo non indicato'}</p>
                    {contact.email ? <p className="text-[11px] text-muted">{contact.email}</p> : null}
                    {contact.lastContactAt ? (
                      <p className="text-[11px] text-faint">Ultimo contatto: {formatDate(contact.lastContactAt)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={`Progetti (${projects.length})`} />
            {projects.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nessun progetto collegato.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {projects.map((project) => (
                  <li key={project.id} className="px-4 py-2">
                    <Link href={`/progetti/${project.code}`} className="text-[13px] text-ink-strong hover:underline">
                      {project.title}
                    </Link>
                    <p className="text-[11px] text-muted">{project.code}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
