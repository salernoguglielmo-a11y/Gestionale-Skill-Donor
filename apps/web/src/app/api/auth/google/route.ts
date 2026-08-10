import { buildAuthUrl, createPkcePair, createStateToken, isOAuthConfigured, readOAuthConfig } from '@sdoh/email';
import { NextResponse, type NextRequest } from 'next/server';
import { absoluteUrl, safeReturnPath } from '@/lib/absolute-url';
import { setOAuthCookie } from '@/lib/session';

/** Avvio del flusso OAuth. Nessuna password è mai richiesta né gestita. */
export async function GET(request: NextRequest) {
  const config = readOAuthConfig();
  if (!isOAuthConfigured(config)) {
    const url = absoluteUrl(request, '/accedi');
    url.searchParams.set('errore', 'oauth_non_configurato');
    url.searchParams.set('dettaglio', config.missing.join(','));
    return NextResponse.redirect(url);
  }

  const state = createStateToken();
  const pkce = await createPkcePair();
  // `safeReturnPath` respinge gli URL assoluti e i `//host`: nessun open redirect.
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('returnTo'));

  await setOAuthCookie({ state, verifier: pkce.verifier, returnTo });
  return NextResponse.redirect(await buildAuthUrl(config, { state, pkce }));
}
