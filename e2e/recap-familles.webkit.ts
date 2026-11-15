import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (15/11/2026) — LE RÉCAPITULATIF DU COMPTE RENDU, PAR FAMILLE DE MAIL. WebKit contre la RECETTE, préavis de TEST, au format iPhone ET
 * au format ordinateur, en clair ET en sombre. Prouve sur le VRAI aperçu (lecture seule : on ne confirme jamais) : l'étiquette et la couleur de
 * chaque famille, l'interne d'abord, une carte par locataire à son nom, le rappel des comptes, la mention « adresse remplacée en recette »,
 * les notes de présence dans la seule carte interne, « En présence de … » en tête du texte de chaque carte.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test recap-familles
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png`, fullPage: true }); };

async function jusquAuRecap(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript((t) => { try { localStorage.setItem('svv-theme', t); } catch { /* rien */ } }, theme);
  await page.goto(`${BASE}/admin/location/previsite/${OCC}/compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-presence-locataire]').first().check();
  await page.locator('[data-ajouter-personne]').click();
  await page.locator('[data-personne-civilite="Madame"]').check();
  await page.locator('[data-personne-nom]').fill('Martin');
  await page.locator('[data-personne-prenom]').fill('Léa');
  await page.locator('[data-personne-note-modale]').fill('mère du locataire');
  await page.locator('[data-personne-ajouter]').click();
  await page.locator('[data-corps-compte-rendu]').fill('Logement propre.');
  await expect(page.locator('[data-aussi-locataires]')).toHaveAttribute('aria-pressed', 'true'); // 🔴 (15/11/2026) activé par défaut
  await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
  await page.locator('[data-recap-previsite]').click();
  await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
  return erreurs;
}

async function verifierFamilles(page: Page): Promise<void> {
  const cartes = page.locator('[data-famille-mail]');
  await expect(cartes.locator('[data-etiquette-famille]')).toHaveText(['MAIL INTERNE À L’AGENCE', 'MAIL AUX LOCATAIRES']);
  await expect(page.locator('[data-rappel-familles]')).toHaveText('1 mail interne · 1 mail locataire');
  const interne = cartes.nth(0); const locataire = cartes.nth(1);
  await expect(locataire.locator('[data-destinataire-famille]')).toContainText('Destinataire :');
  await expect(locataire.locator('[data-recette-remplacement]')).toHaveText('Adresse remplacée en recette : envoyé à a.jorel@sansvisavis.com au lieu de l’adresse du locataire.');
  await expect(interne.locator('[data-collaborateurs-destinataires] li').first()).toBeVisible();
  // les notes de présence (internes) dans la SEULE carte interne
  await expect(interne.locator('[data-notes-internes-carte]')).toContainText('Mme Léa Martin — mère du locataire');
  await expect(locataire.locator('[data-notes-internes-carte]')).toHaveCount(0);
  // « En présence de … » en tête du texte de chaque carte
  // 🔴 (15/11/2026, 6e retour) interne : introduction courte puis « En présence de … » ; locataire : la présence dans l'introduction
  expect((await interne.locator('[data-texte-mail]').textContent())!).toMatch(/^Compte rendu de la pré-visite du .+\n\nEn présence de /);
  expect((await locataire.locator('[data-texte-mail]').textContent())!).toMatch(/ en présence de .+, vous trouverez ci-dessous/);
  await expect(locataire.locator('[data-texte-mail]')).not.toContainText('mère du locataire');
  // les couleurs : la barre et l'étiquette de la même couleur dans une carte ; interne (gris) et locataire (vert) différentes
  const couleurs = await cartes.evaluateAll((cs) => cs.map((c) => [getComputedStyle(c).borderLeftColor, getComputedStyle(c.querySelector('[data-etiquette-famille]')!).backgroundColor,
    getComputedStyle(c).borderLeftWidth]));
  for (const [barre, etiquette, largeur] of couleurs) { expect(barre).toBe(etiquette); expect(largeur).toBe('8px'); }
  expect(couleurs[0][0]).not.toBe(couleurs[1][0]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`[iPhone ${theme}] récapitulatif par famille : étiquettes, couleurs, ordre, une carte par locataire, recette, présence en tête`, async ({ page }) => {
    const erreurs = await jusquAuRecap(page, theme);
    await verifierFamilles(page);
    await capturer(page, `iphone-${theme}-01-recapitulatif-familles`);
    await page.locator('[data-famille-mail="locataire"]').first().scrollIntoViewIfNeeded();
    await capturer(page, `iphone-${theme}-02-carte-locataire`);
    await page.locator('[data-revenir-previsite]').click(); // on ne confirme jamais
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('Logement propre.');
    expect(erreurs).toEqual([]);
  });
}

test.describe('format ordinateur', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  for (const theme of ['light', 'dark'] as const) {
    test(`[ordinateur ${theme}] récapitulatif par famille : mêmes étiquettes, couleurs et ordre`, async ({ page }) => {
      const erreurs = await jusquAuRecap(page, theme);
      await verifierFamilles(page);
      await capturer(page, `ordinateur-${theme}-01-recapitulatif-familles`);
      await page.locator('[data-revenir-previsite]').click();
      expect(erreurs).toEqual([]);
    });
  }
});
