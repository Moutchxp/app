import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { brouillonPropreAvantChaqueEpreuve } from './brouillonPropre';

/**
 * 🔴🔴 Arno (15/11/2026, 9e retour) — JAMAIS DE VOCAL FANTÔME. WebKit, profil iPhone 15, contre la RECETTE (préavis de test), en clair ET en
 * sombre. Prouve : (1) une prise suivie AUSSITÔT d'une mise en veille et de la fermeture de la page revient à la réouverture, déposée et
 * LISIBLE (octets relus sur le serveur) ; (2) une prise vide est REFUSÉE par le serveur, affichée en rouge « Vide ou perdue — à réenregistrer »,
 * et le récapitulatif est refusé en la nommant ; (3) une prise et une photo référencées par le brouillon mais introuvables reviennent en rouge
 * et bloquent l'envoi. Micro simulé (les octets d'un vrai M4A minimal : « ftyp » + « mdat ») ; les prises de l'épreuve sont réellement
 * déposées sur le stockage objet de la recette (jamais le Drive) ; le brouillon de l'épreuve est effacé en partant ; RIEN n'est envoyé.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test vocal-fantome
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const URL_CR = `${BASE}/admin/location/previsite/${OCC}/compte-rendu`;
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
brouillonPropreAvantChaqueEpreuve();
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

/** le micro simulé : `vide` → aucun son (3 octets) ; sinon un M4A minimal valide, différent à chaque prise */
async function preparer(page: Page, theme: 'light' | 'dark', vide = false): Promise<string[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript(([t, v]) => {
    try { localStorage.setItem('svv-theme', t as string); } catch { /* rien */ }
    const son = (): Blob => {
      if (v) return new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' });
      const b = new Uint8Array(400); const ecrire = (s: string, i: number) => { for (let k = 0; k < s.length; k++) b[i + k] = s.charCodeAt(k); };
      ecrire('ftypM4A ', 4); ecrire('mdat', 40); for (let k = 48; k < 400; k++) b[k] = Math.floor(Math.random() * 256);
      return new Blob([b], { type: 'audio/mp4' });
    };
    class FauxEnregistreur {
      static isTypeSupported = (x: string) => x === 'audio/mp4';
      mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_f: unknown, o?: { mimeType?: string }) { this.mimeType = o?.mimeType ?? 'audio/mp4'; }
      start() { this.state = 'recording'; setTimeout(() => { if (this.state === 'recording') this.ondataavailable?.({ data: son() }); }, 250); }
      requestData() { /* les morceaux sont déjà livrés */ }
      stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {}, readyState: 'live' }] }) } });
  }, [theme, vide] as const);
  return erreurs;
}
async function ouvrir(page: Page): Promise<void> {
  await page.goto(URL_CR);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
}
async function effacerBrouillon(page: Page): Promise<void> {
  await page.locator('[data-effacer-brouillon]').scrollIntoViewIfNeeded();
  await page.locator('[data-effacer-brouillon]').tap();
  const efface = page.waitForResponse((r) => (r.request().postData() ?? '').includes('"effacer-brouillon-previsite"'));
  await page.locator('[data-effacer-brouillon-oui]').tap();
  expect((await efface).status()).toBe(200);
}
/** la présence et un texte : sans eux, le récapitulatif ne dirait rien des prises */
async function remplir(page: Page): Promise<void> {
  await page.locator('[data-corps-compte-rendu]').fill('Essai de l’épreuve « vocal fantôme ».');
  const c = page.locator('[data-presence-locataire]').first();
  if (!(await c.isChecked())) await c.check();
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] prise puis MISE EN VEILLE et FERMETURE immédiates : à la réouverture, la prise est là, sauvegardée et lisible`, async ({ browser }) => {
    const contexte = await browser.newContext({ ...test.info().project.use });
    const page = await contexte.newPage();
    const erreurs = await preparer(page, theme);
    await ouvrir(page);
    const b = page.locator('[data-enregistrer-vocal]');
    await b.scrollIntoViewIfNeeded();
    await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(b).toHaveAttribute('data-enregistrement', 'oui');
    await page.waitForTimeout(900);
    // le téléphone passe en veille PENDANT la prise (doigt encore posé), puis la page est fermée presque aussitôt
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await page.waitForTimeout(60);
    await page.close();
    // réouverture, même appareil
    const p2 = await contexte.newPage();
    const erreurs2 = await preparer(p2, theme);
    await ouvrir(p2);
    const prise = p2.locator('[data-vocal="1"] [data-prise="1"]');
    await expect(prise).toBeVisible({ timeout: 15_000 });
    await expect(prise.locator('[data-prise-statut]')).toHaveText('Sauvegardée', { timeout: 30_000 });
    await prise.scrollIntoViewIfNeeded();
    await capturer(p2, `${theme}-01-prise-revenue-apres-veille-et-fermeture`);
    // lisible : après un rechargement, la prise vient du SERVEUR (son numéro de pièce) et ses octets se relisent
    await p2.waitForTimeout(1800);
    await p2.reload();
    await expect(p2.locator('[data-vocal="1"] [data-prise="1"] [data-prise-statut]')).toHaveText('Sauvegardée', { timeout: 30_000 });
    const lu = await p2.evaluate(async () => {
      const brouillon = await (await fetch(`/api/admin/location?previsiteBrouillon=${location.pathname.split('/')[4]}`, { cache: 'no-store' })).json() as { data?: { brouillon?: { fichiers?: { prises?: { id?: number }[] }[] } } };
      const id = brouillon.data?.brouillon?.fichiers?.[0]?.prises?.[0]?.id;
      if (typeof id !== 'number') return { id: null, statut: 0, octets: 0, signature: '' };
      const r = await fetch(`/api/admin/location/pieces-sortie?piece=${id}`, { cache: 'no-store' });
      const o = new Uint8Array(await r.arrayBuffer());
      return { id, statut: r.status, octets: o.byteLength, signature: String.fromCharCode(...o.subarray(4, 8)) };
    });
    expect(lu).toMatchObject({ statut: 200, octets: 400, signature: 'ftyp' });
    expect(lu.id).not.toBeNull();
    await effacerBrouillon(p2);
    expect([...erreurs, ...erreurs2]).toEqual([]);
    await contexte.close();
  });

  test(`[${theme}] prise VIDE : refusée par le serveur, ROUGE « Vide ou perdue — à réenregistrer », récapitulatif refusé en la nommant`, async ({ page }) => {
    const erreurs = await preparer(page, theme, true);
    await ouvrir(page);
    await remplir(page);
    const b = page.locator('[data-enregistrer-vocal]');
    await b.scrollIntoViewIfNeeded();
    const reponse = page.waitForResponse((r) => (r.request().postData() ?? '').includes('"vocal-compte-rendu"'));
    await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
    await page.waitForTimeout(900);
    await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
    const corps = await (await reponse).json() as { etat: string; motif?: string };
    expect(corps.etat).not.toBe('ok'); // 🔴 le SERVEUR refuse le son vide
    const prise = page.locator('[data-vocal="1"] [data-prise="1"]');
    await expect(prise).toHaveAttribute('data-prise-etat', 'erreur');
    await expect(prise.locator('[data-prise-statut]')).toHaveText('Vide ou perdue — à réenregistrer');
    const rouge = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = getComputedStyle(document.querySelector('.svv-adm-root')!).getPropertyValue('--color-svv-red'); document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; });
    expect(await prise.locator('[data-prise-statut]').evaluate((e) => getComputedStyle(e).color)).toBe(rouge);
    await expect(prise.locator('[data-prise-motif]')).toContainText('vide');
    await prise.scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-02-prise-vide-en-rouge`);
    const motif = 'Prise 1 de « Vocal 1 » : vide ou perdue — supprimez-la (et refaites-la) avant d’envoyer.';
    await expect(page.locator('[data-blocage-envoi="perdue"]')).toHaveText(motif);
    let apercu = false;
    page.on('request', (r) => { if ((r.postData() ?? '').includes('"apercu-compte-rendu-previsite"')) apercu = true; });
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-previsite-refus]')).toHaveText(motif);
    await page.locator('[data-previsite-refus]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-03-recapitulatif-refuse`);
    expect(apercu).toBe(false);
    // supprimée : plus rien ne bloque
    await prise.locator('[data-prise-supprimer]').tap();
    await page.locator('[data-prise-supprimer-oui]').tap();
    await expect(page.locator('[data-blocage-envoi]')).toHaveCount(0);
    await effacerBrouillon(page);
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] le brouillon cite une prise et une photo INTROUVABLES : elles reviennent en rouge et bloquent l’envoi`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await page.route('**/api/admin/location?previsiteBrouillon=*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data: {
      enregistreLe: new Date().toISOString(), brouillon: { corps: 'Compte rendu de l’épreuve.', presents: [Number(OCC)], ajoutees: [], aussiLocataires: true, fichierActif: null,
        photos: [{ cle: 'perdue-1', legende: 'Parquet', perdue: true }],
        fichiers: [{ cle: 'f-epreuve', nom: 'Cuisine', locataires: false, prises: [{ cle: 'perdue-2', dureeS: 2, perdue: true }] }] } } }) }));
    await page.route('**/api/admin/location', (r) => {
      const d = r.request().postData() ?? '';
      // rien de l'épreuve n'est écrit : ni brouillon, ni aperçu
      if (d.includes('"brouillon-previsite"') || d.includes('"effacer-brouillon-previsite"')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data: { enregistreLe: new Date().toISOString(), efface: true } }) });
      return r.continue();
    });
    await ouvrir(page);
    await expect(page.locator('[data-vocal="1"] [data-prise="1"]')).toHaveAttribute('data-prise-etat', 'perdue');
    await expect(page.locator('[data-vocal="1"] [data-prise="1"] [data-prise-statut]')).toHaveText('Vide ou perdue — à réenregistrer');
    await expect(page.locator('[data-photo="1"]')).toHaveAttribute('data-photo-etat', 'perdue');
    await expect(page.locator('[data-photo="1"] [data-photo-perdue]')).toBeVisible();
    await page.locator('[data-photo="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-04-photo-perdue`);
    await page.locator('[data-vocal="1"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-05-prise-perdue`);
    const motif = 'Photo 1 et Prise 1 de « Cuisine » : vides ou perdues — supprimez-les (et refaites-les) avant d’envoyer.';
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-previsite-refus]')).toHaveText(motif);
    expect(erreurs).toEqual([]);
  });
}
