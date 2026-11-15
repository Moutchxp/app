import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴 Arno (15/11/2026, 8e retour du test iPhone) — LE DICTAPHONE : LA DESTINATION DES PRISES TOUJOURS VISIBLE. WebKit, profil iPhone 15, contre
 * la RECETTE (préavis de test), en clair ET en sombre. Prouve : le titre dicté REMPLACE l'ancien ; les pastilles (une par fichier + « Nouveau »,
 * l'active pleine rouge, ≥ 44 px, défilement horizontal) ; le libellé sous le gros bouton ; la carte active bordée de rouge et étiquetée ;
 * la prise ajoutée dans le BON fichier après un changement ; l'appui sur une carte ; la suppression du fichier actif ; la restauration du
 * fichier actif à la réouverture. Micro, transcription et dépôt des prises simulés ; le brouillon de l'épreuve est effacé en partant.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-8
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript((t) => {
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
    class FauxEnregistreur {
      static isTypeSupported = (x: string) => x === 'audio/mp4';
      mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? 'audio/mp4'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {}, readyState: 'live' }] }) } });
  }, theme);
  let id = 97_000;
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    const ok = (data: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data }) });
    if (c.action === 'dicter-compte-rendu') return ok({ ok: true, texte: 'salle de bain.' });
    if (c.action === 'vocal-compte-rendu') { id += 1; return ok({ id, nom: 'v.m4a', taille: 3 }); }
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location/previsite/${OCC}/compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  return erreurs;
}
async function maintenir(page: Page, sel: string, ms: number): Promise<void> {
  const b = page.locator(sel);
  await b.scrollIntoViewIfNeeded();
  await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('data-enregistrement', 'oui');
  await page.waitForTimeout(ms);
  await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('data-enregistrement', 'non');
}
/** « Effacer le brouillon » : on attend la RÉPONSE du serveur (le texte est vide dans cette épreuve : « champ vide » ne prouve rien, et fermer
 *  la page trop tôt annulait la demande, laissant le brouillon de l'épreuve vivant). */
async function effacerBrouillon(page: Page): Promise<void> {
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  const efface = page.waitForResponse((r) => (r.request().postData() ?? '').includes('"effacer-brouillon-previsite"'));
  await page.locator('[data-effacer-brouillon-oui]').tap();
  expect((await efface).status()).toBe(200);
  await expect(page.locator('[data-fichier-actif-etiquette]')).toHaveCount(0);
}
const sous = (page: Page) => page.locator('[data-rond-duree]');
const pastille = (page: Page, n: number) => page.locator(`[data-pastille-vocal="${n}"]`);

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] titre dicté qui REMPLACE ; pastilles et destination ; carte active ; prise dans le bon fichier ; appui sur une carte ; suppression ; restauration`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await expect(sous(page)).toHaveText('La première prise crée « Vocal 1 »');
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-prise-etat="ok"]')).toHaveCount(1, { timeout: 10_000 });
    // le titre dicté REMPLACE « Vocal 1 »
    await maintenir(page, '[data-vocal="1"] [data-dicter-titre]', 700);
    await expect(page.locator('[data-vocal="1"] [data-vocal-nom]')).toHaveValue('Salle de bain', { timeout: 10_000 });
    await expect(sous(page)).toHaveText('Maintenir pour enregistrer dans « Salle de bain »');
    // « + Nouveau » : un second fichier, actif ; l'écran revient au gros bouton
    await page.locator('[data-pastille-nouveau]').tap();
    await expect(pastille(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(pastille(page, 1)).toHaveAttribute('aria-pressed', 'false');
    await expect(sous(page)).toHaveText('Maintenir pour enregistrer dans « Vocal 2 »');
    const rouge = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = getComputedStyle(document.querySelector('.svv-adm-root')!).getPropertyValue('--color-svv-red'); document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; });
    await expect.poll(() => pastille(page, 2).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(rouge);
    expect(await pastille(page, 1).evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(rouge);
    expect((await pastille(page, 1).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('[data-pastilles-vocaux]').evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto');
    // la carte active : bordure rouge épaisse et étiquette
    const carte2 = page.locator('[data-vocal="2"]');
    expect(await carte2.evaluate((e) => [getComputedStyle(e).borderTopColor, getComputedStyle(e).borderTopWidth])).toEqual([rouge, '4px']);
    await expect(carte2.locator('[data-fichier-actif-etiquette]')).toHaveText('Les prochaines prises vont ici');
    await expect(carte2.locator('[data-vocal-choisir]')).toBeDisabled();
    await expect(carte2.locator('[data-vocal-choisir]')).toHaveText('Fichier actif');
    await expect(page.locator('[data-vocal="1"] [data-vocal-choisir]')).toHaveText('Choisir ce fichier');
    await page.locator('[data-pastilles-vocaux]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-01-pastilles-et-libelle`);
    // changer de destination par la pastille : la prise va dans « Salle de bain »
    await pastille(page, 1).tap();
    await expect(sous(page)).toHaveText('Maintenir pour enregistrer dans « Salle de bain »');
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-vocal="1"]')).toHaveAttribute('data-vocal-prises', '2', { timeout: 10_000 });
    await expect(carte2).toHaveAttribute('data-vocal-prises', '0');
    await page.locator('[data-vocal="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-02-carte-active-bordee`);
    // un appui sur une AUTRE carte (hors boutons et champs) la rend active
    await carte2.locator('[data-vocal-resume]').tap();
    await expect(pastille(page, 2)).toHaveAttribute('aria-pressed', 'true');
    await expect(carte2.locator('[data-fichier-actif-etiquette]')).toBeVisible();
    // la réouverture restaure le fichier actif
    await page.waitForTimeout(1800);
    await page.reload();
    await expect(page.locator('[data-fenetre-previsite="saisie"]')).toBeVisible({ timeout: 30_000 });
    await expect(pastille(page, 2)).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect(sous(page)).toHaveText('Maintenir pour enregistrer dans « Vocal 2 »');
    // supprimer le fichier ACTIF : le précédent devient actif
    await page.locator('[data-vocal="2"] [data-vocal-supprimer]').tap();
    await page.locator('[data-vocal-supprimer-oui]').tap();
    await expect(pastille(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(sous(page)).toHaveText('Maintenir pour enregistrer dans « Salle de bain »');
    await page.locator('[data-vocaux-compte-rendu]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-03-apres-suppression-du-fichier-actif`);
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });
}
