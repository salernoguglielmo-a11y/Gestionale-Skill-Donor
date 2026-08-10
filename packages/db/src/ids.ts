import { createHash } from 'node:crypto';

/**
 * UUID deterministici (variante v5, namespace fisso) derivati da una chiave
 * naturale. Sono il meccanismo con cui il seed resta idempotente: rieseguirlo
 * aggiorna sempre le stesse righe invece di crearne di nuove, e i riferimenti
 * incrociati (attività ↔ progetto ↔ email) si risolvono senza dover interrogare
 * il database.
 */

const NAMESPACE = 'a0f3e6c2-6b7d-4f2a-9c1e-5d8b7a4e3f10';

function namespaceBytes(): Buffer {
  return Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
}

export function deterministicUuid(kind: string, key: string): string {
  const hash = createHash('sha1');
  hash.update(namespaceBytes());
  hash.update(`${kind}:${key}`, 'utf8');
  const bytes = hash.digest().subarray(0, 16);
  // Versione 5 e variante RFC 4122.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export const seedId = {
  user: (email: string) => deterministicUuid('user', email.toLowerCase()),
  organization: (slug: string) => deterministicUuid('organization', slug),
  contact: (key: string) => deterministicUuid('contact', key),
  project: (code: string) => deterministicUuid('project', code),
  task: (code: string) => deterministicUuid('task', code),
  thread: (key: string) => deterministicUuid('thread', key),
  message: (key: string) => deterministicUuid('message', key),
  document: (key: string) => deterministicUuid('document', key),
  savedView: (name: string) => deterministicUuid('saved_view', name.toLowerCase()),
  draft: (key: string) => deterministicUuid('draft', key),
  approval: (key: string) => deterministicUuid('approval', key),
};
