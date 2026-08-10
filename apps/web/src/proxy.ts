import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy (ex middleware): Content Security Policy con nonce e verifica dell'origine.
 *
 * La CSP usa un nonce generato a ogni richiesta invece di `unsafe-inline`:
 * Next propaga il nonce ai propri script quando lo trova nell'header, quindi
 * uno script iniettato via XSS non viene eseguito.
 *
 * L'autenticazione **non** è gestita qui: il proxy gira su un runtime
 * ridotto senza accesso al database, e un controllo di sessione parziale
 * darebbe una falsa sensazione di sicurezza. Ogni pagina e ogni azione chiama
 * `requireUser()` / `requirePermission()`, che sono il punto di autorizzazione.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export default function proxy(request: NextRequest) {
  // Difesa CSRF per le richieste con effetti: l'origine deve coincidere con l'host.
  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      if (!originHost || originHost !== host) {
        return new NextResponse('Origine non consentita.', { status: 403 });
      }
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    // In sviluppo Next inietta l'HMR con eval; in produzione il nonce basta.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Tailwind genera stili nel documento: gli attributi inline restano necessari.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Nessuna chiamata verso terzi dal browser: le integrazioni girano lato server.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Esclude gli asset statici: la CSP non serve e il costo si nota.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
