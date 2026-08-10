# Skill Donor Operations Hub — Piano di implementazione

> Documento vivo. Aggiornato al termine di ogni milestone.
> Ultimo aggiornamento: 10 agosto 2026.

## 0. Esito della discovery (obbligatoria, eseguita prima di scrivere codice)

Ispezione integrale del repository inizialmente assegnato,
`salernoguglielmo-a11y/Trivago-per-traghetti`.

> **Aggiornamento (10 agosto 2026).** Dopo la discovery il committente ha fornito
> un repository dedicato, `salernoguglielmo-a11y/Gestionale-Skill-Donor`, e il file
> del logo. Il progetto è stato spostato alla radice di quel repository e il
> repository originale è rimasto intatto. Le osservazioni della discovery restano
> qui perché spiegano le decisioni prese prima dello spostamento.

| Verifica richiesta | Esito |
| --- | --- |
| `CLAUDE.md` / `AGENTS.md` o equivalenti | **Non presenti** in tutto il repository |
| `./project_sources/` con i materiali di brand | **Non presente**. I file `01-Skill_Donor_Logo_Colori_Ufficiali.pdf`, `02-Skill_Donor_Logo.png`, `09-Skill_Donor_Logo-1-1-.png` non esistono nel repository né altrove nel workspace |
| Altri PDF/documenti riservati | Nessuno |
| Contenuto esistente | Progetto **MOLO** — metamotore di confronto prezzi traghetti (Next.js 14 + React 18 + Tailwind 3, dati statici in `src/data`), 40 file tracciati, 14 commit |
| Tecnologie già presenti | Next.js 14.2.35, React 18, TypeScript 5, Tailwind 3.4, ESLint 8, npm (`package-lock.json`), deploy Vercel |
| Modifiche preesistenti | Tutto il codice MOLO in `src/`, `public/`, `.github/workflows/fetch-timetables.yml`, `vercel.json` |

### Conseguenze operative

1. **Nessun asset logo disponibile.** Non è possibile ritagliare o ottimizzare un logo
   che non esiste. Il principio "non ridisegnarlo" viene rispettato **non producendo
   alcun logo**: l'applicazione usa un segnaposto tipografico neutro (wordmark
   "Skill Donor" + marcatore geometrico) e un punto di innesto documentato
   (`apps/web/public/brand/README.md`) dove inserire i file ufficiali. I **colori
   ufficiali sono invece noti dal brief** e vengono applicati integralmente:
   arancione `#FF5900`, grigio `#404040`. `#FF4900` non compare mai nel codice.
2. **Il repository originale non è stato sovrascritto.** MOLO è lavoro preesistente:
   il gestionale è stato sviluppato in una sottodirectory autonoma e poi trasferito
   nel repository dedicato. Nessun file MOLO è stato modificato o rimosso.

### Esito

Il prodotto vive ora alla radice di `Gestionale-Skill-Donor`, con il proprio
workspace pnpm. Lo spostamento non ha richiesto modifiche al codice: la directory
era già self-contained.

---

## 1. Architettura in sintesi

