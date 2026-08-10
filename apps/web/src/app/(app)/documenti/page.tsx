import { CONFIDENTIALITY_LABELS, DOCUMENT_TYPE_LABELS, formatDate } from '@sdoh/core';
import { getDb, listDocuments } from '@sdoh/db';
import { Badge, Card, CardHeader, EmptyState } from '@sdoh/ui';
import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoNote } from '@/components/feedback';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Documenti' };
export const dynamic = 'force-dynamic';

const CONFIDENTIALITY_TONES = {
  pubblico: 'success',
  interno: 'neutral',
  riservato: 'warning',
  sensibile: 'danger',
} as const;

export default async function DocumentsPage() {
  await requireUser();
  const db = await getDb();
  const documents = await listDocuments(db);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Documenti e deliverable</h1>
        <p className="text-xs text-muted">Registro dei documenti con versione, stato e livello di riservatezza.</p>
      </header>

      <InfoNote>
        L’Hub registra <strong>riferimenti</strong> ai documenti, non i file: nessun contenuto viene caricato, archiviato
        o inviato a un provider AI. Il campo “posizione” punta all’archivio esterno dove il file risiede davvero.
      </InfoNote>

      <Card>
        <CardHeader title={`${documents.length} documenti`} />
        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Nessun documento registrato"
            description="I documenti si collegano a un progetto o a un’attività."
          />
        ) : (
          <div className="sd-scroll-x">
            <table className="sd-table">
              <caption className="sr-only">Registro dei documenti</caption>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col" className="w-32">Tipologia</th>
                  <th scope="col" className="w-48">Progetto</th>
                  <th scope="col" className="w-24">Attività</th>
                  <th scope="col" className="w-20">Versione</th>
                  <th scope="col" className="w-32">Stato</th>
                  <th scope="col" className="w-32">Riservatezza</th>
                  <th scope="col" className="w-32">Aggiornato</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="max-w-sm">
                      <span className="text-[13px] text-ink-strong">{doc.name}</span>
                      {doc.locationRef ? (
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">{doc.locationRef}</span>
                      ) : null}
                    </td>
                    <td className="text-[11px] text-muted">{DOCUMENT_TYPE_LABELS[doc.type]}</td>
                    <td className="max-w-48 truncate text-[11px] text-muted">{doc.projectTitle ?? '—'}</td>
                    <td className="text-[11px]">
                      {doc.taskCode ? (
                        <Link href={`/attivita/${doc.taskCode}`} className="font-mono text-brand-deep hover:underline">
                          {doc.taskCode}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-[11px] text-muted">{doc.version}</td>
                    <td className="text-[11px] text-muted">{doc.status}</td>
                    <td>
                      <Badge tone={CONFIDENTIALITY_TONES[doc.confidentiality]}>
                        {CONFIDENTIALITY_LABELS[doc.confidentiality]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap text-[11px] text-muted">{formatDate(doc.updatedAt)}</td>
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
