import {
  TASK_PRIORITY_LABELS,
  TASK_SOURCE_LABELS,
  TASK_STATUS_LABELS,
  ACTOR_TYPE_LABELS,
} from './enums';
import { formatDate, formatDateTime } from './time';
import type { TaskSummary } from './types';

/**
 * Escaping CSV secondo RFC 4180, con una precauzione in più: i valori che
 * iniziano con `= + - @` vengono prefissati con un apostrofo, altrimenti Excel
 * e Google Sheets li interpretano come formule (CSV injection).
 */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  // BOM: senza, Excel in ambiente italiano rende male gli accenti.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const TASK_CSV_HEADERS = [
  'Codice',
  'Titolo',
  'Stato',
  'Priorità',
  'Progetto',
  'Responsabile',
  'Scadenza',
  'Prossimo passo',
  'In attesa di terzi',
  'In attesa di',
  'Follow-up previsto',
  'Motivo del blocco',
  'Ultimo aggiornamento',
  'Provenienza',
  'Aggiornata da',
  'Confidenza AI',
  'Descrizione',
];

export function tasksToCsv(tasks: TaskSummary[]): string {
  return toCsv(
    TASK_CSV_HEADERS,
    tasks.map((t) => [
      t.code,
      t.title,
      TASK_STATUS_LABELS[t.status],
      TASK_PRIORITY_LABELS[t.priority],
      t.projectTitle ?? '',
      t.ownerName ?? '',
      t.dueDate ? formatDate(t.dueDate) : '',
      t.nextStep ?? '',
      t.waitingOnThirdParty ? 'Sì' : 'No',
      t.waitingOn ?? '',
      t.followUpDate ? formatDate(t.followUpDate) : '',
      t.blockedReason ?? '',
      formatDateTime(t.lastUpdateAt),
      TASK_SOURCE_LABELS[t.source],
      ACTOR_TYPE_LABELS[t.updatedByType],
      t.aiConfidence == null ? '' : `${Math.round(t.aiConfidence * 100)}%`,
      t.description ?? '',
    ]),
  );
}
