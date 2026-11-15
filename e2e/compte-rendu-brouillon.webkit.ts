import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴🔴 Arno (15/11/2026, 6e retour du test iPhone) — LA SAUVEGARDE AUTOMATIQUE DU COMPTE RENDU. WebKit, profil iPhone 15, contre la RECETTE
 * (brouillon serveur, migration 474), en clair ET en sombre. Prouve : restauration après rechargement (texte, présence, bouton d'envoi) avec
 * « Brouillon restauré — enregistré à HHhMM » ; passage en ARRIÈRE-PLAN → enregistré tout de suite, restauré sur un AUTRE appareil (contexte
 * neuf, sans copie locale) ; réseau coupé → photo et prise gardées dans le téléphone (« en attente du réseau »), toujours là après
 * rechargement, puis déposées au retour du réseau ; « Effacer le brouillon ». Dépôts des pièces SIMULÉS (rien n'est écrit dans le stockage) ;
 * rien n'est envoyé. Chaque épreuve efface son brouillon en partant.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-brouillon
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };
const PAGE = `/admin/location/previsite/${OCC}/compte-rendu`;

function png(l: number, h: number, rvb: [number, number, number]): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloc = (type: string, data: Buffer) => { const t = Buffer.from(type); const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([lg, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: l }, () => rvb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => ligne)))), bloc('IEND', Buffer.alloc(0))]);
}

