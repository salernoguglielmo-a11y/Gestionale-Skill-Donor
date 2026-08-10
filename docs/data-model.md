# Modello dati

Schema PostgreSQL definito in `packages/db/src/schema.ts`, migrazioni in
`packages/db/migrations/`. Tutti i timestamp sono `timestamptz`: gli istanti sono
memorizzati in UTC e resi nel fuso `Europe/Rome` dal livello di presentazione
(`packages/core/src/time.ts`). Nessun componente formatta date per conto proprio.

## Relazioni

```
User ──1:N── Task (owner)          User ──1:N── Project (owner)
User ──1:N── AuditLog              User ──1:N── SavedView

Organization ──1:N── Contact
Organization ──N:M── Project       via project_organizations (con ruolo)
Organization ──N:M── Task          via task_organizations

Project ──1:N── Task
Project ──1:N── Document
Project ──0:1── Contact            (referente)

Task ──1:N── TaskEvent             timeline, umana e AI
Task ──N:M── Task                  task_dependencies (blocca / bloccata da)
Task ──N:M── Contact               via task_contacts
Task ──N:M── EmailThread           via task_email_threads
Task ──1:N── Document
Task ──1:N── AIDraft

EmailThread ──1:N── EmailMessage
EmailThread ──0:1── Project        (progetto suggerito dall'AI)

AIDraft ──0:1── Approval
Approval ──▶ AuditLog
AIAction  (registro AI, indipendente)
IntegrationToken  (token OAuth cifrati)
AppSetting        (chiave/valore)
```

## Entità

### `users`
`id`, `email` (unico, case-insensitive), `name`, `role`, `timezone`,
`permissions` (jsonb: `tasks:write`, `email:draft`, `ai:use`, `approvals:decide`…),
`last_login_at`, `created_at`.

Monoutente per progetto, ma la struttura dei permessi granulari è già presente:
aggiungere un secondo utente non richiede migrazioni distruttive.

### `organizations`
`name`, `slug` (unico), `type`, `status`, `website`, `city`, `fiscal_code`,
`legal_form`, `sector`, `notes`.

`type` ∈ `skill_donor` · `ets` · `donor` · `partner` · `fornitore` ·
`istituzione` · `altro`. ETS, donor, partner, soci e istituzioni sono **viste
diverse della stessa entità**: cambia il ruolo, non la natura del dato. I soci
sono modellati come contatti collegati a `skill-donor` più le attività del
progetto `PRJ-GOVERNANCE`.

### `contacts`
`first_name`, `last_name`, `email`, `phone`, `role`, `organization_id`, `notes`,
`last_contact_at`.

### `projects`
`code` (unico, es. `PRJ-CIMIC`), `title`, `description`, `type`, `status`,
`owner_id`, `referent_contact_id`, **`need`**, **`deliverable`**, `next_step`,
`start_date`, `due_date`, `impact_metrics` (jsonb).

`need` e `deliverable` sono il cuore del matching: il bisogno espresso dall'ETS e
ciò che Skill Donor si impegna a consegnare. `impact_metrics` è un array di
`{ label, value, note? }`: la misurazione d'impatto varia per progetto e
irrigidirla in colonne sarebbe sbagliato.

### `tasks`
`code` (unico, `SD-001`…), `title`, `description`, `project_id`, `owner_id`,
`status`, `priority`, `due_date`, `next_step`, **`last_update_at`**, `source`,
`blocked_reason`, `waiting_on_third_party`, `waiting_on`, `follow_up_date`,
`ai_confidence`, `updated_by_type`, `updated_by_label`, `completed_at`.

