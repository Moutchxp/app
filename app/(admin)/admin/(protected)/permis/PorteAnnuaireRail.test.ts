// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BaseCommune } from './contactForm';
import { EditeurContactCommune } from './EditeurContactCommune';
import { EncartArbitrages, type ArbitrageAffiche } from './DemandesRendu';
import { BlocPrada } from './BlocPrada';

/**
 * Lot 10 §B/§C — LA CARTE ANNUAIRE PORTE LE RAIL (modifiable à volonté) ET LE BLOC PRADA Y DONNE ACCÈS. Comportement exercé sur
 * un vrai rendu (jsdom + act, sans testing-library ; `createElement`, pas de JSX — convention .test.ts du dépôt). On observe les
 * fetch RÉELLEMENT émis (URL + corps) et les callbacks : aucune assertion de couleur/classe/pixel, aucune lecture de source.
 *
 * INVARIANT DU LOT vérifié ici : toute écriture emprunte le CHEMIN EXISTANT — aperçu `basculer-rail` → confirmation →
 * `annuler-lot` → PATCH `/contact`. Aucun second endpoint, aucune table parallèle. Allers-retours ILLIMITÉS (aucun verrou) ; les
 * demandes déjà envoyées ne sont jamais touchées (garde SERVEUR d'annuler-lot, hors de ce test front).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const clic = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await vider(); };
const boutonTexte = (t: string | RegExp): HTMLButtonElement | undefined =>
  boutons().find((b) => (typeof t === 'string' ? (b.textContent ?? '').trim() === t : t.test(b.textContent ?? '')));
const vider = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

/** Saisir un champ contrôlé repéré par le PRÉFIXE de son aria-label (idiome .tsx du dépôt : setter natif + événement input). */
const saisir = async (prefixeAria: string, valeur: string): Promise<void> => {
  const input = container.querySelector(`input[aria-label^="${prefixeAria}"]`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, valeur); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
/** Choisir le canal (donc le rail) via le `<select>` de SelecteurCanal. */
const choisirCanal = async (valeur: string): Promise<void> => {
  const sel = container.querySelector('select[aria-label="Canal de contact"]') as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(sel, valeur); sel.dispatchEvent(new Event('change', { bubbles: true })); });
};

interface Appel { url: string; method: string; body: Record<string, unknown> | undefined }
const reponse = (corps: unknown, ok = true): Response => ({ ok, json: async () => corps } as unknown as Response);

/**
 * Routeur de fetch : enregistre chaque appel (URL/méthode/corps) et répond selon la route. GET /contact → BaseCommune ;
 * GET basculer-rail → aperçu {ids,nbDemandes} ; POST annuler-lot → ok ; PATCH /contact → ok ; GET /prada → arbitrages ;
 * GET /communes → []. `prada` peut être une FONCTION (payload variable d'un appel à l'autre) pour observer un rafraîchissement.
 */
function brancher(opts: {
  base?: BaseCommune; apercu?: { ids: number[]; nbDemandes: number }; patchOk?: boolean; annulerOk?: boolean;
  prada?: () => unknown;
}): Appel[] {
  const appels: Appel[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url); const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/basculer-rail')) return reponse(opts.apercu ?? { ids: [], nbDemandes: 0 });
    if (u.includes('/demandes/annuler-lot')) return reponse({ ok: true }, opts.annulerOk ?? true);
    if (u.includes('/api/admin/permis/contact') && method === 'PATCH') return reponse({ ok: true }, opts.patchOk ?? true);
    if (u.includes('/api/admin/permis/prada')) return reponse(opts.prada ? opts.prada() : { arbitrages: [], ambiguites: [], injoignables: [] });
    if (u.includes('/api/admin/permis/communes')) return reponse({ communes: [] });
    return reponse(opts.base ?? BASE_EMAIL); // GET /contact?code=…
  }) as unknown as typeof fetch;
  return appels;
}

const BASE_EMAIL: BaseCommune = { codeInsee: '75056', communeNom: 'Paris', destCanal: 'email', destEmail: 'urba@paris.fr', destUrlFormulaire: null, destAdressePostale: null };
const BASE_INCONNU: BaseCommune = { codeInsee: '93008', communeNom: 'Bobigny', destCanal: 'inconnu', destEmail: null, destUrlFormulaire: null, destAdressePostale: null };
const BASE_TELE: BaseCommune = { codeInsee: '93048', communeNom: 'Montreuil', destCanal: 'formulaire', destEmail: null, destUrlFormulaire: 'https://montreuil.fr/tele', destAdressePostale: null };