/** Le réseau des PIÈCES : coupé (la requête échoue comme sans réseau) ou simulé (une pièce fictive rendue, rien n'est écrit). */
const reseau = { coupe: false, id: 99_000 };
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
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
  }, theme);
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    if (c.action !== 'photo-compte-rendu' && c.action !== 'vocal-compte-rendu') return r.continue();
    if (reseau.coupe) return r.abort('internetdisconnected');
    reseau.id += 1;
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data: { id: reseau.id, nom: 'piece', taille: 3 } }) });
  });
  return erreurs;
}
const formulaire = (page: Page) => page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]');
async function ouvrir(page: Page): Promise<void> {
  await page.goto(`${BASE}${PAGE}`);
  await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
}
async function effacer(page: Page): Promise<void> {
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  await page.locator('[data-effacer-brouillon-oui]').tap();
  await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('');
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] rechargement : tout est RESTAURÉ (texte, présence, bouton d’envoi) avec « Brouillon restauré — enregistré à HHhMM » ; « Effacer le brouillon »`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    reseau.coupe = false;
    await ouvrir(page);
    // l'enregistrement RÉEL du nouveau contenu (pas celui d'un brouillon déjà là)
    const enregistre = page.waitForResponse((r) => r.request().method() === 'POST' && (r.request().postData() ?? '').includes(`Salon propre (${theme}).`)
      && (r.request().postData() ?? '').includes('"aussiLocataires":false'));
    await page.locator('[data-corps-compte-rendu]').fill(`Salon propre (${theme}).`);
    await page.locator('[data-presence-locataire]').first().check();
    await page.locator('[data-aussi-locataires]').tap();
    await enregistre;
    await expect(page.locator('[data-sauvegarde]')).toHaveAttribute('data-sauvegarde', 'enregistre', { timeout: 10_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0); // aucune fenêtre « Modification enregistrée »
    await expect(page.locator('[data-sauvegarde]')).toHaveText('Enregistré');
    await capturer(page, `${theme}-01-enregistre`);
    await page.reload();
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue(`Salon propre (${theme}).`, { timeout: 10_000 });
    // 🔴 (7e retour) le petit cartouche sur la ligne de « ← Retour » : un appui dit l'heure et « Brouillon restauré »
    await page.locator('.pvv-ligne-retour [data-sauvegarde]').tap();
    await expect(page.locator('[data-sauvegarde-detail]')).toHaveText(/^Dernier enregistrement à \d{2}h\d{2} · Brouillon restauré$/);
    await expect(page.locator('[data-presence-locataire]').first()).toBeChecked();
    await expect(page.locator('[data-aussi-locataires]')).toHaveAttribute('aria-pressed', 'false');
    await capturer(page, `${theme}-02-restaure-apres-rechargement`);
    // « Effacer le brouillon » : confirmé, le formulaire est vidé ; rechargé, rien ne revient
    await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
    await page.locator('[data-effacer-brouillon]').tap();
    await expect(page.locator('[data-effacer-brouillon-confirmer] .pvv-confirmer-question')).toContainText('Effacer le brouillon ?');
    await capturer(page, `${theme}-03-effacer-confirmation`);
    await page.locator('[data-effacer-brouillon-oui]').tap();
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('');
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('');
    await expect(page.locator('[data-sauvegarde-detail]')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] ARRIÈRE-PLAN : enregistré tout de suite ; repris sur un AUTRE appareil (sans copie locale), tel quel`, async ({ page, browser }) => {
    await preparer(page, theme);
    reseau.coupe = false;
    await ouvrir(page);
    const ecrit = page.waitForRequest((r) => r.method() === 'POST' && (r.postData() ?? '').includes('"brouillon-previsite"') && (r.postData() ?? '').includes('Vu en arrière-plan'));
    await page.locator('[data-corps-compte-rendu]').fill('Vu en arrière-plan.');
    // le téléphone passe en veille AVANT le délai d'enregistrement : l'enregistrement part tout de suite
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await ecrit;
    await page.waitForTimeout(500);
    // un autre appareil : un contexte neuf (aucune copie locale)
    const autre = await browser.newContext({ ...test.info().project.use, colorScheme: theme });
    const p2 = await autre.newPage();
    await preparer(p2, theme);
    await ouvrir(p2);
    await expect(p2.locator('[data-corps-compte-rendu]')).toHaveValue('Vu en arrière-plan.', { timeout: 10_000 });
    await p2.locator('.pvv-ligne-retour [data-sauvegarde]').tap();
    await expect(p2.locator('[data-sauvegarde-detail]')).toContainText('Brouillon restauré');
    await capturer(p2, `${theme}-04-autre-appareil-restaure`);
    await effacer(p2);
    await autre.close();
  });

  test(`[${theme}] réseau coupé : photo et prise gardées dans le téléphone, toujours là après rechargement, déposées au retour du réseau`, async ({ page }) => {
    await preparer(page, theme);
    reseau.coupe = false;
    await ouvrir(page);
    reseau.coupe = true;
    await page.locator('[data-photo-galerie]').setInputFiles([{ name: 'salon.png', mimeType: 'image/png', buffer: png(64, 48, [60, 140, 200]) }]);
    await expect(page.locator('[data-photo-etat="attente"]')).toHaveCount(1, { timeout: 20_000 });
    await page.locator('[data-photo="1"] [data-photo-legende]').fill('Rayure parquet');
    const rond = page.locator('[data-enregistrer-vocal]');
    await rond.scrollIntoViewIfNeeded();
    await rond.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(rond).toHaveAttribute('data-enregistrement', 'oui');
    await page.waitForTimeout(800);
    await rond.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(page.locator('[data-prise-etat="attente"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('[data-photo-attente]')).toContainText('En attente du réseau');
    await expect(page.locator('[data-prise-attente]')).toContainText('En attente du réseau');
    await expect(page.locator('[data-recap-previsite]')).toBeDisabled();
    await page.locator('[data-photo="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-05-photo-en-attente`);
    // Chrome rechargé pendant la coupure : tout revient depuis le téléphone
    await page.waitForTimeout(500);
    await page.reload();
    await expect(formulaire(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-photo-etat="attente"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('[data-photo="1"] [data-photo-legende]')).toHaveValue('Rayure parquet');
    await expect(page.locator('[data-prise-etat="attente"]')).toHaveCount(1);
    // le réseau revient : déposées toutes seules
    reseau.coupe = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('[data-photo-etat="ok"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-prise-etat="ok"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-photo="1"] [data-photo-legende]')).toHaveValue('Rayure parquet');
    await capturer(page, `${theme}-06-deposees-au-retour-du-reseau`);
    await effacer(page);
  });
}
