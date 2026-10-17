// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';
import { TITRE_PAGE_TACHES } from '../../../../lib/gestion/ecran';

/**
 * ══ 🔴🔴 LOT GESTION-TITRE-TACHES (accord explicite d'Arno, 17/10/2026, LIMITÉ À LA PAGE TÂCHES) ══════════════════════
 * Sur `?ecran=taches`, plus rien au-dessus du cadre des tâches : ni « Gestion » et sa phrase, ni « Dernière relève… »
 * et ses quatre boutons, ni l'alerte « La relève automatique est arrêtée… », ni « Copie des pièces vers le Drive à
 * reprendre ». À la place : « Tableau de bord des tâches », au niveau et dans le style du titre « Gestion ». Le cadre
 * (bouton « ← Boîte » compris) ne change pas, et les autres écrans gardent exactement ce qu'ils avaient.
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
let appels: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    appels.push(u);
    if (u.includes('/empreinte')) return { ok: true, json: async () => ({ messageMax: 1 }) } as unknown as Response;
    if (u.includes('/taches')) return { ok: true, json: async () => ({ taches: [], collaborateurs: [], evenements: [] }) } as unknown as Response;
    if (u.includes('/boite')) return { ok: true, json: async () => ({ lignes: [], suivant: null, total: null, comptes: {} }) } as unknown as Response;
    if (u.includes('/syndics')) return { ok: true, json: async () => ({ syndics: [] }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
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
const texte = () => container.textContent ?? '';
const MASQUE_TITRE = '.gst-page > .svv-page-head:not(.gst-titre-taches){display:none}';

describe('🔴 page Tâches : le titre « Tableau de bord des tâches », plus aucun élément du bloc d’en-tête', () => {
  it('le titre, au niveau et dans le style de « Gestion » (h1.svv-page-title dans un en-tête de page)', async () => {
    await monter('?ecran=taches');
    expect(TITRE_PAGE_TACHES).toBe('Tableau de bord des tâches');
    const h1 = container.querySelector('header.svv-page-head.gst-titre-taches > .svv-page-head-ligne > h1.svv-page-title');
    expect(h1?.textContent).toBe('Tableau de bord des tâches');
    // « Gestion » et sa phrase (rendus par la page serveur) sont masqués par la feuille — notre titre, lui, non.
    expect(styles()).toContain(MASQUE_TITRE);
  });
  it('ni « Dernière relève… », ni ses quatre boutons, ni l’alerte, ni la ligne Drive', async () => {
    await monter('?ecran=taches');
    expect(container.querySelector('.gst-bandeau')).toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire', 'À rattacher']) expect(boutons()).not.toContain(mot);
    expect(texte()).not.toMatch(/Dernière relève|messages en base/);
    expect(texte()).not.toMatch(/relève automatique est arrêtée/i);
    expect(texte()).not.toContain('Copie des pièces vers le Drive à reprendre');
    expect(container.querySelector('.gst-veille')).toBeNull();
  });
  it('le cadre des tâches est là, bouton « ← Boîte » compris', async () => {
    await monter('?ecran=taches');
    expect(container.querySelector('.pe-taches')).not.toBeNull();
    expect(boutons()).toContain('← Boîte');
  });
  it('le statut de relève n’est plus mesuré sur cette page (aucun battement)', async () => {
    await monter('?ecran=taches');
    expect(appels.some((u) => u.includes('/empreinte'))).toBe(false);
  });
});

describe('🔴 les autres écrans ne changent pas', () => {
  it('page Boîte : aucune règle ni titre du lot, l’alerte de relève reste', async () => {
    await monter('');
    expect(styles()).not.toContain(MASQUE_TITRE);
    expect(container.querySelector('.gst-titre-taches')).toBeNull();
    expect(texte()).toMatch(/relève automatique est arrêtée/i);
    expect(appels.some((u) => u.includes('/empreinte'))).toBe(true);
  });
  it('un écran qui portait tout le bloc (Syndics) le garde : relève, quatre boutons, alerte, ligne Drive, titre', async () => {
    await monter('?ecran=syndics');
    expect(styles()).not.toContain(MASQUE_TITRE);
    expect(container.querySelector('.gst-titre-taches')).toBeNull();
    expect(container.querySelector('.gst-bandeau')).not.toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire', 'À rattacher']) expect(boutons()).toContain(mot);
    expect(texte()).toMatch(/relève automatique est arrêtée/i);
    expect(texte()).toContain('Copie des pièces vers le Drive à reprendre');
  });
});
