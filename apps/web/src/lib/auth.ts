import { getDb, getOwnerUser, seedId, SEED_USER } from '@sdoh/db';
import { isOAuthConfigured, readOAuthConfig } from '@sdoh/email';
import { redirect } from 'next/navigation';
import { readSession, type SessionData } from './session';

/**
 * Autorizzazione. Regola unica: l'accesso reale è consentito soltanto
 * all'indirizzo in `ALLOWED_EMAIL`, verificato sull'id_token firmato da Google.
 *
 * Quando Google OAuth non è configurato l'app resta utilizzabile in **modalità
 * demo**, che è dichiarata in ogni schermata e non consente alcuna operazione
 * verso servizi esterni.
 */

export interface AuthMode {
  googleConfigured: boolean;
  missingVariables: string[];
  demoAllowed: boolean;
  allowedEmail: string | null;
}

export function getAuthMode(): AuthMode {
  const config = readOAuthConfig();
  const configured = isOAuthConfigured(config);
  // La modalità demo si disattiva esplicitamente con DEMO_MODE=off.
  const demoAllowed = process.env.DEMO_MODE !== 'off';
  return {
    googleConfigured: configured,
    missingVariables: configured ? [] : config.missing,
    demoAllowed,
    allowedEmail: configured ? config.allowedEmail : (process.env.ALLOWED_EMAIL ?? null),
  };
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  mode: 'google' | 'demo';
  sessionRef: string;
}

/** Utente corrente, oppure `null`. Non effettua redirect. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  let session: SessionData | null;
  try {
    session = await readSession();
  } catch {
    return null;
  }
  if (!session) return null;

  const allowed = getAuthMode().allowedEmail;
  // Anche con un cookie valido, l'allowlist viene riverificata a ogni richiesta:
  // cambiare ALLOWED_EMAIL invalida immediatamente le sessioni esistenti.
  if (session.mode === 'google' && allowed && session.email.toLowerCase() !== allowed.toLowerCase()) {
    return null;
  }

  const db = await getDb();
  const owner = await getOwnerUser(db);

  return {
    id: owner?.id ?? session.userId,
    email: session.email,
    name: owner?.name ?? session.name,
    role: owner?.role ?? 'owner',
    permissions: owner?.permissions ?? SEED_USER.permissions,
    mode: session.mode,
    sessionRef: session.sessionRef,
  };
}

/** Utente corrente o redirect alla pagina di accesso. Da usare in ogni pagina. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');
  return user;
}

/** Verifica di un permesso specifico prima di un'azione di scrittura. */
export async function requirePermission(permission: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    throw new Error(`Permesso mancante: ${permission}`);
  }
  return user;
}

export function demoUserIdentity() {
  return {
    userId: seedId.user(SEED_USER.email),
    email: SEED_USER.email,
    name: SEED_USER.name,
  };
}
