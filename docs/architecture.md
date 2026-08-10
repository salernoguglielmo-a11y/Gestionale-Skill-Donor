# Architettura

## Quadro d'insieme

```
                    ┌──────────────────────────────────────────────┐
   Browser ────────▶│  apps/web — Next.js 16 (App Router)          │
   (privato)        │  Server Components · Server Actions · API    │
                    │  auth Google OAuth · CSP con nonce           │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
   Claude / ChatGPT         │                              │
        │                   ▼                              ▼
        │           ┌───────────────┐            ┌──────────────────┐
        └──stdio───▶│  apps/mcp     │───────────▶│   packages/db    │
                    │  13 tool MCP  │            │  Drizzle + SQL   │
                    │  scritture =  │            └────────┬─────────┘
                    │  proposte     │                     │
                    └───────────────┘            ┌────────▼─────────┐
                                                 │  PostgreSQL 16   │
                            ┌────────────────────┤  oppure PGlite   │
                            │                    └──────────────────┘
              ┌─────────────┴──────────────┬──────────────────┐
              ▼                            ▼                  ▼
      packages/core              packages/ai          packages/email
      dominio puro          OpenAI/Anthropic/mock     Gmail + OAuth
      (nessuna dipendenza)   output validati Zod      (nessun invio)
```

Regola di dipendenza: `core` non dipende da nulla; `db`, `ai`, `email` dipendono
solo da `core`; `web` e `mcp` dipendono dai package, mai fra loro. Le regole di
dominio vivono in un unico punto, quindi dashboard, assistente e server MCP
producono per costruzione gli stessi numeri.

---

## Scelte tecnologiche e motivazioni

| Ambito | Scelta | Perché questa, e non l'alternativa |
| --- | --- | --- |
| Framework | **Next.js 16.3** (App Router) + React 19.2 | I Server Components tengono i dati sul server: l'elenco di 32 attività con progetti e stati arriva al browser come HTML, non come JSON da idratare. Le Server Action danno mutazioni con validazione server-side per default, senza scrivere endpoint REST a mano. |
| Linguaggio | **TypeScript 5.9** strict, con `noUncheckedIndexedAccess` | TypeScript 7.x (port in Go) è troppo recente perché Next ed ESLint lo supportino in modo stabile: qui la stabilità vale più della velocità di compilazione. |
| ORM | **Drizzle 0.45** | SQL-first: le migrazioni sono file `.sql` leggibili e versionati, non un formato proprietario. I tipi derivano dallo schema, quindi una colonna rinominata rompe la compilazione anziché la produzione. Runtime minimo, importante in un'app che gira su Server Components. |
| Database | **PostgreSQL 16**, con **PGlite** come driver alternativo | Decisione architetturale centrale, spiegata sotto. |
| Validazione | **Zod 4** | Un unico schema serve form, API route, tool MCP e output strutturati dei modelli. `z.toJSONSchema` genera anche lo schema JSON per i provider AI: nessuna duplicazione fra validazione e contratto verso il modello. |
| Stile | **Tailwind 4.3**, configurazione CSS-first | I token di brand sono dichiarati una sola volta in `@theme` e consumati da UI e app. Niente file di configurazione JavaScript da tenere allineato al CSS. |
| Componenti | **Radix Primitives** + componenti scritti a mano | Radix fornisce focus trap, ARIA e gestione della tastiera reali. I componenti restano nel repository, quindi modificabili senza combattere con un generatore di codice. |
| Auth | **Google OAuth 2.0** con `google-auth-library` + sessione in cookie cifrato | L'SDK Google serve comunque per Gmail: aggiungere una libreria di autenticazione in beta introdurrebbe una dipendenza critica senza necessità. L'app ha un solo utente e un solo provider: il flusso sta in 150 righe verificabili. |
| Test | **Vitest 4** + **Playwright 1.62** | Gli integration test girano su PostgreSQL reale in-process: nessun servizio esterno in CI, nessun mock del database. |
| AI | SDK ufficiali `openai` e `@anthropic-ai/sdk` | Nessun wrapper di terze parti fra l'app e i provider. |
| MCP | **@modelcontextprotocol/sdk 1.30**, trasporto stdio | Unico trasporto supportato da tutti i client MCP correnti senza infrastruttura aggiuntiva. |

### La scelta di PGlite

`packages/db` espone un solo tipo `Db` con due driver dietro:

- `postgres-js` verso un PostgreSQL reale (`DATABASE_URL=postgres://…`);
- **PGlite** — PostgreSQL compilato in WebAssembly ed eseguito dentro il processo
  Node — quando non c'è alcun database configurato.

Non è un mock e non è un secondo dialetto: esegue le stesse migrazioni e lo stesso
SQL, inclusi `jsonb`, i tipi enum, gli indici parziali e il trigger PL/pgSQL che
rende l'audit log append-only. Conseguenze pratiche:

1. L'applicazione è **avviabile e testabile senza Docker e senza credenziali**:
   `pnpm db:seed && pnpm dev` funziona su una macchina appena clonata.
