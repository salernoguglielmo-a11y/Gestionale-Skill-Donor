import { countPending, getDb, listTasks } from '@sdoh/db';
import { needsFollowUp } from '@sdoh/core';
import { Badge, Button } from '@sdoh/ui';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { BrandWordmark } from '@/components/brand';
import { CommandPalette } from '@/components/command-palette';
import { SidebarNav } from '@/components/nav';
import { requireUser } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const [pending, tasks] = await Promise.all([countPending(db), listTasks(db)]);
  const waiting = tasks.filter((t) => needsFollowUp(t)).length;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Vai al contenuto principale
      </a>

      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link href="/oggi" className="shrink-0 rounded" aria-label="Skill Donor Operations Hub">
          <BrandWordmark />
        </Link>

        <div className="ml-2 hidden flex-1 md:flex">
          <CommandPalette />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user.mode === 'demo' ? (
            <Badge tone="warning" title="Sessione dimostrativa: nessun servizio esterno è collegato.">
              Modalità demo
            </Badge>
          ) : (
            <Badge tone="success">Accesso Google</Badge>
          )}
          <span className="hidden text-xs text-muted lg:inline">{user.email}</span>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" size="sm" variant="ghost" aria-label="Esci">
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Esci</span>
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-line bg-surface lg:w-56 lg:border-b-0 lg:border-r">
          <div className="sd-scroll-x lg:sticky lg:top-12 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            <SidebarNav
              counts={{
                bozzeInAttesa: pending.drafts + pending.approvals,
                emailDaClassificare: pending.unclassifiedThreads,
                inAttesa: waiting,
              }}
            />
          </div>
        </aside>

        <main id="contenuto" className="min-w-0 flex-1 p-3 lg:p-5">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
