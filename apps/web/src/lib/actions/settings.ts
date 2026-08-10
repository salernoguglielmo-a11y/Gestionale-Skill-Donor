'use server';

import { settingsSchema } from '@sdoh/core';
import { getDb, recordAudit, schema } from '@sdoh/db';
import { readOAuthConfig, isOAuthConfigured, revokeToken, decryptJson } from '@sdoh/email';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '../auth';
import { loadSettings, saveSettings } from '../settings';
import type { ActionResult } from './tasks';

export async function saveSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requirePermission('settings:write');

  const parsed = settingsSchema.safeParse({
    aiMode: formData.get('aiMode'),
    emailRetentionDays: formData.get('emailRetentionDays'),
    auditRetentionDays: formData.get('auditRetentionDays'),
    autoClassifyOnSync: formData.get('autoClassifyOnSync') === 'on',
    requireApprovalForTaskCreation: formData.get('requireApprovalForTaskCreation') === 'on',
  });

  if (!parsed.success) {
    const issues = (parsed.error as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues ?? [];
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return { ok: false, message: 'Correggi i campi segnalati.', fieldErrors };
  }

  const previous = await loadSettings();
  await saveSettings({
    aiMode: parsed.data.aiMode,
    emailRetentionDays: parsed.data.emailRetentionDays,
    auditRetentionDays: parsed.data.auditRetentionDays,
    autoClassifyOnSync: parsed.data.autoClassifyOnSync,
    requireApprovalForTaskCreation: parsed.data.requireApprovalForTaskCreation,
  });

  const db = await getDb();
  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'settings.update',
    entityType: 'app_settings',
    previousValue: previous,
    newValue: parsed.data,
    source: 'web:settings',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/impostazioni');
  return { ok: true, message: 'Impostazioni salvate.' };
}

/**
 * Disconnessione di Gmail: revoca il refresh token presso Google e poi rimuove
 * il record locale. Se la revoca remota fallisce il token locale viene comunque
 * eliminato, e l'esito è riportato all'utente.
 */
export async function disconnectGmailAction(): Promise<ActionResult> {
  const user = await requirePermission('settings:write');
  const db = await getDb();

  const [token] = await db
    .select()
    .from(schema.integrationTokens)
    .where(eq(schema.integrationTokens.provider, 'gmail'));
  if (!token) return { ok: false, message: 'Nessun account Gmail collegato.' };

  const config = readOAuthConfig();
  let revoked = false;
  let revokeError: string | null = null;

  if (isOAuthConfigured(config)) {
    try {
      const payload = decryptJson<{ refreshToken: string }>(token.encryptedPayload);
      await revokeToken(config, payload.refreshToken);
      revoked = true;
    } catch (error) {
      revokeError = error instanceof Error ? error.message : 'errore sconosciuto';
    }
  }

  await db.delete(schema.integrationTokens).where(eq(schema.integrationTokens.provider, 'gmail'));

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'gmail.disconnect',
    entityType: 'integration_token',
    newValue: { revocaRemota: revoked, errore: revokeError },
    source: 'web:settings',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/impostazioni');
  return {
    ok: true,
    message: revoked
      ? 'Account Gmail scollegato e token revocato presso Google.'
      : `Token locale rimosso. Revoca presso Google non riuscita${revokeError ? ` (${revokeError})` : ''}: revocare manualmente da myaccount.google.com/permissions.`,
  };
}

/** Applica la retention: cancella i corpi email oltre la finestra configurata. */
export async function applyRetentionAction(): Promise<ActionResult> {
  const user = await requirePermission('settings:write');
  const settings = await loadSettings();
  const db = await getDb();

  const cutoff = new Date(Date.now() - settings.emailRetentionDays * 86_400_000);
  const { sql } = await import('drizzle-orm');

  const result = await db
    .update(schema.emailMessages)
    .set({ bodyCachedText: null, bodyFetchedAt: null })
    .where(sql`${schema.emailMessages.bodyFetchedAt} is not null and ${schema.emailMessages.bodyFetchedAt} < ${cutoff}`)
    .returning({ id: schema.emailMessages.id });

  await recordAudit(db, {
    actorType: 'umano',
    actorLabel: user.name,
    userId: user.id,
    action: 'retention.apply',
    entityType: 'email_message',
    newValue: { corpiRimossi: result.length, giorni: settings.emailRetentionDays },
    source: 'web:settings',
    sessionRef: user.sessionRef,
  });

  revalidatePath('/impostazioni');
  return {
    ok: true,
    message: `Retention applicata: rimossi ${result.length} corpi email più vecchi di ${settings.emailRetentionDays} giorni.`,
  };
}
