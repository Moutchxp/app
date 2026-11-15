import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴 Arno (15/11/2026, 5e retour du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE, en clair ET en sombre. Prouve : « Carrousel » /
 * « Liste » en deux vrais boutons séparés (liseré, 44 px, l'actif en plein rouge, aria-pressed) ; le liseré de chaque légende (accentué au
 * focus) ; un micro DANS chaque légende, à droite, sans que le texte passe dessous ; la dictée insérée dans la BONNE légende, au curseur, sans
 * ouvrir le clavier ; les confirmations (photo, fichier vocal, prise, personne ajoutée) : la question sur une ligne, puis « Garder » à gauche
 * et l'action rouge à droite, sur UNE même ligne, même taille. Micro, transcription et dépôts simulés : rien n'est enregistré ni envoyé.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-5
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

/** Une petite image PNG (couleur unie), fabriquée ici : aucune vraie photo. */
function png(l: number, h: number, rvb: [number, number, number]): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloc = (type: string, data: Buffer) => { const t = Buffer.from(type); const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([lg, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: l }, () => rvb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => ligne)))), bloc('IEND', Buffer.alloc(0))]);
}

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<{ appels: Record<string, unknown>[]; erreurs: string[] }> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript((t) => {
    try { localStorage.setItem('svv-theme', t); localStorage.removeItem('svav.compteRendu.photos.vue'); } catch { /* rien */ }
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
  const appels: Record<string, unknown>[] = [];
  let id = 9500;
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    const ok = (data: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data }) });
    if (c.action === 'dicter-compte-rendu') { appels.push(c); return ok({ ok: true, texte: 'fissure plafond' }); }
    if (c.action === 'photo-compte-rendu') { appels.push(c); id += 1; return ok({ id, nom: 'photo.jpg', taille: 3 }); }
    if (c.action === 'vocal-compte-rendu') { appels.push(c); id += 1; return ok({ id, nom: 'Vocal.m4a', taille: 3 }); }
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location/previsite/${OCC}/compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-photo-galerie]').setInputFiles([
    { name: 'salon.png', mimeType: 'image/png', buffer: png(64, 48, [60, 140, 200]) },
    { name: 'chambre.png', mimeType: 'image/png', buffer: png(64, 48, [90, 180, 90]) },
  ]);
  await expect(page.locator('[data-photo-etat="ok"]')).toHaveCount(2, { timeout: 20_000 });
  return { appels, erreurs };
}
const boite = (page: Page, sel: string) => page.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height }; });
const style = (page: Page, sel: string, p: string) => page.locator(sel).evaluate((e, q) => getComputedStyle(e).getPropertyValue(q), p);

