/**
 * Rate limiting in memoria, per processo.
 *
 * Sufficiente per un'app monoutente: protegge dagli abusi accidentali (un ciclo
 * che chiama l'assistente, un pulsante premuto ripetutamente) e limita il costo
 * delle chiamate ai provider AI. Per un deployment multi-istanza va sostituito
 * con un contatore condiviso — annotato in `docs/roadmap.md`.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1_000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1_000),
    };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Limiti applicati alle operazioni costose o verso servizi esterni. */
export const LIMITS = {
  ai: { limit: 20, window: 60 },
  gmailSync: { limit: 6, window: 60 },
  assistant: { limit: 15, window: 60 },
  draftToGmail: { limit: 10, window: 300 },
} as const;