/** Monte la carte annuaire pour `base` et vide les microtâches du chargement GET. Retourne le journal d'appels fetch. */
const monterCarte = async (base: BaseCommune, cb: { onFerme?: () => void; onEnregistre?: () => void } & Partial<Parameters<typeof brancher>[0]>): Promise<Appel[]> => {
  const { onFerme = vi.fn(), onEnregistre = vi.fn(), ...opts } = cb;
  const appels = brancher({ base, ...opts });
  await act(async () => { root.render(createElement(EditeurContactCommune, { codeInsee: base.codeInsee, onFerme, onEnregistre })); });
  await vider();
  return appels;
};
const aperçus = (a: Appel[]): Appel[] => a.filter((x) => x.url.includes('/basculer-rail'));
const annulations = (a: Appel[]): Appel[] => a.filter((x) => x.url.includes('/demandes/annuler-lot'));
const patchs = (a: Appel[]): Appel[] => a.filter((x) => x.url.includes('/api/admin/permis/contact') && x.method === 'PATCH');
const alerteAnnulation = (): Element | null => [...container.querySelectorAll('[role="alert"]')].find((n) => /annulera/.test(n.textContent ?? '')) ?? null;

describe('§B — rail INCHANGÉ : enregistrement DIRECT (ni aperçu, ni annulation)', () => {
  it('éditer un champ sur le même rail (e-mail → e-mail) → PATCH direct vers /contact, aucun aperçu ni annuler-lot', async () => {
    const onEnregistre = vi.fn(); const onFerme = vi.fn();
    const appels = await monterCarte(BASE_EMAIL, { onEnregistre, onFerme });
    await saisir('Adresse e-mail', 'nouveau@paris.fr'); // on reste sur le rail e-mail
    await clic(boutonTexte('Enregistrer')!);
    expect(aperçus(appels)).toHaveLength(0);        // rail inchangé → on ne consulte MÊME PAS l'aperçu
    expect(annulations(appels)).toHaveLength(0);
    const p = patchs(appels);
    expect(p).toHaveLength(1);
    expect(p[0].url).toBe('/api/admin/permis/contact'); // CHEMIN EXISTANT, aucun nouvel endpoint
    expect(p[0].body).toMatchObject({ codeInsee: '75056', canal: 'email', email: 'nouveau@paris.fr' });
    expect(onEnregistre).toHaveBeenCalledTimes(1);
    expect(onFerme).toHaveBeenCalledTimes(1); // canal sur un rail → messageApresEnregistrement null → fermeture
  });

  it('la cible tactile du bouton « Enregistrer » est ≥ 44px (mobile-first)', async () => {
    await monterCarte(BASE_EMAIL, {});
    expect(boutonTexte('Enregistrer')!.style.minHeight).toBe('44px');
  });
});

