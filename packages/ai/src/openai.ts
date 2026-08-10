import {
  AiProviderError,
  parseJsonPayload,
  type AiProviderAdapter,
  type GenerateRequest,
  type GenerateResult,
} from './provider';
import { jsonSchemaOf } from './schemas';

/**
 * Adapter OpenAI (SDK ufficiale `openai`).
 *
 * Il modello non è mai codificato qui: arriva da `OPENAI_MODEL`. Se manca,
 * l'adapter si dichiara non disponibile e l'interfaccia lo mostra — nessun
 * fallback silenzioso su un identificativo destinato a invecchiare.
 */
export class OpenAiAdapter implements AiProviderAdapter {
  readonly name = 'openai' as const;
  readonly model: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;

  private readonly apiKey: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = options.model ?? process.env.OPENAI_MODEL ?? '';

    if (!this.apiKey) {
      this.available = false;
      this.unavailableReason = 'Manca la variabile OPENAI_API_KEY.';
    } else if (!this.model) {
      this.available = false;
      this.unavailableReason = 'Manca la variabile OPENAI_MODEL (identificativo del modello da usare).';
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
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: this.apiKey });

      const response = await client.responses.create({
        model: this.model,
        instructions: request.system,
        input: request.prompt,
        max_output_tokens: request.maxOutputTokens ?? 2_000,
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            schema: jsonSchemaOf(request.schema) as Record<string, unknown>,
            strict: false,
          },
        },
      });

      const parsed = request.schema.parse(parseJsonPayload(response.output_text ?? ''));
      return {
        data: parsed,
        provider: this.name,
        model: this.model,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      throw new AiProviderError(
        error instanceof Error ? error.message : 'Errore sconosciuto del provider OpenAI',
        this.name,
        this.model,
        error,
      );
    }
  }
}
