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
let persoD27: unknown = null;
let admin: boolean;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/'); // l'adresse (?vue=…) que l'écran écrit, comme la Transaction : chaque épreuve repart de zéro
  urls = []; admin = true; persoD27 = null;
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url); urls.push(u);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: u.includes('agence=') ? '1,2,3#3' : '#0' });
    if (u === `${URL_MES_AFFAIRES}?agence=macj`) return ok(agenceMacj());
    if (u.startsWith(`${URL_MES_AFFAIRES}?agence=`)) return ok({ ...agenceMacj(), agence: { cle: u.split('=')[1], societe: null } });
    if (u.startsWith(URL_MES_AFFAIRES)) return ok(persoD27 ?? perso(admin));
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
  it('MACJ : la structure lue (?agence=macj), ses tuiles et ses onglets ; l’empreinte de la structure', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    expect(urls).toContain(`${URL_MES_AFFAIRES}?agence=macj`);
    expect(container.querySelector('[data-onglet-mon-espace="compromis"]')).toBeNull(); // décision 11
    expect(texte('[data-onglet-mon-espace="apporteurs"]')).toBe('Apporteurs'); // décisions 11 et 14 : le seul onglet « Mes … » restant
    expect(texte('[data-note-ca]')).toContain('le CA de MACJ, calculé comme dans le Suivi CA');
    expect(cartes()).toEqual(['1', '2']);
    // décision 8 : plus de compteurs ; « Mois » : les tuiles de la structure
    expect(container.querySelector('[data-compteur]')).toBeNull();
    await cliquer('[data-vue="mois"]');
    expect(texte('[data-valeur-tuile="ca"]')).toBe('10 000 €');
    expect(texte('[data-valeur-tuile="nombre"]')).toBe('1');
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
  it('décision 14 : sous le graphique de « Mois », « Par négociateur » (le tableau de l’Espace par négociateur du Suivi CA) et « Par apporteur »', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    await cliquer('[data-vue="mois"]');
    expect(container.querySelector('[data-onglet-mon-espace="statistiques"]')).toBeNull();
    const negos = container.querySelector('[data-bloc="negociateurs-periode-mon-espace"]')!;
    expect(negos).not.toBeNull();
    expect(negos.textContent).toContain('Mylène DUPONT');
    expect(texte('[data-bloc="negociateurs-periode-mon-espace"] h3')).toBe('Par négociateur — année 2026');
    expect(container.querySelector('[data-bloc="mes-apporteurs"]')).not.toBeNull();
    // la liste des Vendus = la carte « CA » (la structure, somme des cartes)
    expect(texte('[data-total-groupe="vendus"]')).toBe('10 000 € HT');
  });
  it('retour à « Mon espace » : l’espace personnel relu, sans ?agence=', async () => {
    await ouvrir();
    await cliquer('[data-espace="tous"]');
    expect(texte('[data-note-ca]')).toContain('le CA de FUSION');
    await cliquer('[data-espace="moi"]');
    expect(texte('[data-onglet-mon-espace="apporteurs"]')).toBe('Mes apporteurs');
    expect(container.querySelector('[data-note-ca]')).toBeNull(); // décision 10
  });
});

