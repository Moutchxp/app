import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (15/11/2026, 3e retour du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE, en clair ET en sombre. Micro, transcription et
 * dépôts SIMULÉS dans la page (rien n'est enregistré, aucun mail). Prouve : la présence (case non cochée, personne ajoutée cochée, refus sans
 * personne), aucun emoji, boutons de même taille, bouton rond et bouton de dictée ROUGES pendant l'appui.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-3
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<Record<string, unknown>[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  await page.addInitScript((t) => {
    class FauxEnregistreur {
      static isTypeSupported = (x: string) => x === 'audio/mp4';
      mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? 'audio/mp4'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
  }, theme);
  const appels: Record<string, unknown>[] = [];
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    const ok = (data: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data }) });
    if (c.action === 'dicter-compte-rendu') return ok({ ok: true, texte: 'Cuisine propre' });
    if (c.action === 'vocal-compte-rendu') return ok({ id: 9300 + appels.push(c), nom: 'v', taille: 3 });
    if (c.action === 'apercu-compte-rendu-previsite') { appels.push(c); return r.continue(); } // le VRAI aperçu (lecture seule, rien ne part)
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  return appels;
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] présence : case non cochée ; refus sans personne ; personne ajoutée cochée ; « En présence de … » dans le récapitulatif (aperçu réel)`, async ({ page }) => {
    const appels = await preparer(page, theme);
    await expect(page.locator('[data-presence-locataire]').first()).not.toBeChecked();
    await page.locator('[data-corps-compte-rendu]').fill('Logement propre.');
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-presence-motif]')).toHaveText('Cochez au moins une personne présente à la pré-visite.');
    await expect(page.locator('[data-bloc-presence]')).toHaveAttribute('data-presence-erreur', 'oui');
    expect(appels.filter((c) => c.action === 'apercu-compte-rendu-previsite')).toEqual([]);
    await capturer(page, `${theme}-01-presence-refus`);
    await page.locator('[data-ajouter-personne]').tap();
    await page.locator('[data-personne-civilite="Madame"]').check();
    await page.locator('[data-personne-nom]').fill('Martin');
    await page.locator('[data-personne-prenom]').fill('Léa');
    await capturer(page, `${theme}-02-modale-personne`);
    await page.locator('[data-personne-ajouter]').tap();
    await expect(page.locator('[data-personne-ajoutee] [data-presence-personne]')).toBeChecked();
    await expect(page.locator('[data-presence-motif]')).toHaveCount(0);
    await page.locator('[data-presence-locataire]').first().check();
    await page.locator('[data-bloc-presence]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-03-presence-cochee`);
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toContainText('En présence de', { timeout: 20_000 });
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toContainText('et de Mme Léa Martin.');
    await capturer(page, `${theme}-04-recapitulatif-presence`);
  });

  test(`[${theme}] aucun emoji ; boutons de même taille ; bouton rond et dictée ROUGES pendant l’appui`, async ({ page }) => {
    await preparer(page, theme);
    const boite = page.locator('[data-fenetre-previsite="saisie"]');
    expect(await boite.evaluate((b) => /\p{Extended_Pictographic}/u.test(b.textContent ?? ''))).toBe(false);
    const tailles = await page.evaluate(() => ['[data-clavier]', '[data-dicter]', '[data-photo-galerie-bouton]', '[data-ajouter-photo]', '[data-nouveau-vocal]', '[data-annuler-previsite]', '[data-recap-previsite]']
      .map((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return [s, Math.round(r.width), Math.round(r.height)] as const; }));
    const [, l0, h0] = tailles[0];
    for (const [s, l, h] of tailles) { expect(Math.abs(l - l0), `${s} largeur`).toBeLessThanOrEqual(2); expect(Math.abs(h - h0), `${s} hauteur`).toBeLessThanOrEqual(2); }
    await capturer(page, `${theme}-05-texte-boutons`);
    const rouge = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--color-svv-red)'; document.querySelector('.svv-adm-root')!.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    for (const sel of ['[data-enregistrer-vocal]', '[data-dicter]']) {
      const b = page.locator(sel);
      await b.scrollIntoViewIfNeeded();
      const repos = await b.evaluate((e) => getComputedStyle(e).backgroundColor);
      expect(repos).not.toBe(rouge);
      await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
      await expect(b).toHaveAttribute('data-enregistrement', 'oui');
      await page.waitForTimeout(700);
      expect(await b.evaluate((e) => getComputedStyle(e).backgroundColor), `${sel} rouge pendant l’appui`).toBe(rouge);
      if (sel === '[data-enregistrer-vocal]') {
        await expect(page.locator('[data-rond-duree]')).toHaveText(/^\d{2}:\d{2}$/);
        await page.locator('.pvv-dictaphone').scrollIntoViewIfNeeded();
        await capturer(page, `${theme}-06-bouton-rond-rouge`);
      } else await capturer(page, `${theme}-07-dictee-rouge`);
      await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
      await expect(b).toHaveAttribute('data-enregistrement', 'non');
      // retour à l'état normal au relâchement (le fond revient en fondu : on attend la fin de la transition)
      await expect.poll(() => b.evaluate((e) => getComputedStyle(e).backgroundColor), { timeout: 3000 }).toBe(repos);
    }
    await page.locator('.pvv-dictaphone').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-08-dictaphone`);
  });
}
