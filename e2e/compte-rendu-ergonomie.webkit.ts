import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (15/11/2026) — LE FORMULAIRE « COMPTE RENDU PRÉ-VISITE » SUR iPHONE (WebKit, profil iPhone 15), contre la RECETTE. Le micro et la
 * transcription sont SIMULÉS dans la page (aucun son réel, rien chez Mistral) ; les dépôts de photos et de prises répondent par des faux (rien
 * n'est écrit). Prouve : trois blocs dans l'ordre, boutons en fin de formulaire, dictée maintenue insérée au curseur sans ouvrir le clavier,
 * plusieurs prises et plusieurs fichiers vocaux, suppressions confirmées, légende modifiable, bascule Carrousel / Liste mémorisée.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis à pré-visite commencée> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');

const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

/** Une petite image PNG (couleur unie), fabriquée ici : aucune vraie photo. */
function png(l: number, h: number, rvb: [number, number, number]): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloc = (type: string, data: Buffer) => { const t = Buffer.from(type); const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([lg, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: l }, () => rvb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => ligne)))), bloc('IEND', Buffer.alloc(0))]);
}

async function preparer(page: Page): Promise<Record<string, unknown>[]> {
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  // le micro, simulé : une « prise » de quelques octets ; aucun son réel n'est capté
  await page.addInitScript(() => {
    class FauxEnregistreur {
      static isTypeSupported = (t: string) => t === 'audio/mp4';
      mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? 'audio/mp4'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
    // le choix Carrousel / Liste repart de zéro au PREMIER chargement de l'épreuve seulement (un rechargement doit le retrouver)
    try { if (!sessionStorage.getItem('e2e-cr')) { localStorage.removeItem('svav.compteRendu.photos.vue'); sessionStorage.setItem('e2e-cr', '1'); } } catch { /* rien */ }
  });
  const appels: Record<string, unknown>[] = [];
  let id = 9000;
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    const ok = (data: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data }) });
    if (c.action === 'dicter-compte-rendu') { appels.push(c); return ok({ ok: true, texte: 'Cuisine propre' }); }
    if (c.action === 'vocal-compte-rendu') { appels.push(c); id += 1; return ok({ id, nom: 'Vocal.m4a', taille: 3 }); }
    if (c.action === 'transcrire-vocal') { appels.push(c); return ok({ ok: true, texte: 'Le parquet est rayé.' }); }
    if (c.action === 'photo-compte-rendu') { appels.push(c); id += 1; return ok({ id, nom: 'photo.jpg', taille: 3 }); }
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  return appels;
}

/** L'appui long, comme un doigt : pointerdown, maintien, pointerup — ou le doigt qui sort du bouton (pointerout/pointerleave). */
async function maintenir(page: Page, sel: string, ms: number, sortie = false): Promise<void> {
  const b = page.locator(sel).first();
  await b.scrollIntoViewIfNeeded();
  await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(b.locator('[data-maintien-duree]')).toBeVisible();
  await page.waitForTimeout(ms);
  if (sortie) { await b.dispatchEvent('pointerout', { pointerType: 'touch' }); await b.dispatchEvent('pointerleave', { pointerType: 'touch' }); }
  else await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('aria-pressed', 'false');
}

test('trois blocs dans l’ordre ; boutons en FIN de formulaire (pas collés) ; fond opaque', async ({ page }) => {
  await preparer(page);
  const boite = page.locator('[data-fenetre-previsite="saisie"]');
  // 🔴 (15/11/2026) — la partie « Présence » vient en tête
  await expect(boite.locator('.pvv-bloc-titre')).toHaveText([/^Présence/, /^Texte/, /^Photos/, /^Dictaphone/]);
  await capturer(page, '01-ouverture-trois-blocs');
  const actions = boite.locator('.mis-actions');
  expect(await actions.evaluate((e) => getComputedStyle(e).position)).toBe('static');
  expect(await boite.evaluate((b) => b.lastElementChild?.classList.contains('mis-actions'))).toBe(true);
  expect(await page.locator('.pvv-page-cr').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toMatch(/rgba\(.*, 0\.\d+\)$/);
  // au départ, les boutons ne sont pas à l'écran : on les atteint en défilant jusqu'en bas
  expect(await actions.evaluate((e) => e.getBoundingClientRect().top > window.innerHeight)).toBe(true);
  await actions.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-recap-previsite]')).toBeInViewport();
  await capturer(page, '07-fin-de-formulaire-boutons');
});

