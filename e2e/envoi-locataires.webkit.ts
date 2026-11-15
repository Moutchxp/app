import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (15/11/2026) — « Objet : … » ET LE GROS BOUTON D'ENVOI AUX LOCATAIRES. WebKit, profil iPhone 15, contre la RECETTE (préavis de test),
 * en clair ET en sombre. Prouve : « Objet : » suivi d'une espace ; le bouton ACTIVÉ par défaut (plein rouge, coche, noms dessous), désactivé
 * par un appui (contour seul, « interne uniquement »), aria-pressed et aide qui suivent ; le VRAI récapitulatif cohérent (carte « MAIL AUX
 * LOCATAIRES » présente ou absente) ; un vocal marqué « Envoyé aux locataires » n'est joint que si l'envoi est actif (micro et dépôts simulés :
 * rien n'est enregistré). On ne confirme jamais.
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation d'un préavis de test> [E2E_CAPTURES=<dossier>] npx playwright test envoi-locataires
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function ouvrir(page: Page, theme: 'light' | 'dark', o: { vocal?: boolean } = {}): Promise<{ erreurs: string[]; apercus: Record<string, unknown>[] }> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = []; const apercus: Record<string, unknown>[] = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push(e.message.slice(0, 300)));
  await page.addInitScript(({ t, vocal }) => {
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
    if (!vocal) return;
    // le micro simulé (aucun enregistrement réel), comme dans compte-rendu-ergonomie-2
    class FauxEnregistreur {
      static isTypeSupported = (x: string) => x === 'audio/mp4';
      mimeType: string; state = 'inactive'; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_f: unknown, opt?: { mimeType?: string }) { this.mimeType = opt?.mimeType ?? 'audio/mp4'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 0); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxEnregistreur;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) } });
  }, { t: theme, vocal: o.vocal === true });
  // le dépôt d'un vocal simulé (rien n'est écrit) ; l'aperçu est le VRAI (lecture seule), noté au passage
  await page.route('**/api/admin/location', async (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    const c = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    if (c.action === 'vocal-compte-rendu') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'ok', data: { id: 990001, nom: 'vocal.m4a', taille: 3 } }) });
    if (c.action === 'apercu-compte-rendu-previsite') {
      apercus.push(c);
      // un vocal SIMULÉ n'existe pas en base : l'aperçu réel est demandé sans lui, la case du vocal reste lue côté écran
      const { vocaux: _v, fichiersVocaux: _f, ...sans } = c;
      const rep = await r.fetch({ postData: JSON.stringify(sans) });
      return r.fulfill({ response: rep });
    }
    if (c.action === 'compte-rendu-previsite') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ etat: 'refus', motif: 'Essai : rien n’est envoyé.' }) });
    return r.continue();
  });
  await page.goto(`${BASE}/admin/location/previsite/${OCC}/compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  return { erreurs, apercus };
}

async function versRecap(page: Page): Promise<void> {
  await page.locator('[data-presence-locataire]').first().check();
  await page.locator('[data-corps-compte-rendu]').fill('Logement propre.');
  await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
  await page.locator('[data-recap-previsite]').tap();
  await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] « Objet : » ; bouton ACTIVÉ par défaut (rouge, coche, noms) ; un appui le désactive (contour) ; récapitulatif cohérent`, async ({ page }) => {
    const { erreurs, apercus } = await ouvrir(page, theme);
    // 1. « Objet : » — deux-points et une espace avant le texte
    const objet = (await page.locator('[data-objet-ligne]').innerText()).replace(/\s+/g, ' ');
    expect(objet).toMatch(/^Objet : Compte rendu de pré-visite/);
    await page.locator('[data-objet-ligne]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-01-objet`);
    // 2. le bouton, activé par défaut
    const b = page.locator('[data-aussi-locataires]');
    await b.scrollIntoViewIfNeeded();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(b).toHaveText('Compte rendu envoyé aux locataires');
    expect(await b.locator('svg').count()).toBe(1);
    await expect(page.locator('[data-destinataires-titre]')).toHaveText('Les destinataires :');
    await expect(page.locator('[data-destinataire-liste="locataire"]')).toHaveCount(1);
    const rouge = await page.evaluate(() => getComputedStyle(document.querySelector('.svv-adm-root')!).getPropertyValue('--color-svv-red').trim());
    const actif = await b.evaluate((e) => ({ fond: getComputedStyle(e).backgroundColor, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width,
      ref: (document.querySelector('[data-clavier]') as HTMLElement).getBoundingClientRect().height }));
    const rgb = await page.evaluate((c) => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, rouge);
    expect(actif.fond).toBe(rgb);
    expect(actif.h).toBe(actif.ref); // même hauteur que les boutons du formulaire
    expect(actif.w).toBeGreaterThan(300); // pleine largeur
    await capturer(page, `${theme}-02-bouton-active-par-defaut`);
    // un appui : désactivé, contour seul
    await b.tap();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    await expect(b).toHaveText('Compte rendu NON envoyé aux locataires (interne uniquement)');
    await expect(page.locator('[data-destinataire-liste="locataire"]')).toHaveCount(0);
    await expect(page.locator('[data-aide-envoi-locataires]')).toContainText('aucun locataire ne le reçoit');
    // le fond change avec une transition de 0,15 s : on attend l'état stable — contour seul, fond de la page (plus le rouge)
    const surface = await page.evaluate(() => getComputedStyle(document.querySelector('.pvv-page-cr')!).backgroundColor);
    await expect.poll(() => b.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(surface);
    await capturer(page, `${theme}-03-bouton-desactive`);
    // récapitulatif sans envoi : aucune carte locataire
    await versRecap(page);
    await expect(page.locator('[data-famille-mail]')).toHaveCount(1);
    await expect(page.locator('[data-famille-mail="locataire"]')).toHaveCount(0);
    await expect(page.locator('[data-rappel-familles]')).toHaveText('1 mail interne');
    expect(apercus.at(-1)!.aussiLocataires).toBe(false);
    await capturer(page, `${theme}-04-recap-interne-seul`);
    // « Revenir », réactiver : la carte « MAIL AUX LOCATAIRES » revient, avec sa mention
    await page.locator('[data-revenir-previsite]').tap();
    await page.locator('[data-aussi-locataires]').tap();
    await expect(page.locator('[data-aussi-locataires]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-fenetre-previsite="recap"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-famille-mail="locataire"]')).toHaveCount(1);
    await expect(page.locator('[data-famille-mail="locataire"] [data-recette-remplacement]')).toContainText('Adresse remplacée en recette');
    expect(apercus.at(-1)!.aussiLocataires).toBe(true);
    await page.locator('[data-famille-mail="locataire"]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-05-recap-avec-locataires`);
    await page.locator('[data-revenir-previsite]').tap(); // on ne confirme jamais
    expect(erreurs).toEqual([]);
  });

  test(`[${theme}] vocal « Envoyé aux locataires » : joint seulement si l’envoi aux locataires est actif ; sinon le récapitulatif le dit`, async ({ page }) => {
    const { apercus } = await ouvrir(page, theme, { vocal: true });
    const rond = page.locator('[data-enregistrer-vocal]');
    await rond.scrollIntoViewIfNeeded();
    await rond.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 });
    await page.waitForTimeout(900);
    await rond.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0 });
    await expect(page.locator('[data-prise-etat="ok"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('[data-vocal-locataires]')).toHaveText('Non envoyé aux locataires'); // inchangé : NON par défaut
    await page.locator('[data-vocal-locataires]').tap();
    await expect(page.locator('[data-vocal-locataires]')).toHaveText('Envoyé aux locataires');
    // envoi aux locataires désactivé : le vocal n'est pas joint, la raison est dite
    await page.locator('[data-aussi-locataires]').tap();
    await versRecap(page);
    await expect(page.locator('[data-recap-vocal]')).toHaveText('Vocal 1 — NON envoyé (interne) — l’envoi aux locataires est désactivé : activez « Compte rendu envoyé aux locataires » pour le joindre');
    expect(apercus.at(-1)!.aussiLocataires).toBe(false);
    await page.locator('[data-recap-vocal]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-06-vocal-non-joint`);
    // activé : il part avec le compte rendu
    await page.locator('[data-revenir-previsite]').tap();
    await page.locator('[data-aussi-locataires]').tap();
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-recap-previsite]').tap();
    await expect(page.locator('[data-recap-vocal]')).toHaveText('Vocal 1 — ENVOYÉ aux locataires');
    expect(apercus.at(-1)!.aussiLocataires).toBe(true);
    expect((apercus.at(-1)!.fichiersVocaux as { locataires: boolean }[]).map((f) => f.locataires)).toEqual([true]);
    await page.locator('[data-recap-vocal]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-07-vocal-joint`);
    await page.locator('[data-revenir-previsite]').tap();
  });
}
