import type { AiMode } from '@sdoh/core';
import { getDb, getSettings, setSetting } from '@sdoh/db';

/**
 * Impostazioni applicative: valori di default nel codice, sovrascritture nel
 * database. I modelli AI restano invece nelle variabili d'ambiente, perché sono
 * configurazione di deployment e non una preferenza dell'utente.
 */

export interface AppSettings {
  aiMode: AiMode;
  emailRetentionDays: number;
  auditRetentionDays: number;
  autoClassifyOnSync: boolean;
  requireApprovalForTaskCreation: boolean;
}

const DEFAULTS: AppSettings = {
  aiMode: 'openai',
  emailRetentionDays: 180,
  auditRetentionDays: 730,
  autoClassifyOnSync: true,
  requireApprovalForTaskCreation: true,
};

const KEYS = {
  aiMode: 'ai.mode',
  emailRetentionDays: 'retention.emailDays',
  auditRetentionDays: 'retention.auditDays',
  autoClassifyOnSync: 'sync.autoClassify',
  requireApprovalForTaskCreation: 'approvals.requireForTaskCreation',
} as const;

const VALID_MODES: AiMode[] = ['off', 'openai', 'anthropic', 'openai_con_revisione_anthropic'];

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const raw = await getSettings(db);

  // Il seed scrive `ai.mode: "mock"` per rendere la demo autoesplicativa; non è
  // una modalità selezionabile, quindi si normalizza sul default.
  const mode = raw[KEYS.aiMode];
  const aiMode = VALID_MODES.includes(mode as AiMode) ? (mode as AiMode) : DEFAULTS.aiMode;

  return {
    aiMode,
    emailRetentionDays: numberOr(raw[KEYS.emailRetentionDays], DEFAULTS.emailRetentionDays),
    auditRetentionDays: numberOr(raw[KEYS.auditRetentionDays], DEFAULTS.auditRetentionDays),
    autoClassifyOnSync: boolOr(raw[KEYS.autoClassifyOnSync], DEFAULTS.autoClassifyOnSync),
    requireApprovalForTaskCreation: boolOr(
      raw[KEYS.requireApprovalForTaskCreation],
      DEFAULTS.requireApprovalForTaskCreation,
    ),
  };
}

export async function saveSettings(values: AppSettings): Promise<void> {
  const db = await getDb();
  await Promise.all([
    setSetting(db, KEYS.aiMode, values.aiMode),
    setSetting(db, KEYS.emailRetentionDays, values.emailRetentionDays),
    setSetting(db, KEYS.auditRetentionDays, values.auditRetentionDays),
    setSetting(db, KEYS.autoClassifyOnSync, values.autoClassifyOnSync),
    setSetting(db, KEYS.requireApprovalForTaskCreation, values.requireApprovalForTaskCreation),
  ]);
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
