/** Codici leggibili delle attività: `SD-001`. */

export const TASK_CODE_PREFIX = 'SD';
const TASK_CODE_RE = /^SD-(\d{3,})$/;

export function isTaskCode(value: string): boolean {
  return TASK_CODE_RE.test(value.trim().toUpperCase());
}

export function taskCodeNumber(code: string): number | null {
  const m = TASK_CODE_RE.exec(code.trim().toUpperCase());
  return m?.[1] ? Number(m[1]) : null;
}

export function formatTaskCode(n: number): string {
  return `${TASK_CODE_PREFIX}-${String(n).padStart(3, '0')}`;
}

/** Prossimo codice libero dato l'insieme dei codici esistenti. */
export function nextTaskCode(existing: readonly string[]): string {
  const max = existing.reduce((acc, code) => Math.max(acc, taskCodeNumber(code) ?? 0), 0);
  return formatTaskCode(max + 1);
}

/** Normalizza l'input utente: `sd1`, `sd-1`, `SD-001` → `SD-001`. */
export function normaliseTaskCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^SD-?(\d{1,6})$/.exec(cleaned);
  return m?.[1] ? formatTaskCode(Number(m[1])) : null;
}

/** Slug stabile per codici di progetto: "Amici Invisibili" → "amici-invisibili". */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
