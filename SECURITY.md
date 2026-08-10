# Sicurezza

Skill Donor Operations Hub tratta corrispondenza, dati di enti del Terzo settore,
persone fisiche e documenti riservati. Le regole seguenti non sono
raccomandazioni: sono vincoli implementati nel codice e, dove possibile,
verificati da test automatici.

## Principi inderogabili

| Principio | Come è garantito |
| --- | --- |
| Gmail non è mai collegata con password | Solo OAuth 2.0 authorization code + PKCE. Nel codice non esiste alcun campo password per Gmail. |
| Nessuna email può essere inviata | Lo scope `gmail.send` non viene mai richiesto; non esiste alcuna funzione di invio. `tests/no-send.test.ts` scandisce tutto il repository e fallisce se compare uno scope o un metodo di invio, cancellazione o modifica. |
| Nessuna conversazione viene cancellata, archiviata o modificata | Gli scope richiesti sono `gmail.readonly` e `gmail.compose`. Lo stato operativo dei thread vive nel database dell'Hub, non nella casella. |
| Le bozze in Gmail nascono solo da un'azione esplicita | Percorso obbligato: generazione interna → revisione → approvazione → spunta di conferma nella stessa richiesta. Tre passaggi umani distinti. |
| Email e allegati sono contenuti non affidabili | `packages/core/src/untrusted.ts` è l'unico punto in cui un contenuto esterno viene preparato per un modello: i marcatori vengono neutralizzati, il testo è racchiuso in un blocco dichiarato come dati, e ogni prompt di sistema vieta di eseguirne le direttive. |
| Ogni azione automatica è registrata | `recordAudit` scrive su `audit_log` per ogni scrittura; `recordAiAction` registra ogni chiamata a un provider, anche fallita. |
| Le classificazioni AI dichiarano provenienza e confidenza | Modello, provider, data, motivazione, confidenza e dati di origine sono persistiti e mostrati in interfaccia. |
| Le modifiche esterne richiedono approvazione umana | I tool MCP di scrittura creano righe in `approvals` con stato `in_attesa`. Verificato da `tests/mcp-tools.test.ts`. |
| Nessun segreto nel repository | `.env` è ignorato da git; `.env.example` contiene solo nomi di variabili. |
| Le funzioni non implementate sono dichiarate | Il componente `NotImplementedNote` marca in interfaccia ciò che è predisposto ma non attivo. Nessun pulsante finto. |

## Misure implementate

### Autenticazione e autorizzazione
- **Allowlist su singolo indirizzo** (`ALLOWED_EMAIL`), verificata sull'`id_token`
  firmato da Google — non su un valore auto-dichiarato dal profilo.
- L'allowlist è **riverificata a ogni richiesta**: cambiare `ALLOWED_EMAIL`
  invalida immediatamente le sessioni esistenti.
- Sessione in cookie **HttpOnly, SameSite=Lax, Secure** in produzione, cifrato con
  AES-256-GCM. Durata 12 ore.
- Autorizzazione applicata **su ogni pagina e ogni azione** (`requireUser`,
  `requirePermission`), non nel middleware: il middleware gira su un runtime
  ridotto senza accesso al database e darebbe una falsa sensazione di sicurezza.

### Token e segreti
- Token OAuth cifrati at rest (AES-256-GCM, formato versionato `v1.iv.tag.dati`).
  La chiave sta solo in `TOKEN_ENCRYPTION_KEY`, mai nel database: un dump del
  database senza la chiave non contiene credenziali utilizzabili.
- La cifratura è autenticata: un payload manomesso viene rifiutato, non decifrato
  in modo silenzioso.
- Disconnessione Gmail: revoca del refresh token presso Google, poi rimozione
  locale. Se la revoca remota fallisce, l'esito è riportato all'utente.

