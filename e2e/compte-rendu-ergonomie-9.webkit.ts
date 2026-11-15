import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴 Arno (15/11/2026, 9e retour du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE (préavis de test), en clair ET en sombre.
 * Prouve : (1) le récapitulatif met les LOCATAIRES d'abord, le rappel aussi (VRAI aperçu) ; (2) « Écouter » joue au PREMIER toucher un son
 * servi par le serveur (plages 206), avec « Lecture… 00:0x / 00:0y » et la barre ; un seul vocal à la fois ; aucun menu d'appui long sur les
 * boutons ; (3) la fenêtre du compte rendu depuis la frise (brouillon, puis « Continuer la saisie » ; envoyé simulé) ; (4) la page visible
 * SANS défilement (lien direct, frise, retour d'arrière-plan) ; (5) les mêmes réglages du micro à chaque prise et à chaque réouverture, et
 * chaque prise NORMALISÉE (crête −1 dBFS, WAV 16 kHz). Micro simulé (un vrai son WAV, d'un niveau différent à chaque prise) ; les prises
 * sont réellement déposées sur le stockage objet de la recette ; RIEN n'est envoyé ; le brouillon de l'épreuve est effacé.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-9
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const URL_CR = `${BASE}/admin/location/previsite/${OCC}/compte-rendu`;
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };
const CONTRAINTES = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: 48_000 } } };

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript((t) => {
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
    const w = window as unknown as { __contraintes: unknown[]; __niveaux: number[] };
    w.__contraintes = []; w.__niveaux = [0.08, 0.35, 0.6];
    // un VRAI son : WAV 48 kHz, 1,2 s, un « la » dont le niveau change à chaque prise
    const wav = (niveau: number): Blob => {
      const n = 48_000 * 1.2; const o = new DataView(new ArrayBuffer(44 + n * 2));
      const ecrire = (i: number, s: string) => { for (let k = 0; k < s.length; k++) o.setUint8(i + k, s.charCodeAt(k)); };
      ecrire(0, 'RIFF'); o.setUint32(4, 36 + n * 2, true); ecrire(8, 'WAVE'); ecrire(12, 'fmt '); o.setUint32(16, 16, true); o.setUint16(20, 1, true); o.setUint16(22, 1, true);
      o.setUint32(24, 48_000, true); o.setUint32(28, 96_000, true); o.setUint16(32, 2, true); o.setUint16(34, 16, true); ecrire(36, 'data'); o.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) o.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / 48_000) * niveau * 0x7fff), true);
      return new Blob([o.buffer], { type: 'audio/wav' });
    };
    let rang = 0;
    class FauxEnregistreur {
      static isTypeSupported = (x: string) => x === 'audio/mp4';
      mimeType = 'audio/mp4'; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      requestData() { /* rien */ }
      stop() { this.state = 'inactive'; const b = wav(w.__niveaux[rang % w.__niveaux.length]); rang += 1; this.ondataavailable?.({ data: new Blob([b], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async (c: unknown) => {
      w.__contraintes.push(c);
      const piste = { readyState: 'live', stop() { this.readyState = 'ended'; } };
      return { getTracks: () => [piste] };
    } } });
  }, theme);
  return erreurs;
}
async function ouvrir(page: Page): Promise<void> {
  await page.goto(URL_CR);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-brouillon-chargement]')).toHaveCount(0, { timeout: 15_000 });
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
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  const efface = page.waitForResponse((r) => (r.request().postData() ?? '').includes('"effacer-brouillon-previsite"'));
  await page.locator('[data-effacer-brouillon-oui]').tap();
  expect((await efface).status()).toBe(200);
}
/** la page VISIBLE sans défilement : rien n'a défilé, le formulaire est sous le doigt au milieu de l'écran */
async function visibleSansDefilement(page: Page, yAttendu = 0): Promise<void> {
  await page.waitForTimeout(150); // une repeinte (deux images) est passée
  const r = await page.evaluate(() => {
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight * 0.55);
    const titre = document.querySelector('[data-fenetre-previsite] .mis-titre, [data-titre-previsite]')?.getBoundingClientRect();
    return { y: scrollY, dansLaPage: centre?.closest('[data-page-compte-rendu]') !== null, titre: titre ? [titre.top, titre.bottom] : null, haut: innerHeight };
  });
  expect(r.y).toBe(yAttendu);
  expect(r.dansLaPage).toBe(true);
  expect(r.titre).not.toBeNull();
  if (yAttendu === 0) { expect(r.titre![0]).toBeGreaterThanOrEqual(0); expect(r.titre![1]).toBeLessThanOrEqual(r.haut); }
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] (5) mêmes réglages du micro à chaque prise et réouverture ; prises NORMALISÉES (−1 dBFS, WAV 16 kHz) ; (2) « Écouter » joue au premier toucher, progression, un seul à la fois, aucun menu d’appui long`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    const deposees: { type: string; crete: number; frequence: number }[] = [];
    await page.route('**/api/admin/location', async (r) => {
      const d = r.request().postData() ?? '';
      if (d.includes('"vocal-compte-rendu"')) {
        const c = JSON.parse(d) as { donnees: string; typeMime: string };
        const o = Buffer.from(c.donnees.replace(/^data:[^,]*,/, ''), 'base64');
        let m = 0; for (let i = 44; i + 1 < o.byteLength; i += 2) m = Math.max(m, Math.abs(o.readInt16LE(i)));
        deposees.push({ type: c.typeMime, crete: m / 0x7fff, frequence: o.readUInt32LE(24) });
      }
      return r.continue();
    });
    await ouvrir(page);
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-vocal="1"] [data-prise="1"] [data-prise-statut]')).toHaveText('Sauvegardée', { timeout: 20_000 });
    // le micro est relâché (arrière-plan) puis rouvert : les MÊMES réglages
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-vocal="1"] [data-prise="2"] [data-prise-statut]')).toHaveText('Sauvegardée', { timeout: 20_000 });
    expect(await page.evaluate(() => (window as unknown as { __contraintes: unknown[] }).__contraintes)).toEqual([CONTRAINTES, CONTRAINTES]);
    // deux prises de niveaux très différents (0,08 et 0,35) : toutes deux déposées à −1 dBFS, en WAV 16 kHz
    expect(deposees.map((x) => [x.type, x.frequence])).toEqual([['audio/wav', 16_000], ['audio/wav', 16_000]]);
    for (const x of deposees) expect(x.crete).toBeCloseTo(10 ** (-1 / 20), 2);
    await expect(page.locator('[data-vocal="1"] [data-prise="1"]')).toHaveAttribute('data-prise-normalisee', 'oui');
    // (2) après rechargement, les prises viennent du SERVEUR : servies par plages (206), et « Écouter » joue au premier toucher
    await page.waitForTimeout(1800);
    await page.reload();
    await expect(page.locator('[data-vocal="1"] [data-prise="2"] [data-prise-statut]')).toHaveText('Sauvegardée', { timeout: 30_000 });
    const plage = await page.evaluate(async () => {
      const b = await (await fetch(`/api/admin/location?previsiteBrouillon=${location.pathname.split('/')[4]}`, { cache: 'no-store' })).json() as { data: { brouillon: { fichiers: { prises: { id: number }[] }[] } } };
      const id = b.data.brouillon.fichiers[0].prises[0].id;
      const r = await fetch(`/api/admin/location/pieces-sortie?piece=${id}`, { headers: { Range: 'bytes=0-1' }, cache: 'no-store' });
      return { statut: r.status, plage: r.headers.get('content-range'), accepte: r.headers.get('accept-ranges'), disposition: r.headers.get('content-disposition'), octets: (await r.arrayBuffer()).byteLength };
    });
    expect(plage).toMatchObject({ statut: 206, accepte: 'bytes', octets: 2 });
    expect(plage.plage).toMatch(/^bytes 0-1\/\d+$/);
    expect(plage.disposition).toMatch(/^inline/);
    const ecouter = page.locator('[data-vocal="1"] [data-vocal-ecouter]');
    await ecouter.tap(); // UN toucher
    await expect(ecouter).toHaveAttribute('data-en-lecture', 'oui');
    await expect(page.locator('[data-vocal="1"] [data-lecture-texte]')).toHaveText(/^Lecture… 00:0\d \/ 00:0\d$/);
    await expect.poll(() => page.locator('[data-vocal="1"] [role="progressbar"]').getAttribute('aria-valuenow').then(Number), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.locator('[data-vocal="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-02-ecouter-progression`);
    // un autre bouton : le premier s'arrête (un seul à la fois)
    await page.locator('[data-vocal="1"] [data-prise="1"] [data-prise-ecouter]').tap();
    await expect(ecouter).toHaveAttribute('data-en-lecture', 'non');
    await expect(page.locator('[data-lecture-progression]')).toHaveCount(1);
    // aucun menu d'appui long sur un bouton ; les champs restent sélectionnables
    // (« -webkit-touch-callout » n'existe que sur l'iPhone : WebKit de bureau l'ignore, on le lit dans la feuille de style)
    const styles = await page.evaluate(() => {
      const s = (e: Element) => { const c = getComputedStyle(e); return c.getPropertyValue('-webkit-user-select') || c.userSelect; };
      const feuille = [...document.querySelectorAll('style')].map((x) => x.textContent ?? '').join('\n');
      return { bouton: s(document.querySelector('[data-vocal-ecouter]')!), prise: s(document.querySelector('[data-prise-ecouter]')!), texte: s(document.querySelector('[data-corps-compte-rendu]')!),
        callout: /\.pvv-page-cr button,[^{]*\{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none/.test(feuille) };
    });
    expect(styles).toEqual({ bouton: 'none', prise: 'none', texte: 'text', callout: true });
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] (1) récapitulatif : les LOCATAIRES d’abord, puis l’interne ; le rappel dans le même ordre (VRAI aperçu)`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await ouvrir(page);
    await page.locator('[data-corps-compte-rendu]').fill('Essai : ordre des cartes.');
    await page.locator('[data-presence-locataire]').first().check();
    await expect(page.locator('[data-blocage-envoi]')).toHaveCount(0);
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
    const familles = await page.locator('[data-famille-mail]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-famille-mail')));
    expect(familles[0]).toBe('locataire');
    expect(familles.at(-1)).toBe('interne');
    expect(familles.indexOf('interne')).toBeGreaterThan(familles.lastIndexOf('locataire'));
    await expect(page.locator('[data-rappel-familles]')).toHaveText(/^\d+ mails? locataires? · \d+ mails? internes?$/);
    await capturer(page, `${theme}-01-recapitulatif-locataires-d-abord`);
    await page.locator('[data-revenir-previsite]').tap();
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] (3) la frise : « Compte rendu pré-visite » ouvre la fenêtre CENTRÉE du brouillon, puis « Continuer la saisie » ; (4) la page visible SANS défilement (lien, frise, retour d’arrière-plan)`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    // (4) par le lien direct (celui du mail) : visible tout de suite, sans défilement
    await page.goto(URL_CR);
    await expect(page.locator('[data-fenetre-previsite="saisie"]')).toBeVisible({ timeout: 30_000 });
    await visibleSansDefilement(page);
    await capturer(page, `${theme}-04-page-visible-sans-defilement`);
    // une saisie, pour que la fenêtre de la frise ait un brouillon à montrer
    await page.locator('[data-corps-compte-rendu]').fill('Cuisine propre.');
    await page.locator('[data-presence-locataire]').first().check();
    await expect(page.locator('[data-sauvegarde]')).toHaveAttribute('data-sauvegarde', 'enregistre', { timeout: 15_000 });
    // retour d'arrière-plan : toujours visible, à la même place, et la page s'est repeinte
    const y = await page.evaluate(() => scrollY);
    await page.evaluate(() => { document.documentElement.removeAttribute('data-repeint');
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-repeint'))).toBe(true);
    await visibleSansDefilement(page, y);
    // (3) la frise
    await page.goto(`${BASE}/admin/location?previsite=${OCC}`);
    const bouton = page.locator('[data-ligne-depliee] [data-compte-rendu-previsite]');
    await expect(bouton).toBeVisible({ timeout: 30_000 });
    await bouton.tap();
    const f = page.locator('[data-fenetre-compte-rendu="brouillon"]');
    await expect(f).toBeVisible();
    await expect(f.locator('[data-cr-brouillon="oui"]')).toHaveText(/^Brouillon — non envoyé, dernier enregistrement à \d\dh\d\d$/);
    await expect(f.locator('[data-cr-texte]')).toHaveText('Cuisine propre.');
    await expect(f.locator('[data-cr-present]')).toHaveCount(1);
    // centrée, la page de fond masquée (verrou commun)
    const boite = await f.boundingBox();
    const haut = await page.evaluate(() => innerHeight);
    expect(Math.abs((boite!.y + boite!.height / 2) - haut / 2)).toBeLessThan(4);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-shell')!).visibility)).toBe('hidden');
    await capturer(page, `${theme}-03-fenetre-brouillon-frise`);
    await f.locator('[data-continuer-saisie]').tap();
    await expect(page.locator('[data-fenetre-previsite="saisie"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-corps-compte-rendu]')).toHaveValue('Cuisine propre.', { timeout: 15_000 });
    await visibleSansDefilement(page);
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] (3) « Voir le compte rendu » (envoyé, simulé) : présences et notes internes, vocal lu au premier toucher, envois locataires d’abord`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    // une vraie prise déposée, pour l'écouter depuis la consultation
    await ouvrir(page);
    await maintenir(page, '[data-enregistrer-vocal]', 700);
    await expect(page.locator('[data-vocal="1"] [data-prise="1"] [data-prise-statut]')).toHaveText('Sauvegardée', { timeout: 20_000 });
    await page.waitForTimeout(1800);
    const id = await page.evaluate(async () => {
      const b = await (await fetch(`/api/admin/location?previsiteBrouillon=${location.pathname.split('/')[4]}`, { cache: 'no-store' })).json() as { data: { brouillon: { fichiers: { prises: { id: number }[] }[] } } };
      return b.data.brouillon.fichiers[0].prises[0].id;
    });
    await effacerBrouillon(page);
    const CR = { texte: 'En présence de TEST.\n\nCompte rendu de l’épreuve.', objet: 'Compte rendu de pré-visite (épreuve)', saisiPar: 'Arno', saisiLe: '2026-11-15T10:00:00Z', pieces: [], aucunEnvoi: false,
      presences: { occupations: [Number(OCC)], personnes: [{ civilite: 'Madame', nom: 'Essai', prenom: 'Léa', note: 'note interne de l’épreuve' }] },
      destinataires: [{ nom: 'a.jorel', famille: 'interne', quand: '2026-11-15T10:00:00Z', etat: 'envoye', motif: null }],
      vocaux: [{ id, nom: 'Vocal-1.wav', taille: 3, dureeS: 1.2 }], fichiersVocaux: [{ nom: 'Cuisine', prises: [{ id, nom: 'Vocal-1.wav', taille: 3, dureeS: 1.2 }], locataires: false }] };
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
    const f = page.locator('[data-fenetre-compte-rendu="envoye"]');
    await expect(f.locator('[data-cr-present]')).toHaveCount(2);
    await expect(f.locator('[data-cr-note-interne]')).toHaveText(' — note interne : note interne de l’épreuve');
    await f.locator('[data-cr-vocal-ecouter]').tap();
    await expect(f.locator('[data-cr-vocal-ecouter]')).toHaveAttribute('data-en-lecture', 'oui');
    await expect(f.locator('[data-lecture-texte]')).toHaveText(/^Lecture… 00:0\d \/ 00:01$/);
    await f.locator('[data-cr-vocaux]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-05-voir-compte-rendu-envoye`);
    expect(erreurs).toEqual([]);
  });
}
