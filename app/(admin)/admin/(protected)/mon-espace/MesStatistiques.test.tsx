// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_MES_AFFAIRES } from './MesCompteurs';

/**
 * 🔴 MON ESPACE, LOT 8 — l'onglet « Mes statistiques » dans le VRAI écran de « Mon espace », route simulée (rien n'est écrit). Les chiffres viennent
 * du serveur (le filtre du lot 3) ; l'écran les compose : mon CA et son N−1 sur la même période, mes ventes, le prévisionnel À PART et la
 * projection, le graphique mois par mois (barres N, N−1 ; Cumul), par apporteur ; HT | TTC ; Mois / Période / Année / Tout. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const z = { htC: 0, ttcC: 0 };
const m = (ht: number) => ({ htC: ht, ttcC: Math.round(ht * 1.2) });
const mois12 = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => (vals[i + 1] === undefined ? z : m(vals[i + 1])));
const nb12 = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => vals[i + 1] ?? 0);
const vendue = { id: 2, societe: 'criterimmo', libelle: 'JUIN', honorairesTtc: 6000, statut: 'vendue', annee: 2026, mois: 6, dateCompromis: null, apporteur: 'DEBLOIS', note: null,
  origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, mesCotes: ['entree'], commissionsRetirees: false, version: 3 };
let donnees: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  donnees = { disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: false }, ventes: [vendue],
    compteurs: { compromis: { nb: 1, ids: [4], ca: m(750000) }, actees: { nb: 2, ids: [1, 2], annee: 2026, ca: m(1300000) }, parAnnee: [] },
    statistiques: { annees: [
      { annee: 2025, ca: mois12({ 3: 300000 }), nb: nb12({ 3: 1 }), aConfirmer: z, aConfirmerNb: 0 },
      { annee: 2026, ca: mois12({ 3: 600000, 6: 500000 }), nb: nb12({ 3: 1, 6: 1 }), aConfirmer: m(200000), aConfirmerNb: 1 }] },
    retrocessions: [{ id: 1, societe: 'criterimmo', annee: 2026, mois: 6, negociateur: 'Léa', montantTtc: 600, apporteur: 'DEBLOIS', venteId: 2 }] };
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => (String(url).startsWith(URL_MES_AFFAIRES)
    ? { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } : { ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const choisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLSelectElement;
  await act(async () => { el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); }); await calmer();
};
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-onglet-mon-espace="statistiques"]'); };

describe('🔴 « Mes statistiques »', () => {
  it('Année 2026 : mon CA (la vente au mois à confirmer comprise) et N−1 sur la même période, en € et en % ; mes ventes', async () => {
    await ouvrir();
    expect(texte('[data-valeur-ca]')).toBe('13 000 € HT');
    expect(texte('[data-n1-ca]')).toBe('2025, même période : 3 000 € HT — +10 000 € (+333,3 %)');
    expect([texte('[data-valeur-nb]'), texte('[data-n1-nb]')]).toEqual(['3', '2025, même période : 1']);
  });
  it('le prévisionnel À PART (mes compromis en cours) ; la projection = acté + prévisionnel', async () => {
    await ouvrir();
    expect(texte('[data-valeur-previsionnel]')).toBe('7 500 € HT');
    expect(texte('[data-projection]')).toBe('Projection 2026 : 13 000 € HT acté + 7 500 € HT prévisionnel = 20 500 € HT');
  });
  it('HT | TTC : la bascule de l’espace', async () => {
    await ouvrir();
    await cliquer('[data-afficher="ttc"]');
    expect(texte('[data-valeur-ca]')).toBe('15 600 € TTC');
  });
  it('Mois (mars) ; Période (février → juin) ; Tout (sans N−1, sans graphique)', async () => {
    await ouvrir();
    await cliquer('[data-mode-stats="mois"]');
    await choisir('[data-mois-stats]', '3');
    expect([texte('[data-valeur-ca]'), texte('[data-n1-ca]')]).toEqual(['6 000 € HT', '2025, même période : 3 000 € HT — +3 000 € (+100 %)']);
    await cliquer('[data-mode-stats="periode"]');
    await choisir('[data-periode-de]', '2');
    await choisir('[data-periode-a]', '6');
    expect(texte('[data-valeur-ca]')).toBe('11 000 € HT');
    await cliquer('[data-mode-stats="tout"]');
    expect([texte('[data-valeur-ca]'), container.querySelector('[data-n1-ca]'), container.querySelector('[data-bloc="mes-stats-mois"]')]).toEqual(['16 000 € HT', null, null]);
  });
  it('le graphique mois par mois : 12 barres, N et N−1 ; les mois soulignés (Année : jusqu’à novembre) ; Cumul : la courbe', async () => {
    await ouvrir();
    const bloc = container.querySelector('[data-bloc="mes-stats-mois"]')!;
    expect(bloc.querySelectorAll('[data-barre-mois]').length).toBeGreaterThanOrEqual(12);
    expect(bloc.getAttribute('data-periode-graphe')).toBe('1,2,3,4,5,6,7,8,9,10,11');
    expect(texte('[data-a-confirmer]')).toBe('Dont 1 vente au mois à confirmer (2 000 € HT) : comptée dans l’année, dans aucun mois.');
    await act(async () => { (bloc.querySelector('[data-histo-entete] button') as HTMLElement).click(); }); await calmer();
    expect(container.querySelector('[data-bloc="mes-stats-mois"] [data-mois-cumul], [data-bloc="mes-stats-mois"] svg')).not.toBeNull();
  });
  it('par apporteur : DEBLOIS — une vente, son CA, sa rétrocession', async () => {
    await ouvrir();
    expect(texte('[data-apporteur="DEBLOIS"]')).toBe('DEBLOIS15 000 € HT500 € HT');
  });
  it('un compte sans aucune vente : zéro partout, sans erreur', async () => {
    donnees = { ...donnees, ventes: [], retrocessions: [], compteurs: { compromis: { nb: 0, ids: [], ca: z }, actees: { nb: 0, ids: [], annee: 2026, ca: z }, parAnnee: [] },
      statistiques: { annees: [{ annee: 2025, ca: mois12({}), nb: nb12({}), aConfirmer: z, aConfirmerNb: 0 }, { annee: 2026, ca: mois12({}), nb: nb12({}), aConfirmer: z, aConfirmerNb: 0 }] } };
    await ouvrir();
    expect([texte('[data-valeur-ca]'), texte('[data-valeur-previsionnel]'), texte('[data-apporteurs-vide]')])
      .toEqual(['0 € HT', '0 € HT', 'Aucune rétrocession d’apporteur sur vos ventes de la période.']);
  });
});
