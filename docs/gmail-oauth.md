# Configurazione Google OAuth e Gmail

Guida operativa per collegare l'account `g.salerno@skilldonor.org`.

> **Nessuna password.** L'applicazione non chiede, non accetta e non memorizza
> password Google. L'unico meccanismo è OAuth 2.0 authorization code flow con PKCE.
>
> **Nessun invio.** Gli scope richiesti non consentono di spedire, cancellare,
> archiviare o etichettare messaggi.

---

## 1. Progetto Google Cloud

1. Aprire [console.cloud.google.com](https://console.cloud.google.com) con
   l'account `g.salerno@skilldonor.org`.
2. Creare un progetto, per esempio **Skill Donor Ops Hub**.
3. In **API e servizi → Libreria**, abilitare **Gmail API**.

## 2. Schermata di consenso OAuth

1. **API e servizi → Schermata consenso OAuth**.
2. Tipo di utente:
   - **Interno** se `skilldonor.org` è gestito con Google Workspace — è la scelta
     preferibile: nessuna verifica e nessuna scadenza dei token;
   - **Esterno** altrimenti. In questo caso aggiungere
     `g.salerno@skilldonor.org` fra gli **utenti di test** (vedi § 7).
3. Compilare nome dell'applicazione, email di supporto ed email di contatto.
4. Nella sezione **Ambiti**, aggiungere **esattamente** questi:

   | Ambito | Serve per |
   | --- | --- |
   | `openid` | identificativo dell'account |
   | `.../auth/userinfo.email` | verifica dell'allowlist |
   | `.../auth/userinfo.profile` | nome visualizzato |
   | `https://www.googleapis.com/auth/gmail.readonly` | lettura di metadati e corpi su richiesta |
   | `https://www.googleapis.com/auth/gmail.compose` | creazione di bozze |

   ⚠️ **Non aggiungere** `gmail.send`, `gmail.modify` o `https://mail.google.com/`.
   Il primo consentirebbe l'invio, gli altri la modifica e la cancellazione dei
   messaggi. L'applicazione non li usa, e un test automatico
   (`tests/no-send.test.ts`) fallisce se compaiono nel codice.

## 3. Credenziali

1. **API e servizi → Credenziali → Crea credenziali → ID client OAuth**.
2. Tipo: **Applicazione web**.
3. **URI di reindirizzamento autorizzati** — devono coincidere carattere per
   carattere con `GOOGLE_REDIRECT_URI`:

   ```
   http://localhost:3200/api/auth/callback
   https://ops.skilldonor.org/api/auth/callback
   ```

4. Annotare **ID client** e **Client secret**.

## 4. Variabili d'ambiente

```bash
cp .env.example .env
```

```env
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3200/api/auth/callback
ALLOWED_EMAIL=g.salerno@skilldonor.org

# Obbligatoria: cifra i token OAuth e il cookie di sessione
TOKEN_ENCRYPTION_KEY=<output di: openssl rand -base64 32>
```

Generare la chiave:

```bash
openssl rand -base64 32
```

⚠️ Ruotando `TOKEN_ENCRYPTION_KEY` si invalidano tutte le sessioni e tutti i token
Gmail salvati: sarà necessario ricollegare l'account.

## 5. Collegamento

```bash
pnpm dev
```

1. Aprire `http://localhost:3200/accedi` — se le variabili sono corrette compare
   **“Accedi con Google”** al posto dell'avviso di configurazione mancante.
2. Autorizzare l'accesso.
3. Al ritorno si viene reindirizzati a **Oggi**, con il badge “Accesso Google”.

## 6. Verifica del collegamento

Il codice dell'adapter Gmail segue la documentazione ufficiale delle API Gmail v1
ma **non è stato eseguito contro una casella reale** durante lo sviluppo: al primo
collegamento vanno controllati questi punti.

1. **Impostazioni → Gmail**: l'indirizzo mostrato deve essere quello atteso e gli
   scope elencati devono essere solo `gmail.readonly` e `gmail.compose`.
2. **Inbox operativa → Sincronizza ora**: devono comparire i thread reali con
   stato di sincronizzazione `sincronizzato` (non più `mock`).
3. Aprire una conversazione e premere **Recupera il corpo**: il testo deve
   apparire, e in **Audit log** deve comparire `email.fetch_body` **senza** il
   contenuto del messaggio.
4. Generare una bozza, approvarla, spuntare la conferma e premere **Crea bozza in
   Gmail**: la bozza deve comparire in Gmail, **non inviata**.
5. Premere di nuovo **Sincronizza ora**: la seconda esecuzione deve risultare
   incrementale (usa `historyId`) ed essere più rapida.

Se qualcosa non torna, il messaggio di errore compare nell'interfaccia e in
`Impostazioni → Gmail → Errore`.

## 7. Note su token e scadenze

- Il **refresh token** viene rilasciato solo con `access_type=offline` e
  `prompt=consent`: l'applicazione li richiede entrambi. Se nelle impostazioni
  compare `refresh_token_mancante`, revocare l'accesso da
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions) e
  ripetere il collegamento.
- Con schermata di consenso **Esterno in stato di test**, i refresh token scadono
  dopo **7 giorni**. Per un uso continuativo: pubblicare l'app (tipo Interno se si
  ha Workspace) oppure accettare di ricollegare l'account ogni settimana.
- Disconnessione: **Impostazioni → Gmail → Scollega e revoca**. Revoca il token
  presso Google e rimuove il record locale. Se la revoca remota fallisce,
  l'interfaccia lo dice e indica di revocare manualmente da
  `myaccount.google.com/permissions`.

## 8. Errori frequenti

| Messaggio | Causa | Rimedio |
| --- | --- | --- |
| `oauth_non_configurato` | Manca una variabile | Compilare le variabili elencate nel messaggio e riavviare |
| `redirect_uri_mismatch` | URI diverso da quello registrato | Deve coincidere esattamente, protocollo e porta inclusi |
| `account_non_autorizzato` | Email diversa da `ALLOWED_EMAIL` | Usare l'account autorizzato |
| `state_non_valido` | Verifica anti-CSRF fallita, o cookie bloccati | Riprovare; controllare che i cookie non siano bloccati |
| `sessione_oauth_scaduta` | Più di 10 minuti fra avvio e ritorno | Ripetere l'accesso |
| `access_denied` | Consenso rifiutato, o utente non fra quelli di test | Autorizzare, oppure aggiungere l'account agli utenti di test |

## 9. Notifiche push (Pub/Sub) — non attive

L'adapter è **predisposto** per le notifiche push Gmail: il cursore `historyId` è
già persistito e la sincronizzazione incrementale è implementata. La funzione
**non è però attiva**, perché richiede un topic Google Cloud Pub/Sub, un endpoint
pubblico raggiungibile da Google e la verifica della firma dei messaggi: nulla di
tutto ciò era verificabile durante lo sviluppo.

L'interfaccia lo dichiara esplicitamente in **Impostazioni → Gmail** anziché
mostrare un pulsante che non fa nulla. I passi mancanti sono in
`docs/roadmap.md`.
