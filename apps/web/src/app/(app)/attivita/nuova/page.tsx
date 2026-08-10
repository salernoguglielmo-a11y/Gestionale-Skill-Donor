import { getDb, listProjects } from '@sdoh/db';
import { Card } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TaskForm } from '@/components/task-form';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Nuova attività' };
export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  await requireUser();
  const db = await getDb();
  const projects = await listProjects(db);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <nav aria-label="Percorso" className="text-xs text-muted">
        <Link href="/attivita" className="hover:underline">
          Attività
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Nuova</span>
      </nav>

      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Nuova attività</h1>
        <p className="text-xs text-muted">
          Il codice (<span className="font-mono">SD-…</span>) viene assegnato automaticamente alla creazione.
        </p>
      </header>

      <Card className="p-4">
        <TaskForm projects={projects} mode="crea" />
      </Card>
    </div>
  );
}
