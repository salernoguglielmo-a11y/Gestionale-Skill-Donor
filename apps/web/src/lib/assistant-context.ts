import {
  computeBriefCounts,
  formatDate,
  isOpen,
  isOverdue,
  matchesQuery,
  needsFollowUp,
  relativeSince,
  rollupByProject,
  sortTasks,
  staleLevel,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type SourceRef,
  type TaskSummary,
} from '@sdoh/core';
import { getDb, listApprovals, listDrafts, listProjects, listTasks, listThreads } from '@sdoh/db';

/**
 * Costruzione del contesto dell'assistente.
 *
 * Principio: al modello si dà solo ciò che serve alla domanda, mai l'intero
 * database. Il contesto è testo strutturato derivato dai dati registrati, e ogni
 * riga porta un identificativo citabile, così le "fonti" della risposta sono
 * verificabili e non inventate.
 */

const MAX_TASKS_IN_CONTEXT = 40;

export interface AssistantContextResult {
  text: string;
  sources: SourceRef[];
  /** Risposta calcolata direttamente sui dati, senza modello. */
  deterministicAnswer: string | null;
}

export async function buildAssistantContext(question: string, now = new Date()): Promise<AssistantContextResult> {
  const db = await getDb();
  const [tasks, projects, threads, drafts, approvals] = await Promise.all([
    listTasks(db),
    listProjects(db),
    listThreads(db),
    listDrafts(db),
    listApprovals(db, true),
  ]);

  const open = tasks.filter(isOpen);
  const counts = computeBriefCounts(tasks, now);
  const lower = question.toLowerCase();

  // Selezione mirata: si parte dalle attività pertinenti alla domanda, e solo
  // se la ricerca testuale non produce nulla si ricade sull'ordine di urgenza.
  const matched = open.filter((task) => matchesQuery(task, question));
  const relevant = (matched.length > 0 ? matched : sortTasks(open, 'urgenza', 'asc', now)).slice(
    0,
    MAX_TASKS_IN_CONTEXT,
  );

  const sources: SourceRef[] = relevant.map((task) => ({ kind: 'task', id: task.id, label: task.code }));

  const lines: string[] = [
    `Data di riferimento: ${formatDate(now)} (fuso Europe/Rome).`,
    '',
    'INDICATORI COMPLESSIVI (calcolati sui dati registrati):',
    `- attività aperte: ${counts.aperte} su ${tasks.length} totali`,
    `- scadute: ${counts.scadute}`,
    `- in scadenza entro 7 giorni: ${counts.inScadenza}`,
    `- priorità critiche: ${counts.prioritaCritiche}, alte: ${counts.prioritaAlte}`,
    `- ferme da 7+ giorni: ${counts.ferme7}, da 10+ giorni: ${counts.ferme10}`,
    `- in attesa con follow-up dovuto: ${counts.inAttesaConFollowUp}`,
    `- aperte senza prossimo passo: ${counts.senzaProssimoPasso}`,
    `- bozze in attesa di approvazione: ${drafts.filter((d) => d.status === 'generata' || d.status === 'in_revisione').length}`,
    `- proposte in attesa: ${approvals.length}`,
    `- conversazioni da classificare: ${threads.filter((t) => t.status === 'da_classificare').length}`,
    '',
    `ATTIVITÀ PERTINENTI (${relevant.length}${matched.length > 0 ? ', selezionate per corrispondenza testuale' : ', le più urgenti'}):`,
  ];

  for (const task of relevant) {
    lines.push(describeTask(task, now));
  }

  const projectRollup = rollupByProject(tasks, now).slice(0, 15);
  if (projectRollup.length > 0) {
    lines.push('', 'PROGETTI (solo attività aperte):');
    for (const row of projectRollup) {
      const project = projects.find((p) => p.id === row.projectId);
      lines.push(
        `- ${project?.code ?? 'senza-codice'} "${row.projectTitle}": ${row.aperte} aperte, ${row.scadute} scadute, ` +
          `${row.critiche} critiche, ${row.ferme} ferme. Prossimo passo: ${project?.nextStep ?? 'non definito'}.`,
      );
      if (project) sources.push({ kind: 'project', id: project.id, label: project.code });
    }
  }

  // Le email entrano nel contesto solo con i metadati; il corpo mai da qui.
  const relevantThreads = threads
    .filter((t) => t.status !== 'chiusa' && t.status !== 'ignorata')
    .slice(0, 12);
  if (relevantThreads.length > 0) {
    lines.push('', 'CONVERSAZIONI EMAIL (solo metadati):');
    for (const thread of relevantThreads) {
      lines.push(
        `- "${thread.subject}" da ${thread.fromName ?? thread.fromEmail}, ${formatDate(thread.lastMessageAt)}, ` +
          `stato ${thread.status}${thread.linkedTaskCodes.length ? `, collegata a ${thread.linkedTaskCodes.join(', ')}` : ''}` +
          `${thread.injectionFlagged ? ' [SEGNALATA COME POTENZIALMENTE MANIPOLATORIA]' : ''}`,
      );
      sources.push({ kind: 'email_thread', id: thread.id, label: thread.subject });
    }
  }

  return {
    text: lines.join('\n'),
    sources,
    deterministicAnswer: deterministicAnswer(lower, tasks, now),
  };
}

