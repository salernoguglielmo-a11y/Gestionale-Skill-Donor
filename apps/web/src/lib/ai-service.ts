import {
  AiDisabledError,
  AiProviderError,
  answerAssistant,
  classifyThread,
  createRegistry,
  describeSelection,
  draftReply,
  PROMPT_TEMPLATES,
  reviewDraft,
  selectProviders,
  type AiSelection,
  type AssistantContext,
  type DraftContext,
  type ThreadContext,
} from '@sdoh/ai';
import type { SourceRef } from '@sdoh/core';
import { getDb, recordAiAction } from '@sdoh/db';
import { loadSettings } from './settings';

/**
 * Ponte fra l'astrazione AI e il resto dell'applicazione.
 *
 * Ogni operazione, riuscita o fallita, produce una riga nel registro AI con
 * provider, modello, confidenza, token e fonti: nessuna chiamata resta invisibile.
 */

export interface AiRunMeta {
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  degraded: boolean;
  degradedReason: string | null;
  description: string;
}

export async function currentSelection(): Promise<AiSelection> {
  const settings = await loadSettings();
  return selectProviders(settings.aiMode, createRegistry());
}

/** Stato dei provider da mostrare in Impostazioni, senza effettuare chiamate. */
export async function providerStatus() {
  const registry = createRegistry();
  const settings = await loadSettings();
  return {
    mode: settings.aiMode,
    openai: {
      available: registry.openai.available,
      model: registry.openai.model || null,
      reason: registry.openai.unavailableReason,
    },
    anthropic: {
      available: registry.anthropic.available,
      model: registry.anthropic.model || null,
      reason: registry.anthropic.unavailableReason,
    },
    mock: { available: true, model: registry.mock.model, reason: null },
  };
}

async function run<T>(
  action: string,
  sourceRefs: SourceRef[],
  inputSummary: string,
  fn: (selection: AiSelection) => Promise<{
    data: T;
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;
    latencyMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    confidence?: number | null;
  }>,
  correlationId?: string,
): Promise<{ data: T; meta: AiRunMeta }> {
  const db = await getDb();
  const selection = await currentSelection();

  try {
    const result = await fn(selection);
    await recordAiAction(db, {
      action,
      provider: result.provider,
      model: result.model,
      inputSummary,
      sourceRefs,
      confidence: result.confidence ?? null,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      outcome: selection.degraded ? 'riuscita_in_modalita_degradata' : 'riuscita',
      correlationId: correlationId ?? null,
    });

    return {
      data: result.data,
      meta: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        degraded: selection.degraded,
        degradedReason: selection.degradedReason,
        description: describeSelection(selection),
      },
    };
  } catch (error) {
    const provider = error instanceof AiProviderError ? error.provider : selection.primary.name;
    const model = error instanceof AiProviderError ? error.model : selection.primary.model;
    await recordAiAction(db, {
      action,
      provider,
      model,
      inputSummary,
      sourceRefs,
      outcome: 'errore',
      errorMessage: error instanceof Error ? error.message : 'Errore sconosciuto',
      correlationId: correlationId ?? null,
    });
    throw error;
  }
}

export async function runClassification(ctx: ThreadContext, sources: SourceRef[], correlationId?: string) {
  return run(
    'classificazione_email',
    sources,
    `Classificazione del thread "${ctx.subject}"`,
    async (selection) => {
      const result = await classifyThread(selection.primary, ctx);
      return { ...result, confidence: result.data.confidenza };
    },
    correlationId,
  );
}

export interface DraftRunResult {
  subject: string;
  body: string;
  reviewNotes: string;
  confidence: number;
  promptTemplate: string;
  review: {
    provider: 'openai' | 'anthropic' | 'mock';
    model: string;
    outcome: string;
    findings: string[];
    correctedBody: string | null;
    rationale: string;
  } | null;
}

export async function runDraft(
  ctx: DraftContext,
  sources: SourceRef[],
  correlationId?: string,
): Promise<{ data: DraftRunResult; meta: AiRunMeta }> {
  const { data, meta } = await run(
    'generazione_bozza',
    sources,
    `Bozza per "${ctx.thread?.subject ?? ctx.taskSummary ?? 'contenuto interno'}"`,
    async (selection) => {
      const result = await draftReply(selection.primary, ctx);
      return { ...result, confidence: result.data.confidenza };
    },
    correlationId,
  );

  const base: DraftRunResult = {
    subject: data.oggetto,
    body: data.corpo,
    reviewNotes: data.note_per_revisione,
    confidence: data.confidenza,
    promptTemplate: PROMPT_TEMPLATES.bozza,
    review: null,
  };

  // Secondo controllo Anthropic: solo se il criterio di autonomia lo prevede
  // esplicitamente. Nessun invio automatico dello stesso contenuto a due provider.
  const selection = await currentSelection();
  if (!selection.reviewer) return { data: base, meta };

  try {
    const reviewResult = await run(
      'revisione_bozza',
      sources,
      `Revisione della bozza "${data.oggetto}"`,
      async () => {
        const r = await reviewDraft(selection.reviewer!, {
          subject: data.oggetto,
          body: data.corpo,
          sourceExcerpt: ctx.thread?.body ?? ctx.thread?.snippet ?? null,
        });
        return { ...r, confidence: null };
      },
      correlationId,
    );

    base.review = {
      provider: selection.reviewer.name,
      model: selection.reviewer.model,
      outcome: reviewResult.data.esito,
      findings: reviewResult.data.rilievi,
      correctedBody: reviewResult.data.testo_corretto,
      rationale: reviewResult.data.motivazione,
    };
  } catch (error) {
    // Il fallimento della revisione non annulla la bozza: viene segnalato e basta.
    base.review = {
      provider: selection.reviewer.name,
      model: selection.reviewer.model,
      outcome: 'errore',
      findings: [
        `Revisione non riuscita: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
      ],
      correctedBody: null,
      rationale: 'La bozza non è stata sottoposta al secondo controllo.',
    };
  }

  return { data: base, meta };
}

export async function runAssistant(ctx: AssistantContext, correlationId?: string) {
  return run(
    'risposta_assistente',
    ctx.sources,
    ctx.question.slice(0, 200),
    async (selection) => {
      const result = await answerAssistant(selection.primary, ctx);
      return { ...result, confidence: null };
    },
    correlationId,
  );
}

export { AiDisabledError, AiProviderError };
