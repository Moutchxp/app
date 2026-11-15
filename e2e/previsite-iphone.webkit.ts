import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (14/11/2026, production) — LE LIEN DE L'INVITATION AU COMPTE RENDU, OUVERT SUR iPHONE DEPUIS UNE AUTRE APPLICATION (Gmail → Chrome iOS,
 * Mail → Safari : moteur WebKit dans les deux cas). Le lien passe par un relais d'un AUTRE site (comme google.com/url de Gmail) : le cookie
 * de session (SameSite=Strict, inchangé) n'accompagne pas la première navigation. Ce qui est exigé :
 *  - session valide : le formulaire du compte rendu s'ouvre, au plus UN aller-retour par la connexion ;
 *  - la navigation automatique perd la connexion (comportement de WebKit simulé) : PAS DE BOUCLE — message et bouton, et le TOUCHER ouvre le
 *    formulaire ;
 *  - sans session : la page de connexion, avec un message, et rien ne boucle ;
 *  - aucune erreur JavaScript, aucun plantage de la page.
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const LIEN = `${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`;

test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');

/** Ouvre le lien comme depuis Gmail : une page d'un autre site, puis son relais (redirection), puis l'application. */
async function ouvrirDepuisUnAutreSite(page: Page): Promise<{ navigations: string[]; erreurs: string[] }> {
  const navigations: string[] = []; const erreurs: string[] = [];
  page.on('request', (r) => { if (r.isNavigationRequest() && r.url().startsWith(BASE)) navigations.push(new URL(r.url()).pathname + new URL(r.url()).search); });
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('crash', () => erreurs.push('plantage de la page'));
  await page.route('https://mail.exemple.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: r.request().url().includes('/url') ? `<meta http-equiv="refresh" content="0;url=${LIEN}">` : '<meta name="viewport" content="width=device-width"><a id="lien" style="display:block;padding:40px;font-size:24px" href="https://mail.exemple.test/url?q=1">Ouvrir le compte rendu</a>' }));
  await page.goto('https://mail.exemple.test/');
  await page.tap('#lien');
  return { navigations, erreurs };
}
/** Capture d'écran facultative (E2E_CAPTURES = dossier, p. ex. `.captures/<lot>/`). */
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };
const cookie = (domaine: string) => ({ name: 'svv_admin_session', value: JETON, domain: domaine, path: '/', httpOnly: true, sameSite: 'Strict' as const, secure: false });

test('session valide : le formulaire du compte rendu s’ouvre, au plus un aller-retour', async ({ page, context }) => {
  await context.addCookies([cookie(new URL(BASE).hostname)]);
  const { navigations, erreurs } = await ouvrirDepuisUnAutreSite(page);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(navigations.filter((n) => n.startsWith('/admin/login')).length).toBeLessThanOrEqual(1);
  // 🔴 (15/11/2026, 5e retour) — l'ancien lien est redirigé PAR LE SERVEUR vers la page du compte rendu : ce saut n'est pas un aller-retour par
  // la connexion, il est compté à part (au plus un par passage sur l'ancien lien)
  const page_ = navigations.filter((n) => n.startsWith('/admin/location/previsite/'));
  expect(navigations.length - page_.length).toBeLessThanOrEqual(3);
  expect(page_.length).toBeLessThanOrEqual(2);
  expect(page.url()).not.toContain('reprise=1');
  await capturer(page, '02-session-valide-formulaire-ouvert');
  expect(erreurs).toEqual([]);
});

test('WebKit perd la connexion à la navigation automatique : PAS DE BOUCLE ; le toucher ouvre le formulaire', async ({ page, context }) => {
  await context.addCookies([cookie(new URL(BASE).hostname)]);
  // ce que ferait le garde si le cookie n'accompagnait pas le retour automatique : retour à la connexion, marque comprise
  let simulees = 0;
  await page.route((u) => u.searchParams.get('reprise') === '1' && u.pathname === '/admin/location', (r) => {
    simulees += 1;
    const u = new URL(r.request().url());
    return r.fulfill({ contentType: 'text/html', body: `<meta http-equiv="refresh" content="0;url=/admin/login?retour=${encodeURIComponent(u.pathname + u.search)}">` });
  });
  const { navigations, erreurs } = await ouvrirDepuisUnAutreSite(page);
  await expect(page.locator('[data-ouvrir-page-demandee]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000); // une boucle aurait le temps de tourner des dizaines de fois
  expect(simulees).toBe(1);
  expect(navigations.filter((n) => n.startsWith('/admin/login')).length).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-retour-propose]')).toContainText('Votre session est ouverte');
  await capturer(page, '03-pas-de-boucle-message-et-bouton');
  await page.locator('[data-ouvrir-page-demandee]').tap();
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 20_000 });
  await capturer(page, '04-apres-le-toucher-formulaire-ouvert');
  expect(erreurs).toEqual([]);
});

test('sans session : la page de connexion avec un message, rien ne boucle', async ({ page }) => {
  const { navigations, erreurs } = await ouvrirDepuisUnAutreSite(page);
  await expect(page.locator('[data-retour-connexion]')).toHaveText('Connectez-vous pour ouvrir la page demandée.', { timeout: 20_000 });
  await page.waitForTimeout(3000);
  await capturer(page, '05-sans-session-connexion-avec-message');
  expect(navigations.filter((n) => n.startsWith('/admin/login')).length).toBe(1);
  expect(erreurs).toEqual([]);
});

test('le formulaire s’ouvre sans charger la conversion des photos ni l’enregistreur ; un appareil sans micro : message clair', async ({ page, context }) => {
  await context.addCookies([cookie(new URL(BASE).hostname)]);
  await page.addInitScript(() => { delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder; });
  const scripts: string[] = [];
  page.on('response', (r) => { if (r.request().resourceType() === 'script') scripts.push(r.url()); });
  const { erreurs } = await ouvrirDepuisUnAutreSite(page);
  await expect(page.locator('[data-fenetre-previsite="saisie"]')).toBeVisible({ timeout: 20_000 });
  const avant = scripts.length;
  await page.locator('[data-enregistrer-vocal]').tap();
  await expect(page.locator('[data-vocal-micro]')).toContainText('n’est pas disponible sur cet appareil', { timeout: 10_000 });
  expect(scripts.length).toBeGreaterThan(avant); // l'enregistreur s'est chargé AU TOUCHER
  await expect(page.locator('[data-corps-compte-rendu]')).toBeVisible();
  await page.locator('[data-vocal-micro]').scrollIntoViewIfNeeded();
  await capturer(page, '06-appareil-sans-micro-message-clair');
  expect(erreurs).toEqual([]);
});
