import { ORGANIZATION_STATUS_LABELS, ORGANIZATION_TYPES, ORGANIZATION_TYPE_LABELS } from '@sdoh/core';
import { getDb, listOrganizations } from '@sdoh/db';
import { Card, CardHeader, OrganizationTypeBadge } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { safeExternalUrl } from '@/lib/sanitize';

export const metadata: Metadata = { title: 'Organizzazioni' };
export const dynamic = 'force-dynamic';

/**
 * ETS, donor, partner, soci, istituzioni e fornitori sono viste distinte ma
 * della stessa entità: cambia il ruolo, non la natura del dato.
 */
export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const activeType = typeof params.tipo === 'string' ? params.tipo : 'tutte';

  const db = await getDb();
  const organizations = await listOrganizations(db);
  const filtered = activeType === 'tutte' ? organizations : organizations.filter((o) => o.type === activeType);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Organizzazioni</h1>
        <p className="text-xs text-muted">
          ETS, donor, partner, istituzioni e fornitori con cui Skill Donor lavora.
        </p>
      </header>

      <nav aria-label="Filtra per tipologia" className="flex flex-wrap gap-1">
        {[{ value: 'tutte', label: 'Tutte' }, ...ORGANIZATION_TYPES.map((t) => ({ value: t, label: ORGANIZATION_TYPE_LABELS[t] }))].map(
          (filter) => {
            const count =
              filter.value === 'tutte'
                ? organizations.length
                : organizations.filter((o) => o.type === filter.value).length;
            const isActive = activeType === filter.value;
            return (
              <Link
                key={filter.value}
                href={filter.value === 'tutte' ? '/organizzazioni' : `/organizzazioni?tipo=${filter.value}`}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                  isActive
                    ? 'border-brand bg-brand-tint font-medium text-brand-deep'
                    : 'border-line bg-surface text-muted hover:border-brand-border hover:bg-brand-tint'
                }`}
              >
                {filter.label} <span className="tabular-nums">({count})</span>
              </Link>
            );
          },
        )}
      </nav>

      <Card>
        <CardHeader title={`${filtered.length} organizzazioni`} />
        <div className="sd-scroll-x">
          <table className="sd-table">
            <caption className="sr-only">Elenco delle organizzazioni</caption>
            <thead>
              <tr>
                <th scope="col">Denominazione</th>
                <th scope="col" className="w-36">Tipologia</th>
                <th scope="col" className="w-32">Stato</th>
                <th scope="col" className="w-40">Settore</th>
                <th scope="col" className="w-24 text-right">Progetti</th>
                <th scope="col" className="w-24 text-right">Persone</th>
                <th scope="col" className="w-40">Sito</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((org) => {
                const site = safeExternalUrl(org.website);
                return (
                  <tr key={org.id}>
                    <td className="max-w-sm">
                      <Link href={`/organizzazioni/${org.id}`} className="text-[13px] text-ink-strong hover:underline">
                        {org.name}
                      </Link>
                      {org.notes ? <p className="mt-0.5 text-[11px] text-muted sd-clamp-2">{org.notes}</p> : null}
                    </td>
                    <td>
                      <OrganizationTypeBadge type={org.type} />
                    </td>
                    <td className="text-[11px] text-muted">{ORGANIZATION_STATUS_LABELS[org.status]}</td>
                    <td className="text-[11px] text-muted">{(org as { sector?: string }).sector ?? '—'}</td>
                    <td className="text-right tabular-nums">{org.projectCount}</td>
                    <td className="text-right tabular-nums">{org.contactCount}</td>
                    <td className="max-w-40 truncate text-[11px]">
                      {site ? (
                        <a href={site} target="_blank" rel="noopener noreferrer" className="text-brand-deep hover:underline">
                          {new URL(site).hostname}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
