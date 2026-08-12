'use client';

import { Button, Input } from '@sdoh/ui';
import * as React from 'react';
import { ActionFeedback } from './feedback';

interface EsitoMigrazione {
  stato?: string;
  migrazioniApplicate?: string[];
  migrazioniGiaPresenti?: number;
  seed?: Record<string, number> | null;
  prossimoPasso?: string;
  errore?: string;
  dettaglio?: string;
}

/**
 * Modulo di configurazione: chiede il token e chiama `/api/admin/migrate`.
 *
 * Il token viaggia in un'intestazione della richiesta e non viene mai salvato,
 * né nel browser né nel database: resta nello stato del componente per la durata
 * della pagina. Il campo è di tipo password perché il valore non va letto da chi
 * guarda lo schermo.
 */
export function SetupPanel({ tokenConfigurato }: { tokenConfigurato: boolean }) {
  const [token, setToken] = React.useState('');
  const [conSeed, setConSeed] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [esito, setEsito] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [dettagli, setDettagli] = React.useState<EsitoMigrazione | null>(null);

  if (!tokenConfigurato) {
    return (
      <div className="rounded-md border border-line bg-surface-sunken px-3 py-2.5">
        <p className="text-xs font-medium text-ink">Configurazione non attiva</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          La variabile <span className="font-mono">MIGRATION_TOKEN</span> non è impostata. Aggiungila fra le variabili
          d’ambiente del tuo hosting (almeno 16 caratteri, generata a caso), rifai il deploy e ricarica questa pagina.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Se il database è già configurato, questo è il comportamento corretto: la variabile va rimossa a lavoro finito.
        </p>
      </div>
    );
  }

  const esegui = async () => {
    if (token.trim().length < 16) {
      setEsito({ ok: false, message: 'Il token deve avere almeno 16 caratteri.' });
      return;
    }

    setPending(true);
    setEsito(null);
    setDettagli(null);

    try {
      const response = await fetch(`/api/admin/migrate${conSeed ? '?seed=1' : ''}`, {
        method: 'POST',
        headers: { 'x-migration-token': token.trim() },
      });
      const data = (await response.json()) as EsitoMigrazione;
      setDettagli(data);

      if (response.status === 401) {
        setEsito({ ok: false, message: 'Token non valido: controlla di aver copiato lo stesso valore di MIGRATION_TOKEN.' });
      } else if (response.status === 404) {
        setEsito({ ok: false, message: 'Configurazione non attiva sul server. Verifica MIGRATION_TOKEN e rifai il deploy.' });
      } else if (!response.ok) {
        setEsito({ ok: false, message: data.dettaglio ?? data.errore ?? 'Operazione non riuscita.' });
      } else {
        const attivita = data.seed?.tasks;
        setEsito({
          ok: true,
          message: attivita
            ? `Database pronto: ${attivita} attività, ${data.seed?.projects ?? 0} progetti, ${data.seed?.organizations ?? 0} organizzazioni.`
            : 'Struttura del database creata.',
        });
      }
    } catch (error) {
      setEsito({
        ok: false,
        message: `Richiesta non riuscita: ${error instanceof Error ? error.message : 'errore di rete'}`,
      });
    } finally {
      setPending(false);
      setToken('');
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="migration-token" className="mb-1 block text-xs font-medium text-ink">
          Token di configurazione
        </label>
        <Input
          id="migration-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Incolla qui il valore di MIGRATION_TOKEN"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void esegui();
          }}
        />
        <p className="mt-1 text-[11px] text-muted">
          È il valore che hai impostato fra le variabili d’ambiente. Non viene salvato da nessuna parte.
        </p>
      </div>

      <label className="flex items-start gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={conSeed}
          onChange={(event) => setConSeed(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
        />
        <span>
          Carica anche i dati iniziali
          <span className="block text-[11px] text-muted">
            32 attività (SD-001…SD-032), 14 progetti, 21 organizzazioni, 9 persone e 10 conversazioni dimostrative.
            Togli la spunta per partire da un gestionale vuoto.
          </span>
        </span>
      </label>

      <Button variant="primary" disabled={pending || token.trim().length === 0} onClick={() => void esegui()}>
        {pending ? 'Preparazione in corso…' : 'Prepara il database'}
      </Button>

      <ActionFeedback result={esito} />

      {dettagli?.migrazioniApplicate ? (
        <div className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-[11px] text-muted">
          <p>
            Migrazioni applicate ora:{' '}
            <span className="font-mono text-ink">
              {dettagli.migrazioniApplicate.length > 0 ? dettagli.migrazioniApplicate.join(', ') : 'nessuna'}
            </span>
          </p>
          {typeof dettagli.migrazioniGiaPresenti === 'number' ? (
            <p>Migrazioni già presenti: {dettagli.migrazioniGiaPresenti}</p>
          ) : null}
          {dettagli.prossimoPasso ? <p className="mt-1 text-ink">{dettagli.prossimoPasso}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
