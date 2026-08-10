/**
 * Redazione dei dati sensibili prima di ogni scrittura su log.
 * Regola operativa: nei log non finiscono mai indirizzi email completi,
 * numeri di telefono, token o corpi di messaggi.
 */

const EMAIL_RE = /([A-Z0-9._%+-])[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PHONE_RE = /(?<![\w.])(\+?\d[\d\s().-]{7,}\d)(?![\w.])/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const GOOGLE_TOKEN_RE = /\bya29\.[A-Za-z0-9._-]+/g;
const SK_TOKEN_RE = /\b(sk|rk|pk)-[A-Za-z0-9._-]{12,}/g;

/** Chiavi il cui valore non va mai loggato, indipendentemente dal contenuto. */
const SECRET_KEYS = new Set([
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'password',
  'secret',
  'sessionsecret',
  'encryptionkey',
  'body',
  'bodyhtml',
  'bodytext',
  'raw',
]);

export function redactString(input: string): string {
  return input
    .replace(GOOGLE_TOKEN_RE, 'ya29.[REDACTED]')
    .replace(SK_TOKEN_RE, '$1-[REDACTED]')
    .replace(BEARER_RE, '$1 [REDACTED]')
    .replace(IBAN_RE, '[IBAN REDACTED]')
    .replace(EMAIL_RE, '$1***$2')
    .replace(PHONE_RE, '[TEL REDACTED]');
}

/** Redazione ricorsiva di una struttura arbitraria destinata ai log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return '[non serializzabile]';
}

/** Anteprima di un indirizzo email sicura da mostrare nei log. */
export function maskEmail(email: string): string {
  return redactString(email);
}
