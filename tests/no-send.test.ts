import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SCOPES, GMAIL_SCOPES } from '@sdoh/email';
import { describe, expect, it } from 'vitest';

/**
 * Vincolo architetturale verificato automaticamente: **l'applicazione non può
 * inviare email**.
 *
 * Questo test scandisce l'intero codice sorgente e fallisce se compare uno
 * scope Gmail che consente l'invio o la modifica, o una chiamata ai metodi
 * dell'API Gmail che spediscono messaggi. È una rete di sicurezza contro
 * regressioni: nessuno può reintrodurre l'invio senza far fallire la build.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIRS = ['packages', 'apps'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.data', 'coverage', 'test-results']);
const CODE_EXT = /\.(ts|tsx|mjs|cjs|js)$/;

/** Il file dei test è escluso: contiene i pattern proibiti come dati. */
const SELF = 'tests/no-send.test.ts';

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /auth\/gmail\.send/,
    why: 'lo scope gmail.send consentirebbe l’invio di email',
  },
  {
    pattern: /auth\/gmail\.modify/,
    why: 'lo scope gmail.modify consentirebbe di modificare, etichettare o archiviare messaggi',
  },
  {
    pattern: /https:\/\/mail\.google\.com\/(?!mail)/,
    why: 'lo scope mail.google.com dà accesso completo alla casella, inclusa la cancellazione',
  },
  {
    pattern: /users\.messages\.send|users\.drafts\.send|\.messages\.send\(/,
    why: 'chiamata all’API Gmail che invia un messaggio',
  },
  {
    pattern: /users\.messages\.(trash|delete|batchDelete)|users\.threads\.(trash|delete|modify)/,
    why: 'chiamata all’API Gmail che cancella, cestina o modifica conversazioni',
  },
];

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (CODE_EXT.test(entry.name)) yield full;
  }
}

describe('vincolo: nessuna capacità di invio email', () => {
  it('non richiede scope Gmail di invio o modifica', () => {
    expect(GMAIL_SCOPES).toEqual([
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ]);
    expect(ALL_SCOPES.some((scope) => scope.includes('send'))).toBe(false);
    expect(ALL_SCOPES.some((scope) => scope.includes('modify'))).toBe(false);
  });

  it('nessun file del repository contiene uno scope o un metodo di invio', async () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      for await (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (rel === SELF) continue;
        const content = await readFile(file, 'utf8');
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(content)) violations.push(`${rel}: ${why} (pattern ${pattern})`);
        }
      }
    }

    expect(violations, `Trovate capacità di invio o modifica non consentite:\n${violations.join('\n')}`).toEqual([]);
  });

  it('l’adapter Gmail non espone alcun metodo che somigli a un invio', async () => {
    const source = await readFile(join(ROOT, 'packages/email/src/gmail-types.ts'), 'utf8');
    // I nomi dei metodi dell'interfaccia: nessuno deve contenere "send"/"delete".
    const methods = [...source.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1] ?? '');
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method.toLowerCase()).not.toMatch(/send|delete|archive|trash/);
    }
  });
});
