import { OPEN_TASK_STATUSES, TASK_PRIORITY_WEIGHT, type TaskPriority, type TaskStatus } from './enums';
import { daysSince, daysUntil } from './time';
import type { TaskSummary } from './types';

/**
 * Regole operative di Skill Donor. Sono funzioni pure: la dashboard, l'assistente
 * interno e i tool MCP devono produrre gli stessi numeri partendo dagli stessi dati.
 */

/** Soglie di "attività ferma", in giorni dall'ultimo aggiornamento. */
export const STALE_WARNING_DAYS = 7;
export const STALE_CRITICAL_DAYS = 10;

/** Finestra entro cui una scadenza è considerata "in arrivo". */
export const DUE_SOON_DAYS = 7;

export function isOpen(task: Pick<TaskSummary, 'status'>): boolean {
  return OPEN_TASK_STATUSES.includes(task.status);
}

export function isOverdue(task: Pick<TaskSummary, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (!task.dueDate || !isOpen(task)) return false;
  return daysUntil(task.dueDate, now) < 0;
}

export function isDueSoon(task: Pick<TaskSummary, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (!task.dueDate || !isOpen(task)) return false;
  const n = daysUntil(task.dueDate, now);
  return n >= 0 && n <= DUE_SOON_DAYS;
}

export type StaleLevel = 'nessuno' | 'attenzione' | 'critico';

/** Livello di stallo: `attenzione` da 7 giorni, `critico` da 10. */
export function staleLevel(
  task: Pick<TaskSummary, 'status' | 'lastUpdateAt'>,
  now = new Date(),
): StaleLevel {
  if (!isOpen(task)) return 'nessuno';
  const d = daysSince(task.lastUpdateAt, now);
  if (d >= STALE_CRITICAL_DAYS) return 'critico';
  if (d >= STALE_WARNING_DAYS) return 'attenzione';
  return 'nessuno';
}

export function isStale(task: Pick<TaskSummary, 'status' | 'lastUpdateAt'>, now = new Date()): boolean {
  return staleLevel(task, now) !== 'nessuno';
}

/** Attività in attesa di terzi il cui follow-up è dovuto (o mancante da troppo). */
export function needsFollowUp(
  task: Pick<TaskSummary, 'status' | 'waitingOnThirdParty' | 'followUpDate' | 'lastUpdateAt'>,
  now = new Date(),
): boolean {
  if (!task.waitingOnThirdParty || !isOpen(task)) return false;
  if (task.followUpDate) return daysUntil(task.followUpDate, now) <= 0;
  return daysSince(task.lastUpdateAt, now) >= STALE_WARNING_DAYS;
}

export function isHighPriority(task: Pick<TaskSummary, 'priority'>): boolean {
  return task.priority === 'critica' || task.priority === 'alta';
}

/**
 * Punteggio di urgenza usato per l'ordinamento predefinito di "Oggi".
 * Più basso = più in alto. Combina priorità, scadenza e stallo in un solo criterio,
 * così l'ordine è stabile e riproducibile anche lato MCP.
 */
export function urgencyScore(task: TaskSummary, now = new Date()): number {
  let score = TASK_PRIORITY_WEIGHT[task.priority] * 100;
  if (task.dueDate && isOpen(task)) {
    const n = daysUntil(task.dueDate, now);
    if (n < 0) score -= 400 + Math.min(Math.abs(n), 60);
    else if (n <= DUE_SOON_DAYS) score -= 120 - n * 10;
    else score -= Math.max(0, 40 - n);
  }
  const stale = staleLevel(task, now);
  if (stale === 'critico') score -= 60;
  else if (stale === 'attenzione') score -= 25;
  if (!isOpen(task)) score += 10_000;
  return score;
}

export interface DailyBriefCounts {
  scadute: number;
  inScadenza: number;
  prioritaCritiche: number;
  prioritaAlte: number;
  ferme7: number;
  ferme10: number;
  inAttesaConFollowUp: number;
  aperte: number;
  senzaProssimoPasso: number;
}

export function computeBriefCounts(tasks: TaskSummary[], now = new Date()): DailyBriefCounts {
  const open = tasks.filter(isOpen);
  return {
    scadute: open.filter((t) => isOverdue(t, now)).length,
    inScadenza: open.filter((t) => isDueSoon(t, now)).length,
    prioritaCritiche: open.filter((t) => t.priority === 'critica').length,
    prioritaAlte: open.filter((t) => t.priority === 'alta').length,
    ferme7: open.filter((t) => staleLevel(t, now) !== 'nessuno').length,
    ferme10: open.filter((t) => staleLevel(t, now) === 'critico').length,
    inAttesaConFollowUp: open.filter((t) => needsFollowUp(t, now)).length,
    aperte: open.length,
    senzaProssimoPasso: open.filter((t) => !t.nextStep || t.nextStep.trim() === '').length,
  };
}

export interface ProjectRollup {
  projectId: string | null;
  projectTitle: string;
  aperte: number;
  scadute: number;
  critiche: number;
  ferme: number;
  prossimaScadenza: Date | null;
}

export function rollupByProject(tasks: TaskSummary[], now = new Date()): ProjectRollup[] {
  const map = new Map<string, ProjectRollup>();
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    const key = t.projectId ?? '__none__';
    let row = map.get(key);
    if (!row) {
      row = {
        projectId: t.projectId,
        projectTitle: t.projectTitle ?? 'Senza progetto',
        aperte: 0,
        scadute: 0,
        critiche: 0,
        ferme: 0,
        prossimaScadenza: null,
      };
      map.set(key, row);
    }
    row.aperte += 1;
    if (isOverdue(t, now)) row.scadute += 1;
    if (t.priority === 'critica') row.critiche += 1;
    if (isStale(t, now)) row.ferme += 1;
    if (t.dueDate && (!row.prossimaScadenza || t.dueDate < row.prossimaScadenza)) {
      row.prossimaScadenza = t.dueDate;
    }
  }
  return [...map.values()].sort(
    (a, b) => b.scadute - a.scadute || b.critiche - a.critiche || b.aperte - a.aperte,
  );
}

/** Priorità suggerita a partire dai giorni mancanti alla scadenza. */
export function prioritySuggestionFromDueDate(dueDate: Date | null, now = new Date()): TaskPriority {
  if (!dueDate) return 'media';
  const n = daysUntil(dueDate, now);
  if (n <= 2) return 'critica';
  if (n <= 10) return 'alta';
  if (n <= 30) return 'media';
  return 'bassa';
}

export function statusAllowsCompletion(status: TaskStatus): boolean {
  return status !== 'archiviata';
}

export function priorityOrder(a: TaskPriority, b: TaskPriority): number {
  return TASK_PRIORITY_WEIGHT[a] - TASK_PRIORITY_WEIGHT[b];
}
