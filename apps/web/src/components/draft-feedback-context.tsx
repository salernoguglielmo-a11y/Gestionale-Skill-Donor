'use client';

import * as React from 'react';
import type { ActionResult } from '@/lib/actions/tasks';
import { ActionFeedback } from './feedback';

/**
 * Riscontro delle decisioni sulle bozze, mostrato **sopra** l'elenco.
 *
 * Approvare o rifiutare una bozza la sposta nello storico: il riquadro che
 * conteneva il pulsante viene smontato, e con esso sparirebbe il messaggio di
 * conferma. L'utente vedrebbe solo una riga scomparire, senza sapere cosa è
 * successo. Tenendo lo stato in un componente collocato più in alto — la cui
 * posizione nell'albero non cambia quando la lista si aggiorna — la conferma
 * resta leggibile.
 */
const DraftFeedbackContext = React.createContext<((result: ActionResult) => void) | null>(null);

export function DraftFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = React.useState<ActionResult | null>(null);

  return (
    <DraftFeedbackContext.Provider value={setResult}>
      {result ? (
        <div className="sticky top-14 z-10">
          <ActionFeedback result={result} />
        </div>
      ) : null}
      {children}
    </DraftFeedbackContext.Provider>
  );
}

/**
 * Restituisce il setter condiviso, oppure `null` fuori dal provider: in quel
 * caso il chiamante ricade sul proprio stato locale.
 */
export function useDraftFeedback(): ((result: ActionResult) => void) | null {
  return React.useContext(DraftFeedbackContext);
}
