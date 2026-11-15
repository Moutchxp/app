import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴 Arno (15/11/2026, retours du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE. Micro, transcription et dépôts SIMULÉS dans la
 * page (rien n'est enregistré, rien chez Mistral, aucun mail). Prouve : fond opaque clavier ouvert, « Clavier » en bascule, ordre des boutons,
 * « Entrée » et tirets, carrousel par défaut, locataires et dates d'entrée, bouton de thème, vocal envoyé / non envoyé (aperçu, récapitulatif,
 * « Voir le compte rendu »).
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-2
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function preparer(page: Page, o: { compteRendu?: unknown } = {}): Promise<Record<string, unknown>[]> {
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
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
    try { if (!sessionStorage.getItem('e2e-cr2')) { localStorage.removeItem('svav.compteRendu.photos.vue'); sessionStorage.setItem('e2e-cr2', '1'); } } catch { /* rien */ }
  });
  const appels: Record<string, unknown>[] = [];
  let id = 9100;
  await page.route('**/api/admin/location**', async (r) => {
    const req = r.request();
    const ok = (data: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data }) });
    if (req.method() === 'GET' && o.compteRendu && req.url().includes('previsiteCompteRendu=')) return ok(o.compteRendu);
    if (req.method() !== 'POST') return r.continue();
    const c = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (c.action === 'dicter-compte-rendu') { appels.push(c); return ok({ ok: true, texte: 'Cuisine propre' }); }
    if (c.action === 'vocal-compte-rendu' || c.action === 'photo-compte-rendu') { appels.push(c); id += 1; return ok({ id, nom: 'x', taille: 3 }); }
    if (c.action === 'apercu-compte-rendu-previsite') {
      appels.push(c);
      const avecVocal = Array.isArray(c.fichiersVocaux) && (c.fichiersVocaux as { locataires?: boolean }[]).some((f) => f.locataires) && c.aussiLocataires === true;
      // 🔴 (15/11/2026) — comme le vrai serveur : la phrase de présence en tête (l'écran la vérifie)
      return ok({ mails: [{ sorte: 'previsite_compte_rendu', objet: 'Compte rendu', a: ['interne@agence.test'], cc: [], texte: 'En présence de TEST.\n\nCR', ...(avecVocal ? { piece: 'Vocal-2.m4a' } : {}) }],
        sansEmail: [], phrase: 'En présence de TEST.' });
    }
    if (c.action === 'compte-rendu-previsite') { appels.push(c); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'refus', motif: 'Essai : rien n’est envoyé.' }) }); }
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  return appels;
}
async function maintenir(page: Page, sel: string, ms: number): Promise<void> {
  const b = page.locator(sel).first();
  await b.scrollIntoViewIfNeeded();
  await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b.locator('[data-maintien-duree]')).toBeVisible();
  await page.waitForTimeout(ms);
  await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
  await expect(b).toHaveAttribute('aria-pressed', 'false');
}

test('fond OPAQUE clavier ouvert : la zone visible réduite (clavier), rien de la page derrière en bas ni pendant le défilement', async ({ page }) => {
  await preparer(page);
  await page.locator('[data-clavier]').tap();
  await expect(page.locator('[data-corps-compte-rendu]')).toBeFocused();
  // le clavier d'iOS : la zone visible rétrécit (la page, elle, garde sa hauteur)
  await page.setViewportSize({ width: 393, height: 420 });
  await page.waitForTimeout(400);
  const fond = await page.evaluate(() => {
    const points = [[10, window.innerHeight - 2], [196, window.innerHeight - 2], [380, window.innerHeight - 2], [196, 2]];
    // 🔴 (15/11/2026, 5e retour) — le formulaire est une PAGE (sous l'en-tête de l'admin) : en chaque point, un élément opaque de la page,
    // jamais rien de la Location
    const LOCATION = '[data-bloc-preavis], [data-frise-preavis], [data-ligne-preavis], [data-ligne-depliee], .loc-cases, .loc-page';
    return points.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e !== null && e.closest(LOCATION) === null && document.querySelector('.pvv-page-cr') !== null; });
  });
  expect(fond).toEqual([true, true, true, true]);
  // le défilement du formulaire (au doigt) : le fond reste opaque
  // 🔴 (15/11/2026, 5e retour) — le formulaire est une PAGE : c'est la page qui défile
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => { const e = document.elementFromPoint(196, window.innerHeight - 2); return e !== null && e.closest('.pvv-page-cr') !== null; })).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(await page.locator('.pvv-page-cr').evaluate((e) => getComputedStyle(e).backgroundColor));
  await capturer(page, '01-clavier-ouvert-fond-opaque');
});

