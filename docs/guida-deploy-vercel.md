# Guida passo passo: mettere online il gestionale

Guida per chi non è sviluppatore. Non serve installare nulla sul computer: si fa
tutto dal browser. Tempo stimato: **20–30 minuti**.

Alla fine avrai l'applicazione online, con le 32 attività caricate, raggiungibile
solo dal tuo indirizzo Google.

---

## Prima di iniziare

Ti servono tre account, tutti con piano gratuito sufficiente:

| Servizio | A cosa serve | Costo |
| --- | --- | --- |
| [GitHub](https://github.com) | ospita il codice | gratuito |
| [Vercel](https://vercel.com) | esegue l'applicazione | gratuito |
| [Neon](https://neon.tech) *(o Vercel Postgres)* | il database | gratuito |

---

## Passo 1 — Trovare il codice

Il progetto è qui:

**https://github.com/salernoguglielmo-a11y/Gestionale-Skill-Donor**

Apri il link con l'account GitHub `salernoguglielmo-a11y`. Vedrai le cartelle
`apps`, `packages`, `docs` e il `README.md`.

Se il repository risulta privato e non lo vedi, verifica di aver fatto l'accesso
con l'account giusto.

---

## Passo 2 — Creare il database

Il gestionale ha bisogno di un database PostgreSQL. In locale ne usa uno
integrato, ma online serve un database vero: su Vercel i file scritti dall'app
vengono cancellati a ogni richiesta.

### Con Neon (consigliato, più semplice)

1. Vai su **https://neon.tech** e registrati (puoi usare l'account GitHub).
2. Premi **Create project**.
3. Nome: `skill-donor`. Regione: **Europe (Frankfurt)** — più vicina all'Italia.
4. Premi **Create**.
5. Nella schermata che appare cerca **Connection string** e copia il valore.
   Inizia con `postgresql://` e contiene una password: **è un segreto**, non
   condividerlo e non incollarlo in chat o email.

Tienilo da parte: lo userai al passo 4.

### In alternativa, con Vercel Postgres

Dal progetto Vercel: scheda **Storage → Create Database → Postgres**. Vercel
imposta `DATABASE_URL` da solo, e puoi saltare quella riga al passo 4.

---

## Passo 3 — Collegare il progetto a Vercel

1. Vai su **https://vercel.com** e accedi con GitHub.
2. **Add New… → Project**.
3. Nell'elenco dei repository scegli **Gestionale-Skill-Donor** → **Import**.
4. ⚠️ **Passaggio decisivo.** Apri **Root Directory**, premi **Edit** e
   seleziona la cartella:

   ```
   apps/web
   ```

   Senza questo, Vercel non trova l'applicazione e il deploy fallisce.
   Il resto (Framework: Next.js, comandi di build) viene rilevato da solo.

5. **Non premere ancora Deploy**: prima le variabili, al passo 4.

> Se hai già creato il progetto e il Root Directory è sbagliato, lo correggi da
> **Settings → General → Root Directory**.

---

## Passo 4 — Le variabili d'ambiente

Sempre nella schermata di importazione (o poi in **Settings → Environment
Variables**), aggiungi queste voci, una per riga.

### Obbligatorie

| Nome | Valore |
| --- | --- |
| `DATABASE_URL` | la *connection string* copiata al passo 2 |
| `TOKEN_ENCRYPTION_KEY` | una password lunga e casuale, almeno 32 caratteri |
| `MIGRATION_TOKEN` | un'altra password lunga e casuale, almeno 16 caratteri |
| `DEMO_MODE` | `off` |

Per generare le due password casuali puoi usare il generatore di un gestore di
password (1Password, Bitwarden, il portachiavi del browser) chiedendo 40
caratteri. Non devono essere memorizzabili: non le digiterai mai.

- `TOKEN_ENCRYPTION_KEY` cifra i token di Gmail. **Conservala**: se la perdi o la
  cambi, dovrai ricollegare Gmail.
- `MIGRATION_TOKEN` serve una volta sola, al passo 5, e poi va rimossa.
- `DEMO_MODE=off` chiude l'ingresso senza autenticazione. Se vuoi prima vedere
  l'app con i dati di esempio, lascialo `on` e mettilo su `off` dopo.

### Per l'accesso con Google (puoi aggiungerle dopo, vedi passo 8)

| Nome | Valore |
| --- | --- |
| `GOOGLE_CLIENT_ID` | dalla Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | dalla Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://IL-TUO-DOMINIO/api/auth/callback` |
| `ALLOWED_EMAIL` | `g.salerno@skilldonor.org` |

### Per l'intelligenza artificiale (facoltative)

| Nome | Valore |
| --- | --- |
| `OPENAI_API_KEY` e `OPENAI_MODEL` | chiave e nome del modello |
| `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` | chiave e nome del modello |

Senza queste, l'app funziona lo stesso: usa un generatore interno deterministico,
sempre etichettato «modalità demo», così non scambi mai un testo di prova per una
classificazione reale.

Ora premi **Deploy** e aspetta qualche minuto.

---

## Passo 5 — Creare le tabelle nel database

Il database esiste ma è **vuoto**: nessuna tabella. Va preparato una volta sola.

Apri il **Terminale** (macOS: *Applicazioni → Utility → Terminale*; Windows:
*Prompt dei comandi*) e incolla questo comando, sostituendo le due parti in
maiuscolo:

```bash
curl -X POST "https://IL-TUO-DOMINIO/api/admin/migrate?seed=1" \
  -H "x-migration-token: IL-TUO-MIGRATION-TOKEN"
```

- `IL-TUO-DOMINIO` è l'indirizzo che ti ha dato Vercel, per esempio
  `gestionale-skill-donor.vercel.app`
- `IL-TUO-MIGRATION-TOKEN` è il valore che hai messo in `MIGRATION_TOKEN`

Se è andato a buon fine vedrai una risposta che contiene:

```json
{"stato":"ok","migrazioniApplicate":["0000_init.sql","0001_audit_append_only.sql"],
 "seed":{"tasks":32,"projects":14,"organizations":21, …}}
```

**32 attività, 14 progetti, 21 organizzazioni**: il gestionale è pronto.

Puoi ripetere il comando senza rischi: non crea duplicati.

> `?seed=1` carica lo snapshot iniziale con le attività SD-001…SD-032. Se
> preferisci partire da un gestionale vuoto, togli `?seed=1`.

### Subito dopo: rimuovi `MIGRATION_TOKEN`

**Settings → Environment Variables →** accanto a `MIGRATION_TOKEN` premi
**Remove**, poi **Deployments → … → Redeploy**.

Da quel momento quell'indirizzo non esiste più (risponde «Not found») e nessuno
può usarlo.

---

## Passo 6 — Verificare che tutto funzioni

Apri nel browser:

```
https://IL-TUO-DOMINIO/api/health
```

Cosa devi vedere:

| Se leggi… | Significa | Cosa fare |
| --- | --- | --- |
| `"stato":"ok"` | tutto a posto | nulla, passa al passo 7 |
| `"stato":"degradato"` | funziona ma manca qualcosa | guarda `variabiliMancanti` e `migrazioniApplicate` |
| `"stato":"errore"` | il database non risponde | ricontrolla `DATABASE_URL` |

Se `migrazioniApplicate` è `0`, il passo 5 non è andato a buon fine: ripetilo.

Questo indirizzo **non mostra password né chiavi**, solo i nomi di ciò che manca:
puoi aprirlo tranquillamente e, se serve, incollarmi la risposta.

---

## Passo 7 — Entrare nell'applicazione

Apri `https://IL-TUO-DOMINIO`.

- Se hai lasciato `DEMO_MODE=on`, premi **Entra in modalità demo**: vedrai il
  gestionale con le 32 attività.
- Se hai messo `DEMO_MODE=off`, ti serve prima l'accesso Google: passo 8.

---

## Passo 8 — Accesso con Google (per l'uso reale)

Serve perché solo tu possa entrare, e per collegare Gmail.

1. Vai su **https://console.cloud.google.com** con `g.salerno@skilldonor.org`.
2. Crea un progetto, per esempio *Skill Donor Ops Hub*.
3. **API e servizi → Libreria**: cerca **Gmail API** e premi **Abilita**.
4. **API e servizi → Schermata consenso OAuth**: compila i campi richiesti e
   aggiungi **solo** questi ambiti:
   - `openid`, `userinfo.email`, `userinfo.profile`
   - `gmail.readonly` — leggere
   - `gmail.compose` — creare bozze

   ⚠️ **Non aggiungere `gmail.send`.** L'applicazione non lo usa e non può
   inviare email: è una garanzia voluta, verificata da un controllo automatico.
5. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**.
   In **URI di reindirizzamento autorizzati** incolla, esattamente:

   ```
   https://IL-TUO-DOMINIO/api/auth/callback
   ```

6. Copia **ID client** e **Client secret** nelle variabili di Vercel
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), aggiungi `GOOGLE_REDIRECT_URI`
   con lo stesso indirizzo del punto 5 e `ALLOWED_EMAIL` con la tua email.
7. Metti `DEMO_MODE` su `off`.
8. **Redeploy**.

Ora la pagina di accesso mostra **Accedi con Google**, e solo l'indirizzo in
`ALLOWED_EMAIL` può entrare.

La procedura completa, con la lista di verifica del collegamento Gmail, è in
[`gmail-oauth.md`](gmail-oauth.md).

---

## Problemi frequenti

| Sintomo | Causa | Rimedio |
| --- | --- | --- |
| Il deploy fallisce subito | Root Directory non impostato | Settings → General → Root Directory = `apps/web` |
| Pagina bianca o errore 500 | Database non preparato | Rifai il passo 5, poi controlla `/api/health` |
| «Modalità demo non disponibile» | Manca `DATABASE_URL` | Aggiungila e fai Redeploy |
| Il comando del passo 5 dà `401` | Token diverso | Il valore dopo `x-migration-token:` deve coincidere con `MIGRATION_TOKEN` |
| Il comando del passo 5 dà `404` | `MIGRATION_TOKEN` assente o già rimosso | Aggiungila, Redeploy, riprova |
| `redirect_uri_mismatch` al login | Indirizzo diverso da quello registrato | Devono coincidere carattere per carattere, `https://` incluso |
| «Account non autorizzato» | Email diversa da `ALLOWED_EMAIL` | Entra con l'indirizzo autorizzato |

---

## Due cose da sapere

**Il logo.** Per vederlo al posto del segnaposto «SD», carica il file su GitHub
in `apps/web/public/brand/skill-donor-logo.png` (dalla pagina del repository:
**Add file → Upload files**). Al primo deploy successivo comparirà da solo.

**Il server MCP non gira su Vercel.** L'accesso ai dati da Claude e ChatGPT
funziona in modo diverso: è un programma che si avvia sul tuo computer, non un
sito web. Istruzioni in [`mcp.md`](mcp.md).
