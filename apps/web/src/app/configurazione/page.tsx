import { Card } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { SetupPanel } from '@/components/setup-panel';

export const metadata: Metadata = { title: 'Configurazione iniziale' };
export const dynamic = 'force-dynamic';

/**
 * Pagina di configurazione iniziale.
 *
 * Esiste per una ragione precisa: senza di essa la creazione dello schema
 * richiede un terminale con `curl`, e chi mette online l'applicazione può non
 * averne uno né saperlo usare. Qui la stessa operazione si fa dal browser.
 *
 * Non indebolisce nulla: la pagina è solo un modulo che chiama
 * `/api/admin/migrate`, che continua a pretendere il token di configurazione e a
 * rispondere 404 quando quel token non è impostato. La pagina è deliberatamente
 * accessibile senza autenticazione, perché serve *prima* che l'accesso funzioni:
 * senza schema non esiste nemmeno la tabella degli utenti.
 */
export default function SetupPage() {
  const tokenConfigurato = Boolean(process.env.MIGRATION_TOKEN);

  return (
    <main className="flex min-h-screen items-start justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-2.5">
          <BrandMark size={34} />
          <div>
            <h1 className="text-lg font-semibold text-ink-strong">Configurazione iniziale</h1>
            <p className="text-xs text-muted">Skill Donor Operations Hub</p>
          </div>
        </div>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-strong">Preparare il database</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Un database appena creato è vuoto: non contiene ancora nessuna tabella. Questa operazione crea la struttura
            e, se lo scegli, carica lo snapshot iniziale con le 32 attività, i 14 progetti e le anagrafiche.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Si può ripetere senza rischi: non crea duplicati e non cancella nulla.
          </p>

          <div className="mt-4">
            <SetupPanel tokenConfigurato={tokenConfigurato} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-strong">Al termine</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
            <li>
              Rimuovi la variabile <span className="font-mono text-ink">MIGRATION_TOKEN</span> dalle impostazioni del
              tuo hosting e rifai il deploy: questa pagina smetterà di funzionare, com’è giusto.
            </li>
            <li>
              Imposta <span className="font-mono text-ink">DEMO_MODE</span> su <span className="font-mono text-ink">off</span>{' '}
              quando hai configurato l’accesso con Google: la modalità demo è un ingresso senza autenticazione.
            </li>
            <li>
              Controlla lo stato su{' '}
              <Link href="/api/health" className="text-brand-deep hover:underline">
                /api/health
              </Link>
              : deve riportare <span className="font-mono text-ink">&quot;stato&quot;: &quot;ok&quot;</span>.
            </li>
          </ol>
        </Card>

        <p className="text-center text-[11px] text-faint">
          <Link href="/accedi" className="hover:underline">
            Vai alla pagina di accesso
          </Link>
        </p>
      </div>
    </main>
  );
}
