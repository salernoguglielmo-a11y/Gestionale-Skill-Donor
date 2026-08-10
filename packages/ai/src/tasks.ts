import { wrapUntrusted, type SourceRef } from '@sdoh/core';
import { ASSISTANT_SYSTEM, CLASSIFY_SYSTEM, DRAFT_SYSTEM, PROMPT_TEMPLATES, REVIEW_SYSTEM } from './prompts';
import type { AiProviderAdapter, GenerateResult } from './provider';
import {
  assistantAnswerSchema,
  classificationSchema,
  draftSchema,
  reviewSchema,
  type AssistantAnswer,
  type Classification,
  type DraftOutput,
  type ReviewOutput,
} from './schemas';

/**
 * Operazioni AI di alto livello. Qui e solo qui i contenuti esterni vengono
 * incapsulati con `wrapUntrusted` prima di raggiungere un provider.
 */

export interface ThreadContext {
  subject: string;
  fromName: string | null;
  fromEmail: string;
  receivedAt: string;
  snippet: string;
  /** Corpo recuperato su richiesta. Assente per impostazione predefinita. */
  body?: string | null;
  projectHints: Array<{ code: string; title: string }>;
}

export async function classifyThread(
  provider: AiProviderAdapter,
  ctx: ThreadContext,
): Promise<GenerateResult<Classification>> {
  const untrusted = wrapUntrusted(
    [`Oggetto: ${ctx.subject}`, `Mittente: ${ctx.fromName ?? ''} <${ctx.fromEmail}>`, '', ctx.body ?? ctx.snippet].join(
      '\n',
    ),
    { label: `email ricevuta il ${ctx.receivedAt}`, maxLength: 6_000 },
  );

  const prompt = [
    'Classifica la seguente conversazione email ai fini operativi di Skill Donor.',
    '',
    'Progetti esistenti fra cui scegliere (usa il codice esatto oppure null):',
    ctx.projectHints.length
      ? ctx.projectHints.map((p) => `- ${p.code}: ${p.title}`).join('\n')
      : '- (nessun progetto registrato)',
    '',
    untrusted,
  ].join('\n');

  return provider.generate({
    system: CLASSIFY_SYSTEM,
    prompt,
    schema: classificationSchema,
    schemaName: 'classificazione',
    maxOutputTokens: 800,
  });
}

export interface DraftContext {
  thread: ThreadContext | null;
  taskSummary: string | null;
  instruction: string | null;
  /** Fatti registrati che la bozza può citare senza inventare. */
  facts: string[];
}

export async function draftReply(
  provider: AiProviderAdapter,
  ctx: DraftContext,
): Promise<GenerateResult<DraftOutput>> {
  const parts: string[] = ['Prepara una bozza di risposta in italiano.'];

  if (ctx.taskSummary) parts.push('', 'Attività collegata (dato registrato):', ctx.taskSummary);
  if (ctx.facts.length) {
    parts.push('', 'Fatti registrati nell’Hub, utilizzabili senza verifiche ulteriori:');
    parts.push(...ctx.facts.map((f) => `- ${f}`));
  }
  if (ctx.instruction) {
    parts.push('', 'Indicazione dell’utente (fonte affidabile):', ctx.instruction.slice(0, 2_000));
  }
  if (ctx.thread) {
    parts.push(
      '',
      'Conversazione a cui rispondere:',
      wrapUntrusted(
        [
          `Oggetto: ${ctx.thread.subject}`,
          `Mittente: ${ctx.thread.fromName ?? ''} <${ctx.thread.fromEmail}>`,
          '',
          ctx.thread.body ?? ctx.thread.snippet,
        ].join('\n'),
        { label: `email ricevuta il ${ctx.thread.receivedAt}`, maxLength: 6_000 },
      ),
    );
  }

  return provider.generate({
    system: DRAFT_SYSTEM,
    prompt: parts.join('\n'),
    schema: draftSchema,
    schemaName: 'bozza',
    maxOutputTokens: 2_000,
  });
}

export async function reviewDraft(
  provider: AiProviderAdapter,
  input: { subject: string; body: string; sourceExcerpt: string | null },
): Promise<GenerateResult<ReviewOutput>> {
  const parts = [
    'Rivedi criticamente la seguente bozza prodotta da un altro modello.',
    '',
    'Bozza da rivedere (prodotta internamente, non è un dato esterno):',
    `Oggetto: ${input.subject}`,
    input.body.slice(0, 12_000),
  ];
  if (input.sourceExcerpt) {
    parts.push(
      '',
      'Contenuto di origine:',
      wrapUntrusted(input.sourceExcerpt, { label: 'contenuto di origine', maxLength: 4_000 }),
    );
  }

  return provider.generate({
    system: REVIEW_SYSTEM,
    prompt: parts.join('\n'),
    schema: reviewSchema,
    schemaName: 'revisione',
    maxOutputTokens: 1_500,
  });
}

export interface AssistantContext {
  question: string;
  /** Contesto strutturato già filtrato: data minimization verso il provider. */
  structuredContext: string;
  sources: SourceRef[];
}

export async function answerAssistant(
  provider: AiProviderAdapter,
  ctx: AssistantContext,
): Promise<GenerateResult<AssistantAnswer>> {
  const prompt = [
    'Contesto operativo (dati registrati nell’Hub):',
    ctx.structuredContext,
    '',
    'Domanda dell’utente (fonte affidabile):',
    ctx.question.slice(0, 1_000),
  ].join('\n');

  return provider.generate({
    system: ASSISTANT_SYSTEM,
    prompt,
    schema: assistantAnswerSchema,
    schemaName: 'assistente',
    maxOutputTokens: 2_000,
  });
}

export { PROMPT_TEMPLATES };
