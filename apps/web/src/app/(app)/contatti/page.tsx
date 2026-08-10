import { formatDate, relativeSince } from '@sdoh/core';
import { getDb, listContacts } from '@sdoh/db';
import { Card, CardHeader, EmptyState } from '@sdoh/ui';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Persone' };
export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  await requireUser();
  const now = new Date();
  const db = await getDb();
  const contacts = await listContacts(db);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Persone</h1>
        <p className="text-xs text-muted">Referenti degli ETS, dei donor, dei partner e delle istituzioni.</p>
      </header>

      <Card>
        <CardHeader title={`${contacts.length} persone`} description="Ordinate per cognome." />
        {contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nessuna persona registrata"
            description="I referenti vengono creati insieme alle organizzazioni."
          />
        ) : (
          <div className="sd-scroll-x">
            <table className="sd-table">
              <caption className="sr-only">Elenco delle persone di riferimento</caption>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col" className="w-48">Ruolo</th>
                  <th scope="col" className="w-56">Organizzazione</th>
                  <th scope="col" className="w-56">Contatti</th>
                  <th scope="col" className="w-40">Ultimo contatto</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="text-[13px] text-ink-strong">
                      {contact.firstName} {contact.lastName}
                      {contact.notes ? <p className="mt-0.5 text-[11px] text-muted sd-clamp-2">{contact.notes}</p> : null}
                    </td>
                    <td className="text-[12px] text-muted">{contact.role ?? '—'}</td>
                    <td className="text-[12px]">
                      {contact.organizationId ? (
                        <Link href={`/organizzazioni/${contact.organizationId}`} className="text-brand-deep hover:underline">
                          {contact.organizationName}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-[11px] text-muted">
                      {contact.email ? <span className="block truncate">{contact.email}</span> : null}
                      {contact.phone ? <span className="block">{contact.phone}</span> : null}
                      {!contact.email && !contact.phone ? '—' : null}
                    </td>
                    <td className="whitespace-nowrap text-[11px]">
                      {contact.lastContactAt ? (
                        <>
                          <span className="block text-ink">{formatDate(contact.lastContactAt)}</span>
                          <span className="block text-muted">{relativeSince(contact.lastContactAt, now)}</span>
                        </>
                      ) : (
                        <span className="text-faint">Mai</span>
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
  );
}
