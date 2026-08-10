import { getDb, recordAudit, schema, seedId, SEED_USER } from '@sdoh/db';
import {
  encryptJson,
  exchangeCode,
  isOAuthConfigured,
  readOAuthConfig,
  safeEqual,
  UnauthorizedAccountError,
} from '@sdoh/email';
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { absoluteUrl, safeReturnPath } from '@/lib/absolute-url';
import { clearOAuthCookie, createSession, readOAuthCookie } from '@/lib/session';

/**
 * Callback OAuth.
 *
 * Verifiche in ordine: `state` (anti-CSRF, confronto a tempo costante) →
 * scambio del codice con PKCE → allowlist sull'email verificata dall'id_token →
 * salvataggio del refresh token cifrato → creazione della sessione.
 */
export async function GET(request: NextRequest) {
  const fail = (code: string, detail?: string) => {
    const url = absoluteUrl(request, '/accedi');
    url.searchParams.set('errore', code);
    if (detail) url.searchParams.set('dettaglio', detail.slice(0, 200));
    return NextResponse.redirect(url);
  };

  const config = readOAuthConfig();
  if (!isOAuthConfigured(config)) return fail('oauth_non_configurato', config.missing.join(','));

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return fail('accesso_negato', params.get('error') ?? undefined);

  const code = params.get('code');
  const state = params.get('state');
  const stored = await readOAuthCookie();
  await clearOAuthCookie();

  if (!code || !state || !stored) return fail('sessione_oauth_scaduta');
  if (!safeEqual(state, stored.state)) return fail('state_non_valido');

  try {
    const tokens = await exchangeCode(config, { code, codeVerifier: stored.verifier });
    const db = await getDb();

    const userId = seedId.user(tokens.email);
    await db
      .insert(schema.users)
      .values({
        id: userId,
        email: tokens.email,
        name: tokens.name ?? SEED_USER.name,
        role: 'owner',
        permissions: SEED_USER.permissions,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { lastLoginAt: new Date(), name: tokens.name ?? SEED_USER.name },
      });

    // Il refresh token è l'unica credenziale persistita, e solo cifrata.
    if (tokens.refreshToken) {
      const values = {
        provider: 'gmail',
        accountEmail: tokens.email,
        userId,
        encryptedPayload: encryptJson({
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
        }),
        scopes: tokens.scopes,
        expiresAt: tokens.expiresAt,
        lastSyncStatus: 'mai_sincronizzato',
        updatedAt: new Date(),
      };
      await db
        .insert(schema.integrationTokens)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.integrationTokens.provider, schema.integrationTokens.accountEmail],
          set: values,
        });
    } else {
      // Senza refresh token il collegamento non sopravvive alla scadenza dell'access token.
      await db
        .update(schema.integrationTokens)
        .set({ lastSyncStatus: 'refresh_token_mancante' })
        .where(eq(schema.integrationTokens.provider, 'gmail'));
    }

    await createSession({ userId, email: tokens.email, name: tokens.name ?? SEED_USER.name, mode: 'google' });

    await recordAudit(db, {
      actorType: 'umano',
      actorLabel: tokens.name ?? tokens.email,
      userId,
      action: 'auth.login',
      entityType: 'user',
      entityId: userId,
      newValue: { modalita: 'google', scope: tokens.scopes, refreshToken: Boolean(tokens.refreshToken) },
      source: 'oauth:google',
    });

    return NextResponse.redirect(absoluteUrl(request, safeReturnPath(stored.returnTo)));
  } catch (error) {
    if (error instanceof UnauthorizedAccountError) return fail('account_non_autorizzato');
    return fail('scambio_token_fallito', error instanceof Error ? error.message : undefined);
  }
}
