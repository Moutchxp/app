import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (15/11/2026, 7e retour du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE (préavis de test), en clair ET en sombre.
 * Prouve : ROUGE dès le contact (le micro tarde : rouge quand même) ; APPUI CONTINU — un vrai glissement du pointeur hors du bouton pendant
 * l'appui n'arrête PAS l'enregistrement, seul le retrait du doigt l'arrête ; « Entrée » : un appui = un seul retour à la ligne ; le petit
 * cartouche de sauvegarde sur la ligne de « ← Retour » (et son détail) ; l'adresse en grand sous le titre ; « Nouveau fichier vocal » pleine
 * largeur ; les liserés de « Ajouter une personne » ; l'encadré « ATTENTION » dans le mail aux locataires du VRAI aperçu. Micro et
 * transcription simulés ; on ne confirme jamais ; le brouillon de l'épreuve est effacé en partant.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-7
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function preparer(page: Page, theme: 'light' | 'dark', o: { microLent?: boolean } = {}): Promise<{ dictees: number[]; erreurs: string[] }> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript(({ t, lent }) => {
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
    class FauxEnregistreur {
      static isTypeSupported = (x: string) => x === 'audio/mp4';
      mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_f: unknown, opt?: { mimeType?: string }) { this.mimeType = opt?.mimeType ?? 'audio/mp4'; (window as unknown as { __enr: number }).__enr = ((window as unknown as { __enr?: number }).__enr ?? 0) + 1; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    // un micro LENT (première autorisation) : il répond au bout de 1,5 s
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise((ok) => setTimeout(() => ok({ getTracks: () => [{ stop: () => {}, readyState: 'live' }] }), lent ? 1500 : 0)) } });
  }, { t: theme, lent: o.microLent === true });
  const dictees: number[] = [];
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    if (c.action === 'dicter-compte-rendu') { dictees.push(Date.now()); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data: { ok: true, texte: 'cuisine propre' } }) }); }
    if (c.action === 'compte-rendu-previsite') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'refus', motif: 'Essai : rien n’est envoyé.' }) });
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location/previsite/${OCC}/compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  return { dictees, erreurs };
}
async function effacerBrouillon(page: Page): Promise<void> {
  if (await page.locator('[data-revenir-previsite]').count()) await page.locator('[data-revenir-previsite]').tap();
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  await page.locator('[data-effacer-brouillon-oui]').tap();
  await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('');
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] ROUGE au contact (micro lent) ; APPUI CONTINU malgré un glissement hors du bouton ; arrêt au retrait du doigt seulement`, async ({ page }) => {
    const { dictees, erreurs } = await preparer(page, theme, { microLent: true });
    const d = page.locator('[data-dicter]');
    await d.scrollIntoViewIfNeeded();
    const b = (await d.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    // rouge AU CONTACT, alors que le micro n'a pas encore répondu
    expect(await d.getAttribute('data-enregistrement')).toBe('oui');
    const rouge = await page.evaluate(() => { const x = document.createElement('div'); x.style.color = getComputedStyle(document.querySelector('.svv-adm-root')!).getPropertyValue('--color-svv-red'); document.body.appendChild(x); const v = getComputedStyle(x).color; x.remove(); return v; });
    expect(await d.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(rouge);
    await capturer(page, `${theme}-01-rouge-au-contact`);
    await page.waitForTimeout(1700); // le micro répond, l'enregistrement tourne
    await expect(d.locator('[data-maintien-duree]')).toBeVisible();
    // un léger glissement : le pointeur SORT du bouton (et y reste dehors) — l'enregistrement continue
    await page.mouse.move(b.x + b.width / 2 + 10, b.y - 40, { steps: 6 });
    await page.waitForTimeout(1200);
    expect(await d.getAttribute('data-enregistrement')).toBe('oui');
    await expect(d.locator('[data-maintien-duree]')).toBeVisible();
    expect(dictees).toHaveLength(0);
    // le retrait du doigt (hors du bouton) : l'arrêt, puis la transcription
    await page.mouse.up();
    await expect(d).toHaveAttribute('data-enregistrement', 'non');
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue(/cuisine propre/, { timeout: 10_000 });
    expect(dictees).toHaveLength(1);
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] « Entrée » : un appui = UN retour à la ligne ; cartouche de sauvegarde ; adresse en grand ; bouton pleine largeur ; liserés ; encadré ATTENTION`, async ({ page }) => {
    const { erreurs } = await preparer(page, theme);
    const zone = page.locator('[data-corps-compte-rendu]');
    await zone.fill('Salon propre');
    await zone.evaluate((t: HTMLTextAreaElement) => { t.setSelectionRange(t.value.length, t.value.length); });
    await page.locator('[data-entree]').tap();
    await expect(zone).toHaveValue('Salon propre\n- ');
    await page.waitForTimeout(600);
    await page.locator('[data-entree]').tap();
    await expect(zone).toHaveValue('Salon propre\n\n- ');
    // la même activation livrée deux fois d'affilée (contact puis clic de compatibilité) : un seul retour
    await page.waitForTimeout(600);
    await page.locator('[data-entree]').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await page.waitForTimeout(200);
    expect((await zone.inputValue()).split('\n').length).toBe(4);
    // le CARTOUCHE, à droite sur la ligne de « ← Retour »
    await page.evaluate(() => window.scrollTo(0, 0));
    const cartouche = page.locator('.pvv-ligne-retour [data-sauvegarde]');
    await expect(cartouche).toHaveText('Enregistré', { timeout: 10_000 });
    await expect(page.locator('[data-brouillon-restaure]')).toHaveCount(0);
    const [bRetour, bCart, bLigne] = [await page.locator('.pvv-ligne-retour a').first().boundingBox(), await cartouche.boundingBox(), await page.locator('.pvv-ligne-retour').boundingBox()];
    expect(Math.abs(bRetour!.y + bRetour!.height / 2 - (bCart!.y + bCart!.height / 2))).toBeLessThanOrEqual(8); // même ligne
    expect(bLigne!.x + bLigne!.width - (bCart!.x + bCart!.width)).toBeLessThanOrEqual(2); // aligné à droite
    await cartouche.tap();
    await expect(page.locator('[data-sauvegarde-detail]')).toHaveText(/^Dernier enregistrement à \d{2}h\d{2}/);
    // l'adresse en GRAND et en gras sous le titre
    const adresse = page.locator('[data-cr-adresse]');
    expect(parseFloat(await adresse.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(20);
    expect(Number(await adresse.evaluate((e) => getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(800);
    await capturer(page, `${theme}-02-cartouche-et-adresse`);
    // « Nouveau fichier vocal » : pleine largeur de l'encart
    const nv = (await page.locator('[data-nouveau-vocal]').boundingBox())!; const bloc = (await page.locator('[data-vocaux-compte-rendu]').boundingBox())!;
    expect(nv.width).toBeGreaterThan(bloc.width * 0.85);
    await page.locator('[data-nouveau-vocal]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-03-nouveau-vocal-pleine-largeur`);
    // « Ajouter une personne » : liserés et Madame / Monsieur lisibles
    await page.locator('[data-ajouter-personne]').tap();
    for (const sel of ['[data-personne-nom]', '[data-personne-prenom]', '[data-personne-note-modale]']) expect(await page.locator(sel).evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe('1px');
    expect(await page.locator('.pvv-civilite .pvv-case').first().evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe('1px');
    await page.locator('[data-personne-civilite="Madame"]').check();
    await capturer(page, `${theme}-04-ajouter-personne-liseres`);
    await page.locator('[data-personne-annuler]').tap();
    // l'encadré ATTENTION dans le mail aux locataires (VRAI aperçu) — version texte au récapitulatif
    await page.locator('[data-presence-locataire]').first().check();
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
    const loc = (await page.locator('[data-famille-mail="locataire"] [data-texte-mail]').textContent())!;
    expect(loc).toContain('ATTENTION\n\nCette pré-visite a été réalisée dans votre intérêt');
    expect(loc.indexOf('ATTENTION')).toBeLessThan(loc.indexOf('Nous vous prions d’agréer'));
    expect((await page.locator('[data-famille-mail="interne"] [data-texte-mail]').textContent())!).not.toContain('ATTENTION');
    await page.locator('[data-famille-mail="locataire"] [data-texte-mail]').evaluate((e) => { const i = (e.textContent ?? '').indexOf('ATTENTION'); void i; e.scrollIntoView({ block: 'center' }); });
    await capturer(page, `${theme}-05-recap-attention`);
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });
}
