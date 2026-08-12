# Skill Donor Operations Hub

Gestionale interno di **Skill Donor S.r.l. – SIAVS**: fonte unica e strutturata per
attività e scadenze, progetti e matching, ETS, donor, partner e soci, persone,
corrispondenza Gmail, documenti, bozze da approvare, attività in attesa di terzi,
decisioni, interventi dell'intelligenza artificiale e accesso ai dati da ChatGPT e
Claude tramite un server MCP condiviso.

Applicazione **privata e monoutente**, in italiano, fuso `Europe/Rome`,
desktop-first ma responsive, predisposta per il dominio `ops.skilldonor.org`.

---

## Avvio in tre comandi

Non servono credenziali, non serve Docker, non serve un database in esecuzione.

```bash
pnpm install
pnpm db:seed      # migrazioni + snapshot del 10 agosto 2026 (idempotente)
pnpm dev          # http://localhost:3200
```

Alla schermata di accesso scegliere **“Entra in modalità demo”**.

Perché funziona senza infrastruttura: in assenza di `DATABASE_URL` l'app usa
**PGlite**, cioè PostgreSQL compilato in WASM ed eseguito nel processo Node.
Non è un mock — sono le stesse migrazioni e lo stesso SQL della produzione.

### Con un PostgreSQL reale

```bash
pnpm db:up                                                   # docker compose
echo 'DATABASE_URL=postgres://sdoh:sdoh_local_dev@localhost:5433/sdoh' >> .env
pnpm db:migrate && pnpm db:seed
pnpm dev
```

---

## Script disponibili

| Comando | Effetto |
| --- | --- |
| `pnpm install` | Installa le dipendenze del monorepo |
| `pnpm dev` | Avvia l'app in sviluppo su `:3200` |
| `pnpm build` | Build di produzione |
| `pnpm start` | Avvia la build di produzione |
| `pnpm lint` | ESLint (configurazione Next) |
| `pnpm typecheck` | `tsc --noEmit` su package, web e MCP |
| `pnpm test` | Unit e integration test (Vitest, PGlite in memoria) |
| `pnpm test:e2e` | Test end-to-end (Playwright) |
| `pnpm verify` | lint + typecheck + test in sequenza |
| `pnpm db:generate` | Genera una migrazione dallo schema Drizzle |
| `pnpm db:migrate` | Applica le migrazioni |
| `pnpm db:seed` | Migrazioni + seed idempotente |
| `pnpm db:reset --force` | Ricrea lo schema da zero (solo host locali) |
| `pnpm db:up` / `pnpm db:down` | PostgreSQL locale via Docker Compose |
| `pnpm mcp` | Avvia il server MCP su stdio |
| `pnpm setup` | `install` + `db:migrate` + `db:seed` |

### Diagnostica di un'istanza online

```bash
curl -s https://<dominio>/api/health | jq
```

Riporta driver del database, migrazioni applicate, variabili mancanti e stato
delle integrazioni. Non espone alcun valore riservato: solo i nomi delle
variabili mancanti e indicatori booleani.

---

## Struttura

```
skill-donor-ops-hub/
├── apps/
│   ├── web/          Next.js 16 (App Router) — UI, API, auth, assistente
│   └── mcp/          server MCP stdio riusabile da Claude e ChatGPT
├── packages/
│   ├── core/         dominio puro: enum, regole, filtri, CSV, redazione log
│   ├── db/           schema Drizzle, migrazioni, seed, query
│   ├── ai/           provider OpenAI / Anthropic / mock + schemi di output
│   ├── email/        adapter Gmail (reale e mock), OAuth, cifratura token
│   └── ui/           design system: token di brand + primitive accessibili
├── e2e/              test Playwright
├── tests/            test Vitest
└── docs/             architettura, modello dati, threat model, OAuth, MCP, deploy
```

---

## Cosa è realmente operativo

Verificato in questo ambiente, senza credenziali esterne:

- **Database, migrazioni e seed** — 32 attività `SD-001`…`SD-032`, 14 progetti,
  21 organizzazioni, 9 persone, 10 conversazioni dimostrative, 6 documenti.
  Il seed è idempotente: rieseguirlo non duplica nulla (test automatico).
- **Attività** — vista tabella e Kanban, filtri, ricerca, ordinamento, modifica
  rapida, selezione multipla, esportazione CSV, viste salvate, dettaglio con
  timeline, dipendenze, collegamenti e cronologia AI.
- **Dashboard “Oggi”** — scadute, in scadenza, priorità, attività ferme da 7 e 10
  giorni, follow-up dovuti, email da classificare, bozze in attesa, riepilogo per
  progetto.
- **Inbox operativa** in modalità demo — sincronizzazione, collegamento a
  un'attività, creazione di attività da email, classificazione, recupero del corpo
  su richiesta, apertura del thread in Gmail.
- **Bozze e approvazioni** — generazione, modifica, approvazione, rifiuto e
  trasferimento (simulato in demo) verso Gmail, sempre dopo conferma esplicita.
