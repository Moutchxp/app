// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { URL_COUTS } from '../../../../lib/mon-espace/couts';
import { TableauCoutsGlobaux } from '../transaction/CoutsGlobaux';
import type { Agence } from '../../../../lib/mon-espace/agence';
import { DUS_COUTS, E_COUTS, LIGNES_LOCATION_COUTS, RETROS_COUTS, SAISIS_COUTS, SALAIRES_LOCATION_COUTS, VENTES_COUTS } from '../../../../lib/mon-espace/__fixtures__/couts';

/**
 * 🔴🔴 472 — « RÉMUNÉRATIONS ASSOCIÉS » à l'écran (Arno, 13/11/2026), les VRAIS composants, routes simulées (rien n'est écrit) :
 *   · la saisie du mois : la ligne au-dessus des salaires dans la Vente (CRITERIMMO et MACJ), jamais en location ni gestion ; « + ajouter » ; le choix
 *     parmi les SEULS associés ; sans TVA ; l'enregistrement envoie la ligne (compte, sans TVA) ;
 *   · le Suivi CA (« Coûts globaux ») : la colonne n'existe que si la donnée en porte — un compte sans « Les coûts » (à qui la route ne l'envoie
 *     jamais) ne voit ni la colonne, ni son titre, ni un total qui la contiendrait ;
 *   · un compte sans « Les coûts » : ni l'onglet, ni la route (403).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-03';
const VIDE = { compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, actees: { nb: 0, ids: [], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] };
const titulaire = (associe: boolean) => ({ id: 1, prenom: 'Arno', administrateur: true, associe });
const PROFILS = [{ id: 2, libelle: 'Arnaud JOREL', fonctions: ['vente'], associe: true }, { id: 9, libelle: 'Cédric JULLIEN', fonctions: ['vente'], associe: true },
  { id: 5, libelle: 'Jean-Baptiste PONS', fonctions: ['location'], associe: false }];
let associe: boolean; let urls: string[]; let posts: Record<string, unknown>[];
let container: HTMLDivElement; let root: Root;
const donnees = () => ({ disponible: true, aujourdhui: JOUR, ventes: VENTES_COUTS, gestion: [], location: {}, locationTtcC: {}, retrocessions: RETROS_COUTS, statutsNegociateurs: {},
  locationCa: { lignes: LIGNES_LOCATION_COUTS, retrocessions: [], salaires: SALAIRES_LOCATION_COUTS, dus: DUS_COUTS }, coutsSaisis: SAISIS_COUTS, coutsLignes: [],
  saisie: true, profils: PROFILS, versionsGestion: {}, monga: true, validations: [], caGestion: true, remunerations: true });
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  associe = true; urls = []; posts = [];
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); urls.push(u);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    const refus = { ok: false, status: 403, json: async () => ({ etat: 'refus' }) };
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: '#0' });
    if (u.startsWith(URL_COUTS) && init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return ok({ id: 1 }); }
    if (u.startsWith(URL_COUTS)) return associe ? ok(u.includes('rappel=1') ? { rappel: null, alertes: [] } : donnees()) : refus;
    if (u.startsWith(`${URL_MES_AFFAIRES}?agence=`)) return ok({ disponible: true, aujourdhui: JOUR, titulaire: titulaire(associe), ventes: [], compteurs: VIDE, retrocessions: [],
      statutsNegociateurs: {}, nomsNegociateurs: {}, agence: { cle: u.split('=')[1], societe: u.split('=')[1] === 'tous' ? null : u.split('=')[1] } });
    if (u.startsWith(URL_MES_AFFAIRES)) return ok({ disponible: true, aujourdhui: JOUR, titulaire: titulaire(associe), ventes: [], compteurs: VIDE, retrocessions: [] });
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const choisir = async (sel: string, v: string) => { await act(async () => { const e = container.querySelector(sel) as HTMLSelectElement; e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }); await calmer(); };
const taper = async (sel: string, v: string) => { await act(async () => { const e = container.querySelector(sel) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer(); };
const ouvrirSaisie = async (a: Agence) => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer(`[data-espace="${a}"]`);
  await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-ouvrir-saisie]'); };

describe('🔴 la saisie du mois', () => {
  it.each(['criterimmo', 'macj'] as const)('%s : dans la Vente, « Rémunérations associés » juste au-dessus de « Salaires chargés » ; TVA « — » ; jamais en location ni en gestion', async (a) => {
    await ouvrirSaisie(a);
    const vente = [...container.querySelectorAll('[data-bloc-saisie="vente"] [data-poste-saisie]')].map((p) => p.getAttribute('data-poste-saisie'));
    expect(vente).toEqual(['vente-remunerations', 'vente-salaires', 'vente-autres']);
    expect(container.querySelector('[data-poste-saisie="vente-remunerations"] .mes-saisie-nom')?.textContent).toBe('Rémunérations associés');
    expect(container.querySelector('[data-poste-saisie="vente-remunerations"] .mes-saisie-tva')?.textContent).toBe('—');
    expect(container.querySelector('[data-poste-saisie="location-remunerations"], [data-poste-saisie="gestion-remunerations"]')).toBeNull();
    expect(container.querySelector('[data-complet="vente-remunerations"]')).not.toBeNull();
  });
  it('« + ajouter » : le choix parmi les SEULS associés ; l’enregistrement envoie la ligne (le compte, sans TVA) et la case ✓', async () => {
    await ouvrirSaisie('criterimmo');
    await cliquer('[data-ajouter-brouillon="vente-remunerations"]');
    const options = [...container.querySelectorAll('[data-profil-brouillon="vente-remunerations-0"] option')].map((o) => o.textContent);
    expect(options).toEqual(['Associé…', 'Arnaud JOREL', 'Cédric JULLIEN']);
    expect(container.querySelector('[data-tva-brouillon="vente-remunerations-0"]')).toBeNull(); // aucun choix de TVA
    await choisir('[data-profil-brouillon="vente-remunerations-0"]', '9');
    await taper('[data-montant-brouillon="vente-remunerations-0"]', '4000');
    await act(async () => { (container.querySelector('[data-complet="vente-remunerations"]') as HTMLInputElement).click(); }); await calmer();
    await cliquer('[data-enregistrer-mois]'); await calmer();
    expect(posts.find((p) => p.action === 'ligne-ajouter')).toEqual({ action: 'ligne-ajouter', ligne: { societe: 'criterimmo', famille: 'vente', poste: 'remunerations', annee: 2026, mois: 10,
      compteId: 9, libelle: null, montantHt: 4000, tva: false } });
    expect(posts.some((p) => p.action === 'valider' && (p.validation as { poste: string }).poste === 'remunerations')).toBe(true);
  });
  it('une ligne sans associé : rien n’est envoyé, le message le dit', async () => {
    await ouvrirSaisie('macj');
    await cliquer('[data-ajouter-brouillon="vente-remunerations"]');
    await taper('[data-montant-brouillon="vente-remunerations-0"]', '100');
    await cliquer('[data-enregistrer-mois]');
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-message-saisie]')?.textContent).toMatch(/choisissez l’associé/);
  });
  it('🔴 un compte sans « Les coûts » : ni l’onglet, ni la route (403) — le poste n’est jamais lu', async () => {
    associe = false;
    await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-espace="criterimmo"]');
    expect(container.querySelector('[data-onglet-mon-espace="couts"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/Rémunérations associés/);
    expect(urls.some((u) => u.startsWith(URL_COUTS))).toBe(false);
  });
});

describe('🔴 Suivi CA › « Coûts globaux » : la colonne seulement quand la donnée en porte', () => {
  const rendre = async (saisis: typeof SAISIS_COUTS) => {
    await act(async () => {
      root.render(createElement(TableauCoutsGlobaux, { e: { ...E_COUTS, saisis }, rangees: [{ cle: '2026-09', libelle: 'Septembre', annee: 2026, mois: 9 }],
        total: { cle: '2026', libelle: 'Année 2026', annee: 2026, mois: null }, titre: 'Coûts', jour: '2026-11-03', salaires: true, onSalaires: () => undefined, idTitre: 'essai', donnee: 'essai-couts' }));
    });
    await act(async () => { (container.querySelector('[data-bloc="essai-couts"] button[aria-expanded]') as HTMLElement).click(); });
  };
  it('compte avec « Les coûts » (la route envoie les lignes) : la colonne « Rémunérations associés », avant les salaires, et son montant', async () => {
    await rendre([...SAISIS_COUTS, { societe: 'criterimmo', famille: 'vente', poste: 'remunerations', annee: 2026, mois: 9, montantHt: 3000 }]);
    expect(container.querySelector('[data-entete-remunerations]')?.textContent).toBe('Rémunérations associés');
    expect(container.querySelector('[data-rangee-couts="2026-09"] [data-cout="vente-remunerations"]')?.textContent?.replace(/\s/g, ' ')).toBe('3 000 €');
    const entetes = [...container.querySelectorAll('thead tr:nth-child(2) th')].map((t) => t.textContent);
    expect(entetes.indexOf('Rémunérations associés')).toBe(entetes.indexOf('Salaires chargés') - 1);
  });
  it('🔴 compte sans « Les coûts » (la route les a retirées) : ni colonne, ni titre, ni le mot nulle part', async () => {
    await rendre(SAISIS_COUTS);
    expect(container.querySelector('[data-entete-remunerations], [data-cout="vente-remunerations"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/Rémunérations associés/);
  });
});
