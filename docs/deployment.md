# Deployment

Applicazione privata e monoutente, destinata a `ops.skilldonor.org`.

## Requisiti

| Componente | Versione | Note |
| --- | --- | --- |
| Node.js | ≥ 22 | |
| pnpm | 10.x | `corepack enable` |
| PostgreSQL | 16 | In produzione **non** usare PGlite |
| Reverse proxy con TLS | — | Caddy, nginx o l'equivalente della piattaforma |

---

## 1. Database

```bash
createdb sdoh
createuser sdoh --pwprompt
psql -c 'GRANT ALL PRIVILEGES ON DATABASE sdoh TO sdoh;'
```

Il volume del database deve essere **cifrato a riposo**: contiene corrispondenza
e riferimenti a documenti riservati.

## 2. Variabili d'ambiente

Partire da `.env.example`. Minimo per la produzione:

```env
DATABASE_URL=postgres://sdoh:PASSWORD@localhost:5432/sdoh

# openssl rand -base64 32 — custodire in un gestore di segreti, non sul filesystem
TOKEN_ENCRYPTION_KEY=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://ops.skilldonor.org/api/auth/callback
ALLOWED_EMAIL=g.salerno@skilldonor.org

# Disattiva l'ingresso senza autenticazione: obbligatorio in produzione
DEMO_MODE=off

OPENAI_API_KEY=...
OPENAI_MODEL=...
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
```

⚠️ **`DEMO_MODE=off` è obbligatorio in produzione**: la modalità demo è un
ingresso senza autenticazione.

⚠️ `TOKEN_ENCRYPTION_KEY` non va tenuta accanto al database: chi ottiene entrambi
ottiene i token Gmail. Se la si ruota, tutte le sessioni decadono e Gmail va
ricollegata.