Monorepo pnpm, TypeScript strict ovunque, nessuno step di build per i package interni
(sorgenti TS consumati direttamente via `transpilePackages` di Next e `tsx` per l'MCP):
meno configurazione, meno stati intermedi, refactor atomici.

```
skill-donor-ops-hub/
├── apps/
│   ├── web/     Next.js (App Router) — UI, API route, auth, assistente
│   └── mcp/     server MCP stdio (SDK ufficiale) riusabile da Claude e ChatGPT
└── packages/
    ├── core/    dominio puro: tipi, enum, regole (staleness, brief, filtri, CSV, redazione log)
    ├── db/      schema Drizzle, migrazioni, client factory, seed idempotente
    ├── ai/      astrazione provider (OpenAI / Anthropic / mock) + schemi Zod di output
    ├── email/   adapter Gmail (reale + mock), OAuth, cifratura token
    └── ui/      design system: token di brand + primitive accessibili su Radix
```

### Decisioni architetturali e motivazioni

| Decisione | Scelta | Motivazione |
| --- | --- | --- |
| Framework | **Next.js 16.3 (App Router)** + React 19.2 | Server Components riducono il JS inviato al client; le Server Action danno mutazioni con validazione server-side per default. Versione stabile corrente. |
| Linguaggio | **TypeScript 5.9** strict | TS 7.x è troppo recente per l'ecosistema Next/ESLint: stabilità prima di novità. |
| ORM | **Drizzle 0.45** + drizzle-kit 0.31 | SQL-first, tipi derivati dallo schema, migrazioni versionate leggibili in `packages/db/migrations`. Nessun runtime pesante. |
| Database | **PostgreSQL 16** | Richiesto. Due driver dietro la stessa interfaccia Drizzle. |
| Database in demo/test | **PGlite 0.5** (Postgres compilato in WASM) | Decisione chiave: l'app è **realmente eseguibile senza Docker e senza credenziali**. È Postgres vero (stesse migrazioni, stesso SQL), non un mock. `postgres-js` per l'ambiente reale, PGlite per demo, sviluppo offline e test. |
| Validazione | **Zod 4** | Un unico schema per form, API route, tool MCP e output strutturati dei modelli. |
| Stile | **Tailwind 4.3** (config CSS-first) | Token di brand definiti una sola volta in `@theme`, consumati da UI e app. |
| Componenti | **Radix Primitives** + componenti scritti a mano in stile shadcn | Accessibilità reale (focus trap, ARIA, tastiera) senza dipendere da un generatore di codice. |
| Auth | **Google OAuth 2.0** con `google-auth-library` (SDK ufficiale) + sessione in cookie cifrato AES-256-GCM | Serve comunque l'SDK Google per Gmail. Allowlist su singola email. Evita una dipendenza auth in beta. |
| Test | **Vitest 4** (unit + integration su PGlite) e **Playwright 1.62** (E2E) | Gli integration test girano su Postgres reale in-process: nessun servizio esterno in CI. |
| AI | SDK ufficiali **openai 7** e **@anthropic-ai/sdk 0.116** | Nessun model id hardcoded: i modelli arrivano da env/impostazioni. |
| MCP | **@modelcontextprotocol/sdk 1.30**, trasporto stdio | Trasporto ufficialmente supportato sia da Claude Desktop sia dai client MCP. HTTP rimandato: non testabile senza dominio e credenziali. |

### Invarianti di sicurezza codificate

- **Nessun percorso di invio email esiste nel codice.** Lo scope Gmail `gmail.send` non è
  mai richiesto; non esiste alcuna funzione `send`. Verificato da un test automatico
  (`no-send.test.ts`) che fallisce se compare uno scope o un metodo di invio.
- Contenuti email e allegati sono sempre incapsulati in un blocco marcato come **dati
  non affidabili** prima di raggiungere qualsiasi modello, mai come istruzioni.
- Le scritture esposte via MCP creano **proposte**, mai modifiche dirette.
- Ogni azione automatica scrive su `audit_log` (append-only, trigger che vieta UPDATE/DELETE).

---

## 2. Modello dati preliminare

Entità e relazioni principali (dettaglio completo in `docs/data-model.md`).

```
User ──1:N── AuditLog
Organization ──N:M── Project        (project_organizations, con ruolo)
Organization ──1:N── Contact
Project ──1:N── Task ──1:N── TaskEvent          (timeline)
Task ──N:M── Task                   (task_dependencies: blocca / bloccata da)
Task ──N:M── Contact/Organization   (task_links, polimorfico tipizzato)
Task ──N:M── EmailThread            (task_email_threads)
EmailThread ──1:N── EmailMessage    (solo metadati; corpo on demand, mai persistito per default)
Project/Task ──1:N── Document
AIDraft ──0:1── Approval ──1:N── AuditLog
AIAction (registro AI: provider, modello, confidenza, token, esito)
SavedView, AppSetting, IntegrationToken (cifrato at rest)
```

Enum: `task_status` (da_fare, in_lavorazione, in_attesa, bloccata, da_verificare,
completata, archiviata), `task_priority` (critica, alta, media, bassa),
`organization_type`, `project_status`, `draft_status`, `approval_status`,
`actor_type` (umano / ai / sistema), `confidentiality`.

Nota: `da_verificare` estende gli stati iniziali del brief perché il seed richiesto
(SD-030, SD-031) lo usa esplicitamente.

---

## 3. Milestone e stato

| # | Milestone | Stato |
| --- | --- | --- |
| 1 | Discovery e architettura | ✅ completata |
| 2 | Fondazioni, schema DB, migrazioni, seed SD-001…SD-032 | ✅ completata |
| 3 | Attività (tabella, kanban, dettaglio, filtri, CSV, viste) e dashboard Oggi | ✅ completata |
| 4 | Inbox operativa e Gmail adapter (mock + reale) | ✅ completata |
| 5 | Provider AI, bozze, approvazioni, registro AI, assistente | ✅ completata |
| 6 | Server MCP | ✅ completata |
| 7 | Sicurezza, test, documentazione | ✅ completata |
| 8 | Verifica visiva e handoff | ✅ completata |

## 3-bis. Esito delle verifiche (10 agosto 2026)

Eseguite sul repository `Gestionale-Skill-Donor`, senza credenziali esterne.

| Controllo | Comando | Esito |
| --- | --- | --- |
| Lint | `pnpm lint` | ✅ nessun problema |
| Type check | `pnpm typecheck` | ✅ package, web e MCP |
| Test unitari e di integrazione | `pnpm test` | ✅ 76/76 (5 file) |
| Test end-to-end | `pnpm test:e2e` | ✅ 63/63 (21 × 1440 px, 1024 px, smartphone) |
| Build di produzione | `pnpm build` | ✅ 27 route |
| Server MCP | handshake stdio | ✅ 13 tool, lettura reale, scrittura come proposta |

### Difetti trovati dai test e corretti

Non cosmetici: tre sarebbero arrivati in produzione.

1. **Redirect di autenticazione costruiti sull'host sbagliato.** `new URL(path,
   request.url)` restituiva l'host interno anziché quello pubblico: il cookie di
   sessione non veniva inviato e l'utente tornava alla pagina di accesso. Dietro
   `ops.skilldonor.org` avrebbe reso impossibile l'accesso. Corretto con
   `absoluteUrl()`, che usa `x-forwarded-host` / `x-forwarded-proto`.
2. **Race nella barra filtri.** Digitare nella ricerca e cliccare subito un
   filtro faceva perdere uno dei due aggiornamenti, per via di una closure sui
   parametri ormai vecchia. Ora le modifiche partono dall'URL corrente.
3. **Conferma persa approvando una bozza.** L'approvazione sposta la bozza nello
   storico e smonta il riquadro che conteneva il messaggio: l'utente vedeva una
   riga sparire senza spiegazione. Il riscontro è stato spostato sopra l'elenco.
4. **Trabocco orizzontale su smartphone.** Gli elementi di griglia hanno
   `min-width: auto` e non si restringevano sotto la larghezza del contenuto.
   Risolto con `min-w-0` sulle colonne.
5. **Euristica di prompt injection incompleta in inglese.** «Ignore all previous
   instructions» non veniva riconosciuta. Espressione regolare corretta e test
   estesi a più formulazioni.
6. **`next lint` rimosso in Next 16.** Sostituito con `eslint .` e configurazione
   flat nativa; corretti due errori reali di React (`setState` sincrono dentro un
   effetto) in barra filtri e palette dei comandi.

## 4. Registro decisioni e problemi

- **2026-08-10 — `project_sources/` assente.** Non bloccante: colori ufficiali noti dal
  brief, logo sostituito da un segnaposto con punto di innesto documentato.
  Nessun asset inventato, nessun logo ridisegnato.
- **2026-08-10 — Repository originale occupato da un altro progetto.** Isolamento in
  sottodirectory anziché sovrascrittura; poi trasferimento nel repository dedicato
  fornito dal committente.
- **2026-08-10 — Logo ufficiale fornito.** Il componente `brand.tsx` ora carica
  `public/brand/skill-donor-logo.png` se presente, senza alcuna modifica al codice
  e senza alterare proporzioni o colori del marchio.
- **2026-08-10 — Nessuna credenziale disponibile** (Google OAuth, OpenAI, Anthropic).
  Adapter completi + modalità demo deterministica dichiarata in interfaccia. Le
  integrazioni reali non sono verificabili in questo ambiente: elencato in
  `README.md` § "Cosa non è stato possibile verificare".
- **2026-08-10 — Gmail push (Pub/Sub) non implementato.** L'adapter espone il punto di
  estensione ma l'interfaccia dichiara la funzione come non attiva: nessun pulsante finto.
