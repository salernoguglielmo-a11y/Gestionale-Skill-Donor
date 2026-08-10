import type { NextRequest } from 'next/server';

/**
 * URL assoluto costruito dall'host effettivo della richiesta.
 *
 * `new URL(path, request.url)` non è affidabile: dietro un reverse proxy — e in
 * alcune configurazioni di `next start` — `request.url` riporta l'host interno
 * anziché quello con cui il browser ha contattato l'applicazione. Un redirect
 * costruito così cambia origine, e il browser non invia il cookie di sessione
 * appena impostato: l'utente torna alla pagina di accesso senza spiegazione.
 *
 * Qui si usano `x-forwarded-host` / `host` e `x-forwarded-proto`, che sono ciò
 * che il proxy dichiara. Con `ops.skilldonor.org` davanti all'app è l'unico modo
 * corretto di ottenere l'URL pubblico.
 */
export function absoluteUrl(request: NextRequest, path: string): URL {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');

  if (!host) return new URL(path, request.url);

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto =
    forwardedProto ??
    // In locale l'app gira in chiaro; ovunque altro si assume HTTPS.
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]') ? 'http' : 'https');

  return new URL(path, `${proto}://${host}`);
}

/**
 * Percorso di ritorno sicuro: solo percorsi relativi alla stessa applicazione.
 * Blocca gli open redirect verso `//host-esterno` o URL assoluti.
 */
export function safeReturnPath(value: string | null | undefined, fallback = '/oggi'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
