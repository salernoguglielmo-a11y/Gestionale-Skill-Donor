import {
  APPROVAL_STATUS_LABELS,
  DRAFT_STATUS_LABELS,
  ORGANIZATION_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  THREAD_STATUS_LABELS,
  type ApprovalStatus,
  type DraftStatus,
  type OrganizationType,
  type TaskPriority,
  type TaskStatus,
  type ThreadStatus,
} from '@sdoh/core';
import { Badge } from './primitives';

/**
 * Rappresentazione visiva degli stati di dominio, definita una sola volta.
 * Colore e forma non sono l'unico veicolo dell'informazione: ogni badge porta
 * sempre l'etichetta testuale, requisito WCAG 1.4.1.
 */

const STATUS_TONES: Record<TaskStatus, 'neutral' | 'brand' | 'danger' | 'warning' | 'success' | 'info' | 'outline'> = {
  da_fare: 'neutral',
  in_lavorazione: 'brand',
  in_attesa: 'info',
  bloccata: 'danger',
  da_verificare: 'warning',
  completata: 'success',
  archiviata: 'outline',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

const PRIORITY_TONES: Record<TaskPriority, 'danger' | 'warning' | 'neutral' | 'outline'> = {
  critica: 'danger',
  alta: 'warning',
  media: 'neutral',
  bassa: 'outline',
};

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge tone={PRIORITY_TONES[priority]}>
      <span aria-hidden="true" className="font-mono text-[10px]">
        {priority === 'critica' ? '!!' : priority === 'alta' ? '!' : '·'}
      </span>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

const THREAD_TONES: Record<ThreadStatus, 'neutral' | 'brand' | 'warning' | 'info' | 'success' | 'outline'> = {
  da_classificare: 'warning',
  collegata: 'brand',
  risposta_da_preparare: 'info',
  in_attesa: 'neutral',
  chiusa: 'success',
  ignorata: 'outline',
};

export function ThreadStatusBadge({ status }: { status: ThreadStatus }) {
  return <Badge tone={THREAD_TONES[status]}>{THREAD_STATUS_LABELS[status]}</Badge>;
}

const DRAFT_TONES: Record<DraftStatus, 'neutral' | 'warning' | 'success' | 'danger' | 'brand'> = {
  generata: 'neutral',
  in_revisione: 'warning',
  approvata: 'success',
  rifiutata: 'danger',
  trasferita_gmail: 'brand',
};

export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return <Badge tone={DRAFT_TONES[status]}>{DRAFT_STATUS_LABELS[status]}</Badge>;
}

const APPROVAL_TONES: Record<ApprovalStatus, 'warning' | 'success' | 'danger' | 'outline'> = {
  in_attesa: 'warning',
  approvata: 'success',
  rifiutata: 'danger',
  scaduta: 'outline',
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={APPROVAL_TONES[status]}>{APPROVAL_STATUS_LABELS[status]}</Badge>;
}

const ORG_TONES: Record<OrganizationType, 'brand' | 'info' | 'success' | 'neutral' | 'outline'> = {
  skill_donor: 'brand',
  ets: 'success',
  donor: 'info',
  partner: 'info',
  fornitore: 'neutral',
  istituzione: 'neutral',
  altro: 'outline',
};

export function OrganizationTypeBadge({ type }: { type: OrganizationType }) {
  return <Badge tone={ORG_TONES[type]}>{ORGANIZATION_TYPE_LABELS[type]}</Badge>;
}

/** Indicatore di stallo: 7 giorni = attenzione, 10 = critico. */
export function StaleBadge({ level, days }: { level: 'attenzione' | 'critico'; days: number }) {
  return (
    <Badge tone={level === 'critico' ? 'danger' : 'warning'}>
      Ferma da {days} {days === 1 ? 'giorno' : 'giorni'}
    </Badge>
  );
}

/** Etichetta obbligatoria su tutto ciò che proviene da un adapter mock. */
export function DemoBadge({ label = 'Dati dimostrativi' }: { label?: string }) {
  return (
    <Badge tone="warning" title="Contenuto generato in modalità demo: nessun servizio esterno è stato contattato.">
      {label}
    </Badge>
  );
}
