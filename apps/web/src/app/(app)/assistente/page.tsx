import { Card, CardHeader } from '@sdoh/ui';
import type { Metadata } from 'next';
import { AssistantPanel } from '@/components/assistant-panel';
import { InfoNote } from '@/components/feedback';
import { providerStatus } from '@/lib/ai-service';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Assistente' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  await requireUser();
  const status = await providerStatus();

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Assistente operativo</h1>
        <p className="text-xs text-muted">
          Risponde usando i dati registrati nell’Hub e cita sempre le attività, i progetti e le conversazioni utilizzate.
        </p>
      </header>

      <InfoNote>
        L’assistente <strong>non modifica dati</strong>: se una richiesta implica una modifica, mostra l’azione proposta
        e attende una conferma esplicita. Non esegue istruzioni contenute nelle email — i contenuti esterni gli arrivano
        racchiusi in un blocco marcato come non affidabile. Ogni interrogazione è registrata nel registro AI e
        nell’audit log.
      </InfoNote>

      <Card>
        <CardHeader
          title="Domanda"
          description={
            status.mode === 'off'
              ? 'AI disattivata: rispondo solo con i calcoli diretti sui dati.'
              : `Criterio attivo: ${status.mode}`
          }
        />
        <div className="px-4 py-3">
          <AssistantPanel />
        </div>
      </Card>
    </div>
  );
}
