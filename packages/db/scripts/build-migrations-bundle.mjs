#!/usr/bin/env node
/**
 * Genera `src/migrations-bundle.ts` a partire dai file in `migrations/`.
 *
 * Perché esiste. Le migrazioni venivano lette dal disco a runtime con
 * `readdir`. In sviluppo funziona; dentro una funzione serverless no: il
 * bundler include solo i file che riesce a *vedere* analizzando il codice, e
 * una lettura dinamica di una directory è invisibile all'analisi statica. Il
 * risultato era `ENOENT ... scandir '/var/task/packages/db/migrations'` al
 * primo accesso al database, cioè esattamente dove serviva funzionare.
 *
 * Incorporando l'SQL in un modulo TypeScript le migrazioni viaggiano con il
 * codice: nessun percorso da risolvere, nessun file da tracciare, stesso
 * comportamento su qualunque piattaforma.
 *
 * I file `.sql` restano la fonte di verità: si modificano quelli e si rigenera
 * con `pnpm db:bundle`. Un test verifica che il bundle sia allineato, così una
 * migrazione aggiunta senza rigenerare non può arrivare in produzione.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(packageRoot, 'migrations');
const outputFile = join(packageRoot, 'src', 'migrations-bundle.ts');

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.error(`Nessuna migrazione trovata in ${migrationsDir}.`);
  process.exit(1);
}

const entries = [];
for (const name of files) {
  const sql = await readFile(join(migrationsDir, name), 'utf8');
  // JSON.stringify produce un letterale valido per qualunque contenuto:
  // apici, backtick, `${`, ritorni a capo.
  entries.push(`  { name: ${JSON.stringify(name)}, sql: ${JSON.stringify(sql)} },`);
}

const contents = `// GENERATO AUTOMATICAMENTE DA scripts/build-migrations-bundle.mjs — NON MODIFICARE A MANO.
// Fonte di verità: i file in packages/db/migrations/. Dopo averli cambiati: pnpm db:bundle

/**
 * Migrazioni incorporate nel bundle JavaScript.
 *
 * Leggerle dal disco a runtime non funziona in una funzione serverless: il
 * bundler include solo i file visibili all'analisi statica, e una \`readdir\`
 * dinamica non lo è. Incorporandole, viaggiano con il codice ovunque esso giri.
 */
export interface EmbeddedMigration {
  readonly name: string;
  readonly sql: string;
}

export const EMBEDDED_MIGRATIONS: readonly EmbeddedMigration[] = [
${entries.join('\n')}
];
`;

await writeFile(outputFile, contents, 'utf8');
console.log(`Bundle migrazioni generato: ${files.length} file (${files.join(', ')}).`);