`last_update_at` è distinto da `updated_at`: il primo è l'ultimo aggiornamento
**operativo** (l'utente ha fatto qualcosa), il secondo è tecnico. Le regole di
stallo ("ferma da 12 giorni") usano solo il primo, altrimenti una migrazione o un
job di manutenzione azzererebbe i segnali della dashboard.

Stati: `da_fare` · `in_lavorazione` · `in_attesa` · `bloccata` · **`da_verificare`** ·
`completata` · `archiviata`.
`da_verificare` estende gli stati iniziali del brief perché lo snapshot lo richiede
esplicitamente per `SD-030` (SMAU) e `SD-031` (Boost Your Ideas).

Priorità: `critica` · `alta` · `media` · `bassa`.
Provenienza: `manuale` · `email` · `ai` · `mcp` · `seed`.

### `task_events`
Timeline: `kind`, `summary`, `detail` (jsonb redatto), `actor_type`, `actor_label`,
`created_at`. Ogni modifica lascia una riga leggibile in italiano.

### `email_threads` ed `email_messages`

**Politica di conservazione**, applicata nello schema e non solo nel codice:

| Dato | Conservato | Note |
| --- | --- | --- |
| Gmail thread ID e message ID | sempre | chiave di riconciliazione |
| mittente, destinatari, oggetto, date, etichette | sempre | metadati |
| snippet | sempre | anteprima fornita da Gmail |
| link diretto a Gmail | sempre | ricostruito dal thread ID |
| stato di sincronizzazione | sempre | `mock` · `sincronizzato` · `errore` |
| **corpo del messaggio** | **mai per impostazione predefinita** | `body_cached_text` resta `NULL` finché l'utente non lo richiede; la retention lo rimuove |
| **allegati** | **mai** | solo `{ filename, mimeType, size }` in `attachment_meta` |

`injection_flagged` e `injection_reasons` marcano le conversazioni con
formulazioni tipiche di prompt injection; la segnalazione è visibile in interfaccia,
nel contesto MCP e nella classificazione.

`ai_classification` (jsonb) contiene provider, modello, data, categoria,
motivazione, confidenza e dati di origine: i requisiti di tracciabilità delle
classificazioni AI sono nel dato, non solo nell'interfaccia.

### `documents`
`name`, `type`, `project_id`, `task_id`, `version`, `status`, `source`,
`location_ref`, `confidentiality`, `notes`.

`location_ref` è un **riferimento esterno** (Drive, filesystem, URL): l'Hub non
ospita file, non li carica e non li invia a un provider AI.
`confidentiality` ∈ `pubblico` · `interno` · `riservato` · `sensibile`.

### `ai_drafts`
`provider`, `model`, `prompt_template`, `source_refs` (jsonb: riferimenti
verificabili ai dati usati), `subject`, `body`, `status`, `review_notes`,
`revision_provider`, `revision_model`, `revision_body`, `revision_notes`,
`thread_id`, `task_id`, `approved_by_user_id`, `approved_at`,
**`gmail_draft_id`**, `gmail_transferred_at`.

`gmail_draft_id` è popolato **solo** dopo che l'utente ha esplicitamente creato la
bozza in Gmail: la sua presenza è la prova che il passaggio umano è avvenuto.

Stati: `generata` → `in_revisione` → `approvata` | `rifiutata` → `trasferita_gmail`.

### `approvals`
`action_type`, `entity_type`, `entity_id`, `status`, `requested_by_type`,
`requested_by_label`, `approved_by_user_id`, `proposed_payload` (jsonb),
`rationale`, `outcome`, `decided_at`.

`action_type` ∈ `crea_attivita` · `aggiorna_attivita` · `crea_bozza` ·
`crea_bozza_gmail` · `collega_email_attivita`.
**Non esiste e non deve esistere un tipo "invio email".**

### `ai_actions` — registro AI
`action`, `provider`, `model`, `input_summary` (redatto), `source_refs`,
`confidence`, `input_tokens`, `output_tokens`, `latency_ms`, `outcome`,
`error_message`, `human_review`, `correlation_id`.

Una riga per ogni chiamata a un provider, **anche quando fallisce**: gli errori
sono spesso l'informazione più utile.

### `audit_log` — append-only
`actor_type` (`umano` · `ai` · `sistema`), `actor_label`, `user_id`, `action`,
`entity_type`, `entity_id`, `previous_value`, `new_value`, `source`,
`session_ref`, `correlation_id`, `created_at`.

L'immutabilità è imposta dal database (migrazione `0001_audit_append_only.sql`):
un trigger rifiuta `UPDATE` e `DELETE`. L'unica rimozione possibile passa dalla
funzione `audit_log_purge(giorni)`, che registra la purga prima di eseguirla.

`session_ref` è un riferimento opaco di 8 caratteri, non l'identificativo di
sessione: correla le azioni senza esporre un valore riutilizzabile.

### `integration_tokens`
`provider`, `account_email`, `encrypted_payload` (AES-256-GCM), `scopes`,
`expires_at`, **`last_history_id`**, `last_sync_at`, `last_sync_status`,
`last_sync_error`.

`last_history_id` è il cursore per la sincronizzazione incrementale Gmail.

### `saved_views` e `app_settings`
Viste salvate per utente (nome unico case-insensitive) e impostazioni
chiave/valore (criterio di autonomia AI, retention, comportamenti automatici).

---

## Idempotenza del seed

Ogni riga del seed ha un id **derivato deterministicamente** da una chiave
naturale (`SD-001`, `PRJ-CIMIC`, slug dell'organizzazione…) tramite UUID v5 con
namespace fisso (`packages/db/src/ids.ts`). Conseguenze:

- rieseguire `pnpm db:seed` aggiorna le stesse righe, non ne crea di nuove;
- i riferimenti incrociati si risolvono senza interrogare il database;
- le entità create a mano dopo il seed non vengono toccate.

Verificato da `tests/db-seed.test.ts`, che esegue il seed tre volte e controlla i
conteggi.

## Snapshot iniziale

`SEED_TODAY = 2026-08-10`. Le anzianità sono espresse in **giorni prima dello
snapshot** (`staleDays`), non in date assolute: i segnali "ferma da 12 giorni"
restano coerenti anche rieseguendo il seed più avanti nel tempo.

Contenuto: 32 attività `SD-001`…`SD-032` con i codici richiesti, 14 progetti,
21 organizzazioni, 9 persone, 10 conversazioni dimostrative (una delle quali
contiene deliberatamente un tentativo di prompt injection, per verificare che il
sistema lo tratti come dato e non come istruzione), 6 documenti, 3 viste salvate.
