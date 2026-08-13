import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuthMode } from '@/lib/auth';

/**
 * Un pulsante che porta a un errore è peggio di un pulsante assente: l'utente
 * scopre il problema dopo averlo premuto, e il messaggio che riceve parla di
 * cifratura, non di ciò che deve fare.
 *
 * `getAuthMode` decide cosa la schermata di accesso può offrire davvero. Questi
 * test fissano la regola: si offre solo ciò che, nella configurazione corrente,
 * riesce ad aprire una sessione.
 */

const CHIAVI = [
  'TOKEN_ENCRYPTION_KEY',
  'DEMO_MODE',
  'DATABASE_URL',
  'VERCEL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'ALLOWED_EMAIL',
] as const;

let originale: Record<string, string | undefined>;

beforeEach(() => {
  originale = Object.fromEntries(CHIAVI.map((k) => [k, process.env[k]]));
  for (const k of CHIAVI) delete process.env[k];
});

afterEach(() => {
  for (const k of CHIAVI) {
    const v = originale[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const CHIAVE_VALIDA = 'chiave-di-sessione-abbastanza-lunga';

describe('getAuthMode: la schermata di accesso non offre pulsanti che fallirebbero', () => {
  it('senza TOKEN_ENCRYPTION_KEY non offre la modalità demo e spiega perché', () => {
    const mode = getAuthMode();

    expect(mode.demoAllowed).toBe(false);
    expect(mode.demoUnavailableReason).toContain('TOKEN_ENCRYPTION_KEY');
    // Il messaggio deve dire cosa fare, non solo cosa manca.
    expect(mode.demoUnavailableReason).toMatch(/imposta|Impostala/i);
  });

  it('con la chiave presente offre la modalità demo', () => {
    process.env.TOKEN_ENCRYPTION_KEY = CHIAVE_VALIDA;

    const mode = getAuthMode();

    expect(mode.demoAllowed).toBe(true);
    expect(mode.demoUnavailableReason).toBeNull();
  });

  it('rifiuta una chiave troppo corta come se fosse assente', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'corta';

    expect(getAuthMode().demoAllowed).toBe(false);
  });

  it('non dichiara Google configurato se manca la chiave di sessione', () => {
    process.env.GOOGLE_CLIENT_ID = 'id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'segreto';
    process.env.GOOGLE_REDIRECT_URI = 'https://ops.example.org/api/auth/callback';
    process.env.ALLOWED_EMAIL = 'persona@example.org';

    const mode = getAuthMode();

    // Altrimenti il flusso fallirebbe al ritorno da Google, a consenso già dato.
    expect(mode.googleConfigured).toBe(false);
    expect(mode.missingVariables).toContain('TOKEN_ENCRYPTION_KEY');
  });

  it('dichiara Google configurato quando c’è tutto', () => {
    process.env.TOKEN_ENCRYPTION_KEY = CHIAVE_VALIDA;
    process.env.GOOGLE_CLIENT_ID = 'id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'segreto';
    process.env.GOOGLE_REDIRECT_URI = 'https://ops.example.org/api/auth/callback';
    process.env.ALLOWED_EMAIL = 'persona@example.org';

    const mode = getAuthMode();

    expect(mode.googleConfigured).toBe(true);
    expect(mode.missingVariables).toEqual([]);
    expect(mode.allowedEmail).toBe('persona@example.org');
  });

  it('su una piattaforma serverless senza database spiega che serve DATABASE_URL', () => {
    process.env.TOKEN_ENCRYPTION_KEY = CHIAVE_VALIDA;
    process.env.VERCEL = '1';

    const mode = getAuthMode();

    expect(mode.demoAllowed).toBe(false);
    expect(mode.demoUnavailableReason).toContain('DATABASE_URL');
  });

  it('DEMO_MODE=off resta una scelta esplicita, distinta da una configurazione incompleta', () => {
    process.env.TOKEN_ENCRYPTION_KEY = CHIAVE_VALIDA;
    process.env.DEMO_MODE = 'off';

    const mode = getAuthMode();

    expect(mode.demoAllowed).toBe(false);
    expect(mode.demoUnavailableReason).toContain('DEMO_MODE=off');
  });
});
