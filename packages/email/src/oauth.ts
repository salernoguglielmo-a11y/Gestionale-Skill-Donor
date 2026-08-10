import { randomBytes } from 'node:crypto';
import { ALL_SCOPES } from './gmail-types';

/**
 * Google OAuth 2.0 con `google-auth-library` (SDK ufficiale).
 *
 * Vincoli applicati:
 * - **mai password**: solo authorization code flow con PKCE;
 * - `access_type=offline` + `prompt=consent` per ottenere un refresh token;
 * - allowlist su una sola email proprietaria, verificata sull'`id_token`
 *   firmato da Google, non sul valore restituito dal profilo.
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  allowedEmail: string;
}

export class OAuthNotConfiguredError extends Error {
  constructor(readonly missing: string[]) {
    super(`Google OAuth non è configurato. Variabili mancanti: ${missing.join(', ')}.`);
    this.name = 'OAuthNotConfiguredError';
  }
}

export function readOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig | { missing: string[] } {
  const missing: string[] = [];
  const clientId = env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? '';
  const redirectUri = env.GOOGLE_REDIRECT_URI ?? '';
  const allowedEmail = env.ALLOWED_EMAIL ?? '';

  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!redirectUri) missing.push('GOOGLE_REDIRECT_URI');
  if (!allowedEmail) missing.push('ALLOWED_EMAIL');

  return missing.length ? { missing } : { clientId, clientSecret, redirectUri, allowedEmail };
}

export function isOAuthConfigured(config: OAuthConfig | { missing: string[] }): config is OAuthConfig {
  return !('missing' in config);
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export async function createPkcePair(): Promise<PkcePair> {
  const { OAuth2Client } = await import('google-auth-library');
  // `generateCodeVerifierAsync` è un metodo di istanza: serve un client, anche senza credenziali.
  const { codeVerifier, codeChallenge } = await new OAuth2Client().generateCodeVerifierAsync();
  if (!codeChallenge) throw new Error('Generazione del code challenge PKCE non riuscita.');
  return { verifier: codeVerifier, challenge: codeChallenge, method: 'S256' };
}

export function createStateToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function buildAuthUrl(
  config: OAuthConfig,
  params: { state: string; pkce: PkcePair },
): Promise<string> {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...ALL_SCOPES],
    state: params.state,
    code_challenge_method: 'S256' as never,
    code_challenge: params.pkce.challenge,
    // Suggerisce l'account corretto; l'allowlist resta comunque applicata dopo.
    login_hint: config.allowedEmail,
    include_granted_scopes: true,
  });
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
  email: string;
  name: string | null;
}

export class UnauthorizedAccountError extends Error {
  constructor(readonly attempted: string) {
    super('Questo account Google non è autorizzato ad accedere all’Hub.');
    this.name = 'UnauthorizedAccountError';
  }
}

/**
 * Scambia il codice con i token e verifica l'identità.
 * L'email autorizzata è confrontata con quella dell'`id_token` verificato
 * crittograficamente, non con un valore auto-dichiarato.
 */
export async function exchangeCode(
  config: OAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<OAuthTokens> {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });

  const { tokens } = await client.getToken({
    code: params.code,
    codeVerifier: params.codeVerifier,
  });

  if (!tokens.id_token) throw new Error('Google non ha restituito un id_token: impossibile verificare l’identità.');

  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
  const payload = ticket.getPayload();
  const email = payload?.email;

  if (!email || payload?.email_verified !== true) {
    throw new Error('L’account Google non ha un indirizzo email verificato.');
  }
  if (email.toLowerCase() !== config.allowedEmail.toLowerCase()) {
    throw new UnauthorizedAccountError(email);
  }

  return {
    accessToken: tokens.access_token ?? '',
    refreshToken: tokens.refresh_token ?? null,
    scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email,
    name: payload?.name ?? null,
  };
}

/** Revoca il refresh token presso Google e non solo localmente. */
export async function revokeToken(config: OAuthConfig, refreshToken: string): Promise<void> {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
  await client.revokeToken(refreshToken);
}
