/**
 * Tutte le date mostrate all'utente sono rese nel fuso `Europe/Rome`,
 * indipendentemente dal fuso del server. Nessun componente deve chiamare
 * `toLocaleDateString` direttamente: passa da qui.
 */

export const APP_TIMEZONE = 'Europe/Rome';

const dateFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: APP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateLongFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: APP_TIMEZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: APP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/** Parti calendariali di un istante, lette nel fuso di Roma. */
function romeParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function formatDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '—';
}

export function formatDateLong(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? dateLongFmt.format(d) : '—';
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : '—';
}

export function formatTime(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : '—';
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Chiave `YYYY-MM-DD` del giorno civile romano contenente l'istante. */
export function romeDayKey(value: Date | string): string {
  const d = toDate(value);
  if (!d) return '';
  const { year, month, day } = romeParts(d);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Differenza in giorni civili romani (b − a). Conta i cambi di data, non le 24 ore:
 * "scaduta da 1 giorno" deve essere vero anche se sono passate solo 3 ore
 * attraverso la mezzanotte.
 */
export function diffInDays(a: Date | string, b: Date | string): number {
  const ka = romeDayKey(a);
  const kb = romeDayKey(b);
  if (!ka || !kb) return 0;
  const [ay = 0, am = 0, ad = 0] = ka.split('-').map(Number);
  const [by = 0, bm = 0, bd = 0] = kb.split('-').map(Number);
  const ua = Date.UTC(ay, am - 1, ad);
  const ub = Date.UTC(by, bm - 1, bd);
  return Math.round((ub - ua) / 86_400_000);
}

/** Giorni trascorsi da `value` fino a `now` (positivo se nel passato). */
export function daysSince(value: Date | string, now: Date = new Date()): number {
  return diffInDays(value, now);
}

/** Giorni mancanti a `value` da `now` (negativo se già passata). */
export function daysUntil(value: Date | string, now: Date = new Date()): number {
  return diffInDays(now, value);
}

/** Formulazione relativa in italiano, es. "scaduta da 3 giorni", "fra 2 giorni". */
export function relativeDeadline(value: Date | string | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return 'Nessuna scadenza';
  const n = daysUntil(d, now);
  if (n === 0) return 'Scade oggi';
  if (n === 1) return 'Scade domani';
  if (n === -1) return 'Scaduta da 1 giorno';
  if (n < 0) return `Scaduta da ${Math.abs(n)} giorni`;
  return `Fra ${n} giorni`;
}

export function relativeSince(value: Date | string | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return 'mai';
  const n = daysSince(d, now);
  if (n <= 0) return 'oggi';
  if (n === 1) return 'ieri';
  return `${n} giorni fa`;
}

/** Offset di Europe/Rome in minuti nell'istante dato (+60 con CET, +120 con CEST). */
export function romeOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Istante UTC corrispondente a un orario civile romano.
 * L'offset viene calcolato due volte perché la prima stima può cadere dal lato
 * sbagliato di un cambio di ora legale.
 */
export function romeInstant(dayKey: string, time = '00:00'): Date {
  const naive = new Date(`${dayKey}T${time}:00.000Z`);
  let result = new Date(naive.getTime() - romeOffsetMinutes(naive) * 60_000);
  result = new Date(naive.getTime() - romeOffsetMinutes(result) * 60_000);
  return result;
}

/** Mezzanotte romana del giorno indicato, come istante UTC. */
export function romeMidnight(dayKey: string): Date {
  return romeInstant(dayKey, '00:00');
}