async function maintenir(page: Page, sel: string, ms: number): Promise<void> {
  const b = page.locator(sel);
  await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('data-enregistrement', 'oui');
  await page.waitForTimeout(ms);
  await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('data-enregistrement', 'non');
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] « Carrousel » / « Liste » : deux vrais boutons séparés, liseré, 44 px, l’actif marqué ; légendes cadrées avec micro à droite`, async ({ page }) => {
    const { erreurs } = await preparer(page, theme);
    const c = '[data-vue-carrousel]'; const l = '[data-vue-liste]';
    await page.locator('[data-photos-compte-rendu]').scrollIntoViewIfNeeded();
    await expect(page.locator(c)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(l)).toHaveAttribute('aria-pressed', 'false');
    const [bc, bl] = [await boite(page, c), await boite(page, l)];
    expect(bc.h).toBeGreaterThanOrEqual(44); expect(bl.h).toBeGreaterThanOrEqual(44);
    expect(bl.x - (bc.x + bc.l)).toBeGreaterThanOrEqual(8); // un espace net entre les deux
    expect(await style(page, l, 'border-top-width')).toBe('1px'); // le liseré de l'inactif
    const surface = await page.evaluate(() => getComputedStyle(document.querySelector('.pvv-page-cr')!).backgroundColor);
    expect(await style(page, l, 'background-color')).toBe(surface); // fond blanc (fond de carte en sombre)
    expect(await style(page, c, 'background-color')).not.toBe(surface); // l'actif, plein
    await capturer(page, `${theme}-01-carrousel-actif`);
    await page.locator(l).tap();
    await expect(page.locator(l)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(c)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => style(page, c, 'background-color')).toBe(surface);
    // la légende : liseré visible au repos, accentué au focus ; le micro DANS le champ, à droite, 44 px ; le texte ne passe pas dessous
    const champ = '[data-photo="1"] [data-photo-legende]'; const micro = '[data-photo="1"] [data-dicter-legende]';
    expect(await style(page, champ, 'border-top-width')).toBe('1px');
    const repos = await style(page, champ, 'border-top-color');
    const [bChamp, bMicro] = [await boite(page, champ), await boite(page, micro)];
    expect(bMicro.l).toBeGreaterThanOrEqual(44); expect(bMicro.h).toBeGreaterThanOrEqual(44);
    expect(bMicro.x + bMicro.l).toBeLessThanOrEqual(bChamp.x + bChamp.l); // à l'intérieur, à droite
    expect(bMicro.x).toBeGreaterThan(bChamp.x + bChamp.l / 2);
    expect(parseFloat(await style(page, champ, 'padding-right'))).toBeGreaterThanOrEqual(bMicro.l); // marge droite : le texte ne passe pas sous le bouton
    await page.locator(champ).focus();
    await expect.poll(() => style(page, champ, 'border-top-color')).not.toBe(repos);
    await page.locator(champ).blur();
    await page.locator('[data-photo="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-02-liste-legendes-micro`);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] le micro d’une légende : 🔴 (10e retour) la dictée REMPLACE CETTE légende (capitale, sans point final), sans ouvrir le clavier ; rouge pendant l’appui`, async ({ page }) => {
    const { appels } = await preparer(page, theme);
    await page.locator('[data-vue-liste]').tap();
    await page.locator('[data-photo="1"] [data-photo-legende]').fill('Salon');
    await page.locator('[data-photo="2"] [data-photo-legende]').fill('Mur chambre');
    await page.locator('[data-photo="2"] [data-photo-legende]').evaluate((i: HTMLInputElement) => { i.focus(); i.setSelectionRange(3, 3); i.blur(); });
    const micro = '[data-photo="2"] [data-dicter-legende]';
    await page.locator(micro).scrollIntoViewIfNeeded();
    const b = page.locator(micro);
    await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(b).toHaveAttribute('data-enregistrement', 'oui');
    const rouge = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = getComputedStyle(document.querySelector('.svv-adm-root')!).getPropertyValue('--color-svv-red'); document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; });
    expect(await style(page, micro, 'background-color')).toBe(rouge);
    await capturer(page, `${theme}-03-micro-legende-rouge`);
    await page.waitForTimeout(800);
    await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(page.locator('[data-photo="2"] [data-photo-legende]')).toHaveValue('Fissure plafond', { timeout: 10_000 });
    await expect(page.locator('[data-photo="1"] [data-photo-legende]')).toHaveValue('Salon');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-photo-legende') ?? false)).toBe(false);
    expect(appels.filter((c) => c.action === 'dicter-compte-rendu')).toHaveLength(1);
    // un appui bref : ignoré
    await maintenir(page, '[data-photo="1"] [data-dicter-legende]', 150);
    await expect(page.locator('[data-photo="1"] [data-legende-message]')).toContainText('Appui trop bref');
    expect(appels.filter((c) => c.action === 'dicter-compte-rendu')).toHaveLength(1);
    await page.locator('[data-photo="2"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-04-legende-dictee`);
  });

  test(`[${theme}] confirmations : la question sur une ligne, « Garder » à gauche et l’action rouge à droite, sur UNE ligne, même taille`, async ({ page }) => {
    const { erreurs } = await preparer(page, theme);
    await page.locator('[data-vue-liste]').tap();
    const verifier = async (racine: string, question: string, action: string) => {
      await expect(page.locator(`${racine} .pvv-confirmer-question`)).toHaveText(question);
      const [g, a] = [page.locator(`${racine} .pvv-confirmer-boutons > button`).nth(0), page.locator(`${racine} .pvv-confirmer-boutons > button`).nth(1)];
      await expect(g).toHaveText('Garder'); await expect(a).toHaveText(action);
      const [bg, ba] = [await g.boundingBox(), await a.boundingBox()];
      expect(Math.abs(bg!.y - ba!.y)).toBeLessThanOrEqual(1); // une même ligne
      expect(Math.abs(bg!.width - ba!.width)).toBeLessThanOrEqual(1); expect(Math.abs(bg!.height - ba!.height)).toBeLessThanOrEqual(1); // même taille
      expect(bg!.x).toBeLessThan(ba!.x); // « Garder » à gauche
      const q = await page.locator(`${racine} .pvv-confirmer-question`).boundingBox();
      expect(q!.y + q!.height).toBeLessThanOrEqual(bg!.y); // la question au-dessus
    };
    // la photo
    await page.locator('[data-photo="2"] [data-photo-supprimer]').tap();
    await verifier('[data-photo-confirmer]', 'Supprimer la photo 2 ?', 'Supprimer');
    await page.locator('[data-photo-confirmer]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-05-confirmation-photo`);
    await page.locator('[data-photo-supprimer-non]').tap();
    await expect(page.locator('[data-photo]')).toHaveCount(2);
    // le fichier vocal et sa prise
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-prise-etat="ok"]')).toHaveCount(1);
    await page.locator('[data-vocal-supprimer]').tap();
    await verifier('[data-vocal-confirmer]', 'Supprimer « Vocal 1 » et ses 1 prise ?', 'Supprimer');
    await page.locator('[data-vocal-supprimer-non]').tap();
    await page.locator('[data-prise-supprimer]').tap();
    await verifier('[data-prise-confirmer]', 'Supprimer la prise 1 ?', 'Supprimer');
    await page.locator('[data-prise-confirmer]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-06-confirmation-prise`);
    await page.locator('[data-prise-supprimer-non]').tap();
    // la personne ajoutée
    await page.locator('[data-ajouter-personne]').tap();
    await page.locator('[data-personne-civilite="Madame"]').check();
    await page.locator('[data-personne-nom]').fill('Martin');
    await page.locator('[data-personne-prenom]').fill('Léa');
    await page.locator('[data-personne-ajouter]').tap();
    await page.locator('[data-personne-retirer]').tap();
    await verifier('[data-personne-confirmer]', 'Retirer Mme Léa Martin ?', 'Retirer');
    await page.locator('[data-personne-confirmer]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-07-confirmation-personne`);
    await page.locator('[data-personne-retirer-oui]').tap();
    await expect(page.locator('[data-personne-ajoutee]')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });
}
