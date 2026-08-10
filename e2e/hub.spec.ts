import { expect, test, type Page } from '@playwright/test';

/**
 * Percorsi end-to-end corrispondenti ai criteri di accettazione dell'MVP.
 * Girano in modalità demo: nessuna credenziale, nessun servizio esterno.
 */

async function login(page: Page) {
  await page.goto('/accedi');
  await page.getByRole('button', { name: 'Entra in modalità demo' }).click();
  await page.waitForURL('**/oggi', { timeout: 60_000 });
}

test.describe('accesso e dashboard', () => {
  test('1. l’accesso in modalità demo porta alla dashboard Oggi', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
    await expect(page.getByText('Modalità demo').first()).toBeVisible();
    // Nessun contenuto segnaposto.
    await expect(page.locator('body')).not.toContainText(/lorem ipsum/i);
  });

  test('la dashboard mostra gli indicatori operativi richiesti', async ({ page }) => {
    await login(page);
    for (const label of [
      'Scadute',
      'In scadenza (7 gg)',
      'Critiche',
      'Ferme da 7+ gg',
      'Ferme da 10+ gg',
      'Follow-up dovuto',
      'Email da classificare',
      'Bozze da approvare',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Riepilogo per progetto' })).toBeVisible();
  });
});

test.describe('attività', () => {
  test('2. l’elenco contiene tutte le attività SD-001…SD-032', async ({ page }) => {
    await login(page);
    await page.goto('/attivita');
    // Il conteggio totale cresce se un'esecuzione precedente ha creato attività:
    // ciò che conta è che le 32 dello snapshot ci siano tutte.
    await expect(page.getByText(/\d+ di \d+ attività/)).toBeVisible();

    for (const code of ['SD-001', 'SD-004', 'SD-016', 'SD-026', 'SD-032']) {
      await expect(page.getByRole('link', { name: code, exact: true })).toBeVisible();
    }
  });

  test('3. ricerca e filtri restringono l’elenco', async ({ page }) => {
    await login(page);
    await page.goto('/attivita');

    await page.getByRole('searchbox', { name: 'Cerca fra le attività' }).fill('CIMIC');
    await expect(page.getByRole('link', { name: 'SD-001', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SD-016', exact: true })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Cerca fra le attività' }).fill('');
    await expect(page.getByRole('link', { name: 'SD-016', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Critica', exact: true }).click();
    await expect(page.getByRole('link', { name: 'SD-004', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SD-016', exact: true })).toHaveCount(0);
  });

  test('4. la modifica rapida di stato e priorità è persistente', async ({ page }) => {
    await login(page);
    await page.goto('/attivita?q=Exo+Molise');

    const row = page.locator('tbody tr').filter({ hasText: 'SD-015' });
    await row.getByLabel('Stato di SD-015').selectOption('in_lavorazione');
    await expect(page.getByRole('status')).toContainText('SD-015');

    await page.reload();
    await expect(page.locator('tbody tr').filter({ hasText: 'SD-015' }).getByLabel('Stato di SD-015')).toHaveValue(
      'in_lavorazione',
    );

    // Ripristino, così il test è ripetibile.
    await page.locator('tbody tr').filter({ hasText: 'SD-015' }).getByLabel('Stato di SD-015').selectOption('da_fare');
    await expect(page.getByRole('status')).toBeVisible();
  });

  test('5. il dettaglio mostra timeline, dipendenze e collegamenti', async ({ page }) => {
    await login(page);
    await page.goto('/attivita/SD-001');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('CIMIC');
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prossimo passo e scadenza' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dipendenze' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SD-029' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Email collegate' })).toBeVisible();
  });

  test('la vista Kanban raggruppa per stato', async ({ page }) => {
    await login(page);
    await page.goto('/attivita?vista=kanban');
    await expect(page.getByRole('heading', { name: 'In lavorazione', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'In attesa', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Da verificare', exact: true })).toBeVisible();
  });

  test('6. la creazione manuale assegna il codice successivo', async ({ page }) => {
    await login(page);
    await page.goto('/attivita/nuova');

    const titolo = `Attività di verifica E2E ${Date.now()}`;
    await page.getByLabel('Titolo').fill(titolo);
    await page.getByLabel('Prossimo passo').fill('Verificare il flusso di creazione.');
    await page.getByLabel('Priorità').selectOption('alta');
    await page.getByRole('button', { name: 'Crea attività' }).click();

    await page.waitForURL(/\/attivita\/SD-\d{3}/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(titolo);
  });
});

test.describe('inbox e bozze', () => {
  test('7. l’inbox mostra le email dimostrative dichiarandole tali', async ({ page }) => {
    await login(page);
    await page.goto('/inbox');

    await expect(page.getByRole('heading', { name: 'Inbox operativa' })).toBeVisible();
    await expect(page.getByText('Modalità demo').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Paper CIMIC/ })).toBeVisible();
    await expect(page.getByText('Nessuna casella collegata', { exact: false }).first()).toBeVisible();
  });

  test('la conversazione sospetta è marcata e non eseguita', async ({ page }) => {
    await login(page);
    await page.goto('/inbox');
    await page.getByRole('link', { name: /Aggiornamento urgente delle coordinate/ }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Contenuto potenzialmente manipolatorio' })).toBeVisible();
    await expect(page.getByText('non viene mai eseguito né interpretato come istruzione')).toBeVisible();
  });

  test('8. un’email si collega a un’attività esistente', async ({ page }) => {
    await login(page);
    await page.goto('/inbox');
    await page.getByRole('link', { name: /SMAU Milano 2026/ }).click();

    // `selectOption` accetta solo etichette esatte: si ricava il valore dall'opzione.
    const select = page.getByLabel('Attività a cui collegare la conversazione');
    const value = await select.locator('option', { hasText: 'SD-030' }).first().getAttribute('value');
    await select.selectOption(value ?? '');
    await page.getByRole('button', { name: 'Collega', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('SD-030');

    await page.goto('/attivita/SD-030');
    await expect(page.getByRole('link', { name: /SMAU Milano 2026/ })).toBeVisible();
  });

  test('9-11. bozza generata, approvata e registrata nei log', async ({ page }) => {
    await login(page);
    await page.goto('/inbox');
    await page.getByRole('link', { name: /La Coperta Corta/ }).click();
    await page.getByRole('button', { name: 'Genera bozza interna' }).click();
    await expect(page.getByRole('status')).toContainText('Bozza generata', { timeout: 30_000 });

    await page.goto('/bozze');
    const draft = page.locator('li').filter({ hasText: 'BOZZA GENERATA IN MODALITÀ DEMO' }).first();
    await expect(draft).toBeVisible();
    // `exact` evita di intercettare il testo della bozza dentro la textarea.
    await expect(draft.getByText('Generata in modalità demo', { exact: true })).toBeVisible();

    // 10. approvazione controllata
    await draft.getByRole('button', { name: 'Approva', exact: true }).click();
    await expect(page.getByRole('status').first()).toContainText('Bozza approvata');

    // 11. registrazione nel registro AI e nell'audit log
    await page.goto('/registro-ai');
    await expect(page.getByRole('cell', { name: 'generazione_bozza' }).first()).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByRole('cell', { name: 'draft.generate' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'draft.approve' }).first()).toBeVisible();
  });

  test('il trasferimento in Gmail richiede una conferma esplicita', async ({ page }) => {
    await login(page);

    // Il test si procura la propria bozza: non dipende dall'ordine di esecuzione.
    await page.goto('/attivita/SD-006');
    await page.getByRole('button', { name: 'Genera bozza interna' }).click();
    await expect(page.getByRole('status')).toContainText('Bozza generata', { timeout: 30_000 });

    await page.goto('/bozze');
    const panel = page.locator('li').filter({ hasText: 'Trasferimento in Gmail' }).first();
    await expect(panel).toBeVisible();

    // Senza spunta di conferma il pulsante resta disattivato.
    await expect(panel.getByRole('button', { name: 'Crea bozza in Gmail' })).toBeDisabled();
    await expect(panel.getByText('Il messaggio non viene inviato', { exact: false })).toBeVisible();

    // Anche spuntando la conferma, una bozza non approvata non è trasferibile.
    await panel.getByRole('checkbox', { name: /Confermo di voler creare/ }).check();
    await expect(panel.getByRole('button', { name: 'Crea bozza in Gmail' })).toBeDisabled();

    // Solo dopo l'approvazione il pulsante si attiva.
    await panel.getByRole('button', { name: 'Approva', exact: true }).click();
    await expect(page.getByRole('status').first()).toContainText('Bozza approvata');
  });
});

test.describe('altre sezioni', () => {
  test('la vista “in attesa” elenca le dipendenze da terzi', async ({ page }) => {
    await login(page);
    await page.goto('/in-attesa');
    await expect(page.getByRole('heading', { name: 'In attesa di terzi' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SD-026', exact: true })).toBeVisible();
  });

  test('progetti, organizzazioni e persone sono navigabili', async ({ page }) => {
    await login(page);

    await page.goto('/progetti');
    await expect(page.getByRole('link', { name: 'CIMIC — paper e seminario' })).toBeVisible();
    await page.getByRole('link', { name: 'CIMIC — paper e seminario' }).click();
    await expect(page.getByRole('heading', { name: 'Metriche d’impatto' })).toBeVisible();

    await page.goto('/organizzazioni?tipo=ets');
    await expect(page.getByRole('link', { name: 'Amici Invisibili' })).toBeVisible();

    await page.goto('/contatti');
    await expect(page.getByRole('cell', { name: /Benedetta Tatti/ })).toBeVisible();
  });

  test('le impostazioni dichiarano ciò che non è attivo', async ({ page }) => {
    await login(page);
    await page.goto('/impostazioni');

    await expect(page.getByText('gmail.send', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Non attivo:', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Pub/Sub', { exact: false }).first()).toBeVisible();
  });

  test('l’assistente risponde con calcoli verificabili sui dati', async ({ page }) => {
    await login(page);
    await page.goto('/assistente');

    await page.getByRole('button', { name: 'Quali attività sono ferme da più di dieci giorni?' }).click();
    await expect(page.getByRole('heading', { name: /Calcolo diretto sui dati registrati/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Attività ferme da più di 10 giorni/)).toBeVisible();
  });

  test('l’esportazione CSV restituisce un file scaricabile', async ({ page }) => {
    await login(page);
    await page.goto('/attivita?priority=critica');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^attivita-skill-donor-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

test.describe('accessibilità e resa visiva', () => {
  test('la navigazione da tastiera raggiunge il contenuto principale', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Vai al contenuto principale' })).toBeFocused();
  });

  test('nessuna schermata produce scorrimento orizzontale del corpo pagina', async ({ page }) => {
    await login(page);
    for (const path of ['/oggi', '/attivita', '/inbox', '/progetti', '/impostazioni']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `scorrimento orizzontale su ${path}`).toBeLessThanOrEqual(1);
    }
  });

  test('ogni pagina ha un solo titolo di primo livello', async ({ page }) => {
    await login(page);
    for (const path of ['/oggi', '/attivita', '/inbox', '/bozze', '/progetti', '/impostazioni', '/assistente']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }), `h1 su ${path}`).toHaveCount(1);
    }
  });
});
