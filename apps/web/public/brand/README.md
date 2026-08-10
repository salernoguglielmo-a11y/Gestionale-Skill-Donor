# Asset di brand

## Come inserire il logo ufficiale

Copiare il file in questa directory con **esattamente** questo nome:

```
apps/web/public/brand/skill-donor-logo.png
```

Non serve modificare il codice: `src/components/brand.tsx` verifica la presenza
del file all'avvio del server e, se lo trova, lo mostra al posto del segnaposto,
in intestazione e nella pagina di accesso. Se il file non c'è, resta il segnaposto
tipografico — nessuna immagine rotta.

Dopo aver copiato il file, riavviare l'applicazione (`pnpm dev` oppure
`pnpm build && pnpm start`): il controllo avviene una sola volta all'avvio.

### Vincoli sull'asset

- Il logo **non va ridisegnato, ricostruito o approssimato**.
- È ammessa una versione ottimizzata per il web: stesse proporzioni, solo
  ricampionata o ricompressa.
- Non applicare filtri CSS, ombre, rotazioni, ritagli o cambi di colore.
  Il componente usa `object-fit: contain` proprio per non deformarlo.
- Formato consigliato: PNG con sfondo trasparente, lato lungo ≥ 512 px.

## Colori ufficiali

| Ruolo | Valore | Uso nell'interfaccia |
| --- | --- | --- |
| Arancione Skill Donor | `#FF5900` | accenti, bordi, stati selezionati, anello di focus |
| Arancione scuro (derivato) | `#C44300` | superfici con testo bianco |
| Grigio Skill Donor | `#404040` | testo principale |

`#FF4900` non è usato in nessun punto del codice.

### Perché esiste `#C44300`

L'arancione ufficiale su bianco offre un contrasto di **3,1:1**: sufficiente per
elementi grafici, **insufficiente** per testo di piccole dimensioni (WCAG AA
richiede 4,5:1). Le azioni primarie usano quindi `#C44300`, la variante scura
della stessa tinta: bianco su quel fondo raggiunge **5,0:1**.

L'arancione puro resta l'accento del prodotto — bordi, indicatori, selezioni,
focus — ma non porta mai testo piccolo.

## Documenti riservati

Gli eventuali altri materiali di brand **non vanno copiati qui**: `public/` è
servita pubblicamente dall'applicazione. Vanno tenuti fuori dal repository.
