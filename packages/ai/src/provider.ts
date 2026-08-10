import type { AiProvider as ProviderName } from '@sdoh/core';
import type { z } from 'zod';

/**
 * Contratto minimo di un provider. Volutamente stretto: una sola operazione
 * ("produci un oggetto conforme a questo schema"). Tutta la logica di prompt,
 * contenimento dei dati non affidabili e registrazione vive fuori dai provider,
 * così aggiungerne uno nuovo non duplica regole di sicurezza.
 */

export interface GenerateRequest<T> {
  /** Istruzioni di sistema. Non contengono mai testo proveniente dall'esterno. */
  system: string;
  /** Prompt utente: i contenuti esterni sono già incapsulati in blocchi non affidabili. */
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxOutputTokens?: number;
}

export interface GenerateResult<T> {
  data: T;
  provider: ProviderName;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface AiProviderAdapter {
  readonly name: ProviderName;
  readonly model: string;
  /** Falso quando manca la chiave o il modello: l'interfaccia lo dichiara, non finge. */
  readonly available: boolean;
  readonly unavailableReason: string | null;
  generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderName,
    readonly model: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * Estrae il primo oggetto JSON da una risposta testuale.
 * I modelli in modalità JSON restituiscono JSON puro, ma alcune configurazioni
 * lo racchiudono in un blocco markdown: gestirlo qui evita di duplicare il
 * parsing in ogni adapter.
 */
export function parseJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error('La risposta del modello non contiene JSON valido.');
  }
}
