// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';

/**
 * ══ 🔴🔴 Arno (26/11/2026, 11h36, retrait accordé LIMITÉ À L'ÉCRAN « SYNDICS » de la Gestion) — « il faut supprimer le bloc d'en-tête dans cette page » ══
 * Même traitement que Copropriétés et « 20 % à restituer » : sur `?ecran=syndics`, ni « Gestion » et sa phrase (page serveur → feuille), ni
 * « Dernière relève… » et ses boutons (Relever maintenant, Rafraîchir, Annuaire, À rattacher), ni « Relève automatique… », ni « Copie des pièces
 * vers le Drive… ». La page commence par « ← Boîte · Syndics (N) · + Ajouter un syndic ». La boîte garde tout le bloc et tous ces boutons.
 * Le VRAI écran, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const il = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
// La relève arrêtée depuis 5 h (→ l'alerte rouge) et une copie arrêtée volontairement (→ la ligne « à reprendre »).
const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0,
  evenements: [], evenementsTotal: 0, evenementsOuverts: 0, messagesCaptures: 56000, messagesExclus: 120,
  derniereReleveLe: il(5), dernierMailLe: il(5),
  veille: { derniereLe: il(5), resultat: 'ok', erreur: null, intervalleS: 60, toleranceIntervalles: 10 },
  suite: { resultat: null, detail: null, ms: null },
  copie: { derniere: { id: 4, resultat: 'arret', termineLe: il(30), motifArret: 'limite atteinte', echecs: 0, piecesCopiees: 10, vivant: false }, restantes: 1234, motifs: [] },
};
let container: HTMLDivElement;
let root: Root;
let ecrits: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecrits = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') !== 'GET') ecrits.push(u);
    const rep = (j: unknown) => ({ ok: true, json: async () => j }) as unknown as Response;
    if (u.includes('/empreinte')) return rep({ messageMax: 1 });
    if (u.includes('vingtPourcent=1')) return rep({ etat: 'ok', data: { aujourdhui: '2026-11-25', lignes: [], manquantes: [], faites: [] } });
    if (u.includes('/coproprietes/liste')) return rep({ etat: 'ok', data: { lignes: [] } });
    if (u.includes('/coproprietes/officielles')) return rep({ etat: 'ok', data: { lignes: {} } });
    if (u.includes('/coproprietes/regroupement')) return rep({ etat: 'ok', data: { groupes: [] } });
    if (u.includes('/boite')) return rep({ lignes: [], suivant: null, total: null, comptes: {} });
    if (u.includes('/syndics')) return rep({ syndics: [] });
    return rep(ECRAN);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (adresse: string) => {
  window.history.replaceState(null, '', `/admin/gestion${adresse}`);
  await act(async () => { root.render(createElement(GestionVue)); });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
const styles = () => [...container.querySelectorAll('style')].map((s) => s.textContent ?? '');
// le texte À L'ÉCRAN : sans le contenu des feuilles de style (une règle CSS peut citer « relève automatique » dans un commentaire)
const texte = () => { const c = container.cloneNode(true) as HTMLElement; c.querySelectorAll('style').forEach((x) => x.remove()); return c.textContent ?? ''; };
const MASQUE_EN_TETE = '.gst-page > .svv-page-head{display:none}';

describe('🔴 écran « Syndics » de la Gestion : plus aucun élément du bloc d’en-tête', () => {
  it('« Gestion » et sa phrase (page serveur) masqués par la feuille', async () => {
    await monter('?ecran=syndics');
    expect(styles()).toContain(MASQUE_EN_TETE);
  });
  it('ni « Dernière relève… », ni ses boutons (Relever maintenant, Rafraîchir, Annuaire, À rattacher), ni « Relève automatique… », ni la ligne Drive', async () => {
    await monter('?ecran=syndics');
    expect(container.querySelector('.gst-bandeau')).toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire', 'À rattacher']) expect(boutons()).not.toContain(mot);
    expect(texte()).not.toMatch(/Dernière relève|messages en base/);
    expect(texte()).not.toMatch(/relève automatique/i);
    expect(texte()).not.toContain('Copie des pièces vers le Drive');
    expect(container.querySelector('.gst-veille')).toBeNull();
  });
  it('la page commence par « ← Boîte · Syndics (N) · + Ajouter un syndic » ; rien n’est écrit', async () => {
    await monter('?ecran=syndics');
    const tete = container.querySelector('.esy .esy-tete')!;
    const enfants = [...tete.children].map((x) => (x.textContent ?? '').trim());
    expect([enfants[0], enfants[1].replace(/\s*\d+$/, ''), enfants[2]]).toEqual(['← Boîte', 'Syndics', '+ Ajouter un syndic']);
    expect(tete.closest('.esy')?.previousElementSibling?.matches('.gst-bandeau, .gst-veille') ?? false).toBe(false);
    // rien du bloc d'en-tête AVANT l'écran
    const avant = [...container.querySelectorAll('.gst-bandeau, .gst-veille')].filter((x) => x.compareDocumentPosition(tete) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(avant).toEqual([]);
    expect(ecrits).toEqual([]);
  });
});

describe('🔴 la boîte et les autres écrans ne changent pas', () => {
  it('la boîte (accueil) : aucune feuille du lot, l’alerte de relève reste', async () => {
    await monter('');
    expect(styles()).not.toContain(MASQUE_EN_TETE);
    expect(texte()).toMatch(/relève automatique est arrêtée/i);
  });
  it('la boîte en plein écran : l’alerte de relève reste', async () => {
    await monter('?ecran=boite');
    expect(styles()).not.toContain(MASQUE_EN_TETE);
    expect(texte()).toMatch(/relève automatique est arrêtée/i);
  });
  it.each(['a_trier', 'adresses_a_verifier'])('« %s » garde tout le bloc : relève, boutons, alerte, ligne Drive', async (e) => {
    await monter(`?ecran=${e}`);
    expect(styles()).not.toContain(MASQUE_EN_TETE);
    expect(container.querySelector('.gst-bandeau')).not.toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire']) expect(boutons()).toContain(mot);
    expect(texte()).toMatch(/relève automatique est arrêtée/i);
    expect(texte()).toContain('Copie des pièces vers le Drive à reprendre');
  });
  it.each(['coproprietes', 'vingt_pourcent'])('« %s » garde son propre retrait, inchangé', async (e) => {
    await monter(`?ecran=${e}`);
    expect(styles()).toContain(MASQUE_EN_TETE);
    expect(container.querySelector('.gst-bandeau')).toBeNull();
  });
});