test('« Maintenir pour dicter » : insertion AU CURSEUR, sans ouvrir le clavier ; « Clavier » ouvre la saisie ; appui bref ignoré', async ({ page }) => {
  const appels = await preparer(page);
  const zone = page.locator('[data-corps-compte-rendu]');
  await zone.fill('Entrée propre. Salon rayé.');
  await zone.evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(15, 15); t.blur(); });
  await maintenir(page, '[data-dicter]', 900);
  await expect(zone).toHaveValue('Entrée propre. Cuisine propre Salon rayé.');
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-corps-compte-rendu') ?? false)).toBe(false);
  expect(appels.filter((c) => c.action === 'vocal-compte-rendu')).toEqual([]); // la dictée ne garde aucun fichier
  await maintenir(page, '[data-dicter]', 150);
  await expect(page.locator('[data-dictee-message]')).toContainText('Appui trop bref');
  await page.locator('[data-clavier]').tap();
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-corps-compte-rendu') ?? false)).toBe(true);
  await capturer(page, '02-texte-dictee-inseree');
});

test('dictée : pendant l’appui, le bouton est ROUGE avec la durée ; 🔴 (7e retour) le doigt qui glisse hors du bouton n’arrête PAS — seul son retrait arrête', async ({ page }) => {
  await preparer(page);
  const b = page.locator('[data-dicter]');
  await b.scrollIntoViewIfNeeded();
  await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b.locator('[data-maintien-duree]')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(b).toHaveClass(/pvv-maintien--actif/);
  await capturer(page, '03-dictee-en-cours-rouge');
  await b.dispatchEvent('pointerout', { pointerType: 'touch' }); await b.dispatchEvent('pointerleave', { pointerType: 'touch' }); await b.dispatchEvent('pointercancel', { pointerType: 'touch' });
  await page.waitForTimeout(400);
  await expect(b).toHaveAttribute('data-enregistrement', 'oui'); // toujours en cours
  await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue(/Cuisine propre/);
});

test('DICTAPHONE : deux prises dans « Vocal 1 », un nouveau fichier, suppressions confirmées, transcription à la demande', async ({ page }) => {
  const appels = await preparer(page);
  await maintenir(page, '[data-enregistrer-vocal]', 800);
  await maintenir(page, '[data-enregistrer-vocal]', 800);
  await expect(page.locator('[data-vocal="1"]')).toHaveAttribute('data-vocal-prises', '2');
  await page.locator('[data-nouveau-vocal]').tap();
  await maintenir(page, '[data-enregistrer-vocal]', 800);
  await expect(page.locator('[data-vocal]')).toHaveCount(2);
  await expect(page.locator('[data-vocal="2"]')).toHaveAttribute('data-vocal-prises', '1');
  await page.locator('[data-vocal="2"] [data-vocal-nom]').fill('Salle de bain');
  await page.locator('[data-vocal="1"]').scrollIntoViewIfNeeded();
  await capturer(page, '05-dictaphone-deux-fichiers');
  expect(appels.filter((c) => c.action === 'transcrire-vocal')).toEqual([]); // jamais automatique
  await page.locator('[data-vocal="1"] [data-prise="1"] [data-prise-supprimer]').tap();
  await expect(page.locator('[data-prise-confirmer]')).toBeVisible();
  await page.locator('[data-prise-supprimer-oui]').tap();
  await expect(page.locator('[data-vocal="1"]')).toHaveAttribute('data-vocal-prises', '1');
  await page.locator('[data-vocal="1"] [data-vocal-transcrire]').tap();
  await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue(/Le parquet est rayé\. \(transcrit d’un vocal\)/);
  await page.locator('[data-vocal="2"] [data-vocal-supprimer]').tap();
  await expect(page.locator('[data-vocal-confirmer]')).toContainText('Supprimer « Salle de bain »');
  await page.locator('[data-vocal-supprimer-oui]').tap();
  await expect(page.locator('[data-vocal]')).toHaveCount(1);
});

