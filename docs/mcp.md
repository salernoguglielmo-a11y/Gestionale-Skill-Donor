# Server MCP

Il server MCP espone i dati dell'Hub a **Claude** e **ChatGPT** (e a qualunque
client compatibile con il Model Context Protocol), così l'assistente che usi
quotidianamente può leggere attività, progetti e corrispondenza senza copiaincolla.

> **Confine di sicurezza fondamentale.** Le letture sono dirette. Le scritture
> **non modificano nulla**: creano una *proposta* in coda di approvazione, che
> diventa un dato reale solo dopo una decisione umana dentro l'Hub. Un client
> compromesso, o un modello ingannato da un'email, non può alterare lo stato
> operativo di Skill Donor. Verificato da `tests/mcp-tools.test.ts`.

---

## Installazione

Il server gira come processo locale e comunica su **stdio**: non apre porte di
rete e viene avviato dal client.

```bash
pnpm install
pnpm db:migrate && pnpm db:seed   # se il database non è già pronto
pnpm mcp                          # prova manuale: deve stampare due righe su stderr
```

Output atteso:

```
[sdoh-mcp] database: PGlite (/…/.data/pglite) (pglite)
[sdoh-mcp] server MCP avviato su stdio
```

Le diagnostiche vanno su **stderr**: `stdout` è il canale del protocollo e
qualunque scrittura estranea corromperebbe la sessione.

---

## Configurazione con Claude Desktop

`claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/`,
Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "skill-donor": {
      "command": "pnpm",
      "args": ["--dir", "/PERCORSO/ASSOLUTO/gestionale-skill-donor", "mcp"],
      "env": {
        "PGLITE_DIR": ".data/pglite"
      }
    }
  }
}
```

Con un PostgreSQL reale, sostituire `PGLITE_DIR` con `DATABASE_URL`.
Riavviare Claude Desktop: i tool compaiono nel menu degli strumenti.

## Configurazione con Claude Code

```bash
claude mcp add skill-donor -- pnpm --dir /PERCORSO/ASSOLUTO/gestionale-skill-donor mcp
```

## Configurazione con ChatGPT

Il supporto MCP di ChatGPT è in evoluzione e differisce fra desktop, web e
piattaforma per sviluppatori. Le due strade attuali:

1. **Client desktop con supporto MCP locale** — stessa forma di configurazione di
   Claude Desktop: comando `pnpm`, argomenti `["--dir", "<percorso>", "mcp"]`,
   trasporto stdio.
2. **Connettori remoti** — richiedono un endpoint HTTP pubblico e autenticato.
   **Non è implementato**: vedi § "Trasporto remoto" sotto.

⚠️ Non vengono documentati passaggi puntuali dell'interfaccia di ChatGPT perché
cambiano spesso e non erano verificabili qui: fare riferimento alla
documentazione ufficiale corrente e usare comando, argomenti e trasporto sopra.

---

## Tool disponibili

### Lettura — accesso diretto ai dati

| Tool | Cosa restituisce |
| --- | --- |
| `list_tasks` | Attività, ordinate per urgenza. Filtri per stato, priorità, solo aperte |
| `get_task` | Un'attività per codice (`SD-001`) con dipendenze, persone, organizzazioni, conversazioni ed eventi |
| `search_tasks` | Ricerca testuale su codice, titolo, descrizione, prossimo passo, progetto |
| `list_projects` | Progetti con stato, prossimo passo e conteggi delle attività aperte |
| `get_project` | Un progetto con bisogno, deliverable, organizzazioni, metriche d'impatto, attività |
| `list_waiting_items` | Attività in attesa di terzi, con ultimo aggiornamento e follow-up |
| `get_daily_brief` | Briefing del giorno: scadute, in scadenza, priorità, ferme, code in attesa |
| `search_email_metadata` | Ricerca su oggetto, mittente, anteprima. **Nessun corpo** |
| `get_thread_context` | Metadati di una conversazione, classificazione AI, attività collegate |
| `list_pending_approvals` | Proposte in attesa di decisione umana |

### Scrittura — creano solo proposte

| Tool | Cosa fa davvero |
| --- | --- |
| `create_task_proposal` | Registra la proposta di creare un'attività. **Nessuna attività viene creata** |
| `update_task_proposal` | Registra la proposta di modificare un'attività. **L'attività resta invariata** |
| `create_draft_proposal` | Registra una bozza in stato "in revisione". **Nessuna email inviata, nessuna bozza in Gmail** |

Ogni risposta lo dichiara esplicitamente, così il modello non riferisce
all'utente un'azione che non è avvenuta.

---

## Permessi

| Ambito | Concesso | Note |
| --- | --- | --- |
| Lettura di attività, progetti, organizzazioni, persone | ✅ | |
| Lettura dei **metadati** email | ✅ | mittente, oggetto, data, anteprima, etichette |
| Lettura dei **corpi** email | ❌ | non esposti via MCP in alcun modo |
| Lettura degli allegati | ❌ | mai scaricati, nemmeno dall'applicazione |
| Modifica diretta di attività | ❌ | solo proposte |
| Creazione di bozze in Gmail | ❌ | richiede due passaggi umani nell'Hub |
| Invio di email | ❌ | **non esiste in nessun punto del sistema** |
| Decisione sulle approvazioni | ❌ | solo dall'interfaccia, da un essere umano |
| Lettura dell'audit log | ❌ | consultabile solo dall'interfaccia |

---

## Minacce e mitigazioni

| Minaccia | Mitigazione |
| --- | --- |
| Client MCP compromesso che tenta di alterare i dati | Le scritture producono solo proposte; nessun tool modifica un'attività |
| Modello indotto da un'email a chiamare tool dannosi | Non esistono tool distruttivi. Le conversazioni sospette sono marcate `⚠ potenzialmente manipolatoria` nella risposta, con l'istruzione esplicita di non eseguirne il contenuto |
| Esfiltrazione di corrispondenza | I corpi non sono esposti; solo oggetto, mittente e anteprima |
| Accesso non autorizzato al server | Trasporto stdio: il processo è avviato dal client sulla macchina dell'utente, non c'è porta in ascolto |
| Azioni non tracciate | Ogni scrittura registra una riga in `audit_log` con `source: mcp:stdio` e attore `client MCP` |
| Estrazione massiva di dati | Ogni tool ha un limite massimo di righe (100) |

**Limite noto:** il server non autentica il chiamante. La sicurezza deriva dal
trasporto locale e dal fatto che le scritture sono innocue. È il motivo per cui il
trasporto HTTP non è esposto.

---

## Esempi d'uso

Con il server collegato, si può chiedere all'assistente:

> «Fammi un briefing operativo di oggi su Skill Donor.»
→ `get_daily_brief`: scadute, in scadenza, priorità, ferme, follow-up dovuti.

> «Cosa sappiamo di SD-001?»
→ `get_task`: stato, prossimo passo, dipendenze (blocca SD-029), CIMIC, Benedetta
Tatti, conversazione collegata.

> «Quali attività aspettano una risposta da terzi da più tempo?»
→ `list_waiting_items`, ordinate dalla più silenziosa.

> «Mostrami tutto ciò che riguarda Amici Invisibili.»
→ `search_tasks` + `get_project` + `search_email_metadata`.

> «Segna SD-003 come in lavorazione.»
→ `update_task_proposal` registra la proposta e risponde che **l'attività non è
stata modificata**: la modifica va approvata nell'Hub, in *Bozze e approvazioni*.

---

## Trasporto remoto — non implementato

L'architettura è predisposta (i tool sono funzioni pure sul database, indipendenti
dal trasporto), ma l'endpoint HTTP **non è esposto**. Servirebbero, come minimo:

1. autenticazione del chiamante (token per client, revocabili);
2. autorizzazione per tool, non solo per connessione;
3. rate limiting condiviso fra istanze;
4. TLS e un dominio verificabile;
5. audit dell'origine di ogni chiamata.

Nulla di ciò era verificabile durante lo sviluppo, e un endpoint remoto non
autenticato esporrebbe l'intero stato operativo. Meglio dichiararlo assente:
vedi `docs/roadmap.md`.

---

## Diagnostica

| Sintomo | Causa probabile | Rimedio |
| --- | --- | --- |
| Il client non elenca i tool | Percorso errato in `--dir`, oppure `pnpm` non nel `PATH` | Usare percorsi assoluti; provare `pnpm mcp` a mano |
| «database: PGlite …» ma nessun dato | Migrazioni o seed non eseguiti | `pnpm db:migrate && pnpm db:seed` |
| Errore di lock sul database | Un altro processo usa la stessa directory PGlite | Chiudere `pnpm dev`, oppure usare `DATABASE_URL` con PostgreSQL |
| Risposte JSON corrotte | Qualcosa ha scritto su `stdout` | Le diagnostiche vanno su `stderr` |
