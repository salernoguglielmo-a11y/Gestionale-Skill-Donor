'use client';

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_QUICK_FILTERS,
  TASK_QUICK_FILTER_LABELS,
  TASK_SORT_FIELDS,
  TASK_SORT_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type ProjectSummary,
} from '@sdoh/core';
import { Button, cn, Input, Select } from '@sdoh/ui';
import { Download, Save, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { saveViewAction, type ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

/**
 * Barra filtri. Lo stato vive nella query string, non in `useState`: un filtro
 * si può copiare, mettere nei preferiti e ricaricare, e la dashboard può linkare
 * direttamente una lista già filtrata.
 */
export function TaskFilters({
  projects,
  layout,
  total,
  shown,
}: {
  projects: ProjectSummary[];
  layout: 'tabella' | 'kanban';
  total: number;
  shown: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [query, setQuery] = React.useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = React.useState(urlQuery);
  const [saveResult, setSaveResult] = React.useState<ActionResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Il campo si riallinea quando l'URL cambia dall'esterno (vista salvata,
  // "Azzera filtri", pulsante indietro). L'aggiustamento avviene durante il
  // render, non in un effetto: evita il render a cascata.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  /**
   * Le modifiche partono sempre dall'URL corrente del browser, non dallo
   * snapshot `params` catturato al render: digitare nella ricerca e cliccare
   * subito un filtro sono due aggiornamenti ravvicinati, e con una closure
   * vecchia il secondo cancellerebbe il primo.
   */
  const update = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(window.location.search);
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Debounce sulla ricerca: la navigazione non riparte a ogni tasto.
  React.useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => {
      update((next) => {
        if (query.trim()) next.set('q', query.trim());
        else next.delete('q');
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, urlQuery, update]);

  const activeQuick = params.getAll('quick');
  const activeStatus = params.getAll('status');
  const activePriority = params.getAll('priority');
  const activeProject = params.getAll('project');
  const hasFilters =
    activeQuick.length + activeStatus.length + activePriority.length + activeProject.length > 0 || Boolean(params.get('q'));

  const toggleMulti = (key: string, value: string) =>
    update((next) => {
      const values = next.getAll(key);
      next.delete(key);
      const remaining = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      for (const v of remaining) next.append(key, v);
    });

  const exportHref = `/api/tasks/export?${params.toString()}`;

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca per codice, titolo, prossimo passo, progetto…"
          aria-label="Cerca fra le attività"
          className="h-8 min-w-56 flex-1 text-xs"
        />

        <Select
          aria-label="Vista"
          value={layout}
          onChange={(event) =>
            update((next) => {
              next.set('vista', event.target.value);
            })
          }
          className="h-8 w-auto text-xs"
        >
          <option value="tabella">Vista tabella</option>
          <option value="kanban">Vista Kanban</option>
        </Select>

        <Select
          aria-label="Ordinamento"
          value={params.get('sort') ?? 'urgenza'}
          onChange={(event) =>
            update((next) => {
              next.set('sort', event.target.value);
            })
          }
          className="h-8 w-auto text-xs"
        >
          {TASK_SORT_FIELDS.map((field) => (
            <option key={field} value={field}>
              Ordina per {TASK_SORT_LABELS[field].toLowerCase()}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Direzione ordinamento"
          value={params.get('dir') ?? 'asc'}
          onChange={(event) =>
            update((next) => {
              next.set('dir', event.target.value);
            })
          }
          className="h-8 w-auto text-xs"
        >
          <option value="asc">Crescente</option>
          <option value="desc">Decrescente</option>
        </Select>

        <Button asChild size="sm" variant="secondary">
          <a href={exportHref} download>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {TASK_QUICK_FILTERS.map((quick) => (
          <FilterChip
            key={quick}
            active={activeQuick.includes(quick)}
            onClick={() => toggleMulti('quick', quick)}
            label={TASK_QUICK_FILTER_LABELS[quick]}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {TASK_PRIORITIES.map((priority) => (
          <FilterChip
            key={priority}
            active={activePriority.includes(priority)}
            onClick={() => toggleMulti('priority', priority)}
            label={TASK_PRIORITY_LABELS[priority]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filtra per stato"
          value=""
          onChange={(event) => {
            if (event.target.value) toggleMulti('status', event.target.value);
          }}
          className="h-8 w-auto text-xs"
        >
          <option value="">Aggiungi filtro stato…</option>
          {TASK_STATUSES.filter((s) => !activeStatus.includes(s)).map((status) => (
            <option key={status} value={status}>
              {TASK_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filtra per progetto"
          value=""
          onChange={(event) => {
            if (event.target.value) toggleMulti('project', event.target.value);
          }}
          className="h-8 w-auto max-w-64 text-xs"
        >
          <option value="">Aggiungi filtro progetto…</option>
          {projects
            .filter((p) => !activeProject.includes(p.id))
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
        </Select>

        {activeStatus.map((status) => (
          <FilterChip
            key={status}
            active
            removable
            onClick={() => toggleMulti('status', status)}
            label={TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] ?? status}
          />
        ))}
        {activeProject.map((id) => (
          <FilterChip
            key={id}
            active
            removable
            onClick={() => toggleMulti('project', id)}
            label={projects.find((p) => p.id === id)?.title ?? 'Progetto'}
          />
        ))}

        {hasFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery('');
              router.replace(pathname, { scroll: false });
            }}
          >
            Azzera filtri
          </Button>
        ) : null}

        <span className="ml-auto text-[11px] text-muted">
          {shown} di {total} attività
        </span>

        <form
          action={(formData) => {
            formData.set('filter', JSON.stringify(currentFilter(params)));
            formData.set('layout', layout);
            startTransition(async () => setSaveResult(await saveViewAction(null, formData)));
          }}
          className="flex items-center gap-1"
        >
          <Input
            name="name"
            placeholder="Nome vista"
            aria-label="Nome della vista da salvare"
            className="h-8 w-32 text-xs"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Salva vista
          </Button>
        </form>
      </div>

      <ActionFeedback result={saveResult} />
    </div>
  );
}

function FilterChip({
  label,
  active,
  removable,
  onClick,
}: {
  label: string;
  active: boolean;
  removable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
        active
          ? 'border-brand bg-brand-tint font-medium text-brand-deep'
          : 'border-line bg-surface text-muted hover:border-brand-border hover:bg-brand-tint',
      )}
    >
      {label}
      {removable ? <X className="h-3 w-3" aria-hidden="true" /> : null}
    </button>
  );
}

/** Ricostruisce il filtro serializzabile dalla query string corrente. */
function currentFilter(params: URLSearchParams) {
  return {
    ...(params.get('q') ? { query: params.get('q') } : {}),
    ...(params.getAll('status').length ? { status: params.getAll('status') } : {}),
    ...(params.getAll('priority').length ? { priority: params.getAll('priority') } : {}),
    ...(params.getAll('project').length ? { projectId: params.getAll('project') } : {}),
    ...(params.getAll('quick').length ? { quick: params.getAll('quick') } : {}),
    sort: params.get('sort') ?? 'urgenza',
    direction: params.get('dir') ?? 'asc',
  };
}