### Trattamento dei contenuti esterni
- Segnalazione euristica dei tentativi di prompt injection, in italiano e in
  inglese; le conversazioni sospette sono marcate in interfaccia, nell'MCP e
  nella classificazione.
- **Nessun `dangerouslySetInnerHTML` nel repository.** I corpi delle email sono
  mostrati come testo semplice in `<pre>`: React fa l'escaping.
- Gli allegati non vengono **mai** scaricati: si leggono solo nome, tipo e peso.
- I corpi dei messaggi non sono conservati per impostazione predefinita e non
  sono esposti via MCP.

### Difese web
- **Content Security Policy con nonce** per richiesta (`apps/web/src/proxy.ts`),
  senza `unsafe-inline` sugli script. `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'`, `connect-src 'self'`: il browser non contatta mai terze parti.
- Verifica dell'origine su ogni richiesta non idempotente (difesa CSRF), in
  aggiunta al controllo integrato delle Server Action di Next.
- Header: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`.
- Rate limiting sulle operazioni costose: chiamate AI, sincronizzazione Gmail,
  assistente, trasferimento bozze.
- Validazione **Zod lato server** su ogni input, inclusi i parametri della query
  string: un valore manomesso viene scartato, non propagato in una query.
- Drizzle ORM parametrizza tutte le query: nessuna concatenazione di SQL con input
  utente.
- Solo URL `http`/`https` finiscono in un attributo `href` (`safeExternalUrl`):
  `javascript:` e `data:` sono bloccati.
- Esportazione CSV protetta da CSV injection (prefisso apostrofo sui valori che
  iniziano con `=`, `+`, `-`, `@`).

### Registrazione e conservazione
- `audit_log` **append-only garantito dal database**: un trigger PostgreSQL
  rifiuta `UPDATE` e `DELETE`. L'unica rimozione passa da `audit_log_purge`, che
  registra l'intenzione prima di eseguirla.
- **Redazione prima della scrittura**: indirizzi email, numeri di telefono, IBAN,
  token Google e chiavi API vengono mascherati; i campi noti come sensibili
  (`refresh_token`, `body`, `apiKey`…) sono sostituiti senza guardarne il valore.
- Retention configurabile per i corpi email e per l'audit log.
- Data minimization verso i provider AI: al modello va solo il contesto pertinente
  alla richiesta, troncato, mai l'intero database.

## Rischi residui

Elencati apertamente perché non sono stati eliminati:

1. **Le integrazioni reali non sono state eseguite.** Google OAuth, Gmail, OpenAI
   e Anthropic sono implementati secondo la documentazione ufficiale ma non
   provati contro il servizio: il primo collegamento va verificato seguendo
   `docs/gmail-oauth.md`.
2. **Rate limiting in memoria, per processo.** Adeguato a un'app monoutente su una
   sola istanza; con più repliche va sostituito da un contatore condiviso.
3. **Nessuna scansione antivirus degli allegati.** Mitigato dal fatto che gli
   allegati non vengono mai scaricati né aperti.
4. **La segnalazione di prompt injection è euristica.** Riduce il rischio, non lo
   annulla: la difesa strutturale è il contenimento dei contenuti esterni e il
   fatto che nessuna azione con effetti avvenga senza approvazione umana.
5. **Il database PGlite di sviluppo è un file non cifrato** sul disco della
   macchina. In produzione va usato PostgreSQL con cifratura del volume.
6. **Il server MCP non autentica il chiamante**: la sicurezza deriva dal
   trasporto stdio (il processo è avviato dal client sulla macchina dell'utente) e
   dal fatto che le scritture producono solo proposte. Un trasporto HTTP
   richiederebbe autenticazione, e per questo non è stato esposto.

## Segnalazione di vulnerabilità

Applicazione privata e monoutente. Le vulnerabilità vanno segnalate direttamente
al titolare del trattamento, **g.salerno@skilldonor.org**, senza aprire issue
pubbliche e senza includere dati reali nella segnalazione.