- **Assistente interno** — risponde sui dati registrati, cita le fonti, distingue
  fatti e inferenze, propone azioni senza applicarle.
- **Registro AI e audit log** — ogni chiamata e ogni azione con effetti. L'audit
  log è append-only per costruzione: un trigger PostgreSQL rifiuta `UPDATE` e
  `DELETE` (verificato da test).
- **Server MCP** — 13 tool, trasporto stdio. Le letture sono dirette, le scritture
  creano soltanto proposte in coda di approvazione (verificato da test).
- **Modalità demo** — deterministica e sempre etichettata come tale.

## Cosa è predisposto ma non verificabile qui

Queste funzioni sono implementate secondo la documentazione ufficiale, ma **non
sono state eseguite contro il servizio reale**, perché l'ambiente di sviluppo non
disponeva di credenziali. L'interfaccia le dichiara esplicitamente.

| Funzione | Stato | Serve per verificarla |
| --- | --- | --- |
| Accesso Google OAuth | codice completo, non eseguito | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ALLOWED_EMAIL` |
| Sincronizzazione Gmail reale | codice completo, non eseguito | collegamento OAuth attivo |
| Creazione di bozze in Gmail | codice completo, non eseguito | collegamento OAuth attivo |
| Classificazione e bozze con OpenAI | adapter completo, non eseguito | `OPENAI_API_KEY` + `OPENAI_MODEL` |
| Revisione con Anthropic | adapter completo, non eseguito | `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` |

## Cosa non è implementato, e perché

- **Invio di email** — assente per scelta architetturale. Non esiste alcun
  endpoint, pulsante o funzione che spedisca un messaggio; lo scope
  `gmail.send` non viene mai richiesto. Un test automatico (`tests/no-send.test.ts`)
  scandisce l'intero repository e fallisce se qualcuno lo reintroduce.
- **Notifiche push Gmail (Google Cloud Pub/Sub)** — l'adapter è predisposto
  (cursore `historyId` persistito, sincronizzazione incrementale implementata), ma
  la funzione non è testabile senza un progetto Google Cloud: l'interfaccia la
  dichiara non attiva anziché mostrare un pulsante che non fa nulla.
- **Trasporto MCP HTTP remoto** — previsto dall'architettura, non esposto: senza
  dominio e senza un meccanismo di autenticazione verificabile sarebbe una
  funzione dichiarata e non provata.
- **Multiutente completo, fatturazione, CRM commerciale, portale esterno per ETS
  o donor, app mobile nativa** — fuori dal perimetro dell'MVP.

---

## Identità visiva

Colori ufficiali: arancione **`#FF5900`**, grigio **`#404040`**. `#FF4900` non
compare in nessun punto del codice. L'arancione è un colore di accento — bordi,
indicatori, stati selezionati, focus — non lo sfondo dominante.

**Logo.** Il marchio non viene ridisegnato né approssimato: l'applicazione cerca
`apps/web/public/brand/skill-donor-logo.png` e, se lo trova, lo mostra così com'è
in intestazione e nella pagina di accesso. Se il file non è presente resta un
segnaposto tipografico neutro, senza immagini rotte. Nessuna modifica al codice è
necessaria: vedi [`apps/web/public/brand/README.md`](apps/web/public/brand/README.md).

Contrasto: i token di testo rispettano WCAG AA (`#404040` su bianco = 10,4:1).
L'arancione puro su bianco vale 3,1:1, quindi è usato solo per elementi grafici;
le azioni primarie usano `#C44300` (bianco su questo fondo = 5,0:1).

---

## Documentazione

| Documento | Contenuto |
| --- | --- |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Piano, discovery, decisioni e registro dei problemi |
| [`docs/architecture.md`](docs/architecture.md) | Architettura, scelte tecnologiche e motivazioni |
| [`docs/data-model.md`](docs/data-model.md) | Entità, relazioni, enum e politiche di conservazione |
| [`docs/threat-model.md`](docs/threat-model.md) | Minacce, contromisure e rischi residui |
| [`docs/gmail-oauth.md`](docs/gmail-oauth.md) | Configurazione Google OAuth passo per passo |
| [`docs/mcp.md`](docs/mcp.md) | Server MCP: installazione, Claude, ChatGPT, permessi, minacce |
| [`docs/guida-deploy-vercel.md`](docs/guida-deploy-vercel.md) | **Guida passo passo per mettere online l'app** (per chi non è sviluppatore) |
| [`docs/deployment.md`](docs/deployment.md) | Deploy, backup, restore, monitoraggio |
| [`docs/roadmap.md`](docs/roadmap.md) | Milestone successive |
| [`SECURITY.md`](SECURITY.md) | Principi di sicurezza e segnalazione delle vulnerabilità |
| [`CLAUDE.md`](CLAUDE.md) | Istruzioni per gli agenti che lavorano su questo repository |
