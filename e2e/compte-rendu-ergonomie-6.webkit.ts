import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴 Arno (15/11/2026, 6e retour du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE (préavis de test), en clair ET en sombre.
 * Prouve : « Clavier » rouge champ actif, BLANC dès que le champ perd le focus ; « Entrée » pose le tiret tout de suite (« - | »), le tiret
 * orphelin n'est pas envoyé ; le micro dans le TITRE d'un fichier vocal (dictée dans ce titre) ; « Les destinataires : » un par ligne, barre
 * verte (locataire) / grise (interne), mention de recette ; désactivé : les seuls internes ; « Écouter » sur chaque vocal du récapitulatif ;
 * le VRAI aperçu : mail aux locataires (appel, introduction avec la présence, points à tirets, clôture, politesse) et mail interne
 * (introduction courte). Micro, transcription et dépôt des vocaux simulés ; on ne confirme jamais ; le brouillon est effacé en partant.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-6
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<{ apercus: Record<string, unknown>[]; erreurs: string[] }> {
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
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  }, theme);
  const apercus: Record<string, unknown>[] = [];
  let id = 98_000;
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    const ok = (data: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data }) });
    if (c.action === 'dicter-compte-rendu') return ok({ ok: true, texte: 'salle de bains' });
    if (c.action === 'vocal-compte-rendu') { id += 1; return ok({ id, nom: 'v.m4a', taille: 3 }); }
    if (c.action === 'apercu-compte-rendu-previsite') apercus.push(c);
    if (c.action === 'compte-rendu-previsite') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'refus', motif: 'Essai : rien n’est envoyé.' }) });
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location/previsite/${OCC}/compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800); // le brouillon éventuel est lu
  return { apercus, erreurs };
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
async function effacerBrouillon(page: Page): Promise<void> {
  if (await page.locator('[data-revenir-previsite]').count()) await page.locator('[data-revenir-previsite]').tap();
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  await page.locator('[data-effacer-brouillon-oui]').tap();
  await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('');
}
const couleur = (page: Page, nom: string) => page.evaluate((n) => { const d = document.createElement('div'); d.style.color = getComputedStyle(document.querySelector('.svv-adm-root')!).getPropertyValue(n); document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, nom);

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] « Clavier » suit le champ ; « Entrée » pose le tiret tout de suite ; le tiret orphelin n’est pas envoyé`, async ({ page }) => {
    const { apercus, erreurs } = await preparer(page, theme);
    const clavier = page.locator('[data-clavier]'); const zone = page.locator('[data-corps-compte-rendu]');
    await zone.fill('Salon propre');
    // le champ a le focus (clavier ouvert) : rouge ; on le quitte, puis « Clavier » le rouvre
    await expect(clavier).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-titre-previsite]').tap();
    await expect(clavier).toHaveAttribute('aria-pressed', 'false');
    await clavier.tap();
    await expect(clavier).toHaveAttribute('aria-pressed', 'true');
    const rouge = await couleur(page, '--color-svv-red');
    await expect.poll(() => clavier.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(rouge);
    // fermé autrement (appui ailleurs : le champ perd le focus) : le bouton redevient BLANC
    await page.locator('[data-titre-previsite]').tap();
    await expect(clavier).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => clavier.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(rouge);
    await capturer(page, `${theme}-07-clavier-blanc`);
    // « Entrée » : « - | »
    await zone.evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
    await page.locator('[data-entree]').tap();
    await expect(zone).toHaveValue('Salon propre\n- ');
    expect(await zone.evaluate((t: HTMLTextAreaElement) => t.selectionStart)).toBe('Salon propre\n- '.length);
    await zone.scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-08-entree-tiret-immediat`);
    await page.locator('[data-presence-locataire]').first().check();
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-blocage-envoi]')).toHaveCount(0, { timeout: 15_000 }); // 🔴 (9e retour) le récapitulatif attend « Sauvegardée »
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
    expect(apercus.at(-1)!.corps).toBe('Salon propre');
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] « Les destinataires : » barres verte / grise, mention de recette ; micro du titre de vocal ; « Écouter » au récapitulatif ; mails soignés`, async ({ page }) => {
    const { erreurs } = await preparer(page, theme);
    const vert = await couleur(page, '--color-svv-green-ink'); const gris = await couleur(page, '--color-svv-gray');
    await page.locator('[data-bloc-envoi-locataires]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-destinataires-titre]')).toHaveText('Les destinataires :');
    await expect(page.locator('[data-destinataire-liste="locataire"]')).toHaveCount(1, { timeout: 10_000 });
    expect(await page.locator('[data-destinataire-liste="interne"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-destinataire-liste="locataire"]').evaluate((e) => getComputedStyle(e).borderLeftColor)).toBe(vert);
    expect(await page.locator('[data-destinataire-liste="interne"]').first().evaluate((e) => getComputedStyle(e).borderLeftColor)).toBe(gris);
    await expect(page.locator('[data-destinataire-recette]')).toContainText('Adresse remplacée en recette');
    await capturer(page, `${theme}-09-destinataires-active`);
    await page.locator('[data-aussi-locataires]').tap();
    await expect(page.locator('[data-destinataire-liste="locataire"]')).toHaveCount(0);
    expect(await page.locator('[data-destinataire-liste="interne"]').count()).toBeGreaterThan(0);
    await capturer(page, `${theme}-10-destinataires-internes-seuls`);
    await page.locator('[data-aussi-locataires]').tap();
    // le titre d'un fichier vocal : le micro à droite, la dictée dans CE titre
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-prise-etat="ok"]')).toHaveCount(1, { timeout: 10_000 });
    const nom = page.locator('[data-vocal="1"] [data-vocal-nom]');
    await nom.evaluate((i: HTMLInputElement) => { i.focus(); i.setSelectionRange(i.value.length, i.value.length); i.blur(); });
    await maintenir(page, '[data-vocal="1"] [data-dicter-titre]', 700);
    // 🔴 (15/11/2026, 8e retour) le titre dicté REMPLACE l'ancien
    await expect(nom).toHaveValue('Salle de bains', { timeout: 10_000 });
    const [bNom, bMicro] = [await nom.boundingBox(), await page.locator('[data-vocal="1"] [data-dicter-titre]').boundingBox()];
    expect(bMicro!.x + bMicro!.width).toBeLessThanOrEqual(bNom!.x + bNom!.width); expect(bMicro!.width).toBeGreaterThanOrEqual(44);
    await page.locator('[data-vocal="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-11-micro-titre-vocal`);
    // le VRAI aperçu
    await page.locator('[data-corps-compte-rendu]').fill('Logement propre.\nRayure du parquet de la chambre');
    await page.locator('[data-presence-locataire]').first().check();
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-blocage-envoi]')).toHaveCount(0, { timeout: 15_000 }); // 🔴 (9e retour) le récapitulatif attend « Sauvegardée »
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
    const ecouter = page.locator('[data-recap-vocal-ligne="1"] [data-recap-ecouter]');
    await expect(page.locator('[data-recap-vocal-ligne="1"] [data-recap-vocal]')).toHaveText('Salle de bains — NON envoyé (interne)');
    await ecouter.tap();
    await expect(ecouter).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-recap-vocal-ligne="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-12-recap-ecouter`);
    await ecouter.tap();
    await expect(ecouter).toHaveAttribute('aria-pressed', 'false');
    const loc = (await page.locator('[data-famille-mail="locataire"] [data-texte-mail]').textContent())!;
    expect(loc.startsWith('Madame, Monsieur,') || /^(Madame|Monsieur) \S/.test(loc)).toBe(true);
    expect(loc).toContain('Suite à la pré-visite de votre logement situé ');
    expect(loc).toMatch(/effectuée le \d{2}\/\d{2}\/\d{4} à \d{2}h\d{2} en présence de .+, vous trouverez ci-dessous le compte rendu des points relevés en vue de l’état des lieux de sortie\./);
    expect(loc).toContain('- Logement propre.\n- Rayure du parquet de la chambre');
    expect(loc).toContain('Ces éléments vous permettent d’anticiper votre état des lieux de sortie. Nous restons à votre disposition pour toute question.');
    expect(loc).toMatch(/Nous vous prions d’agréer, .+, nos salutations distinguées\./);
    const interne = (await page.locator('[data-famille-mail="interne"] [data-texte-mail]').textContent())!;
    expect(interne).toMatch(/^Compte rendu de la pré-visite du \d{2}\/\d{2}\/\d{4} — /);
    expect(interne).toContain('\n\nEn présence de ');
    await page.locator('[data-famille-mail="locataire"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-13-mail-locataire-soigne`);
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });
}
