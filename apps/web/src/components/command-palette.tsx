'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Badge } from '@sdoh/ui';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { SearchHit } from '@/app/api/search/route';

const KIND_LABELS: Record<SearchHit['kind'], string> = {
  attivita: 'Attività',
  progetto: 'Progetto',
  organizzazione: 'Organizzazione',
  persona: 'Persona',
  email: 'Email',
};

const SHORTCUTS: SearchHit[] = [
  { kind: 'attivita', label: 'Vai a Oggi', sublabel: 'Dashboard operativa', href: '/oggi' },
  { kind: 'attivita', label: 'Nuova attività', sublabel: 'Crea un’attività manualmente', href: '/attivita/nuova' },
  { kind: 'email', label: 'Inbox operativa', sublabel: 'Thread Gmail sincronizzati', href: '/inbox' },
  { kind: 'attivita', label: 'In attesa di terzi', sublabel: 'Follow-up da fare', href: '/in-attesa' },
  { kind: 'progetto', label: 'Progetti e matching', sublabel: 'Elenco progetti', href: '/progetti' },
];

/**
 * Palette dei comandi (⌘K / Ctrl+K) e ricerca globale.
 * La navigazione da tastiera è completa: frecce, Invio, Esc.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchHit[]>([]);
  const [active, setActive] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  // I risultati sono derivati, non copiati in stato: sotto i due caratteri si
  // mostrano le scorciatoie, sopra quelli restituiti dalla ricerca.
  const hits = searching ? results : SHORTCUTS;
  // L'indice attivo viene limitato durante il render, così non serve azzerarlo
  // con un effetto ogni volta che l'elenco cambia.
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0));

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (!open || !searching) return;

    // Debounce: evita una richiesta per ogni tasto premuto.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { hits?: SearchHit[] };
        setResults(data.hits ?? []);
        setActive(0);
      } catch {
        // Richiesta annullata o rete non disponibile: si mantiene l'elenco corrente.
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, searching, open]);

  const go = React.useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      setOpen(false);
      setQuery('');
      router.push(hit.href);
    },
    [router],
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-xs text-muted hover:border-brand-border hover:bg-brand-tint"
        >
          <Search className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
          <span className="flex-1 truncate">Cerca attività, progetti, persone, email…</span>
          <kbd className="hidden rounded border border-line bg-surface-sunken px-1 font-mono text-[10px] text-muted sm:inline">
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-strong/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface shadow-xl"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive(Math.min(activeIndex + 1, hits.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(Math.max(activeIndex - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              go(hits[activeIndex]);
            }
          }}
        >
          <Dialog.Title className="sr-only">Ricerca globale</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 text-faint" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca attività, progetti, persone, email…"
              aria-label="Ricerca globale"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            {loading ? <span className="text-[10px] text-muted">Ricerca…</span> : null}
          </div>

          <ul className="max-h-80 overflow-y-auto py-1" role="listbox" aria-label="Risultati">
            {hits.length === 0 ? (
              <li className="px-4 py-6 text-center text-xs text-muted">
                Nessun risultato per «{query.trim()}».
              </li>
            ) : (
              hits.map((hit, index) => (
                <li key={`${hit.href}-${hit.label}`} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      index === activeIndex ? 'bg-brand-tint' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink-strong">{hit.label}</span>
                      <span className="block truncate text-[11px] text-muted">{hit.sublabel}</span>
                    </span>
                    <Badge tone="outline">{KIND_LABELS[hit.kind]}</Badge>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-line bg-surface-sunken px-3 py-1.5 text-[10px] text-muted">
            ↑↓ per navigare · Invio per aprire · Esc per chiudere
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
