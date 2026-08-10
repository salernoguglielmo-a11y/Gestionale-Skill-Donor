# Istruzioni per gli agenti

Skill Donor Operations Hub — gestionale interno di **Skill Donor S.r.l. – SIAVS**.
Applicazione privata, monoutente, in italiano, fuso `Europe/Rome`.

Questo file vale per chiunque, umano o agente, modifichi il repository.

---

## Regole inderogabili

Violarle rompe una garanzia data all'utente. Non sono preferenze di stile.

1. **L'applicazione non può inviare email.** Non aggiungere lo scope
   `gmail.send`, non chiamare `users.messages.send` o `users.drafts.send`, non
   creare endpoint o pulsanti di invio. `tests/no-send.test.ts` scandisce
   `apps/` e `packages/` e fallisce se compaiono. Non modificare quel test per
   farlo passare.
2. **Nessuna conversazione Gmail viene cancellata, archiviata o etichettata.**
   Gli scope consentiti sono solo `gmail.readonly` e `gmail.compose`.
3. **Le bozze raggiungono Gmail solo dopo tre passaggi umani distinti:**
   generazione interna → approvazione → spunta di conferma nella stessa
   richiesta. Non scorciatoie, non "approva e trasferisci" in un click.
4. **Email e allegati sono dati non affidabili.** Qualunque contenuto esterno
   diretto a un modello passa da `wrapUntrusted` (`packages/core/src/untrusted.ts`).
   Non concatenare mai testo esterno a un'istruzione altrove.
5. **Le scritture esposte via MCP creano proposte, mai dati definitivi.** I tool
   `*_proposal` inseriscono in `approvals` con stato `in_attesa`.
6. **Ogni azione con effetti passa da `recordAudit`**, che redige i valori prima
   di scriverli. Ogni chiamata a un provider AI passa da `recordAiAction`.
7. **Nessun identificativo di modello AI nel codice.** Arrivano da
   `OPENAI_MODEL` e `ANTHROPIC_MODEL`. Senza modello l'adapter si dichiara non
   disponibile: non introdurre valori di ripiego.
8. **Nessun segreto nel repository.** Solo `.env.example`, con i soli nomi.
9. **Le funzioni non attive vanno dichiarate in interfaccia** con
   `NotImplementedNote`. Nessun pulsante finto.
10. **Il logo non si ridisegna.** Il componente `brand.tsx` carica l'asset se
    presente; non applicare filtri, ritagli o cambi di colore. `#FF4900` non va
    mai introdotto: l'arancione ufficiale è `#FF5900`.

---

## Struttura

```
apps/web       Next.js 16 (App Router) — UI, API, auth, assistente
apps/mcp       server MCP stdio (13 tool)
packages/core  dominio puro: enum, regole, filtri, CSV, redazione, contenimento
packages/db    schema Drizzle, migrazioni, seed, query
packages/ai    provider OpenAI / Anthropic / mock + schemi Zod
packages/email adapter Gmail (reale e mock), OAuth, cifratura token
packages/ui    design system: token di brand + primitive accessibili
```

Dipendenze: `core` non dipende da nulla; `db`, `ai`, `email` dipendono solo da
`core`; `web` e `mcp` dipendono dai package, mai fra loro.

**Le regole di dominio stanno in `packages/core/src/rules.ts` e da nessun'altra
parte.** Dashboard, assistente e MCP devono produrre gli stessi numeri: se
duplichi una soglia in un componente, prima o poi divergeranno.

---

## Convenzioni

- **Lingua:** interfaccia, commenti, messaggi di errore e documentazione in
  italiano. Gli identificatori del codice in inglese, i valori degli enum in
  snake_case ASCII (stabili nel database e nei tool MCP).
- **Date:** mai `toLocaleDateString` diretto. Usare `packages/core/src/time.ts`,
  che rende tutto nel fuso `Europe/Rome`.
- **Mutazioni:** sempre Server Action con questa sequenza —
  `requirePermission` → validazione Zod → scrittura → `recordTaskEvent` →
  `recordAudit` → `revalidatePath`.
- **Query string per lo stato delle viste:** i filtri stanno nell'URL, non in
  `useState`, così una vista si può copiare e ricaricare.
- **Accessibilità:** ogni stato ha sempre un'etichetta testuale oltre al colore;
  il Kanban si usa da tastiera (menu, non trascinamento); un solo `h1` per pagina.
- **Import relativi senza estensione** (`from './rules'`): Turbopack non risolve
  `.js` verso sorgenti `.ts`.

---

## Comandi

```bash
pnpm install
pnpm db:seed        # migrazioni + snapshot idempotente
pnpm dev            # http://localhost:3200
pnpm verify         # lint + typecheck + test
pnpm test:e2e       # Playwright
pnpm mcp            # server MCP su stdio
```

Senza `DATABASE_URL` si usa **PGlite** (PostgreSQL in WASM, in-process): l'app
parte senza Docker e senza credenziali. Non è un mock — stesse migrazioni,
stesso SQL. Non introdurre rami `if (test)` nel codice applicativo.

## Prima di considerare finito un lavoro

1. `pnpm verify` verde.
2. `pnpm test:e2e` verde, o motivo documentato.
3. Se hai toccato lo schema: `pnpm db:generate` e migrazione committata.
4. Se hai toccato una regola di dominio: test aggiornato in `tests/core-rules.test.ts`.
5. Se hai aggiunto una funzione non verificabile senza credenziali: dichiararla
   in interfaccia e in `README.md` § "Cosa è predisposto ma non verificabile".