function describeTask(task: TaskSummary, now: Date): string {
  const parts = [
    `- ${task.code} "${task.title}"`,
    `stato ${TASK_STATUS_LABELS[task.status]}`,
    `priorità ${TASK_PRIORITY_LABELS[task.priority]}`,
    `progetto ${task.projectTitle ?? 'nessuno'}`,
    `scadenza ${task.dueDate ? formatDate(task.dueDate) : 'nessuna'}${isOverdue(task, now) ? ' (SCADUTA)' : ''}`,
    `ultimo aggiornamento ${relativeSince(task.lastUpdateAt, now)}`,
  ];
  const stale = staleLevel(task, now);
  if (stale !== 'nessuno') parts.push(`FERMA (${stale})`);
  if (task.waitingOnThirdParty) parts.push(`in attesa di ${task.waitingOn ?? 'terzi'}`);
  if (needsFollowUp(task, now)) parts.push('FOLLOW-UP DOVUTO');
  parts.push(`prossimo passo: ${task.nextStep ?? 'NON DEFINITO'}`);
  return parts.join(' · ');
}

/**
 * Alcune domande hanno una risposta esatta calcolabile sui dati: in quei casi
 * l'elenco viene prodotto qui e mostrato accanto alla risposta del modello, così
 * i numeri non dipendono dalla capacità del modello di contare.
 */
function deterministicAnswer(lower: string, tasks: TaskSummary[], now: Date): string | null {
  const open = tasks.filter(isOpen);

  if (/ferm[ae]|inattiv|dieci giorni|10 giorni|ferme da/.test(lower)) {
    const days = /dieci|10/.test(lower) ? 10 : 7;
    const list = open
      .filter((t) => staleLevel(t, now) !== 'nessuno')
      .filter((t) => (days === 10 ? staleLevel(t, now) === 'critico' : true))
      .sort((a, b) => a.lastUpdateAt.getTime() - b.lastUpdateAt.getTime());
    if (list.length === 0) return `Nessuna attività aperta è ferma da più di ${days} giorni.`;
    return [
      `Attività ferme da più di ${days} giorni (${list.length}), dalla più silenziosa:`,
      ...list.map((t) => `• ${t.code} — ${t.title} (${relativeSince(t.lastUpdateAt, now)})`),
    ].join('\n');
  }

  if (/senza prossimo passo|nessun prossimo passo|non hanno un prossimo passo/.test(lower)) {
    const list = open.filter((t) => !t.nextStep?.trim());
    if (list.length === 0) return 'Tutte le attività aperte hanno un prossimo passo definito.';
    return [
      `Attività aperte senza prossimo passo (${list.length}):`,
      ...list.map((t) => `• ${t.code} — ${t.title} (progetto: ${t.projectTitle ?? 'nessuno'})`),
    ].join('\n');
  }

  if (/cosa devo fare oggi|che cosa devo fare|priorit[àa] di oggi/.test(lower)) {
    const list = sortTasks(open, 'urgenza', 'asc', now).slice(0, 10);
    return [
      'Le dieci attività più urgenti oggi, per priorità, scadenza e giorni di inattività:',
      ...list.map(
        (t) =>
          `• ${t.code} — ${t.title} (${TASK_PRIORITY_LABELS[t.priority]}${
            t.dueDate ? `, scadenza ${formatDate(t.dueDate)}` : ''
          }${isOverdue(t, now) ? ', SCADUTA' : ''}) → ${t.nextStep ?? 'prossimo passo non definito'}`,
      ),
    ].join('\n');
  }

  return null;
}
