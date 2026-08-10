import type { AiMode, AiProvider as ProviderName } from '@sdoh/core';
import { AnthropicAdapter } from './anthropic';
import { MockAdapter } from './mock';
import { OpenAiAdapter } from './openai';
import type { AiProviderAdapter } from './provider';

/**
 * Selezione del provider a partire dal criterio di autonomia scelto dall'utente.
 *
 * Regole:
 * - `off`   → nessuna operazione AI possibile;
 * - `openai` / `anthropic` → un solo provider;
 * - `openai_con_revisione_anthropic` → OpenAI produce, Anthropic rivede.
 *   La revisione è un secondo passaggio esplicito, non un invio parallelo:
 *   nessun contenuto viene mandato a entrambi i provider per abitudine.
 *
 * Se il provider scelto non è configurato, si ricade sul mock **dichiarandolo**:
 * l'interfaccia mostra sempre quale adapter ha prodotto il risultato.
 */

export interface AiSelection {
  primary: AiProviderAdapter;
  reviewer: AiProviderAdapter | null;
  /** Vero quando il provider richiesto non era disponibile e si usa il mock. */
  degraded: boolean;
  degradedReason: string | null;
  requestedMode: AiMode;
}

export interface AiRegistry {
  openai: AiProviderAdapter;
  anthropic: AiProviderAdapter;
  mock: AiProviderAdapter;
}

export function createRegistry(overrides: Partial<AiRegistry> = {}): AiRegistry {
  return {
    openai: overrides.openai ?? new OpenAiAdapter(),
    anthropic: overrides.anthropic ?? new AnthropicAdapter(),
    mock: overrides.mock ?? new MockAdapter(),
  };
}

export class AiDisabledError extends Error {
  constructor() {
    super('L’uso dell’AI è disattivato nelle impostazioni (criterio di autonomia: nessun utilizzo AI).');
    this.name = 'AiDisabledError';
  }
}

export function selectProviders(mode: AiMode, registry: AiRegistry = createRegistry()): AiSelection {
  if (mode === 'off') throw new AiDisabledError();

  const fallback = (wanted: AiProviderAdapter, label: string): AiSelection['primary'] => wanted;

  switch (mode) {
    case 'anthropic': {
      const p = registry.anthropic;
      return p.available
        ? { primary: p, reviewer: null, degraded: false, degradedReason: null, requestedMode: mode }
        : {
            primary: registry.mock,
            reviewer: null,
            degraded: true,
            degradedReason: p.unavailableReason,
            requestedMode: mode,
          };
    }
    case 'openai_con_revisione_anthropic': {
      const primary = registry.openai;
      const reviewer = registry.anthropic;
      if (!primary.available) {
        return {
          primary: registry.mock,
          reviewer: reviewer.available ? reviewer : null,
          degraded: true,
          degradedReason: primary.unavailableReason,
          requestedMode: mode,
        };
      }
      return {
        primary,
        reviewer: reviewer.available ? reviewer : null,
        degraded: !reviewer.available,
        degradedReason: reviewer.available
          ? null
          : `Revisione Anthropic non attiva: ${reviewer.unavailableReason ?? 'provider non configurato'}`,
        requestedMode: mode,
      };
    }
    case 'openai':
    default: {
      const p = fallback(registry.openai, 'openai');
      return p.available
        ? { primary: p, reviewer: null, degraded: false, degradedReason: null, requestedMode: mode }
        : {
            primary: registry.mock,
            reviewer: null,
            degraded: true,
            degradedReason: p.unavailableReason,
            requestedMode: mode,
          };
    }
  }
}

/** Modalità effettiva da mostrare in interfaccia, con l'avvertenza sul degrado. */
export function describeSelection(selection: AiSelection): string {
  if (selection.degraded && selection.primary.name === 'mock') {
    return `Modalità demo (mock deterministico) — ${selection.degradedReason ?? 'provider non configurato'}`;
  }
  const base = `Provider: ${selection.primary.name} · modello ${selection.primary.model}`;
  if (selection.reviewer) return `${base} · revisione ${selection.reviewer.name} (${selection.reviewer.model})`;
  if (selection.degraded) return `${base} — ${selection.degradedReason}`;
  return base;
}

export function providerNames(selection: AiSelection): { primary: ProviderName; reviewer: ProviderName | null } {
  return { primary: selection.primary.name, reviewer: selection.reviewer?.name ?? null };
}
