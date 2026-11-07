// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs } from './MesCompteurs';
import { URL_MANDAT, URL_REFERENCES, URL_VENTE } from './NouveauCompromis';
import { honorairesDuCote, partDuCote } from '../../../../lib/transaction/commissions';
import type { Vente } from '../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE (Arno, 07/11/2026) — « Nouveau compromis » : la RÉPARTITION DES HONORAIRES et le TAUX DE COMMISSION, séparés. Le VRAI écran,
 * routes simulées (rien n'est écrit, aucun mail). Données fictives.
 *   · « Les deux côtés » : une ligne « entrée et sortie » à 100 %, non modifiable ; seul le taux (pré-rempli du profil), le montant à côté ;
 *   · deux collaborateurs : parts liées (l'une ajuste l'autre), CA par structure, un taux propre à chacun (60 % + 60 % valide), 0 à 100 % ;
 *   · une partie extérieure : refus tant que le total ≠ 100 %, l'écart dit ; non commissionné : inchangé ;
 *   · un collaborateur des deux structures (lu dans les comptes, jamais un nom) : la structure d'abord, puis sa ligne la porte.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const LEA = { id: 5, nom: 'Léa MARTIN', societe: 'criterimmo' as const, tauxCommission: 60 };
const PAUL = { id: 6, nom: 'Paul BERNARD', societe: 'criterimmo' as const };
const MARC = { id: 7, nom: 'Marc DURAND', societe: 'macj' as const, tauxCommission: 35 };
const ZOE = { id: 8, nom: 'Zoé PETIT', societe: 'macj' as const, commissionne: false };
const DEUX = { id: 9, nom: 'Camille DOUBLE', societe: 'les_deux' as const };
const vide = { nb: 0, ids: [] as number[], ca: { htC: 0, ttcC: 0 } };
let titulaire = 5;
let posts: { url: string; corps: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  posts = []; titulaire = 5;
  try { window.localStorage.setItem('trx-affichage-montants', 'ttc'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (init?.method === 'POST') { posts.push({ url: u, corps: JSON.parse(String(init.body)) }); return ok(99); }
    // La structure imposée par le profil : une seule → imposée ; « les deux » → null (la question reste).
    if (u.startsWith(URL_REFERENCES)) return ok({ disponible: true, aujourdhui: '2026-11-07', titulaireId: titulaire, administrateur: false, lotD: true, personneType: true, prixVente: true,
      mandat: true, uniteCommission: true, negociateurs: [LEA, PAUL, MARC, ZOE, DEUX], apporteurs: [], personnes: [], structureImposee: titulaire === DEUX.id ? null : 'criterimmo' });
    if (u.startsWith(URL_MANDAT)) return ok({ libre: true, numero: 'M-42' });
    if (u.startsWith(URL_VENTE)) return ok(null);
    return ok({ disponible: true, aujourdhui: '2026-11-07', titulaire: { id: titulaire, prenom: 'X', administrateur: false }, ventes: [],
      schema: { lotD: true, personneType: true, uniteCommission: true, prixVente: true, mandat: true }, compteurs: { compromis: vide, actees: { ...vide, annee: 2026 }, parAnnee: [] } });
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, valeur: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const valeur = (sel: string): string => container.querySelector<HTMLInputElement>(sel)?.value ?? '∅';
const enregistrer = () => container.querySelector<HTMLButtonElement>('[data-enregistrer-dossier]')!;
const soumettre = async () => { await act(async () => { (container.querySelector('[data-formulaire-dossier] form') as HTMLFormElement).requestSubmit(); }); await calmer(); };
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-nouveau-compromis-mon-espace]'); };
/** Jusqu'au formulaire, du côté voulu ; la commission et mes clients des deux côtés renseignés. */
const formulaire = async (cote: 'entree' | 'sortie' | 'deux', commission = '12000') => {
  await ouvrir();
  await saisir('[data-parcours-mandat]', 'M-42');
  await cliquer('[data-parcours-verifier]');
  await cliquer(`[data-cote="${cote}"]`);
  await saisir('[data-formulaire-dossier] [data-champ="commission"]', commission);
  for (const [bloc, nom] of [['vendeurs', 'DUPONT'], ['acquereurs', 'MARTIN']] as const) {
    await saisir(`[data-bloc-dossier="${bloc}"] [data-personne-nom]`, nom);
    await saisir(`[data-bloc-dossier="${bloc}"] [data-personne-prenom]`, 'Jean');
    await saisir(`[data-bloc-dossier="${bloc}"] [data-personne-telephone]`, '0600000000');
  }
};
const choisirSortie = async (id: number) => { await cliquer('[data-champ="sortie"]'); await cliquer(`[role="option"][data-option="${id}"]`); };
type Corps = { entreeId: number; sortieId: number; parties: Record<string, unknown>[]; commissions: Record<'entree' | 'sortie', null | { taux: string | null; mode: string; montant: string }> };
const dossier = (): Corps => posts[0].corps.dossier as Corps;
/** Le montant envoyé, tel qu'affiché (« 7 200 ») : le serveur relit les espaces. */
const montant = (c: { montant: string } | null): string => (c?.montant ?? '').replace(/\s/g, '');

describe('« Les deux côtés » : une ligne à 100 %, seul le taux de commission', () => {
  it('ligne non modifiable, taux pré-rempli du profil (60 %) et montant à côté ; ni 50/50, ni cumul, ni partie extérieure ; enregistré « entrée et sortie »', async () => {
    await formulaire('deux');
    expect(texte('[data-ligne-deux-cotes]')).toBe('Entrée et sortie du mandat — Léa MARTIN — CRITERIMMO — 100 % des honoraires');
    expect(container.querySelectorAll('[data-partie-pct], [data-partie-eur], [data-champ="entree"], [data-champ="sortie"]')).toHaveLength(0);
    expect(container.querySelector('[data-revenir-5050]')).toBeNull();
    expect(container.querySelector('[data-ajouter-exterieure]')).toBeNull();
    // 🔴 Arno (07/11/2026) — les apporteurs restent disponibles dans ce cas.
    expect(container.querySelector('[data-champ="apporteur-annuaire"]')).not.toBeNull();
    expect(container.querySelector('[data-montant-unite="retro"]')).not.toBeNull();
    expect(container.querySelector('[data-total-pct]')).toBeNull();
    // Le TAUX DE COMMISSION (seul champ), pré-rempli depuis le profil ; le montant calculé à côté : 60 % × 12 000 € TTC = 7 200 € TTC.
    expect(container.querySelector('[data-montant-unite="commission-entree"] label')!.textContent).toContain('Taux de commission (%)');
    expect(valeur('[data-taux="commission-entree"]')).toBe('60');
    expect(valeur('[data-champ="commission-entree"]').replace(/\s/g, ' ')).toBe('7 200');
    expect(container.querySelector('[data-champ="commission-sortie"]')).toBeNull();
    expect(texte('[data-parts-societes]')).toContain('CA : CRITERIMMO reçoit 100 % des honoraires');
    expect(enregistrer().disabled).toBe(false);
    await soumettre();
    expect(posts).toHaveLength(1);
    const d = dossier();
    expect([d.entreeId, d.sortieId]).toEqual([5, 5]);
    expect(d.parties).toEqual([expect.objectContaining({ sorte: 'entree_sortie', compteId: 5, societe: 'criterimmo', pourcentage: 100, montantHt: null })]);
    expect(d.commissions.entree).toMatchObject({ taux: '60', mode: 'calculee' });
    expect(montant(d.commissions.entree)).toBe('7200');
    expect(d.commissions.sortie).toBeNull();
  });

  it('les totaux : la ligne « entrée et sortie » est comptée UNE fois (100 % à l’entrée, 0 % à la sortie)', () => {
    const v = { honorairesTtc: 12000, dossier: { entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 5, nom: 'Léa MARTIN' } },
      repartition: { retroApporteurTtc: 0, parties: [{ sorte: 'entree_sortie', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] } } as unknown as Vente;
    expect([partDuCote(v, 'entree'), partDuCote(v, 'sortie')]).toEqual([100, 0]);
    expect([honorairesDuCote(v, 'entree')!.ttc, honorairesDuCote(v, 'sortie')!.ttc]).toEqual([12000, 0]);
  });

  it('modifié pour ce compromis : 45 % recalcule le montant ; 120 % → « Enregistrer » désactivé, message clair, rien n’est envoyé', async () => {
    await formulaire('deux');
    await saisir('[data-taux="commission-entree"]', '45');
    expect(valeur('[data-champ="commission-entree"]').replace(/\s/g, ' ')).toBe('5 400');
    await saisir('[data-taux="commission-entree"]', '120');
    expect(texte('[data-motif-taux="entree"]')).toBe('Le taux de commission de Léa MARTIN doit être compris entre 0 et 100 %.');
    expect(enregistrer().disabled).toBe(true);
    expect(texte('[data-enregistrer-bloque-taux]')).toContain('compris entre 0 et 100 %');
    await soumettre();
    expect(posts).toEqual([]);
  });
});

describe('deux collaborateurs : parts liées, CA par structure, un taux chacun', () => {
  it('même structure : 60 → l’autre passe à 40 ; CRITERIMMO reçoit 100 % ; taux 60 % + 60 % accepté (chacun sur SA part)', async () => {
    await formulaire('entree');
    await choisirSortie(PAUL.id);
    await saisir('[data-partie-pct="0"]', '60');
    expect(valeur('[data-partie-pct="1"]')).toBe('40');
    expect(texte('[data-part-societe-form="criterimmo"]')).toContain('100 %');
    expect(texte('[data-part-societe-form="macj"]')).toContain('0 %');
    // Léa : son profil (60 %) ; Paul : sans taux au profil, VIDE et à saisir (aucun 50 % par défaut) — « Enregistrer » refusé, message clair.
    expect([valeur('[data-taux="commission-entree"]'), valeur('[data-taux="commission-sortie"]')]).toEqual(['60', '']);
    expect(valeur('[data-champ="commission-sortie"]')).toBe('');
    expect(container.querySelector('[data-propose="commission-sortie"]')).toBeNull();
    expect(texte('[data-motif-taux="sortie"]')).toBe('Saisissez le taux de commission de Paul BERNARD (entre 0 et 100 %) : aucun taux n’est renseigné dans son profil.');
    expect(enregistrer().disabled).toBe(true);
    expect(texte('[data-enregistrer-bloque-taux]')).toContain('Saisissez le taux de commission de Paul BERNARD');
    await soumettre();
    expect(posts).toEqual([]);
    await saisir('[data-taux="commission-sortie"]', '60');
    expect(container.querySelector('[data-motif-taux]')).toBeNull();
    expect(enregistrer().disabled).toBe(false);
    await soumettre();
    const d = dossier();
    expect(d.parties).toMatchObject([{ sorte: 'entree', compteId: 5, pourcentage: 60 }, { sorte: 'sortie', compteId: 6, pourcentage: 40 }]);
    // 60 % de la part de Léa (60 % × 12 000) et 60 % de celle de Paul (40 % × 12 000) — sans plafond commun.
    expect(d.commissions.entree).toMatchObject({ taux: '60' });
    expect(d.commissions.sortie).toMatchObject({ taux: '60' });
    expect([montant(d.commissions.entree), montant(d.commissions.sortie)]).toEqual(['4320', '2880']);
  });

  it('deux structures : chacune reçoit la part de son collaborateur (CRITERIMMO 70 %, MACJ 30 %) ; le taux de Marc pré-rempli de son profil (35 %)', async () => {
    await formulaire('entree');
    await choisirSortie(MARC.id);
    expect(valeur('[data-taux="commission-sortie"]')).toBe('35');
    await saisir('[data-partie-pct="1"]', '30');
    expect(valeur('[data-partie-pct="0"]')).toBe('70');
    expect(texte('[data-part-societe-form="criterimmo"]')).toContain('70 %');
    expect(texte('[data-part-societe-form="macj"]')).toContain('30 %');
    await soumettre();
    expect(dossier().parties).toMatchObject([{ sorte: 'entree', compteId: 5, societe: 'criterimmo', pourcentage: 70 }, { sorte: 'sortie', compteId: 7, societe: 'macj', pourcentage: 30 }]);
    expect(dossier().commissions.sortie).toMatchObject({ taux: '35' });
  });

  it('une partie extérieure : total ≠ 100 % → refus, l’écart dit clairement ; juste → accepté', async () => {
    await formulaire('entree');
    await choisirSortie(MARC.id);
    await saisir('[data-partie-pct="0"]', '50');
    await cliquer('[data-ajouter-exterieure]');
    await saisir('[data-partie-nom]', 'Agence Voisine');
    await saisir('[data-partie-pct="2"]', '10');
    expect(texte('[data-motif-repartition]')).toContain('La répartition fait 110 %');
    expect(texte('[data-motif-repartition]')).toContain('Écart : 10 % de trop');
    expect(enregistrer().disabled).toBe(true);
    await saisir('[data-partie-pct="1"]', '30');
    expect(texte('[data-motif-repartition]')).toContain('Écart : il manque 10 %');
    await soumettre();
    expect(posts).toEqual([]);
    await saisir('[data-partie-pct="1"]', '40');
    expect(container.querySelector('[data-motif-repartition]')).toBeNull();
    await soumettre();
    expect(dossier().parties.map((p) => p.pourcentage)).toEqual([50, 40, 10]);
  });

  it('non commissionné : reste « Non commissionné » (ni taux, ni commission pour lui) ; sa part reste dans la répartition', async () => {
    await formulaire('entree');
    await choisirSortie(ZOE.id);
    expect(container.querySelector('[data-non-commissionne-form="sortie"]')!.textContent).toBe('Non commissionné');
    expect(container.querySelector('[data-taux="commission-sortie"]')).toBeNull();
    await saisir('[data-partie-pct="0"]', '50');
    expect(valeur('[data-partie-pct="1"]')).toBe('50');
    expect(enregistrer().disabled).toBe(false);
  });
});

describe('un collaborateur des deux structures (lu dans les comptes) : la structure d’abord', () => {
  it('rien d’autre tant qu’il n’a pas choisi ; MACJ choisie : sa ligne la porte, sans redemande, même après le choix du collègue', async () => {
    titulaire = DEUX.id;
    await ouvrir();
    expect(container.querySelector('[data-parcours="structure"]')).not.toBeNull();
    expect(container.querySelector('[data-parcours-mandat], [data-formulaire-dossier], [data-cote]')).toBeNull();
    await cliquer('[data-structure="macj"]');
    await saisir('[data-parcours-mandat]', 'M-42');
    await cliquer('[data-parcours-verifier]');
    await cliquer('[data-cote="entree"]');
    expect(texte('[data-societe-partie="0"]')).toBe('MACJ');
    expect(container.querySelector('[data-societe-vente-manque]')).toBeNull();
    await choisirSortie(PAUL.id);
    expect(texte('[data-societe-partie="0"]')).toBe('MACJ');
    expect(container.querySelector('[data-motif-societe-vente]')).toBeNull();
  });

  it('« Les deux côtés » : la ligne unique porte la structure choisie', async () => {
    titulaire = DEUX.id;
    await ouvrir();
    await cliquer('[data-structure="criterimmo"]');
    await saisir('[data-parcours-mandat]', 'M-42');
    await cliquer('[data-parcours-verifier]');
    await cliquer('[data-cote="deux"]');
    expect(texte('[data-ligne-deux-cotes]')).toBe('Entrée et sortie du mandat — Camille DOUBLE — CRITERIMMO — 100 % des honoraires');
    // sans taux au profil : vide, à saisir avant d'enregistrer (aucun 50 % par défaut)
    expect(valeur('[data-taux="commission-entree"]')).toBe('');
    expect(enregistrer().disabled).toBe(true);
    await saisir('[data-taux="commission-entree"]', '40');
    expect(container.querySelector('[data-motif-taux]')).toBeNull();
    expect(enregistrer().disabled).toBe(false);
  });
});