## 3. Build e avvio

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed        # solo al primo avvio, se si vuole lo snapshot iniziale
pnpm build
pnpm start          # porta 3200
```

Il seed è idempotente: rieseguirlo non duplica nulla, ma sovrascrive le 32
attività dello snapshot con i valori originali. Dopo la messa in esercizio, **non
rieseguirlo**.

## 3-bis. Vercel e piattaforme serverless

Il deploy su Vercel funziona, ma con un vincolo che va capito prima di iniziare.

### PGlite non è utilizzabile in serverless

Senza `DATABASE_URL` l'applicazione usa PGlite, che **scrive su disco e mantiene
lo stato fra una richiesta e l'altra**. Su Vercel nessuna delle due cose è vera:
il filesystem è di sola lettura tranne `/tmp`, e ogni invocazione può girare su
un'istanza diversa. I dati sparirebbero fra una schermata e la successiva.

L'applicazione se ne accorge e **si ferma con un messaggio esplicito** invece di
fallire a metà di una migrazione: la pagina di accesso dichiara che la modalità
demo non è disponibile e spiega cosa manca.

**Serve quindi un PostgreSQL gestito**: Vercel Postgres, Neon, Supabase o
equivalente.

### Impostazioni del progetto

| Impostazione | Valore |
| --- | --- |
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js (rilevato) |
| **Node.js Version** | 22.x |

`apps/web/vercel.json` contiene già `installCommand` e `buildCommand` corretti
per il workspace pnpm: l'installazione parte dalla radice del monorepo, così i
package interni vengono risolti.

### Variabili d'ambiente

```
DATABASE_URL           postgres://…        obbligatoria
TOKEN_ENCRYPTION_KEY   openssl rand -base64 32   obbligatoria
DEMO_MODE              off
GOOGLE_CLIENT_ID       …
GOOGLE_CLIENT_SECRET   …
GOOGLE_REDIRECT_URI    https://<dominio>/api/auth/callback
ALLOWED_EMAIL          g.salerno@skilldonor.org
OPENAI_API_KEY / OPENAI_MODEL           facoltative
ANTHROPIC_API_KEY / ANTHROPIC_MODEL     facoltative
```

`GOOGLE_REDIRECT_URI` deve coincidere **carattere per carattere** con l'URI
registrato in Google Cloud Console. Gli URL di anteprima di Vercel cambiano a
ogni deploy: registrare il dominio stabile di produzione, non quello di preview.

### Migrazioni

Le migrazioni **non vengono eseguite dal deploy**: sarebbero un'operazione di
schema dentro un processo effimero, con più istanze in parallelo. Vanno lanciate
una volta, dalla propria macchina, puntando al database remoto:

```bash
DATABASE_URL='postgres://…' pnpm db:migrate
DATABASE_URL='postgres://…' pnpm db:seed     # solo al primo avvio
```

### Limiti da conoscere

- **Il server MCP non gira su Vercel**: usa il trasporto stdio ed è pensato per
  essere avviato dal client sulla macchina dell'utente. Il deploy web e l'MCP
  sono due cose distinte.
- **Rate limiting in memoria**: con più istanze serverless ogni istanza ha il
  proprio contatore. Per un uso monoutente è accettabile; per un uso intenso
  serve un contatore condiviso.
- `x-forwarded-host` e `x-forwarded-proto` sono impostati dal proxy di Vercel,
  quindi i redirect di accesso funzionano senza configurazione aggiuntiva.

## 4. Reverse proxy

L'applicazione si fida di `x-forwarded-host` e `x-forwarded-proto` per costruire
i redirect (`apps/web/src/lib/absolute-url.ts`): il proxy deve impostarli, e non
deve permettere al client di iniettarli.

Esempio Caddy:

```caddy
ops.skilldonor.org {
    reverse_proxy 127.0.0.1:3200 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

Esempio nginx:

```nginx
server {
    server_name ops.skilldonor.org;
    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP         $remote_addr;
    }
}
```

L'app invia già `Strict-Transport-Security`, CSP con nonce, `X-Frame-Options`,
`X-Content-Type-Options` e `Referrer-Policy`: **il proxy non deve duplicarli né
sovrascriverli**, in particolare la CSP (il nonce cambia a ogni richiesta).

## 5. Servizio systemd

```ini
[Unit]
Description=Skill Donor Operations Hub
After=network.target postgresql.service

[Service]
Type=simple
User=sdoh
WorkingDirectory=/opt/gestionale-skill-donor
EnvironmentFile=/etc/sdoh/env
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=5

# Irrigidimento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/gestionale-skill-donor/.next

[Install]
WantedBy=multi-user.target
```

`/etc/sdoh/env` deve essere `chmod 600`, di proprietà di root.

## 6. Backup

Il database è l'unico stato: non ci sono file caricati dall'applicazione.

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M)
pg_dump --format=custom --file="/var/backups/sdoh/sdoh-${STAMP}.dump" sdoh
find /var/backups/sdoh -name 'sdoh-*.dump' -mtime +30 -delete
```

Il dump contiene i token OAuth **cifrati**: senza `TOKEN_ENCRYPTION_KEY` restano
inutilizzabili. Conservare la chiave separatamente, e non nello stesso backup.

### Restore

```bash
systemctl stop sdoh
dropdb sdoh && createdb sdoh
pg_restore --dbname=sdoh /var/backups/sdoh/sdoh-20260810-0300.dump
pnpm db:migrate    # allinea eventuali migrazioni successive al dump
systemctl start sdoh
```

**Il restore va provato**, non solo documentato: un backup mai ripristinato non è
un backup. Verificare dopo il ripristino che le 32 attività e l'audit log siano
presenti.

## 7. Aggiornamenti

```bash
git pull
pnpm install --frozen-lockfile
pnpm db:migrate      # prima del build: lo schema deve precedere il codice
pnpm build
systemctl restart sdoh
```

Le migrazioni sono additive e ordinate per nome file. Il migratore registra ciò
che ha applicato in `__drizzle_migrations` e salta il resto.

## 8. Monitoraggio

Nessun sistema di alerting è incluso. Il minimo indispensabile:

- **Salute applicativa** — `GET /accedi` deve rispondere 200.
- **Sincronizzazione Gmail** — *Impostazioni → Gmail* mostra ultimo esito ed
  eventuale errore; `lastSyncStatus` in `integration_tokens` è interrogabile.
- **Errori AI** — *Registro AI* riporta il conteggio degli errori.
- **Crescita del database** — la retention dei corpi email va applicata
  periodicamente (*Impostazioni → Applica retention ora*, oppure una attività
  pianificata che invochi la stessa logica).

## 9. Manutenzione dell'audit log

L'audit log è append-only per trigger. La purga controllata:

```sql
SELECT audit_log_purge(730);   -- rimuove le voci più vecchie di 730 giorni
```

Registra la purga prima di eseguirla, quindi la rimozione stessa resta tracciata.

## 10. Verifica dopo il deploy

1. `https://ops.skilldonor.org/accedi` mostra **solo** “Accedi con Google”
   (nessun pulsante demo: conferma che `DEMO_MODE=off` è attivo).
2. L'accesso con l'indirizzo autorizzato funziona; con un altro account viene
   respinto con `account_non_autorizzato`.
3. *Impostazioni* riporta il database corretto e gli scope attesi.
4. Sincronizzazione Gmail: vedi `docs/gmail-oauth.md` § "Verifica del collegamento".
5. `curl -I https://ops.skilldonor.org/accedi` mostra CSP, HSTS e `X-Frame-Options`.
