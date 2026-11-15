import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴 Arno (15/11/2026, 5e retour du test iPhone) — LE COMPTE RENDU DE PRÉ-VISITE EST UNE PAGE À PART ENTIÈRE. WebKit, profil iPhone 15, contre
 * la RECETTE, en clair ET en sombre. Prouve : clavier ouvert simulé (zone visible réduite) → AUCUN élément de la page Location visible ni
 * présent dans la page ; l'ancien lien redirigé ; « Annuler » et « ← Retour » vers le bon préavis ; parcours complet jusqu'au récapitulatif
 * (VRAI aperçu, lecture seule : rien ne part) ; une fenêtre ouverte sur la Location masque la page de fond ; aucune erreur de la console
 * (pas de pastille « Issue »).
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-page
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };
const PAGE_CR = `/admin/location/previsite/${OCC}/compte-rendu`;
/** Ce qui appartient à la page Location (le bloc des préavis, sa frise, ses lignes, l'accueil). */
const LOCATION = '[data-bloc-preavis], [data-frise-preavis], [data-ligne-preavis], [data-ligne-depliee], .loc-cases, .loc-page';

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript((t) => {
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
    // 🔴 « 1 Issue » (journal de la recette, 15/11/2026) — ce que fait Chrome sur iPhone : un attribut `__gcruniqueid` sur chaque champ, dès
    // l'analyse du HTML (AVANT l'hydratation). Simulé ici sur toutes les pages de l'épreuve : aucune erreur ne doit en sortir.
    let n = 0;
    const marquer = (e: Node) => { if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) e.setAttribute('__gcruniqueid', String(++n)); };
    new MutationObserver((ms) => ms.forEach((x) => x.addedNodes.forEach((e) => { marquer(e); (e as Element).querySelectorAll?.('input,textarea').forEach(marquer); })))
      .observe(document, { childList: true, subtree: true });
  }, theme);
  return erreurs;
}
const formulaire = (page: Page) => page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]');

