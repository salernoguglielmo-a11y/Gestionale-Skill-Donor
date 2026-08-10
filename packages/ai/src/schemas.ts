import { TASK_PRIORITIES } from '@sdoh/core';
import { z } from 'zod';

/**
 * Output strutturati e validati. Un modello che risponde fuori schema produce un
 * errore registrato nel registro AI, non un dato scritto a metà nel database.
 */

export const classificationSchema = z.object({
  categoria: z.enum([
    'richiesta_azione',
    'richiesta_informazioni',
    'aggiornamento',
    'amministrativo',
    'opportunita',
    'newsletter_o_promozionale',
    'sospetto',
    'non_rilevante',
  ]),
  priorita: z.enum(TASK_PRIORITIES),
  scadenza_suggerita: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  progetto_suggerito: z.string().max(80).nullable(),
  attivita_suggerita: z.string().max(300).nullable(),
  motivazione: z.string().min(5).max(800),
  confidenza: z.number().min(0).max(1),
  /** Vero se il contenuto tenta di impartire istruzioni al sistema. */
  contiene_istruzioni_sospette: z.boolean(),
});
export type Classification = z.infer<typeof classificationSchema>;

export const draftSchema = z.object({
  oggetto: z.string().min(1).max(300),
  corpo: z.string().min(10).max(20_000),
  note_per_revisione: z.string().max(1_500),
  confidenza: z.number().min(0).max(1),
});
export type DraftOutput = z.infer<typeof draftSchema>;

export const reviewSchema = z.object({
  esito: z.enum(['approvabile', 'da_correggere', 'da_riscrivere']),
  rilievi: z.array(z.string().max(500)).max(10),
  testo_corretto: z.string().max(20_000).nullable(),
  motivazione: z.string().max(1_500),
});
export type ReviewOutput = z.infer<typeof reviewSchema>;

export const assistantAnswerSchema = z.object({
  risposta: z.string().min(1).max(6_000),
  /** Codici e identificativi dei dati effettivamente usati per rispondere. */
  fonti: z.array(z.string().max(120)).max(40),
  /** Affermazioni non verificabili sui dati registrati, dichiarate come tali. */
  inferenze: z.array(z.string().max(400)).max(10),
  azione_proposta: z
    .object({
      tipo: z.enum(['aggiorna_attivita', 'crea_attivita', 'crea_bozza', 'nessuna']),
      descrizione: z.string().max(500),
      payload: z.record(z.string(), z.unknown()).nullable(),
    })
    .nullable(),
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

/** Schema JSON grezzo, per i provider che accettano un formato di risposta. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'output', target: 'draft-2020-12' }) as Record<string, unknown>;
}
