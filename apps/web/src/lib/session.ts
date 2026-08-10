import { encryptJson, decryptJson, MissingEncryptionKeyError } from '@sdoh/email';
import { cookies } from 'next/headers';

/**
 * Sessione in cookie cifrato (AES-256-GCM, stessa primitiva dei token OAuth).
 *
 * Il cookie è HttpOnly, SameSite=Lax e Secure fuori da sviluppo: non è leggibile
 * da JavaScript, non viaggia su richieste cross-site di terze parti e non
 * contiene altro che l'identità dell'utente e la scadenza.
 */

export const SESSION_COOKIE = 'sdoh_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  /** `google` = accesso reale verificato; `demo` = modalità dimostrativa locale. */
  mode: 'google' | 'demo';
  issuedAt: number;
  expiresAt: number;
  /** Riferimento opaco usato nell'audit log al posto dell'identificativo di sessione. */
  sessionRef: string;
}

export async function createSession(data: Omit<SessionData, 'issuedAt' | 'expiresAt' | 'sessionRef'>): Promise<void> {
  const now = Date.now();
  const payload: SessionData = {
    ...data,
    issuedAt: now,
    expiresAt: now + MAX_AGE_SECONDS * 1_000,
    sessionRef: crypto.randomUUID().slice(0, 8),
  };

  const store = await cookies();
  store.set(SESSION_COOKIE, encryptJson(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const data = decryptJson<SessionData>(raw);
    if (typeof data?.expiresAt !== 'number' || data.expiresAt < Date.now()) return null;
    return data;
  } catch (error) {
    // Chiave ruotata o cookie manomesso: si tratta come "non autenticato".
    if (error instanceof MissingEncryptionKeyError) throw error;
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Cookie temporanei del flusso OAuth (state e code verifier PKCE). */
export const OAUTH_COOKIE = 'sdoh_oauth';

export async function setOAuthCookie(payload: { state: string; verifier: string; returnTo: string }): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_COOKIE, encryptJson(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
}

export async function readOAuthCookie(): Promise<{ state: string; verifier: string; returnTo: string } | null> {
  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return decryptJson(raw);
  } catch {
    return null;
  }
}

export async function clearOAuthCookie(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_COOKIE);
}
