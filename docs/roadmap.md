# Roadmap

Stato al 10 agosto 2026. L'MVP è completo e verificabile in modalità demo; le
voci qui sotto sono ordinate per valore rispetto al lavoro quotidiano di Skill
Donor, non per difficoltà tecnica.

---

## Milestone successiva consigliata — Attivazione delle integrazioni reali

È l'unico passo che trasforma l'Hub da strumento completo ma isolato a strumento
collegato al lavoro reale. Tutto il codice esiste già: manca la verifica contro i
servizi.

1. **Google OAuth e Gmail** — creare il progetto Google Cloud, configurare
   consenso e credenziali, collegare l'account e percorrere la lista di verifica
   in `docs/gmail-oauth.md` § "Verifica del collegamento". Punti da controllare
   con attenzione, perché non erano provabili senza credenziali:
   - forma della risposta di `users.threads.get` con `format: 'metadata'`;
   - comportamento di `users.history.list` quando l'`historyId` è troppo vecchio
     (Google risponde 404: è previsto il ripiego sulla sincronizzazione completa);
   - creazione della bozza agganciata al thread corretto.
2. **OpenAI** — impostare `OPENAI_API_KEY` e `OPENAI_MODEL`, classificare alcune
   conversazioni reali e valutare la calibrazione della confidenza.
3. **Anthropic come secondo controllo** — attivare il criterio "OpenAI con
   revisione Anthropic" sulle risposte più delicate (pareri, comunicazioni
   istituzionali) e verificare che i rilievi siano utili e non rumorosi.

Esito atteso: inbox reale, classificazioni reali, bozze reali. Nessuna modifica
architetturale.

---

## Breve termine

- **Notifiche push Gmail (Pub/Sub).** Il cursore `historyId` è già persistito e la
  sincronizzazione incrementale è implementata: manca il topic Pub/Sub, l'endpoint
  pubblico e la verifica della firma dei messaggi. Elimina la sincronizzazione
  manuale.
- **Modifica di organizzazioni, persone e progetti dall'interfaccia.** Oggi le
  anagrafiche sono in sola lettura e si popolano dal seed: creare e modificare un
  ETS o un referente richiede una migrazione dei dati. È la prima lacuna che si
  sente usando l'app quotidianamente.
- **Documenti: caricamento e collegamento.** Oggi si registrano riferimenti
  esterni. Un caricamento vero richiede prima una decisione su dove risiedono i
  file (Drive? volume cifrato?) e sulle relative regole di conservazione.
- **Retention automatica.** La purga dei corpi email è manuale; va pianificata.
- **Esportazione di progetti e organizzazioni in CSV**, come già per le attività.

## Medio termine

- **Metriche d'impatto strutturate.** Oggi `impact_metrics` è un array libero.
  Con qualche mese di dati reali si capirà quali indicatori ricorrono davvero
  (ore pro bono, ETS attivati, professionisti coinvolti) e si potranno rendere
  confrontabili fra progetti e aggregabili per la rendicontazione.
- **Trasporto MCP HTTP autenticato.** Richiede token per client revocabili,
  autorizzazione per tool, rate limiting condiviso e TLS su dominio verificabile
  (vedi `docs/mcp.md` § "Trasporto remoto").
- **Rate limiting condiviso.** Il contatore attuale è in memoria, per processo:
  va sostituito prima di passare a più repliche.
- **Ricerca full-text PostgreSQL.** La ricerca è in memoria: adeguata a poche
  migliaia di attività, non oltre. `tsvector` con indice GIN è il passo naturale.
- **Vista calendario delle scadenze**, alternativa a tabella e Kanban.

## Lungo termine

- **Multiutente.** Lo schema ha già utenti e permessi granulari: mancano
  l'invito, l'assegnazione delle attività fra persone e la revisione
  dell'allowlist a singolo indirizzo.
- **Portale esterno per ETS e donor.** Cambio di perimetro: dati di terzi,
  autenticazione separata, valutazione privacy.
- **Modalità scura.** Il design system è già a token: serve la seconda palette e
  la verifica dei contrasti. Non fatta nell'MVP per non allungare i tempi a
  parità di valore operativo.
- **App mobile nativa.** L'interfaccia è responsive e utilizzabile da telefono:
  un'app nativa avrebbe senso solo con notifiche push proprie.

---

## Debito tecnico noto

| Voce | Impatto | Nota |
| --- | --- | --- |
| Rate limiting in memoria | Medio se si scala | Documentato in `SECURITY.md` |
| Ricerca in memoria | Basso oggi | Diventa rilevante oltre ~5.000 attività |
| Nessuna paginazione negli elenchi | Basso oggi | 32 attività; da rivedere oltre alcune centinaia |
| Adapter Gmail non provato contro il servizio | Alto finché non si collega | Prima voce della milestone successiva |
| Assenza di alerting | Medio in esercizio | `docs/deployment.md` § 8 indica il minimo |
| E2E su un solo database condiviso fra viewport | Basso | I test evitano di dipendere dai conteggi assoluti |

## Cosa resta deliberatamente fuori

- **Invio di email.** È un vincolo di prodotto, non una funzione mancante:
  reintrodurlo richiederebbe una decisione esplicita del titolare e la revisione
  dell'intero threat model.
- **Fatturazione e CRM commerciale.** Skill Donor non vende: l'Hub riflette
  volontariato di competenze, matching e governance.
- **Automazioni autonome ad alto impatto.** L'approvazione umana prima di ogni
  effetto esterno è il principio su cui poggia la fiducia nello strumento.