test('« Clavier » en bascule ; ordre des boutons ; « Entrée » et tirets ; dictée sur une ligne vide', async ({ page }) => {
  await preparer(page);
  const ordre = await page.locator('.pvv-texte-boutons > button').evaluateAll((bs) => bs.map((b) => (b.hasAttribute('data-clavier') ? 'clavier' : 'dicter')));
  expect(ordre).toEqual(['clavier', 'dicter']);
  expect((await page.locator('.pvv-photos-boutons label').allTextContents()).map((x) => x.trim())).toEqual(['Photothèque', 'Ajouter une photo']);
  const clavier = page.locator('[data-clavier]');
  const zone = page.locator('[data-corps-compte-rendu]');
  await clavier.tap();
  await expect(zone).toBeFocused();
  await expect(clavier).toHaveAttribute('aria-pressed', 'true');
  await expect(clavier).toContainText('Fermer le clavier');
  await page.keyboard.type('Salon propre');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Cuisine sale');
  await expect(zone).toHaveValue('Salon propre\n- Cuisine sale');
  await clavier.tap();
  await expect(zone).not.toBeFocused();
  await expect(clavier).toHaveAttribute('aria-pressed', 'false');
  // « Entrée » sans clavier : 🔴 (15/11/2026, 6e retour) la nouvelle ligne a son tiret TOUT DE SUITE (« - | ») ; la dictée y arrive
  await page.locator('[data-entree]').tap();
  await expect(zone).not.toBeFocused();
  await expect(zone).toHaveValue('Salon propre\n- Cuisine sale\n- ');
  await maintenir(page, '[data-dicter]', 800);
  await expect(zone).toHaveValue('Salon propre\n- Cuisine sale\n- Cuisine propre');
  await zone.scrollIntoViewIfNeeded();
  await capturer(page, '02-texte-entree-tirets');
});

test('photos en CARROUSEL par défaut ; en-tête : locataires et date d’entrée ; bouton clair / sombre', async ({ page }) => {
  await preparer(page);
  await expect(page.locator('[data-photos-compte-rendu]')).toHaveAttribute('data-vue-photos', 'carrousel');
  await expect(page.locator('[data-cr-locataire]').first()).toHaveText(/ — Entré\(e\) dans les lieux le \d{2}\/\d{2}\/\d{4}$/);
  const theme = page.locator('.pvv-titre-ligne [data-theme-bascule]');
  await expect(theme).toBeVisible();
  await capturer(page, '03-en-tete-locataires-theme');
  const avant = await page.locator('.svv-adm-root').getAttribute('data-theme');
  await theme.tap();
  const apres = await page.locator('.svv-adm-root').getAttribute('data-theme');
  expect(apres).not.toBe(avant);
  expect(await page.evaluate(() => localStorage.getItem('svv-theme'))).toBe(apres);
  await capturer(page, '04-theme-bascule');
  await theme.tap();
  await page.evaluate(() => localStorage.removeItem('svv-theme'));
});

