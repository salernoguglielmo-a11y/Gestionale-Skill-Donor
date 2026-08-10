import {
  AiProviderError,
  parseJsonPayload,
  type AiProviderAdapter,
  type GenerateRequest,
  type GenerateResult,
} from './provider';
import { jsonSchemaOf } from './schemas';

/**
 * Adapter Anthropic (SDK ufficiale `@anthropic-ai/sdk`).
 *
 * L'output strutturato è ottenuto con un tool a uso forzato: il modello deve
 * chiamare `registra_risultato` con un input conforme allo schema, quindi la
 * risposta è già un oggetto e non testo da interpretare.
 */
export class AnthropicAdapter implements AiProviderAdapter {
  readonly name = 'anthropic' as const;
  readonly model: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;

  private readonly apiKey: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? '';

    if (!this.apiKey) {
      this.available = false;
      this.unavailableReason = 'Manca la variabile ANTHROPIC_API_KEY.';
    } else if (!this.model) {
      this.available = false;
      this.unavailableReason = 'Manca la variabile ANTHROPIC_MODEL (identificativo del modello da usare).';
    } else {
      this.available = true;
      this.unavailableReason = null;
    }
  }

  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    if (!this.available) {
      throw new AiProviderError(this.unavailableReason ?? 'Provider non disponibile', this.name, this.model);
    }

    const started = Date.now();
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });

      const toolName = 'registra_risultato';
      const message = await client.messages.create({
        model: this.model,
        max_tokens: request.maxOutputTokens ?? 2_000,
        system: request.system,
        tools: [
          {
            name: toolName,
            description: 'Registra il risultato strutturato dell’analisi.',
            input_schema: jsonSchemaOf(request.schema) as { type: 'object' },
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: request.prompt }],
      });

      const toolUse = message.content.find((block) => block.type === 'tool_use');
      const payload =
        toolUse && 'input' in toolUse
          ? toolUse.input
          : parseJsonPayload(
              message.content
                .map((block) => (block.type === 'text' ? block.text : ''))
                .join('\n'),
            );

      return {
        data: request.schema.parse(payload),
        provider: this.name,
        model: this.model,
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      throw new AiProviderError(
        error instanceof Error ? error.message : 'Errore sconosciuto del provider Anthropic',
        this.name,
        this.model,
        error,
      );
    }
  }
}
