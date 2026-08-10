import {
  TASK_PRIORITIES,
  TASK_QUICK_FILTERS,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
  type TaskFilter,
  type TaskPriority,
  type TaskQuickFilter,
  type TaskSortField,
  type TaskStatus,
} from '@sdoh/core';

/**
 * Traduce la query string in un `TaskFilter` validato.
 * Ogni valore è confrontato con gli enum di dominio: un parametro manomesso
 * viene ignorato, non propagato in una query.
 */
export function parseTaskFilter(params: URLSearchParams): TaskFilter & { layout: 'tabella' | 'kanban' } {
  const pick = <T extends string>(key: string, allowed: readonly T[]): T[] =>
    params.getAll(key).filter((v): v is T => (allowed as readonly string[]).includes(v));

  const sort = params.get('sort');
  const direction = params.get('dir');
  const layout = params.get('vista') === 'kanban' ? 'kanban' : 'tabella';
  const query = params.get('q')?.slice(0, 200) ?? '';

  return {
    ...(query ? { query } : {}),
    status: pick<TaskStatus>('status', TASK_STATUSES),
    priority: pick<TaskPriority>('priority', TASK_PRIORITIES),
    projectId: params.getAll('project'),
    quick: pick<TaskQuickFilter>('quick', TASK_QUICK_FILTERS),
    sort: (TASK_SORT_FIELDS as readonly string[]).includes(sort ?? '')
      ? (sort as TaskSortField)
      : ('urgenza' as TaskSortField),
    direction: direction === 'desc' ? 'desc' : 'asc',
    layout,
  };
}

/** Costruisce una `URLSearchParams` dai searchParams di Next. */
export function toSearchParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) for (const v of value) params.append(key, v);
    else if (typeof value === 'string') params.append(key, value);
  }
  return params;
}
