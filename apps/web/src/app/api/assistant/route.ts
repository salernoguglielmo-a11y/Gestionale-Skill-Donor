import { AiDisabledError } from '@sdoh/ai';
import { assistantQuerySchema } from '@sdoh/core';
import { getDb, recordAudit } from '@sdoh/db';
import { NextResponse, type NextRequest } from 'next/server';
import { runAssistant } from '@/lib/ai-service';
import { buildAssistantContext } from '@/lib/assistant-context';
import { getCurrentUser } from '@/lib/auth';
import { LIMITS, rateLimit } from '@/lib/rate-limit';

export interface AssistantResponse {
  answer: string;
  deterministicAnswer: string | null;
  sources: string[];
  inferences: string[];
  proposedAction: { tipo: string; descrizione: string; payload: unknown } | null;
  provider: string;
  model: string;
  degraded: boolean;
  degradedReason: string | null;
}

/**
 * Assistente interno.
 *
 * Non modifica dati: se la richiesta implica una modifica, la risposta contiene
 * un'azione *proposta* che l'utente deve confermare esplicitamente altrove.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  if (!user.permissions.includes('ai:use')) {
    return NextResponse.json({ error: 'Permesso ai:use mancante' }, { status: 403 });
  }

  const limit = rateLimit(`assistant:${user.id}`, LIMITS.assistant.limit, LIMITS.assistant.window);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Limite raggiunto. Riprova fra ${limit.retryAfterSeconds} secondi.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = assistantQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Domanda non valida.' }, { status: 400 });
  }

  const context = await buildAssistantContext(parsed.data.question);

  try {
    const { data, meta } = await runAssistant({
      question: parsed.data.question,
      structuredContext: context.text,
      sources: context.sources,
    });

    const db = await getDb();
    await recordAudit(db, {
      actorType: 'ai',
      actorLabel: `${meta.provider}/${meta.model}`,
      userId: user.id,
      action: 'assistant.answer',
      entityType: 'assistant',
      newValue: {
        domanda: parsed.data.question.slice(0, 200),
        fonti: data.fonti.length,
        azioneProposta: data.azione_proposta?.tipo ?? 'nessuna',
      },
      source: 'web:assistant',
      sessionRef: user.sessionRef,
    });

    return NextResponse.json({
      answer: data.risposta,
      deterministicAnswer: context.deterministicAnswer,
      sources: data.fonti,
      inferences: data.inferenze,
      proposedAction:
        data.azione_proposta && data.azione_proposta.tipo !== 'nessuna' ? data.azione_proposta : null,
      provider: meta.provider,
      model: meta.model,
      degraded: meta.degraded,
      degradedReason: meta.degradedReason,
    } satisfies AssistantResponse);
  } catch (error) {
    if (error instanceof AiDisabledError) {
      // Con l'AI disattivata l'assistente resta comunque utile: risponde con i
      // soli calcoli deterministici sui dati registrati.
      return NextResponse.json({
        answer:
          context.deterministicAnswer ??
          'L’uso dell’AI è disattivato nelle impostazioni. Posso rispondere solo alle domande che si calcolano direttamente sui dati registrati (attività ferme, senza prossimo passo, priorità di oggi).',
        deterministicAnswer: context.deterministicAnswer,
        sources: context.sources.map((s) => s.label),
        inferences: [],
        proposedAction: null,
        provider: 'nessuno',
        model: 'calcolo diretto sui dati',
        degraded: true,
        degradedReason: 'Criterio di autonomia impostato su “nessun utilizzo AI”.',
      } satisfies AssistantResponse);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore sconosciuto' },
      { status: 500 },
    );
  }
}
