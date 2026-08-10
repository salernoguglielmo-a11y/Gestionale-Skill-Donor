import { randomUUID } from 'node:crypto';
import type { ActorType } from '@sdoh/core';
import { redact } from '@sdoh/core';
import type { Db } from './client';
import * as t from './schema';

/**
 * Scrittura sull'audit log. È l'unico punto da cui passano le registrazioni:
 * i valori vengono redatti prima di essere persistiti, così un token o un
 * indirizzo email completo non finisce nel registro neppure per errore.
 */

export interface AuditInput {
  actorType: ActorType;
  actorLabel: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  source: string;
  sessionRef?: string | null;
  correlationId?: string | null;
}

export async function recordAudit(db: Db, input: AuditInput): Promise<string> {
  const correlationId = input.correlationId ?? randomUUID();
  await db.insert(t.auditLog).values({
    actorType: input.actorType,
    actorLabel: input.actorLabel,
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    previousValue: input.previousValue === undefined ? null : (redact(input.previousValue) as never),
    newValue: input.newValue === undefined ? null : (redact(input.newValue) as never),
    source: input.source,
    sessionRef: input.sessionRef ?? null,
    correlationId,
  });
  return correlationId;
}

export interface AiActionInput {
  action: string;
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  inputSummary: string;
  sourceRefs?: Array<{ kind: string; id: string; label: string }>;
  confidence?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  outcome: string;
  errorMessage?: string | null;
  correlationId?: string | null;
}

/** Registro AI: una riga per ogni chiamata a un provider, riuscita o fallita. */
export async function recordAiAction(db: Db, input: AiActionInput): Promise<void> {
  await db.insert(t.aiActions).values({
    action: input.action,
    provider: input.provider,
    model: input.model,
    inputSummary: String(redact(input.inputSummary)),
    sourceRefs: input.sourceRefs ?? [],
    confidence: input.confidence ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    latencyMs: input.latencyMs ?? null,
    outcome: input.outcome,
    errorMessage: input.errorMessage ? String(redact(input.errorMessage)) : null,
    correlationId: input.correlationId ?? null,
  });
}

export async function recordTaskEvent(
  db: Db,
  input: {
    taskId: string;
    kind: string;
    summary: string;
    detail?: unknown;
    actorType?: ActorType;
    actorLabel?: string;
  },
): Promise<void> {
  await db.insert(t.taskEvents).values({
    taskId: input.taskId,
    kind: input.kind,
    summary: input.summary,
    detail: (input.detail === undefined ? null : redact(input.detail)) as never,
    actorType: input.actorType ?? 'umano',
    actorLabel: input.actorLabel ?? 'Utente',
  });
}
