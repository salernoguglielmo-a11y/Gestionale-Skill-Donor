import { Button, Card, ErrorState } from '@sdoh/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/brand';
import { getAuthMode, getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Accesso' };

const ERROR_MESSAGES: Record<string, string> = {
  oauth_non_configurato:
    'Google OAuth non è configurato su questo ambiente. Compila le variabili indicate in .env.example e riavvia.',
  account_non_autorizzato:
    'Questo account Google non è nell’allowlist. L’Hub accetta soltanto l’indirizzo configurato in ALLOWED_EMAIL.',
  state_non_valido: 'Verifica anti-CSRF fallita: la richiesta non proviene da questa applicazione. Riprova.',
  sessione_oauth_scaduta: 'La procedura di accesso è scaduta. Riprova.',
  scambio_token_fallito: 'Google non ha completato lo scambio dei token.',
  accesso_negato: 'Accesso negato sulla schermata di consenso Google.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentUser()) redirect('/oggi');

  const params = await searchParams;
  const errorCode = typeof params.errore === 'string' ? params.errore : null;
  const detail = typeof params.dettaglio === 'string' ? params.dettaglio : null;
  const mode = getAuthMode();

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-2.5">
          <BrandMark size={34} />
          <div>
            <h1 className="text-lg font-semibold text-ink-strong">Skill Donor Operations Hub</h1>
            <p className="text-xs text-muted">Gestionale interno di Skill Donor S.r.l. – SIAVS</p>
          </div>
        </div>

        {errorCode ? (
          <ErrorState
            title={ERROR_MESSAGES[errorCode] ?? 'Accesso non riuscito.'}
            {...(detail ? { description: `Dettaglio: ${detail}` } : {})}
            className="mb-4"
          />
        ) : null}

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-strong">Accesso</h2>
          <p className="mt-1 text-xs text-muted">
            L’applicazione è privata e monoutente. L’accesso è riservato all’indirizzo autorizzato
            {mode.allowedEmail ? ` (${mode.allowedEmail})` : ''}.
          </p>

          <div className="mt-4 space-y-3">
            {mode.googleConfigured ? (
              <Button asChild variant="primary" className="w-full">
                <a href="/api/auth/google">Accedi con Google</a>
              </Button>
            ) : (
              <div className="rounded-md border border-line bg-surface-sunken px-3 py-2.5">
                <p className="text-xs font-medium text-ink">Accesso Google non disponibile</p>
                <p className="mt-1 text-[11px] text-muted">
                  Mancano queste variabili d’ambiente:{' '}
                  <span className="font-mono">{mode.missingVariables.join(', ')}</span>. La procedura completa è
                  descritta in <span className="font-mono">docs/gmail-oauth.md</span>.
                </p>
              </div>
            )}

            {mode.demoAllowed ? (
              <>
                <div className="flex items-center gap-2 text-[11px] text-faint">
                  <span className="h-px flex-1 bg-line" />
                  oppure
                  <span className="h-px flex-1 bg-line" />
                </div>
                <form action="/api/auth/demo" method="post">
                  <Button type="submit" variant="secondary" className="w-full">
                    Entra in modalità demo
                  </Button>
                </form>
                <p className="text-[11px] leading-relaxed text-muted">
                  La modalità demo carica lo snapshot del 10 agosto 2026 (32 attività, 14 progetti, 10 conversazioni
                  dimostrative) su un database locale. Nessun servizio esterno viene contattato: Gmail e i provider AI
                  restano scollegati e ogni contenuto generato è etichettato come dimostrativo.
                </p>
              </>
            ) : null}
          </div>
        </Card>

        <p className="mt-4 text-center text-[11px] text-faint">
          Nessuna email può essere inviata da questa applicazione: non esiste alcuna funzione di invio.
        </p>
      </div>
    </main>
  );
}
