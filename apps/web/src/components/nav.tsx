'use client';

import { cn } from '@sdoh/ui';
import {
  Bot,
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  FolderKanban,
  History,
  Inbox,
  LayoutDashboard,
  PenLine,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavCounts {
  bozzeInAttesa: number;
  emailDaClassificare: number;
  inAttesa: number;
}

const SECTIONS: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: keyof NavCounts }>;
}> = [
  {
    label: 'Operatività',
    items: [
      { href: '/oggi', label: 'Oggi', icon: LayoutDashboard },
      { href: '/attivita', label: 'Attività', icon: ClipboardList },
      { href: '/in-attesa', label: 'In attesa', icon: CalendarClock, badge: 'inAttesa' },
      { href: '/inbox', label: 'Inbox operativa', icon: Inbox, badge: 'emailDaClassificare' },
      { href: '/bozze', label: 'Bozze', icon: PenLine, badge: 'bozzeInAttesa' },
    ],
  },
  {
    label: 'Anagrafiche',
    items: [
      { href: '/progetti', label: 'Progetti e matching', icon: FolderKanban },
      { href: '/organizzazioni', label: 'Organizzazioni', icon: Building2 },
      { href: '/contatti', label: 'Persone', icon: Users },
      { href: '/documenti', label: 'Documenti', icon: FileText },
    ],
  },
  {
    label: 'Controllo',
    items: [
      { href: '/assistente', label: 'Assistente', icon: Bot },
      { href: '/registro-ai', label: 'Registro AI', icon: History },
      { href: '/audit', label: 'Audit log', icon: ShieldCheck },
      { href: '/impostazioni', label: 'Impostazioni', icon: Settings },
    ],
  },
];

export function SidebarNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigazione principale" className="flex flex-col gap-4 py-3">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const count = item.badge ? counts[item.badge] : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors',
                      active
                        ? 'bg-brand-tint font-medium text-brand-deep sd-accent-bar'
                        : 'text-ink hover:bg-surface-sunken',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-faint')} />
                    <span className="truncate">{item.label}</span>
                    {count > 0 ? (
                      <span className="ml-auto rounded-full bg-brand px-1.5 text-[10px] font-semibold leading-4 text-white">
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
