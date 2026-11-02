// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { monCa, type Moi } from '../../../../lib/mon-espace/mesAffaires';
import { statistiquesMonEspace } from '../../../../lib/mon-espace/statistiques';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE (Arno, 02/11/2026) — la liste sous le graphique, dans le VRAI écran (routes simulées, données cohérentes : les statistiques sont
 * celles de la vraie fonction sur les mêmes ventes) : « Vendus » puis « Compromis » ; le total des Vendus = la carte « CA », leur nombre = « Ventes »
 * (HT et TTC) ; un clic sur un mois du graphique → la liste suit ; ma part, jamais une affaire d'un autre ; « Aucune affaire sur cette période. »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-02';
const base = (o: Partial<Vente>): Vente => ({ id: 0, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 3, dateCompromis: null,
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const partie = (sorte: string, compteId: number, negociateur: string, pourcentage: number) => ({ sorte, compteId, negociateur, societe: 'criterimmo', nom: null, coordonnees: null, pourcentage, montantHt: null });
const dossier = (e: [number, string], s: [number, string]) => ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: e[0], nom: e[1] }, sortie: { id: s[0], nom: s[1] }, apporteurId: null, personnes: [] });
const seule = (o: Partial<Vente>) => base({ repartition: { retroApporteurTtc: 0, parties: [partie('entree_sortie', 5, 'Léa', 100)] } as Vente['repartition'], dossier: dossier([5, 'Léa'], [5, 'Léa']), ...o });
const VENTES: Vente[] = [
  base({ id: 1, libelle: 'PARTAGÉE', honorairesTtc: 12345.67, mois: 3, repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Léa', 60), partie('sortie', 7, 'Marc', 40)] } as Vente['repartition'], dossier: dossier([5, 'Léa'], [7, 'Marc']) }),
  seule({ id: 2, libelle: 'JUIN', honorairesTtc: 6000.01, mois: 6 }),
  seule({ id: 5, libelle: 'COMPROMIS SEPT', honorairesTtc: 9000.09, statut: 'compromis', annee: 2027, mois: null, dateCompromis: '2026-09-15' }),
  base({ id: 7, libelle: 'DE MARC', honorairesTtc: 7777.77, mois: 6, repartition: { retroApporteurTtc: 0, parties: [partie('entree_sortie', 7, 'Marc', 100)] } as Vente['repartition'], dossier: dossier([7, 'Marc'], [7, 'Marc']) }),
];
const LEA: Moi = { compteId: 5, libelles: new Set(['Léa']) };
const ventesLea = VENTES.filter((v) => v.id !== 7).map((v) => { const a = monCa([v], LEA); return { ...v, mesCotes: ['entree'], commissionsRetirees: false, maPart: { ca: a, net: a } }; });
const reponse = () => ({ disponible: true, aujourdhui: JOUR, titulaire: { id: 5, prenom: 'Léa', administrateur: false }, ventes: ventesLea, retrocessions: [],
  compteurs: { compromis: { nb: 1, ids: [5], ca: monCa([VENTES[2]], LEA) }, actees: { nb: 2, ids: [1, 2], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] },
  statistiques: statistiquesMonEspace(VENTES, LEA, JOUR) });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: '#0' });
    if (u.startsWith(URL_MES_AFFAIRES)) return ok(reponse());
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { container.querySelector(sel)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const euros = (t: string): number => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
const ouvrir = async (vue: 'mois' | 'annee') => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer(`[data-vue="${vue}"]`); };
const ids = (g: string) => [...container.querySelectorAll(`[data-groupe-periode="${g}"] [data-ma-vente]`)].map((e) => e.getAttribute('data-ma-vente'));

describe('🔴 la liste sous le graphique', () => {
  it('« Mois », Année : Vendus (total = carte « CA », nombre = « Ventes ») ; décision 15 : pas de groupe Compromis ; ma part ; jamais l’affaire de Marc', async () => {
    await ouvrir('mois');
    expect(ids('vendus')).toEqual(['2', '1']);
    expect(euros(texte('[data-total-groupe="vendus"]'))).toBe(euros(texte('[data-valeur-tuile="ca"]')));
    expect(String(ids('vendus').length)).toBe(texte('[data-valeur-tuile="nombre"]'));
    expect(container.querySelector('[data-groupe-periode="compromis"]')).toBeNull();
    expect(container.querySelector('[data-liste-periode] [data-ma-vente="7"]')).toBeNull();
    expect(texte('[data-liste-periode] [data-ma-vente="1"] [data-carte="part-mot"]')).toBe('ma part');
  });
  it('TTC : le total suit, toujours égal à la carte', async () => {
    await ouvrir('mois');
    await cliquer('[data-afficher="ttc"]');
    expect(euros(texte('[data-total-groupe="vendus"]'))).toBe(euros(texte('[data-valeur-tuile="ca"]')));
  });
  it('un clic sur un mois du graphique : la sélection change, la liste suit (juin : la vente de juin ; septembre : aucun vendu)', async () => {
    await ouvrir('mois');
    await cliquer('[data-decouper="mois"]');
    await cliquer('[data-bloc="histogramme-mois"] [data-barre-mois="6"]');
    expect(ids('vendus')).toEqual(['2']);
    expect(euros(texte('[data-total-groupe="vendus"]'))).toBe(euros(texte('[data-valeur-tuile="ca"]')));
    await cliquer('[data-bloc="histogramme-mois"] [data-barre-mois="9"]');
    expect(texte('[data-liste-periode-vide]')).toBe('Aucune affaire sur cette période.');
  });
  it('« Année(s) » : la même liste sous « Année par année » (Vendus + Compromis), total = la carte « CA » de l’année', async () => {
    await ouvrir('annee');
    expect(ids('vendus')).toEqual(['2', '1']);
    expect(ids('compromis')).toEqual(['5']);
    expect(euros(texte('[data-total-groupe="vendus"]'))).toBe(euros(texte('[data-valeur-tuile="ca-annee"]')));
  });
  it('décision 14 : sous la liste, « Par apporteur d’affaires » (vue perso : pas de « Par négociateur ») ; mêmes filtres', async () => {
    await ouvrir('mois');
    const liste = container.querySelector('[data-liste-periode]')!;
    const apporteurs = container.querySelector('[data-bloc="mes-apporteurs"]')!;
    expect(apporteurs).not.toBeNull();
    expect(liste.compareDocumentPosition(apporteurs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(texte('[data-bloc="mes-apporteurs"] h3')).toBe('Par apporteur d’affaires — année 2026');
    expect(container.querySelector('[data-bloc="negociateurs-periode-mon-espace"]')).toBeNull();
  });
});
