import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * 🔴 Arno (15/11/2026, 4e retour du test iPhone) — WebKit, profil iPhone 15, contre la RECETTE (bandeau « envois réels autorisés vers … »
 * actif), en clair ET en sombre. Prouve : flèche d'Entrée seule avec libellé accessible ; note interne dans le seul mail interne (VRAI aperçu,
 * lecture seule : rien ne part) ; trames des boutons ; alignement ; AUCUNE erreur d'hydratation — y compris quand, comme Chrome sur iPhone,
 * le navigateur transforme d'office les adresses e-mail de la page en liens AVANT l'hydratation (simulé ici).
 *   E2E_JETON_FICHIER=<jeton de recette> E2E_OCCUPATION=<occupation> [E2E_CAPTURES=<dossier>] npx playwright test compte-rendu-ergonomie-4
 */
const OCC = process.env.E2E_OCCUPATION ?? '';
const JETON = process.env.E2E_JETON_FICHIER ? readFileSync(process.env.E2E_JETON_FICHIER, 'utf8').trim() : '';
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
test.skip(OCC === '' || JETON === '', 'E2E_OCCUPATION et E2E_JETON_FICHIER requis (recette)');
const capturer = async (page: Page, nom: string) => { if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/${nom}.png` }); };

async function preparer(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
  await page.emulateMedia({ colorScheme: theme });
  await page.context().addCookies([{ name: 'svv_admin_session', value: JETON, domain: new URL(BASE).hostname, path: '/', httpOnly: true, sameSite: 'Strict', secure: false }]);
  const erreurs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /hydrat/i.test(m.text())) erreurs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (/hydrat/i.test(e.message)) erreurs.push(e.message.slice(0, 300)); });
  await page.addInitScript((t) => {
    try { localStorage.setItem('svv-theme', t); } catch { /* rien */ }
    // ce que fait Chrome sur iPhone : chaque adresse e-mail du TEXTE de la page devient un lien, dès l'analyse du HTML (avant l'hydratation)
    const MAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    const lier = (n: Node) => {
      if (n.nodeType !== Node.TEXT_NODE || !n.parentNode || (n.parentNode as Element).closest?.('a,script,style,textarea,input')) return;
      const m = MAIL.exec(n.textContent ?? ''); if (!m) return;
      const t2 = (n as Text).splitText(m.index); t2.splitText(m[0].length);
      const a = document.createElement('a'); a.href = `mailto:${m[0]}`; a.textContent = m[0]; t2.parentNode!.replaceChild(a, t2);
    };
    new MutationObserver((ms) => ms.forEach((x) => x.addedNodes.forEach((n) => { lier(n); n.childNodes?.forEach(lier); }))).observe(document, { childList: true, subtree: true });
  }, theme);
  await page.goto(`${BASE}/admin/location?previsite=${OCC}&geste=compte-rendu`);
  await expect(page.locator('[data-fenetre-previsite="saisie"][data-geste-previsite="compte_rendu"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  return erreurs;
}

for (const theme of ['light', 'dark'] as const) {
  test(`[${theme}] aucune erreur d’hydratation (adresses transformées en liens comme Chrome iPhone) ; bandeau lisible`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    expect(erreurs).toEqual([]);
    expect(await page.locator('#bandeau-recette').evaluate((b) => getComputedStyle(b.querySelector('.svv-adresse-css')!, '::after').content)).toBe('"a.jorel@sansvisavis.com"');
    expect(await page.locator('#bandeau-recette a[href^="mailto:"]').count()).toBe(0); // rien à transformer : l'adresse n'est pas du texte
    await capturer(page, `${theme}-01-ouverture-sans-erreur`);
  });

  test(`[${theme}] flèche d’Entrée seule ; trames ; « Nouveau fichier vocal » à droite`, async ({ page }) => {
    await preparer(page, theme);
    const entree = page.locator('[data-entree]');
    await expect(entree).toHaveAttribute('aria-label', 'Aller à la ligne');
    expect((await entree.textContent())?.trim()).toBe('');
    const boite = await entree.boundingBox();
    expect(boite!.width).toBeGreaterThanOrEqual(44); expect(boite!.height).toBeGreaterThanOrEqual(44);
    const fond = (s: string) => page.locator(s).evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await fond('[data-ajouter-photo]')).toBe(await fond('[data-dicter]'));
    expect(await fond('[data-photo-galerie-bouton]')).toBe(await fond('[data-clavier]'));
    expect(await fond('[data-ajouter-photo]')).not.toBe(await fond('[data-photo-galerie-bouton]'));
    const droite = await page.evaluate(() => {
      const b = document.querySelector('[data-nouveau-vocal]')!.getBoundingClientRect(); const c = document.querySelector('[data-vocaux-compte-rendu]')!.getBoundingClientRect();
      return { bouton: Math.round(b.right), bloc: Math.round(c.right), gauche: Math.round(b.left - c.left) };
    });
    expect(droite.bloc - droite.bouton).toBeLessThanOrEqual(16); // collé à la marge droite du bloc
    expect(droite.gauche).toBeGreaterThan(100);
    await page.locator('[data-bloc-texte]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-02-texte-fleche`);
    await page.locator('[data-photos-compte-rendu]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-03-photos-trames`);
    await page.locator('.pvv-dictaphone').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-04-dictaphone-a-droite`);
  });

  test(`[${theme}] note INTERNE : dans la liste, modifiable ; dans le mail interne seulement — jamais dans la phrase ni dans le mail du locataire (VRAI aperçu)`, async ({ page }) => {
    const erreurs = await preparer(page, theme);
    await page.locator('[data-ajouter-personne]').tap();
    await page.locator('[data-personne-civilite="Madame"]').check();
    await page.locator('[data-personne-nom]').fill('Martin');
    await page.locator('[data-personne-prenom]').fill('Léa');
    await page.locator('[data-personne-note-modale]').fill('mère du locataire');
    await capturer(page, `${theme}-05-modale-note`);
    await page.locator('[data-personne-ajouter]').tap();
    await expect(page.locator('[data-personne-ajoutee] [data-personne-note]')).toHaveValue('mère du locataire');
    await page.locator('[data-personne-ajoutee] [data-personne-note]').fill('mère de la locataire');
    await page.locator('[data-bloc-presence]').scrollIntoViewIfNeeded();
    await capturer(page, `${theme}-06-presence-note`);
    await page.locator('[data-corps-compte-rendu]').fill('Logement propre.');
    await expect(page.locator('[data-aussi-locataires]')).toHaveAttribute('aria-pressed', 'true'); // 🔴 (15/11/2026) activé par défaut
    await page.locator('[data-recap-previsite]').scrollIntoViewIfNeeded();
    await page.locator('[data-recap-previsite]').tap();
    const mails = page.locator('[data-mail-prevu="previsite_compte_rendu"]');
    await expect(mails.first()).toBeVisible({ timeout: 20_000 });
    const textes = await mails.evaluateAll((ms) => ms.map((m) => ({ a: m.querySelector('[data-a]')?.textContent ?? '', texte: m.textContent ?? '' })));
    expect(textes.length).toBeGreaterThanOrEqual(2);
    const interne = textes.filter((m) => m.texte.includes('Notes de présence (internes)'));
    expect(interne).toHaveLength(1);
    expect(interne[0].texte).toContain('Mme Léa Martin — mère de la locataire');
    // 🔴 (15/11/2026, 6e retour) interne : « En présence de … » ; locataires : « … en présence de … » dans l'introduction
    expect(interne[0].texte).toContain('En présence de Mme Léa Martin.');
    for (const m of textes.filter((x) => x !== interne[0])) expect(m.texte).toContain('en présence de Mme Léa Martin, vous trouverez');
    for (const m of textes.filter((x) => x !== interne[0])) expect(m.texte).not.toContain('mère de la locataire');
    await capturer(page, `${theme}-07-recapitulatif-note-interne`);
    expect(erreurs).toEqual([]);
  });
}