/** Le CLAVIER OUVERT simulé : la zone visible réduite (le clavier iOS occupe le bas de l'écran), le curseur dans le texte. */
async function ouvrirClavier(page: Page): Promise<void> {
  await page.setViewportSize({ width: 393, height: 420 });
  await page.locator('[data-corps-compte-rendu]').focus();
  await page.waitForTimeout(400);
}
/** Ce que l'on VOIT, point par point, de haut en bas de la zone visible : jamais un élément de la Location, jamais de trou transparent. */
async function sonderEcran(page: Page): Promise<{ location: number; transparent: number; points: number }> {
  return page.evaluate((sel) => {
    const h = window.visualViewport?.height ?? window.innerHeight; let location = 0; let transparent = 0; let points = 0;
    for (let y = 2; y < h; y += 12) for (const x of [4, 196, 389]) {
      points += 1;
      const e = document.elementFromPoint(x, y);
      if (e === null) { transparent += 1; continue; }
      if (e.closest(sel) !== null) location += 1;
    }
    return { location, transparent, points };
  }, LOCATION);
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] l’ancien lien ouvre la PAGE (redirigé) ; clavier ouvert : rien de la Location, ni visible ni présent ; aucune erreur`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await page.goto(`${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`);
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(PAGE_CR);
    expect(await page.locator(LOCATION).count()).toBe(0);
    expect(await page.locator('.mis-voile, [aria-modal="true"]').count()).toBe(0);
    await capturer(page, `${theme}-01-page-redirigee`);
    await ouvrirClavier(page);
    for (const y of [0, 600, 99999]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(150);
      const s = await sonderEcran(page);
      expect(s.location, `défilement ${y}`).toBe(0);
      expect(s.transparent, `défilement ${y}`).toBe(0);
    }
    expect(await page.locator(LOCATION).count()).toBe(0);
    // le fond de la page va jusqu'au bord inférieur : la page elle-même est opaque, de la couleur du formulaire
    const fonds = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.svv-adm-root')!).backgroundColor,
      getComputedStyle(document.querySelector('.pvv-page-cr')!).backgroundColor]);
    expect(fonds[0]).toBe(fonds[2]); expect(fonds[1]).toBe(fonds[2]);
    expect(fonds[2]).not.toMatch(/rgba\(.*, 0\)$/);
    await capturer(page, `${theme}-02-clavier-ouvert-bas-de-page`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capturer(page, `${theme}-03-clavier-ouvert-haut-de-page`);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] « Annuler » et « ← Retour » : la Location, le bon préavis déplié ; le bouton de la frise ouvre la page`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await page.goto(`${BASE}/admin/location?previsite=${OCC}`);
    const lien = page.locator('[data-ligne-depliee] a[data-compte-rendu-previsite]');
    await expect(lien).toBeVisible({ timeout: 30_000 });
    expect(await lien.getAttribute('href')).toBe(PAGE_CR);
    const cle = await page.locator('[data-ligne-depliee]').getAttribute('data-ligne-depliee');
    await capturer(page, `${theme}-04-location-frise`);
    await lien.tap();
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(PAGE_CR);
    expect(await page.locator(LOCATION).count()).toBe(0);
    // « Annuler » (en fin de formulaire) : retour à l'origine, la ligne du préavis dépliée
    await page.locator('[data-annuler-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-annuler-previsite]').tap();
    await expect(page.locator(`[data-ligne-depliee="${cle}"]`)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe('/admin/location');
    await expect(page.locator('[data-fenetre-previsite]')).toHaveCount(0);
    // « ← Retour » de la page : même retour
    await page.locator('[data-ligne-depliee] a[data-compte-rendu-previsite]').tap();
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    await capturer(page, `${theme}-05-page-retour`);
    await page.locator('[data-page-compte-rendu] a[data-retour-lien]').tap();
    await expect(page.locator(`[data-ligne-depliee="${cle}"]`)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe('/admin/location');
    // lien direct (aucune origine connue, comme depuis un mail) : « Annuler » → la Location, ce préavis déplié
    await page.goto(`${BASE}${PAGE_CR}`);
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* rien */ } });
    await page.locator('[data-annuler-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-annuler-previsite]').tap();
    await expect(page.locator(`[data-ligne-depliee="${cle}"]`)).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).search).toBe(`?previsite=${OCC}`);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] parcours complet jusqu’au récapitulatif (VRAI aperçu, rien ne part) ; « Ajouter une personne » masque la page de fond`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await page.goto(`${BASE}${PAGE_CR}`);
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-ajouter-personne]').tap();
    await expect(page.locator('[data-modale-personne]')).toBeVisible();
    // une fenêtre ouverte sur téléphone : la page de fond est masquée (visibility hidden), seule la fenêtre se voit
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-shell')!).visibility)).toBe('hidden');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-modale-personne]')!).visibility)).toBe('visible');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-corps-compte-rendu]')!).visibility)).toBe('hidden');
    await page.locator('[data-personne-civilite="Madame"]').check();
    await page.locator('[data-personne-nom]').fill('Martin');
    await page.locator('[data-personne-prenom]').fill('Léa');
    await page.locator('[data-personne-nom]').focus();
    await page.setViewportSize({ width: 393, height: 420 }); await page.waitForTimeout(300);
    const s = await sonderEcran(page);
    expect(s.location).toBe(0);
    await capturer(page, `${theme}-06-ajouter-personne-clavier`);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('[data-personne-ajouter]').tap();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-shell')!).visibility)).toBe('visible');
    await page.locator('[data-corps-compte-rendu]').fill('Logement propre.');
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-blocage-envoi]')).toHaveCount(0, { timeout: 15_000 }); // 🔴 (9e retour) le récapitulatif attend « Sauvegardée »
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toContainText('En présence de Mme Léa Martin.');
    await expect(page.locator('[data-confirmer-previsite]')).toBeVisible();
    expect(await page.locator(LOCATION).count()).toBe(0);
    await capturer(page, `${theme}-07-recapitulatif`);
    // « Revenir » : la saisie est intacte (double validation inchangée) — on ne confirme jamais ici
    await page.locator('[data-revenir-previsite]').tap();
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('Logement propre.');
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] sur la Location, une fenêtre de saisie ouverte (Refus / absence) masque la page de fond sur téléphone`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await page.goto(`${BASE}/admin/location?previsite=${OCC}`);
    const refus = page.locator('[data-ligne-depliee] [data-refus-previsite]');
    await expect(refus).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-shell')!).visibility)).toBe('visible');
    await refus.tap();
    await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="refus"]')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-shell')!).visibility)).toBe('hidden');
    await page.locator('[data-texte-refus]').focus();
    await page.setViewportSize({ width: 393, height: 420 }); await page.waitForTimeout(300);
    expect((await sonderEcran(page)).location).toBe(0);
    await capturer(page, `${theme}-08-fenetre-refus-clavier`);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('[data-annuler-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite]')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-shell')!).visibility)).toBe('visible');
    expect(erreurs).toEqual([]);
  });
}