describe('🔴 D27 / D28 (Arno, 03/11/2026) — l’onglet « Compromis » : 4 cartes, « Par apporteur — compromis en cours » ; « Mois » : ventes actées', () => {
  const C = (htC: number, ttcC: number) => ({ htC, ttcC });
  it('« Mon espace » : les cartes = ce que le serveur a calculé (volume − reversé = ma part nette) ; le tableau sous la liste, total = « dont apporteurs »', async () => {
    const v = (id: number, ca: number, coll: number, app: number, nom: string | null) => ({ ...vente(id, { statut: 'compromis', mois: null, dateCompromis: '2026-10-01', honorairesTtc: ca * 1.2 / 100 }),
      mesCotes: ['entree'], commissionsRetirees: false, maPart: { ca: C(ca - coll - app, (ca - coll - app) * 1.2), net: C(ca - coll - app, (ca - coll - app) * 1.2) },
      // 🔴 D29 — un apporteur externe : versé sans TVA (HT = TTC) ; la TVA non récupérable, à part (TTC)
      verse: { ca: C(ca, ca * 1.2), collegues: C(coll, coll * 1.2), negociateurs: C(0, 0), apporteurs: C(app, app), tva: C(0, app * 0.2), parApporteur: nom === null ? [] : [{ nom, m: C(app, app) }] } });
    const ventes = [v(37, 625000, 270833, 83333, 'Gardien Dacquet'), v(209, 750000, 0, 0, null)];
    persoD27 = { ...perso(true), ventes, compteurs: { ...perso(true).compteurs, compromis: { nb: 2, ids: [37, 209], ca: C(1020834, 1225001) } } };
    await ouvrir();
    await cliquer('[data-vue="compromis"]');
    expect(texte('[data-valeur-compromis="volume"]')).toBe('13 750 €');
    expect(texte('[data-valeur-compromis="nombre"]')).toBe('2');
    expect(texte('[data-valeur-compromis="reverse"]')).toBe('3 541,66 €');
    expect(texte('[data-dont="collegues"]')).toBe('dont collègues 2 708,33 €');
    expect(texte('[data-dont="negociateurs"]')).toBe('dont négociateurs 0 €');
    expect(texte('[data-dont="apporteurs"]')).toBe('dont apporteurs 833,33 € sans TVA');
    expect(texte('[data-valeur-compromis="net"]')).toBe('10 208,34 €');
    expect(texte('[data-bloc="apporteurs-compromis"] h3')).toBe('Volume d’affaires par apporteur d’affaires — compromis en cours'); // 🔴 D31
    expect(container.querySelector('[data-bloc="apporteurs-compromis"]')!.classList.contains('mes-bloc-apporteurs')).toBe(true); // trame grise (D31)
    expect(texte('[data-bloc="apporteurs-compromis"] [data-apporteur="Gardien Dacquet"] td')).toBe('1');
    expect(texte('[data-bloc="apporteurs-compromis"] [data-total-verse]')).toBe('833,33 € sans TVA');
    expect(texte('[data-bloc="apporteurs-compromis"] [data-verse-apporteur]')).toBe('833,33 € sans TVA');
    expect(texte('[data-tuile="reverse"] .tdb-tuile-mot')).toBe('Reversé / partagé (HT)'); // 🔴 D29 (Arno)
    expect(container.querySelector('[data-dont="tva"]')).toBeNull(); // 🔴 D31-3 — plus jamais dans la carte (HT ou TTC)
    // 🔴 D31-3 — en TTC non plus ; le montant de la carte compte toujours la TVA non récupérable (D29) : 3 541,66 HT → coll × 1,2 + versé + 0,2 × versé
    await cliquer('.mes-compteurs-tete [data-afficher="ttc"]');
    expect(container.querySelector('[data-dont="tva"]')).toBeNull();
    expect(container.querySelector('[data-reverse-detail]')!.textContent).not.toMatch(/TVA non récupérable/);
    expect(texte('[data-valeur-compromis="reverse"]')).toBe('4 249,99 €'); // 2 708,33 × 1,2 + 833,33 + 166,67 (TVA non récupérable)
    // l'ordre : les cartes, puis la liste, puis le tableau
    const ordre = [...container.querySelectorAll('[data-cartes-compromis], [data-ma-vente], [data-bloc="apporteurs-compromis"]')].map((e) => e.getAttribute('data-bloc') ?? (e.hasAttribute('data-cartes-compromis') ? 'cartes' : 'carte'));
    expect(ordre).toEqual(['cartes', 'carte', 'carte', 'apporteurs-compromis']);
  });
  it('mode agence (MACJ) : volume et nombre = Suivi CA ; volume − reversé = la somme des « reste » ; le filtre « Négociateur » suit la liste', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    expect(container.querySelector('[data-cartes-compromis="agence"]')).not.toBeNull();
    expect(texte('[data-valeur-compromis="volume"]')).toBe('12 500 €');
    expect(texte('[data-valeur-compromis="nombre"]')).toBe('2');
    const reste = [...container.querySelectorAll('[data-nego-reste]')].reduce((t, e) => t + Number((e.textContent ?? '').replace(/[^0-9,]/g, '').replace(',', '.')), 0);
    expect(texte('[data-valeur-compromis="net"]')).toBe(`${reste.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} €`.replace(/\s/g, ' '));
    await choisir('[data-filtre-negociateur]', 'Cédric MARTIN');
    expect(texte('[data-valeur-compromis="nombre"]')).toBe('1');
    expect(texte('[data-valeur-compromis="volume"]')).toBe('7 500 €');
    expect(texte('[data-bloc="apporteurs-compromis"] [data-apporteurs-vide]')).toBe('Aucune commission d’apporteur sur les compromis en cours.');
  });
  it('« Mois » : « Par apporteur d’affaires — … — ventes actées »', async () => {
    await ouvrir();
    await cliquer('[data-espace="macj"]');
    await cliquer('[data-vue="mois"]');
    expect(texte('[data-bloc="mes-apporteurs"] h3')).toBe('Volume d’affaires par apporteur d’affaires — ventes actées'); // 🔴 D31
    expect(container.querySelector('[data-bloc="mes-apporteurs"]')!.classList.contains('mes-bloc-apporteurs')).toBe(true);
    expect(container.querySelector('[data-bloc="apporteurs-compromis"]')).toBeNull();
  });
});
