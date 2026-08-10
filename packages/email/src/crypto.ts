import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cifratura dei token OAuth at rest: AES-256-GCM, chiave da `TOKEN_ENCRYPTION_KEY`.
 *
 * La chiave non viene mai persistita: senza la variabile d'ambiente i token nel
 * database sono inutilizzabili, che è il comportamento voluto in caso di dump.
 * Il formato è versionato (`v1.<iv>.<tag>.<ciphertext>`) per poter ruotare
 * l'algoritmo in futuro senza ambiguità sui dati esistenti.
 */

const VERSION = 'v1';
const IV_BYTES = 12;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super(
      'Manca TOKEN_ENCRYPTION_KEY: i token OAuth non possono essere cifrati. ' +
        'Generarne una con `openssl rand -base64 32` e inserirla nel file .env.',
    );
    this.name = 'MissingEncryptionKeyError';
  }
}

export function deriveKey(secret?: string): Buffer {
  const raw = secret ?? process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (!raw || raw.length < 16) throw new MissingEncryptionKeyError();
  // SHA-256 normalizza qualunque lunghezza a 32 byte, base64 o esadecimale che sia.
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptJson(payload: unknown, secret?: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptJson<T = unknown>(encoded: string, secret?: string): T {
  const [version, ivB64, tagB64, dataB64] = encoded.split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Payload cifrato non riconosciuto o danneggiato.');
  }
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

/** Confronto a tempo costante per token di stato e CSRF. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
