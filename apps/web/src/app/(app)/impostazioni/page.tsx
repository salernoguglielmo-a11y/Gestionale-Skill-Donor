import { AI_MODE_LABELS, formatDateTime } from '@sdoh/core';
import { getDb, getOwnerUser } from '@sdoh/db';
import { GMAIL_SCOPES } from '@sdoh/email';
import { Badge, Button, Card, CardHeader, NotImplementedNote } from '@sdoh/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GmailDisconnectButton, RetentionButton, SettingsForm } from '@/components/settings-form';
import { InfoNote } from '@/components/feedback';
import { providerStatus } from '@/lib/ai-service';
import { getAuthMode, requireUser } from '@/lib/auth';
import { getGmailState } from '@/lib/gmail-service';
import { loadSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'Impostazioni' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [settings, gmail, ai, owner, authMode] = await Promise.all([
    loadSettings(),
    getGmailState(),
    providerStatus(),
    getOwnerUser(db),
    Promise.resolve(getAuthMode()),
  ]);

  const { getDbHandle } = await import('@sdoh/db');
  const handle = await getDbHandle();

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold text-ink-strong">Impostazioni</h1>
        <p className="text-xs text-muted">Account, integrazioni, criteri di autonomia, retention e stato di salute.</p>
      </header>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Account" />
          <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
            <Row label="Nome" value={owner?.name ?? user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Ruolo" value={owner?.role ?? user.role} />
            <Row label="Fuso orario" value={owner?.timezone ?? 'Europe/Rome'} />
            <Row label="Ultimo accesso" value={owner?.lastLoginAt ? formatDateTime(owner.lastLoginAt) : '—'} />
            <Row
              label="Modalità di accesso"
              value={user.mode === 'demo' ? 'Demo (nessun servizio esterno)' : 'Google OAuth'}
            />
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-faint">Permessi</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1">
                {user.permissions.map((permission) => (
                  <Badge key={permission} tone="outline">
                    {permission}
                  </Badge>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-faint">Allowlist</dt>
              <dd className="text-ink">
                {authMode.allowedEmail
                  ? `Solo ${authMode.allowedEmail} può accedere con Google.`
                  : 'ALLOWED_EMAIL non impostata: l’accesso Google è disattivato.'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Gmail" description="Sola lettura più creazione di bozze. Nessuna capacità di invio." />
          <div className="space-y-3 px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              {gmail.connected ? (
                <>
                  <Badge tone="success">Collegata</Badge>
                  <span className="text-muted">{gmail.accountEmail}</span>
                </>
              ) : (
                <>
                  <Badge tone="warning">Non collegata</Badge>
                  <span className="text-muted">L’inbox mostra dati dimostrativi.</span>
                </>
              )}
            </div>

            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Row
                label="Ultima sincronizzazione"
                value={gmail.lastSyncAt ? formatDateTime(gmail.lastSyncAt) : 'mai'}
              />
              <Row label="Esito" value={gmail.lastSyncStatus ?? '—'} />
              <Row label="Cursore historyId" value={gmail.lastHistoryId ?? '—'} />
              <Row label="Errore" value={gmail.lastSyncError ?? 'nessuno'} />
            </dl>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-faint">Scope richiesti</p>
              <ul className="mt-1 space-y-0.5">
                {GMAIL_SCOPES.map((scope) => (
                  <li key={scope} className="font-mono text-[10px] text-muted">
                    {scope}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">
                <code className="font-mono">gmail.send</code> e <code className="font-mono">gmail.modify</code> non sono
                richiesti: il primo consentirebbe l’invio, il secondo la modifica o l’archiviazione dei messaggi.
              </p>
            </div>

            {gmail.connected ? (
              <GmailDisconnectButton />
            ) : authMode.googleConfigured ? (
              <Button asChild size="sm" variant="primary">
                <a href="/api/auth/google?returnTo=/impostazioni">Collega Gmail con Google</a>
              </Button>
            ) : (
              <div className="rounded-md border border-line bg-surface-sunken px-3 py-2">
                <p className="text-[12px] font-medium text-ink">Collegamento non disponibile</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Variabili mancanti: <span className="font-mono">{authMode.missingVariables.join(', ')}</span>. La
                  procedura completa è in <span className="font-mono">docs/gmail-oauth.md</span>.
                </p>
              </div>
            )}

            <NotImplementedNote>
              <strong>Non attivo:</strong> le notifiche push Gmail via Google Cloud Pub/Sub. L’adapter è predisposto
              (cursore <span className="font-mono">historyId</span> già persistito e sincronizzazione incrementale
              implementata), ma la funzione non è verificabile senza un progetto Google Cloud con Pub/Sub configurato,
              quindi non viene presentata come funzionante.
            </NotImplementedNote>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Provider AI" description="Configurati tramite variabili d’ambiente." />
          <div className="space-y-2 px-4 py-3 text-[13px]">
            <p className="text-muted">
              Criterio attivo: <strong className="text-ink">{AI_MODE_LABELS[settings.aiMode]}</strong>
            </p>
            <ul className="space-y-1.5">
              {(['openai', 'anthropic'] as const).map((key) => (
                <li key={key} className="rounded border border-line px-2.5 py-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-strong">{key === 'openai' ? 'OpenAI' : 'Anthropic'}</span>
                    <Badge tone={ai[key].available ? 'success' : 'warning'}>
                      {ai[key].available ? 'Configurato' : 'Non configurato'}
                    </Badge>
                    {ai[key].model ? <span className="font-mono text-[11px] text-muted">{ai[key].model}</span> : null}
                  </div>
                  {ai[key].reason ? <p className="mt-0.5 text-[11px] text-muted">{ai[key].reason}</p> : null}
                </li>
              ))}
            </ul>
            <InfoNote>
              Gli identificativi dei modelli non sono scritti nel codice: si impostano con{' '}
              <span className="font-mono">OPENAI_MODEL</span> e <span className="font-mono">ANTHROPIC_MODEL</span>, così
              non invecchiano insieme all’applicazione. Senza chiave o senza modello l’app usa l’adapter mock
              deterministico, sempre etichettato come tale.
            </InfoNote>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Server MCP" description="Accesso ai dati da Claude e ChatGPT." />
          <div className="space-y-2 px-4 py-3 text-[13px]">
            <p className="text-muted">
              Il server MCP gira come processo separato e comunica su <strong>stdio</strong>. Le operazioni di lettura
              sono dirette; le scritture creano solo <strong>proposte</strong>, che compaiono nella coda approvazioni e
              diventano dati reali unicamente dopo la tua decisione.
            </p>
            <pre className="overflow-x-auto rounded border border-line bg-surface-sunken p-2 text-[11px] text-ink">
              pnpm mcp
            </pre>
            <p className="text-[11px] text-muted">
              Configurazione per Claude Desktop e per i client compatibili in{' '}
              <span className="font-mono">docs/mcp.md</span>.
            </p>
            <NotImplementedNote>
              <strong>Non attivo:</strong> il trasporto HTTP remoto autenticato. L’architettura lo prevede, ma senza un
              dominio e un meccanismo di autenticazione verificabili non viene esposto.
            </NotImplementedNote>
          </div>
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Criteri, retention e audit" />
          <div className="grid gap-4 px-4 py-3 lg:grid-cols-2">
            <SettingsForm settings={settings} />
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium text-ink">Manutenzione</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Rimuove i corpi email conservati oltre la finestra di retention. I metadati restano.
                </p>
                <div className="mt-1.5">
                  <RetentionButton />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-ink">Audit log</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Append-only garantito da un trigger PostgreSQL.{' '}
                  <Link href="/audit" className="text-brand-deep hover:underline">
                    Consulta il registro
                  </Link>
                  .
                </p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-ink">Salute delle integrazioni</p>
                <ul className="mt-1 space-y-1 text-[11px]">
                  <HealthRow
                    label="Database"
                    ok
                    detail={`${handle.driver === 'pglite' ? 'PGlite (PostgreSQL in-process)' : 'PostgreSQL'} — ${handle.description}`}
                  />
                  <HealthRow label="Gmail" ok={gmail.connected} detail={gmail.connected ? 'collegata' : 'modalità demo'} />
                  <HealthRow
                    label="OpenAI"
                    ok={ai.openai.available}
                    detail={ai.openai.available ? (ai.openai.model ?? '') : 'non configurato'}
                  />
                  <HealthRow
                    label="Anthropic"
                    ok={ai.anthropic.available}
                    detail={ai.anthropic.available ? (ai.anthropic.model ?? '') : 'non configurato'}
                  />
                  <HealthRow
                    label="Accesso Google"
                    ok={authMode.googleConfigured}
                    detail={authMode.googleConfigured ? 'configurato' : `mancano ${authMode.missingVariables.join(', ')}`}
                  />
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-success' : 'bg-warning'}`}
      />
      <span className="w-28 shrink-0 text-ink">{label}</span>
      <span className="text-muted">
        {ok ? 'attivo' : 'non attivo'}
        {detail ? ` — ${detail}` : ''}
      </span>
    </li>
  );
}
