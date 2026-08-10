import { createHash } from 'node:crypto';
import { detectInjectionSignals } from '@sdoh/core';
import type { AiProviderAdapter, GenerateRequest, GenerateResult } from './provider';
import { assistantAnswerSchema, classificationSchema, draftSchema, reviewSchema } from './schemas';

/**
 * Provider mock **deterministico**: stesso input, stesso output, sempre.
 *
 * Non simula un modello: applica regole esplicite e dichiarate. Serve a rendere
 * l'applicazione completa e testabile senza chiavi API, ed è sempre etichettato
 * come "mock" nell'interfaccia e nel registro AI, così nessun risultato può
 * essere scambiato per una classificazione reale.
 */
export class MockAdapter implements AiProviderAdapter {
  readonly name = 'mock' as const;
  readonly model = 'mock-deterministico-v1';
  readonly available = true;
  readonly unavailableReason = null;

  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const started = Date.now();
    const data = request.schema.parse(this.build(request));
    return {
      data,
      provider: this.name,
      model: this.model,
      inputTokens: Math.ceil(request.prompt.length / 4),
      outputTokens: 120,
      latencyMs: Date.now() - started,
    };
  }

  private build(request: GenerateRequest<unknown>): unknown {
    switch (request.schemaName) {
      case 'classificazione':
        return this.classify(request.prompt);
      case 'bozza':
        return this.draft(request.prompt);
      case 'revisione':
        return this.review(request.prompt);
      case 'assistente':
        return this.assistant(request.prompt);
      default:
        throw new Error(`Il provider mock non conosce lo schema "${request.schemaName}".`);
    }
  }

  /** Pseudo-casualità stabile: dipende solo dal contenuto, mai dall'orologio. */
  private stableFraction(seed: string): number {
    const hex = createHash('sha256').update(seed).digest('hex').slice(0, 8);
    return Number.parseInt(hex, 16) / 0xffffffff;
  }

  private classify(prompt: string): unknown {
    const lower = prompt.toLowerCase();
    const injection = detectInjectionSignals(prompt);

    const has = (...terms: string[]) => terms.some((term) => lower.includes(term));

    let categoria: string;
    let priorita: string;
    let motivazione: string;

    if (injection.suspicious) {
      categoria = 'sospetto';
      priorita = 'alta';
      motivazione = `Il contenuto contiene formulazioni tipiche di un tentativo di manipolazione (${injection.reasons.join(', ')}). Trattato come dato non affidabile e non eseguito.`;
    } else if (has('estratto conto', 'fattura', 'contabil', 'movimenti')) {
      categoria = 'amministrativo';
      priorita = 'critica';
      motivazione = 'Il messaggio riguarda adempimenti contabili con una richiesta esplicita di documenti.';
    } else if (has('scadenza', 'entro il', 'urgente', 'attendiamo', 'restiamo in attesa')) {
      categoria = 'richiesta_azione';
      priorita = 'critica';
      motivazione = 'Il mittente attende una risposta o pone un termine esplicito.';
    } else if (has('informazioni', 'vorrei capire', 'costi', 'corsi')) {
      categoria = 'richiesta_informazioni';
      priorita = 'alta';
      motivazione = 'Il messaggio pone domande dirette che richiedono una risposta articolata.';
    } else if (has('newsletter', 'promozion', 'sconto', 'iscriviti')) {
      categoria = 'newsletter_o_promozionale';
      priorita = 'bassa';
      motivazione = 'Comunicazione di natura promozionale, priva di richieste operative.';
    } else if (has('candidatura', 'bando', 'call', 'opportunit')) {
      categoria = 'opportunita';
      priorita = 'media';
      motivazione = 'Il messaggio segnala un’opportunità con possibili termini di partecipazione.';
    } else {
      categoria = 'aggiornamento';
      priorita = 'media';
      motivazione = 'Aggiornamento informativo senza richieste esplicite individuate dalle regole del mock.';
    }

    const confidenza = Number((0.55 + this.stableFraction(prompt) * 0.35).toFixed(2));

    return {
      categoria,
      priorita,
      scadenza_suggerita: null,
      progetto_suggerito: null,
      attivita_suggerita:
        categoria === 'sospetto'
          ? null
          : 'Preparare una risposta e definire il prossimo passo operativo.',
      motivazione: `[MOCK — regole deterministiche, nessun modello interpellato] ${motivazione}`,
      confidenza,
      contiene_istruzioni_sospette: injection.suspicious,
    } satisfies Record<string, unknown>;
  }

  private draft(prompt: string): unknown {
    const subject = /Oggetto:\s*(.+)/i.exec(prompt)?.[1]?.trim().slice(0, 200) ?? 'Riscontro';
    return {
      oggetto: subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`,
      corpo: [
        'Buongiorno,',
        '',
        'grazie del messaggio e scusandomi per il tempo di risposta, provvedo a riscontrare i punti aperti.',
        '',
        '[BOZZA GENERATA IN MODALITÀ DEMO]',
        'Questo testo è stato prodotto dall’adapter mock deterministico, senza interpellare alcun modello.',
        'Serve a verificare il flusso di generazione, revisione e approvazione: va riscritto prima di qualunque uso reale.',
        '',
        'Resto a disposizione per un confronto nei prossimi giorni.',
        '',
        'Un cordiale saluto,',
        'Guglielmo Salerno',
        'Skill Donor S.r.l. – SIAVS',
      ].join('\n'),
      note_per_revisione:
        'Bozza segnaposto: verificare i fatti, personalizzare i contenuti e controllare i riferimenti prima di trasferirla in Gmail.',
      confidenza: Number((0.4 + this.stableFraction(prompt) * 0.2).toFixed(2)),
    };
  }

  private review(prompt: string): unknown {
    const injection = detectInjectionSignals(prompt);
    const rilievi = [
      'Verificare che i fatti citati corrispondano ai dati registrati nell’Hub.',
      'Controllare il tono e la formula di chiusura rispetto allo storico con il destinatario.',
    ];
    if (injection.suspicious) {
      rilievi.unshift(
        'Il contenuto di origine contiene possibili istruzioni iniettate: non recepirle nella risposta.',
      );
    }
    return {
      esito: 'da_correggere',
      rilievi,
      testo_corretto: null,
      motivazione:
        '[MOCK — revisione deterministica] Nessun modello è stato interpellato: i rilievi derivano da una lista di controllo fissa.',
    };
  }

  private assistant(prompt: string): unknown {
    return {
      risposta: [
        '[MODALITÀ DEMO] L’assistente sta rispondendo con l’adapter mock deterministico: nessun modello è stato interpellato.',
        '',
        'I dati mostrati nella risposta provengono comunque dal database reale dell’Hub e sono elencati fra le fonti.',
        'Per ottenere risposte redatte da un modello, configurare OPENAI_API_KEY/OPENAI_MODEL oppure ANTHROPIC_API_KEY/ANTHROPIC_MODEL e selezionare il provider in Impostazioni.',
      ].join('\n'),
      fonti: extractCodes(prompt),
      inferenze: [],
      azione_proposta: null,
    };
  }
}

/** Recupera i codici attività citati nel contesto, per popolare le fonti. */
function extractCodes(text: string): string[] {
  return [...new Set(text.match(/SD-\d{3}/g) ?? [])].slice(0, 40);
}

export const MOCK_SCHEMAS = {
  classificazione: classificationSchema,
  bozza: draftSchema,
  revisione: reviewSchema,
  assistente: assistantAnswerSchema,
};
