import { defineConfig, devices } from '@playwright/test';

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * I test end-to-end girano contro la build di produzione, in modalità demo, su
 * un database PGlite dedicato (`.data/pglite-e2e`): non toccano i dati di
 * sviluppo e non richiedono alcuna credenziale.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /**
   * `PLAYWRIGHT_CHROMIUM_PATH` permette di usare un Chromium già presente sulla
   * macchina invece di scaricarne uno. Sulle postazioni normali non serve:
   * basta `pnpm exec playwright install chromium`.
   */
  use: {
    baseURL: BASE_URL,
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: 'pnpm --filter @sdoh/web exec next build && pnpm --filter @sdoh/web exec next start --port 3210',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NODE_ENV: 'production',
      PGLITE_DIR: '.data/pglite-e2e',
      DEMO_MODE: 'on',
      TOKEN_ENCRYPTION_KEY: 'chiave-e2e-non-segreta-solo-per-i-test-locali',
    },
  },
});
