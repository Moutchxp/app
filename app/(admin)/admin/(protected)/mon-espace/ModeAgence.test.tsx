// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { compteursAgence, statistiquesAgence } from '../../../../lib/mon-espace/agence';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE, LOT 10 — le MODE AGENCE dans le VRAI écran, routes simulées (rien n'est écrit) : le sélecteur pour un administrateur seulement ;
 * « Agence : CRITERIMMO / MACJ / FUSION » lit `?agence=…` (et l'empreinte de la structure) ; compteurs, onglets, filtre « Négociateur », tri ;
 * la carte complète (les commissions des deux côtés) ; « Statistiques » : le CA de la structure et le bloc par négociateur. Données fictives ;
 * les chiffres du serveur sont ceux de `agence.ts` (le Suivi CA), calculés ici sur les mêmes ventes.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-02';
const ligne = (id: number, negociateur: string, montantTtc: number) => ({ id, negociateur, role: 'negociateur' as const, montantTtc, nature: 'vente' as const, compte: true,
  origine: 'import' as const, sourceFichier: null, sourceOnglet: negociateur, sourceLigne: id, note: null });
const vente = (id: number, o: Partial<Vente>): Vente => ({ id, societe: 'macj', libelle: `AFFAIRE ${id}`, honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: id, lignes: [], double: null, version: id, ...o });
const VENTES = [
  vente(1, { statut: 'compromis', mois: null, dateCompromis: '2026-10-01', honorairesTtc: 6000, lignes: [ligne(1, 'MYLENE', 900)] }),
  vente(2, { statut: 'compromis', mois: null, dateCompromis: '2026-09-01', honorairesTtc: 9000, lignes: [ligne(2, 'CEDRIC', 1300)] }),
  vente(3, { honorairesTtc: 12000, lignes: [ligne(3, 'MYLENE', 2000)] }),
];
const dAgence = { societe: 'macj' as const, ventes: VENTES, retrocessions: [], statutsNegociateurs: {} };
const agenceMacj = () => ({ disponible: true, aujourdhui: JOUR, titulaire: { id: 1, prenom: 'Arno', administrateur: true },
  ventes: VENTES.map((v) => ({ ...v, mesCotes: [], commissionsRetirees: false })), compteurs: compteursAgence(dAgence, JOUR), statistiques: statistiquesAgence(dAgence, JOUR),
  retrocessions: [], statutsNegociateurs: {}, nomsNegociateurs: { MYLENE: 'Mylène DUPONT', CEDRIC: 'Cédric MARTIN' }, agence: { cle: 'macj', societe: 'macj' } });
const perso = (administrateur: boolean) => ({ disponible: true, aujourdhui: JOUR, titulaire: { id: 1, prenom: 'Arno', administrateur }, ventes: [],
  compteurs: { compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, actees: { nb: 0, ids: [], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] }, retrocessions: [] });
let urls: string[];
let admin: boolean;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  urls = []; admin = true;
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url); urls.push(u);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: u.includes('agence=') ? '1,2,3#3' : '#0' });
    if (u === `${URL_MES_AFFAIRES}?agence=macj`) return ok(agenceMacj());
    if (u.startsWith(`${URL_MES_AFFAIRES}?agence=`)) return ok({ ...agenceMacj(), agence: { cle: u.split('=')[1], societe: null } });
    if (u.startsWith(URL_MES_AFFAIRES)) return ok(perso(admin));
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const choisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLSelectElement;
  await act(async () => { el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); }); await calmer();
};
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); };
const cartes = () => [...container.querySelectorAll('[data-ma-vente]')].map((e) => e.getAttribute('data-ma-vente'));

describe('🔴 le mode agence', () => {
  it('un collaborateur : aucun sélecteur', async () => {
    admin = false;
    await ouvrir();
    expect(container.querySelector('[data-selecteur-espace]')).toBeNull();
  });
  it('un administrateur : « Mon espace » par défaut ; les trois structures proposées', async () => {
    await ouvrir();
    expect([...container.querySelectorAll('[data-espace]')].map((b) => b.getAttribute('data-espace'))).toEqual(['moi', 'criterimmo', 'macj', 'tous']);
    expect(container.querySelector('[data-espace="moi"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(urls.filter((u) => u.startsWith(URL_MES_AFFAIRES))).toEqual([URL_MES_AFFAIRES]);
  });
  it('MACJ : la structure lue (?agence=macj), ses compteurs et ses onglets ; l’empreinte de la structure', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    expect(urls).toContain(`${URL_MES_AFFAIRES}?agence=macj`);
    expect(texte('[data-compteur="compromis"]')).toContain('Compromis en cours — MACJ');
    expect(texte('[data-compteur="compromis"]')).toContain('2 compromis');
    expect(texte('[data-compteur="actees"]')).toContain('10 000 € HT');
    expect(texte('[data-onglet-mon-espace="ventes"]')).toBe('Ventes');
    expect(texte('[data-note-ca]')).toContain('calculé comme dans le Suivi CA');
    expect(cartes()).toEqual(['1', '2']);
  });
  it('les compromis : filtre « Négociateur » (une personne) et tri (CA décroissant)', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    await choisir('[data-filtre-negociateur]', 'Cédric MARTIN');
    expect(cartes()).toEqual(['2']);
    await choisir('[data-filtre-negociateur]', '');
    await choisir('[data-tri-compromis]', 'ca-desc');
    expect(cartes()).toEqual(['2', '1']);
  });
  it('la carte complète : les commissions des deux côtés visibles (pas de vue réduite)', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    expect(container.querySelectorAll('[data-nego-com]').length).toBeGreaterThanOrEqual(2);
  });
  it('« Statistiques » : le CA de la structure (somme des cartes) et le bloc par négociateur', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    await cliquer('[data-onglet-mon-espace="statistiques"]');
    expect(texte('[data-carte-stats="ca"] h3')).toBe('CA MACJ — 2026');
    expect(texte('[data-valeur-ca]')).toBe('10 000 € HT');
    expect(container.querySelector('[data-negociateur-agence="MYLENE"]')?.textContent).toContain('Mylène DUPONT');
    expect(texte('[data-carte-stats="previsionnel"] h3')).toContain('compromis en cours — MACJ');
  });
  it('retour à « Mon espace » : l’espace personnel relu, sans ?agence=', async () => {
    await ouvrir();
    await cliquer('[data-espace="tous"]');
    expect(texte('[data-compteur="compromis"]')).toContain('Compromis en cours — FUSION');
    await cliquer('[data-espace="moi"]');
    expect(texte('[data-compteur="compromis"]')).toContain('Mes compromis en cours');
  });
});
