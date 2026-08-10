import { matchesQuery } from '@sdoh/core';
import { getDb, listContacts, listOrganizations, listProjects, listTasks, listThreads } from '@sdoh/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export interface SearchHit {
  kind: 'attivita' | 'progetto' | 'organizzazione' | 'persona' | 'email';
  label: string;
  sublabel: string;
  href: string;
}

/** Ricerca globale usata dalla palette dei comandi. Sola lettura, sempre autorizzata. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] satisfies SearchHit[] });

  const needle = q.toLowerCase();
  const db = await getDb();
  const [tasks, projects, organizations, contacts, threads] = await Promise.all([
    listTasks(db),
    listProjects(db),
    listOrganizations(db),
    listContacts(db),
    listThreads(db),
  ]);

  const hits: SearchHit[] = [
    ...tasks
      .filter((t) => matchesQuery(t, q))
      .slice(0, 8)
      .map((t) => ({
        kind: 'attivita' as const,
        label: `${t.code} — ${t.title}`,
        sublabel: t.projectTitle ?? 'Senza progetto',
        href: `/attivita/${t.code}`,
      })),
    ...projects
      .filter((p) => `${p.code} ${p.title} ${p.description ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((p) => ({
        kind: 'progetto' as const,
        label: p.title,
        sublabel: p.code,
        href: `/progetti/${p.code}`,
      })),
    ...organizations
      .filter((o) => `${o.name} ${o.notes ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((o) => ({
        kind: 'organizzazione' as const,
        label: o.name,
        sublabel: `${o.projectCount} progetti · ${o.contactCount} persone`,
        href: `/organizzazioni/${o.id}`,
      })),
    ...contacts
      .filter((c) => `${c.firstName} ${c.lastName} ${c.role ?? ''} ${c.organizationName ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((c) => ({
        kind: 'persona' as const,
        label: `${c.firstName} ${c.lastName}`.trim(),
        sublabel: [c.role, c.organizationName].filter(Boolean).join(' · ') || 'Nessuna organizzazione',
        href: '/contatti',
      })),
    ...threads
      .filter((t) => `${t.subject} ${t.fromEmail} ${t.snippet}`.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((t) => ({
        kind: 'email' as const,
        label: t.subject,
        sublabel: `${t.fromName ?? t.fromEmail}`,
        href: `/inbox/${t.id}`,
      })),
  ];

  return NextResponse.json({ hits });
}