describe('§B — changement de rail AVEC demandes non envoyées : avertir puis emprunter annuler-lot → PATCH', () => {
  it('e-mail → téléservice : avertissement au bon compte, PUIS annuler-lot(ids, autoriserPrete) AVANT le PATCH', async () => {
    const onEnregistre = vi.fn();
    const appels = await monterCarte(BASE_EMAIL, { onEnregistre, apercu: { ids: [11, 22, 33], nbDemandes: 3 } });
    await choisirCanal('formulaire');
    await saisir('URL de téléservice', 'https://paris.fr/urba');
    await clic(boutonTexte('Enregistrer')!);
    // 1) l'aperçu a été consulté et l'AVERTISSEMENT s'affiche avec le compte exact — rien n'est encore écrit
    expect(aperçus(appels)).toHaveLength(1);
    const alerte = alerteAnnulation();
    expect(alerte).toBeTruthy();
    expect(alerte!.textContent).toContain('3 demandes non envoyées');
    expect(annulations(appels)).toHaveLength(0);
    expect(patchs(appels)).toHaveLength(0);
    // 2) confirmation → annuler-lot (chemin existant, autoriserPrete) PUIS PATCH, dans CET ordre
    await clic(boutonTexte('Confirmer et enregistrer')!);
    const ann = annulations(appels); const p = patchs(appels);
    expect(ann).toHaveLength(1);
    expect(ann[0].body).toEqual({ ids: [11, 22, 33], autoriserPrete: true });
    expect(p).toHaveLength(1);
    expect(p[0].url).toBe('/api/admin/permis/contact');
    expect(p[0].body).toMatchObject({ canal: 'formulaire', urlFormulaire: 'https://paris.fr/urba' });
    expect(appels.indexOf(ann[0])).toBeLessThan(appels.indexOf(p[0])); // annulation AVANT l'écriture
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });

  it('la cible tactile du bouton « Confirmer et enregistrer » est ≥ 44px (mobile-first)', async () => {
    await monterCarte(BASE_EMAIL, { apercu: { ids: [1], nbDemandes: 1 } });
    await choisirCanal('formulaire');
    await saisir('URL de téléservice', 'https://paris.fr/urba');
    await clic(boutonTexte('Enregistrer')!);
    expect(boutonTexte('Confirmer et enregistrer')!.style.minHeight).toBe('44px');
  });

  it('sens INVERSE (téléservice → e-mail) : MÊME mécanisme (aucun verrou de sens) — singulier « 1 demande »', async () => {
    const appels = await monterCarte(BASE_TELE, { apercu: { ids: [7], nbDemandes: 1 } });
    await choisirCanal('email');
    await saisir('Adresse e-mail', 'urba@montreuil.fr');
    await clic(boutonTexte('Enregistrer')!);
    expect(alerteAnnulation()!.textContent).toContain('1 demande non envoyée'); // accord au singulier
    await clic(boutonTexte('Confirmer et enregistrer')!);
    expect(annulations(appels)[0].body).toEqual({ ids: [7], autoriserPrete: true });
    expect(patchs(appels)[0].body).toMatchObject({ canal: 'email', email: 'urba@montreuil.fr' });
  });

  it('« Annuler » l’avertissement n’écrit RIEN et redonne la main (le bouton « Enregistrer » revient)', async () => {
    const onEnregistre = vi.fn();
    const appels = await monterCarte(BASE_EMAIL, { onEnregistre, apercu: { ids: [11, 22, 33], nbDemandes: 3 } });
    await choisirCanal('formulaire');
    await saisir('URL de téléservice', 'https://paris.fr/urba');
    await clic(boutonTexte('Enregistrer')!);
    expect(alerteAnnulation()).toBeTruthy();
    await clic(boutonTexte('Annuler')!); // le « Annuler » de l'avertissement
    expect(annulations(appels)).toHaveLength(0);
    expect(patchs(appels)).toHaveLength(0);
    expect(onEnregistre).not.toHaveBeenCalled();
    expect(boutonTexte('Enregistrer')).toBeTruthy(); // on peut ré-enregistrer (allers-retours illimités)
  });
});

describe('§B — changement de rail SANS demande concernée : enregistrement DIRECT, sans avertissement', () => {
  it('inconnu → e-mail, 0 demande non envoyée → aperçu consulté mais PATCH direct, aucun annuler-lot ni avertissement', async () => {
    const onEnregistre = vi.fn();
    const appels = await monterCarte(BASE_INCONNU, { onEnregistre, apercu: { ids: [], nbDemandes: 0 } });
    await choisirCanal('email');
    await saisir('Adresse e-mail', 'urba@bobigny.fr');
    await clic(boutonTexte('Enregistrer')!);
    expect(aperçus(appels)).toHaveLength(1);      // rail changé → aperçu consulté…
    expect(alerteAnnulation()).toBeNull();        // …mais 0 demande → aucun avertissement
    expect(annulations(appels)).toHaveLength(0);
    expect(patchs(appels)).toHaveLength(1);
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });
});

describe('§B — refus CÔTÉ CLIENT d’un rail sans sa coordonnée obligatoire (aucune écriture)', () => {
  it('rail e-mail sans adresse → refus, aucun aperçu ni PATCH', async () => {
    const appels = await monterCarte(BASE_INCONNU, {});
    await choisirCanal('email'); // pas d'e-mail saisi
    await clic(boutonTexte('Enregistrer')!);
    expect(aperçus(appels)).toHaveLength(0);
    expect(patchs(appels)).toHaveLength(0);
    expect([...container.querySelectorAll('[role="alert"]')].some((n) => /Impossible d’enregistrer/.test(n.textContent ?? ''))).toBe(true);
  });

  it('rail téléservice sans URL → refus, aucun aperçu ni PATCH', async () => {
    const appels = await monterCarte(BASE_INCONNU, {});
    await choisirCanal('formulaire'); // pas d'URL saisie
    await clic(boutonTexte('Enregistrer')!);
    expect(aperçus(appels)).toHaveLength(0);
    expect(patchs(appels)).toHaveLength(0);
    expect([...container.querySelectorAll('[role="alert"]')].some((n) => /Impossible d’enregistrer/.test(n.textContent ?? ''))).toBe(true);
  });
});