2. I test di integrazione girano su Postgres vero in memoria, in pochi secondi,
   senza servizi da orchestrare in CI.
3. Il codice applicativo non sa quale driver stia usando: nessun ramo `if (test)`.

Il costo è una dipendenza WASM di alcuni megabyte e prestazioni inferiori a un
PostgreSQL nativo — irrilevante per un'app monoutente con qualche migliaio di
righe, e comunque non usato in produzione.

---

## Invarianti di sicurezza codificate

Queste proprietà non dipendono dalla disciplina di chi scrive il codice: sono
imposte da un test, da un vincolo del database o dalla forma delle API.

| Invariante | Meccanismo |
| --- | --- |
| L'app non può inviare email | `tests/no-send.test.ts` scandisce `apps/` e `packages/` e fallisce se compare uno scope o un metodo di invio, cancellazione o modifica. L'interfaccia `GmailAdapter` non ha alcun metodo che possa spedire. |
| L'audit log non è riscrivibile | Trigger PostgreSQL `audit_log_immutable` su `BEFORE UPDATE OR DELETE`. Verificato da test. |
| Le scritture MCP non modificano dati | I tool `*_proposal` inseriscono in `approvals` con stato `in_attesa`. Verificato da test che confrontano lo stato dell'attività prima e dopo. |
| I contenuti esterni non sono istruzioni | Unico punto di preparazione (`wrapUntrusted`), marcatori neutralizzati, regola di sistema in ogni prompt. Verificato da test. |
| I log non contengono dati sensibili | `recordAudit` applica `redact()` prima dell'`INSERT`: la redazione non è opzionale né dimenticabile al punto di chiamata. |

---

## Flusso di una modifica a un'attività

Esempio: l'utente cambia lo stato di `SD-015` dalla tabella.

1. Il componente client invia la Server Action `quickUpdateTaskAction`.
2. `requirePermission('tasks:write')` verifica sessione, allowlist e permesso.
3. `quickUpdateTaskSchema` (Zod) valida l'input **lato server**.
4. Si legge lo stato precedente, si calcola il delta e si scrive solo se qualcosa
   cambia davvero (una modifica a vuoto non sporca la timeline).
5. `recordTaskEvent` aggiunge una riga alla timeline dell'attività.
6. `recordAudit` scrive valore precedente e nuovo, redatti, con `correlationId`.
7. `revalidatePath` invalida le pagine interessate.
8. Il client mostra l'esito in un elemento `role="status"`.

Il percorso è identico per ogni mutazione: permesso → validazione → scrittura →
timeline → audit → invalidazione.

---

## Flusso di una bozza

```
  contenuto email (non affidabile)
            │  wrapUntrusted: marcatori neutralizzati, blocco dichiarato
            ▼
  provider primario (OpenAI o mock)  ──▶ output validato con Zod
            │
            ├── se il criterio lo prevede: revisione Anthropic (secondo passaggio,
            │   non invio parallelo)
            ▼
  ai_drafts (stato: generata / in_revisione)  +  approvals (in_attesa)
            │
            │  revisione umana: modifica del testo, poi approva o rifiuta
            ▼
  ai_drafts (approvata)
            │
            │  conferma esplicita nella stessa richiesta ("Confermo…")
            ▼
  bozza creata in Gmail  ──  il messaggio NON viene inviato
```

Tre passaggi umani distinti separano la generazione dal contenuto che finisce
nella casella. Nessuno di essi è saltabile: `transferDraftToGmailAction` rifiuta
sia le bozze non approvate sia le richieste senza spunta di conferma.

---

## Organizzazione del monorepo

Package consumati come **sorgenti TypeScript**, senza step di build: Next li
compila con `transpilePackages`, l'MCP gira con `tsx`, Vitest li risolve con alias.
Un refactor che tocca `core` e `web` è un solo commit atomico, senza ordine di
compilazione da rispettare né artefatti intermedi da invalidare. Il costo è che
i package non sono pubblicabili su npm così come sono — irrilevante: sono privati.

## Scelte deliberatamente non fatte

- **Nessuna gestione di stato lato client** (Redux, Zustand, TanStack Query): lo
  stato dell'app è il database, e i filtri stanno nella query string. Un filtro si
  può copiare, mettere nei preferiti e ricaricare.
- **Nessun drag & drop nel Kanban**: lo spostamento avviene da un menu, usabile da
  tastiera e da screen reader. Il trascinamento sarebbe più vistoso e meno accessibile.
- **Nessun calcolo dei costi AI in euro**: i listini cambiano e non vanno
  codificati. Si registrano i token riportati dai provider, sufficienti a
  ricostruire la spesa con il listino in vigore.
- **Nessun identificativo di modello nel codice**: `OPENAI_MODEL` e
  `ANTHROPIC_MODEL` sono variabili d'ambiente. Senza modello impostato l'adapter
  si dichiara non disponibile, invece di ricadere su un identificativo destinato a
  invecchiare.
