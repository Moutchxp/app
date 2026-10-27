// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccueilTransaction, EcranGlobal, EcranSociete } from './EcransTransaction';
import type { DonneesSociete, LigneVente, Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 TUILE « TRANSACTION » (27/10/2026) — les vrais écrans, route simulée (rien n'est écrit) : l'accueil et ses trois cases, le mois
 * d'une société (tuiles, ventes, résultat de l'agence, rétrocession « à répartir » et son rattachement), l'année (toute l'histoire),
 * le CA global (vente + location + gestion, la gestion saisie au mois).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ligne = (negociateur: string, role: LigneVente['role'], montantTtc: number | null): LigneVente => ({
  id: Math.random(), negociateur, role, montantTtc, nature: 'vente', compte: role !== 'negociateur', origine: 'import', sourceFichier: 'TABLEAU DE BORD MACJ 2025.xlsx',
  sourceOnglet: negociateur, sourceLigne: 30, note: null });
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `V${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2025, mois: 1,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: 'TABLEAU DE BORD MACJ 2025.xlsx', sourceOnglet: 'MYLENE', sourceLigne: id, lignes: [], ...o });
const donnees: DonneesSociete = {
  disponible: true, societe: 'macj', aujourdhui: '2025-10-27',
  ventes: [
    vente(1, { libelle: 'GAVEZ DE CAMPOS/ ASMAR', honorairesTtc: 11025, lignes: [ligne('MYLENE', 'negociateur', 3215), ligne('CEDRIC', 'part', 7810)] }),
    vente(2, { libelle: 'LOMBARDI FORT', honorairesTtc: 16275, mois: 2 }),
    vente(3, { libelle: 'CALMET', honorairesTtc: 25000, statut: 'compromis', mois: null }),
    vente(4, { libelle: 'SANS MOIS', honorairesTtc: 6000, mois: null }),
    vente(5, { libelle: 'AN PASSÉ', honorairesTtc: 6000, annee: 2024, mois: 1 }),
  ],
  retrocessions: [{ id: 9, societe: 'macj', annee: 2025, mois: 1, negociateur: 'MYLENE', montantTtc: 1200, apporteur: null, venteId: null, libelle: '=1200', origine: 'import',
    sourceOnglet: 'MYLENE', sourceCellule: 'D3' }],
  aRattacher: [],
};
const donneesGlobal = { disponible: true, aujourdhui: '2025-10-27', location: { '2025-01': 9296.05 }, gestion: [{ id: 1, annee: 2025, mois: 1, nbLots: null, honorairesHt: 14127, adhocHt: 6437, salarieHt: null, resteHt: 7690, note: null, origine: 'import' }],
  ventes: donnees.ventes.map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois, honorairesTtc: v.honorairesTtc, libelle: v.libelle })) };
let container: HTMLDivElement;
let root: Root;
let posts: unknown[];
beforeEach(() => {
  posts = [];
  window.history.replaceState(null, '', '/?annee=2025&mois=1');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  donneesGlobal.ventes = donnees.ventes.map((v) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois, honorairesTtc: v.honorairesTtc, libelle: v.libelle }));
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: null }) }; }
    const data = String(url).includes('vue=global') ? donneesGlobal : String(url).includes('vue=journal') ? [] : donnees;
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data }) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-10-27T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';

describe('l’accueil de la tuile', () => {
  it('trois cases : CRITERIMMO, MACJ, CA global', async () => {
    await act(async () => { root.render(createElement(AccueilTransaction)); });
    expect([...container.querySelectorAll('[data-tuile-transaction]')].map((a) => a.getAttribute('href')))
      .toEqual(['/admin/transaction/criterimmo', '/admin/transaction/macj', '/admin/transaction/global']);
  });
});

describe('une société — le mois', () => {
  it('le CA HT du mois, ses ventes, le résultat de l’agence ; le compromis et le « mois à confirmer » hors du mois', async () => {
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-valeur')).toBe('9 187,50 €');
    expect(texte('[data-tuile="ca-mois"] .tdb-tuile-n1')).toContain('5 000,00 € en 2024');
    expect([...container.querySelectorAll('[data-bloc="ventes-mois"] [data-vente]')].map((x) => x.getAttribute('data-vente'))).toEqual(['1']);
    // 11 025 − 1 200 (rétrocession du mois) − 3 215 (paye de Mylène), ÷ 1,2.
    expect(texte('[data-reste-agence]')).toBe('5 508,33 €');
    expect(texte('[data-tuile="compromis"] .tdb-tuile-valeur')).toBe('20 833,33 €');
  });
  it('D5 — la rétrocession « à répartir » se rattache à la main à la vente du négociateur et du mois', async () => {
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect(container.querySelector('[data-a-repartir]')).not.toBeNull();
    const champ = container.querySelector('[data-rattacher="9"]') as HTMLElement;
    await act(async () => { champ.click(); });
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.startsWith('GAVEZ')) as HTMLElement;
    expect(option).toBeDefined();
    await act(async () => { option.click(); });
    await calmer();
    expect(posts).toContainEqual({ action: 'retro-rattacher', id: 9, venteId: 1 });
  });
});

describe('une société — l’année', () => {
  it('toute l’histoire, année par année ; les « mois à confirmer » comptent dans l’année', async () => {
    window.history.replaceState(null, '', '/?vue=annee');
    await act(async () => { root.render(createElement(EcranSociete, { societe: 'macj' })); });
    await calmer();
    expect([...container.querySelectorAll('[data-annee-histoire]')].map((x) => x.getAttribute('data-annee-histoire'))).toEqual(['2024', '2025']);
    const l2025 = container.querySelector('[data-annee-histoire="2025"]')!;
    expect(l2025.querySelector('[data-mot="CA HT"]')?.textContent?.replace(/\s/g, ' ')).toBe('27 750,00 €');
    expect(l2025.querySelector('[data-mot="dont mois à confirmer"]')?.textContent?.replace(/\s/g, ' ')).toBe('5 000,00 €');
  });
});

describe('le CA global', () => {
  it('vente MACJ + location + gestion, mois par mois ; CRITERIMMO porte la location et la gestion', async () => {
    await act(async () => { root.render(createElement(EcranGlobal)); });
    await calmer();
    const janvier = container.querySelector('[data-mois-global="1"]')!;
    const cel = (mot: string): string => janvier.querySelector(`[data-mot="${mot}"]`)?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(cel('Vente MACJ')).toBe('9 187,50 €');
    expect(cel('Location')).toBe('9 296,05 €');
    expect(cel('Gestion')).toBe('14 127,00 €');
    expect(cel('Total')).toBe('32 610,55 €');
    expect(texte('[data-tuile="previsionnel"] .tdb-tuile-valeur')).toBe('20 833,33 €');
    expect(container.querySelector('[data-mois-a-confirmer]')).not.toBeNull();
  });
});