// ── §C — le bloc « PRADA non adoptée » donne accès à la carte annuaire ─────────────────────────────────────────────────────
const ARB: ArbitrageAffiche = {
  codeInsee: '93047', communeNom: 'Montfermeil', pradaNom: 'Service CADA', pradaCourriel: 'cada@montfermeil.fr',
  contactCanal: 'email', contactEmail: 'urbanisme@montfermeil.fr', contactAdressePostale: null,
};
/** BaseCommune de Montfermeil, PRADA connue MAIS destinataire ≠ courriel PRADA → le bouton d'adoption s'affiche. */
const BASE_MONTFERMEIL: BaseCommune = {
  codeInsee: '93047', communeNom: 'Montfermeil', destCanal: 'email', destEmail: 'urbanisme@montfermeil.fr',
  destUrlFormulaire: null, destAdressePostale: null, destPradaCourriel: 'cada@montfermeil.fr', destPradaNom: 'Service CADA',
};

describe('§C — chaque ligne d’arbitrage OUVRE la carte annuaire', () => {
  it('EncartArbitrages : le bouton « Ouvrir la fiche » remonte le code INSEE de la BONNE commune', async () => {
    const onOuvrirCommune = vi.fn();
    await act(async () => { root.render(createElement(EncartArbitrages, { arbitrages: [ARB], ouvert: true, onToggle: vi.fn(), onOuvrirCommune })); });
    await clic(boutonTexte('Ouvrir la fiche')!);
    expect(onOuvrirCommune).toHaveBeenCalledWith('93047');
  });

  it('sans callback onOuvrirCommune (usages tiers), AUCUN bouton « Ouvrir la fiche » n’est rendu (ajout non intrusif)', async () => {
    await act(async () => { root.render(createElement(EncartArbitrages, { arbitrages: [ARB], ouvert: true, onToggle: vi.fn() })); });
    expect(boutonTexte('Ouvrir la fiche')).toBeUndefined();
  });

  it('BlocPrada : ouvrir la fiche depuis la ligne monte la carte annuaire, avec le bouton d’ADOPTION PRADA (raccourci conservé)', async () => {
    brancher({ base: BASE_MONTFERMEIL, prada: () => ({ arbitrages: [ARB], ambiguites: [], injoignables: [] }) });
    await act(async () => { root.render(createElement(BlocPrada)); });
    await vider(); // /prada + /communes
    await clic(boutonTexte(/PRADA non adoptée/)!); // déplier l'encart (replié par défaut)
    await clic(boutonTexte('Ouvrir la fiche')!);   // ouvrir la carte annuaire → GET /contact
    expect(container.querySelector('[role="dialog"]')).toBeTruthy(); // la carte est montée
    expect(boutonTexte(/Utiliser le courriel de la PRADA/)).toBeTruthy(); // l'adoption reste accessible DANS la carte
  });

  it('BlocPrada : après adoption, le bloc se RAFRAÎCHIT et la ligne qualifiée le quitte (sans reload manuel)', async () => {
    let nPrada = 0;
    // 1er chargement : Montfermeil listée ; après le version++ post-adoption : plus aucun arbitrage (le serveur strict la retire).
    const appels = brancher({ base: BASE_MONTFERMEIL, prada: () => { nPrada += 1; return { arbitrages: nPrada === 1 ? [ARB] : [], ambiguites: [], injoignables: [] }; } });
    await act(async () => { root.render(createElement(BlocPrada)); });
    await vider();
    await clic(boutonTexte(/PRADA non adoptée/)!);
    expect(container.textContent).toContain('Montfermeil'); // la ligne est là
    await clic(boutonTexte('Ouvrir la fiche')!);
    await clic(boutonTexte(/Utiliser le courriel de la PRADA/)!); // demande de confirmation d'adoption
    await clic(boutonTexte('Confirmer')!);                        // adopterPrada → PATCH → onEnregistre(version++) + onFerme
    await vider();
    // le bloc a re-sollicité /prada (≥ 2 fois) et la commune adoptée a disparu de l'affichage — aucun rechargement de page
    expect(appels.filter((a) => a.url.includes('/api/admin/permis/prada') && a.method === 'GET').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[role="dialog"]')).toBeNull(); // carte refermée
    expect(container.textContent).not.toContain('Montfermeil');
  });
});