test('PHOTOS : légende modifiable ; Carrousel (1/n, une photo à la fois) / Liste ; choix mémorisé ; suppression confirmée', async ({ page }) => {
  await preparer(page);
  await page.locator('[data-photo-galerie]').setInputFiles([
    { name: 'cuisine.png', mimeType: 'image/png', buffer: png(64, 48, [200, 120, 60]) },
    { name: 'salon.png', mimeType: 'image/png', buffer: png(64, 48, [60, 140, 200]) },
    { name: 'chambre.png', mimeType: 'image/png', buffer: png(64, 48, [90, 180, 90]) },
  ]);
  await expect(page.locator('[data-photo-etat="ok"]')).toHaveCount(3, { timeout: 20_000 });
  await page.locator('[data-photo="1"] [data-photo-legende]').fill('Rayure parquet chambre');
  await page.locator('[data-vue-carrousel]').tap();
  await expect(page.locator('[data-carrousel-indicateur]')).toHaveText('1/3');
  await page.locator('[data-carrousel-suivante]').tap();
  await expect(page.locator('[data-carrousel-indicateur]')).toHaveText('2/3');
  await page.locator('[data-photo="2"] [data-photo-legende]').fill('Joint douche');
  // une légende touchée : SA photo entière à l'écran, alignée (jamais deux moitiés), l'indicateur suit
  await page.waitForTimeout(500);
  expect(await page.locator('.pvv-carrousel').evaluate((p) => Math.abs(p.scrollLeft - Math.round(p.scrollLeft / p.clientWidth) * p.clientWidth))).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-carrousel-indicateur]')).toHaveText('2/3');
  await page.locator('[data-photos-compte-rendu]').scrollIntoViewIfNeeded();
  await capturer(page, '04-photos-carrousel');
  expect(await page.evaluate(() => localStorage.getItem('svav.compteRendu.photos.vue'))).toBe('carrousel');
  // rouvrir le formulaire (le lien de l'invitation ne l'ouvre qu'une fois : on revient par le lien)
  await page.goto(`${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"]')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem('svav.compteRendu.photos.vue'))).toBe('carrousel'); // mémorisé sur l'appareil
  // 🔴 (15/11/2026, 6e retour) — la sauvegarde automatique a gardé les 3 photos : restaurées ; on efface le brouillon pour repartir d'un formulaire vide
  await expect(page.locator('[data-photo]')).toHaveCount(3, { timeout: 10_000 });
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  await page.locator('[data-effacer-brouillon-oui]').tap();
  await expect(page.locator('[data-photo]')).toHaveCount(0);
  await page.locator('[data-photo-galerie]').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: png(32, 32, [10, 10, 10]) }, { name: 'b.png', mimeType: 'image/png', buffer: png(32, 32, [240, 240, 240]) }]);
  await expect(page.locator('[data-photo-etat="ok"]')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('[data-photos-compte-rendu]')).toHaveAttribute('data-vue-photos', 'carrousel');
  await page.locator('[data-vue-liste]').tap();
  await page.locator('[data-photo="1"] [data-photo-legende]').fill('Entrée');
  await page.locator('[data-photo="1"] [data-photo-supprimer]').tap();
  await expect(page.locator('[data-photo-confirmer]')).toBeVisible();
  await page.locator('[data-photos-compte-rendu]').scrollIntoViewIfNeeded();
  await capturer(page, '06-photos-liste-confirmation');
  await page.locator('[data-photo-supprimer-oui]').tap();
  await expect(page.locator('[data-photo]')).toHaveCount(1);
});