test('vocal « Envoyé aux locataires » : non par défaut ; l’aperçu le reçoit ; le RÉCAPITULATIF le dit par vocal', async ({ page }) => {
  const appels = await preparer(page);
  await page.locator('[data-corps-compte-rendu]').fill('Compte rendu.');
  await maintenir(page, '[data-enregistrer-vocal]', 700);
  await page.locator('[data-nouveau-vocal]').tap();
  await maintenir(page, '[data-enregistrer-vocal]', 700);
  await expect(page.locator('[data-prise-etat="ok"]')).toHaveCount(2);
  await expect(page.locator('[data-vocal-locataires]')).toHaveText(['Non envoyé aux locataires', 'Non envoyé aux locataires']);
  await page.locator('[data-vocal="2"] [data-vocal-locataires]').tap();
  await expect(page.locator('[data-vocal="2"] [data-vocal-locataires]')).toHaveText('Envoyé aux locataires');
  await page.locator('[data-vocal="2"]').scrollIntoViewIfNeeded();
  await capturer(page, '05-vocal-interrupteur');
  await expect(page.locator('[data-aussi-locataires]')).toHaveAttribute('aria-pressed', 'true'); // 🔴 (15/11/2026) activé par défaut
  await page.locator('[data-presence-locataire]').first().check(); // 🔴 (15/11/2026) la présence est obligatoire
  await expect(page.locator('[data-blocage-envoi]')).toHaveCount(0, { timeout: 15_000 }); // 🔴 (9e retour) le récapitulatif attend « Sauvegardée »
  await page.locator('[data-recap-previsite]').tap();
  await expect(page.locator('[data-recap-vocal]')).toHaveText(['Vocal 1 — NON envoyé (interne)', 'Vocal 2 — ENVOYÉ aux locataires']);
  const apercu = appels.find((c) => c.action === 'apercu-compte-rendu-previsite')!;
  expect((apercu.fichiersVocaux as { locataires: boolean }[]).map((f) => f.locataires)).toEqual([false, true]);
  await page.locator('[data-recap-vocaux]').scrollIntoViewIfNeeded();
  await capturer(page, '06-recapitulatif-vocaux');
});

test('« Voir le compte rendu » : chaque vocal dit s’il est parti aux locataires', async ({ page }) => {
  const CR = { texte: 'CR', objet: 'CR', saisiPar: 'Arno', saisiLe: '2026-11-15T10:00:00Z', pieces: [], aucunEnvoi: false, destinataires: [],
    vocaux: [{ id: 1, nom: 'a', taille: 3 }, { id: 2, nom: 'b', taille: 3 }],
    fichiersVocaux: [{ nom: 'Cuisine', prises: [{ id: 1, nom: 'a', taille: 3 }], locataires: true }, { nom: 'Salon', prises: [{ id: 2, nom: 'b', taille: 3 }] }] };
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  // la ligne du préavis d'essai, montrée « pré-visite effectuée, compte rendu saisi » (simulé ici seulement), et son compte rendu simulé
  await page.route('**/api/admin/location?**', async (r) => {
    const u = r.request().url();
    if (u.includes('previsiteCompteRendu=')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data: CR }) });
    if (!u.includes('preavisEnCours=')) return r.continue();
    const rep = await r.fetch(); const j = await rep.json() as { data: { lignes: { occupationIds: number[]; previsite?: Record<string, unknown> }[] } };
    for (const l of j.data.lignes) if (l.occupationIds.includes(Number(OCC)) && l.previsite) Object.assign(l.previsite, { statut: 'effectuee', compteRendu: true });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(j) });
  });
  await page.goto(`${BASE}/admin/location?previsite=${OCC}`);
  const voir = page.locator('[data-voir-compte-rendu="oui"]').first();
  await expect(voir).toBeVisible({ timeout: 30_000 });
  await voir.tap();
  await expect(page.locator('[data-cr-vocal-etat]')).toHaveText(['Cuisine — ENVOYÉ aux locataires', 'Salon — NON envoyé (interne)']);
  await page.locator('[data-cr-vocaux]').scrollIntoViewIfNeeded();
  await capturer(page, '07-voir-compte-rendu-vocaux');
});
