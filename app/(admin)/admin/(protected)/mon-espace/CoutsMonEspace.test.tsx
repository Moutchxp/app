// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { eur } from '../../../../lib/transaction/format';
import { coutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import { coutsDeLAnnee, coutsDuPoint, URL_COUTS } from '../../../../lib/mon-espace/couts';
import { AIDE_POSTES_FUTURS } from './CoutsMonEspace';
import type { Agence } from '../../../../lib/mon-espace/agence';
import { DUS_COUTS, E_COUTS, GESTION_COUTS, LIGNES_LOCATION_COUTS, RETROS_COUTS, SAISIS_COUTS, SALAIRES_LOCATION_COUTS, VENTES_COUTS } from '../../../../lib/mon-espace/__fixtures__/couts';

/**
 * 🔴 « LES COÛTS » (Arno, 03/11/2026, lot C1) — dans le VRAI écran « Mon espace », routes simulées (rien n'est écrit) : l'onglet n'existe qu'en mode
 * agence et pour un associé ; ses tuiles et son tableau = « Coûts globaux » au centime (HT et TTC) ; l'année choisie pilote toute la page ; MACJ :
 * vente seulement ; la colonne « Variable négo (calculé) » n'entre dans aucun total ; retour à la vue perso : l'onglet disparaît.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-03';
const VIDE = { compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, actees: { nb: 0, ids: [], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] };
const agence = (cle: Agence, associe: boolean) => ({ disponible: true, aujourdhui: JOUR, titulaire: { id: 1, prenom: 'Arno', administrateur: true, associe }, ventes: [],
  compteurs: VIDE, retrocessions: [], statutsNegociateurs: {}, nomsNegociateurs: {}, agence: { cle, societe: cle === 'tous' ? null : cle } });
const perso = (associe: boolean) => ({ disponible: true, aujourdhui: JOUR, titulaire: { id: 1, prenom: 'Arno', administrateur: true, associe }, ventes: [], compteurs: VIDE, retrocessions: [] });
const GLOBAL = { disponible: true, aujourdhui: JOUR, ventes: VENTES_COUTS, gestion: GESTION_COUTS, location: {}, locationTtcC: {}, retrocessions: RETROS_COUTS, statutsNegociateurs: {},
  locationCa: { lignes: LIGNES_LOCATION_COUTS, retrocessions: [], salaires: SALAIRES_LOCATION_COUTS, dus: DUS_COUTS }, coutsSaisis: SAISIS_COUTS, coutsLignes: [], saisie: false };
let associe: boolean;
let urls: string[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  associe = true; urls = [];
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url); urls.push(u);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: '#0' });
    if (u.startsWith(URL_COUTS)) return ok(GLOBAL);
    if (u.startsWith(`${URL_MES_AFFAIRES}?agence=`)) return ok(agence(u.split('=')[1] as Agence, associe));
    if (u.startsWith(URL_MES_AFFAIRES)) return ok(perso(associe));
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T10:00:00Z'));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
const egal = (sel: string, centimes: number) => expect(texte(sel)).toBe(eur(centimes / 100).replace(/\s/g, ' '));
const ouvrir = async (espace: Agence | null) => {
  await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer();
  if (espace !== null) await cliquer(`[data-espace="${espace}"]`);
};
const onglet = () => container.querySelector('[data-onglet-mon-espace="couts"]');
/** Le titre d'une colonne (sans le « i » de son picto). */
const titre = (th: Element): string | undefined => {
  const aide = th.querySelector('.trx-entete-aide');
  return (aide === null ? th.firstChild?.textContent : [...aide.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)?.textContent)?.trim();
};

describe('🔴 l’onglet « Les coûts » : associés, mode agence', () => {
  it('vue perso : absent, même pour un associé', async () => {
    await ouvrir(null);
    expect(container.querySelector('[data-onglet-mon-espace="apporteurs"]')).not.toBeNull();
    expect(onglet()).toBeNull();
  });
  it('mode agence, un administrateur NON associé : absent', async () => {
    associe = false;
    await ouvrir('tous');
    expect(container.querySelector('[data-onglet-mon-espace="apporteurs"]')).not.toBeNull();
    expect(onglet()).toBeNull();
  });
  it.each(['criterimmo', 'macj', 'tous'] as const)('mode agence %s, un associé : présent, après « Apporteurs »', async (a) => {
    await ouvrir(a);
    expect(onglet()?.textContent).toBe('Les coûts');
    const ids = [...container.querySelectorAll('[data-onglet-mon-espace]')].map((e) => e.getAttribute('data-onglet-mon-espace'));
    expect(ids).toEqual(['apporteurs', 'couts']);
  });
  it('retour à « Mon espace » depuis « Les coûts » : l’onglet disparaît, « Mois » s’ouvre', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect(container.querySelector('[data-couts-mon-espace]')).not.toBeNull();
    await cliquer('[data-espace="moi"]');
    expect(onglet()).toBeNull();
    expect(container.querySelector('[data-couts-mon-espace]')).toBeNull();
    expect(container.querySelector('[data-liste-mon-espace="vue-mois"]')).not.toBeNull();
  });
});

describe('🔴 les montants = « Coûts globaux », au centime ; l’année choisie pilote toute la page', () => {
  it('FUSION 2026 (année en cours par défaut) : tuiles et ligne de l’année = coutsGlobaux, HT puis TTC', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect(urls.some((u) => u.startsWith(URL_COUTS))).toBe(true);
    expect(container.querySelector('[data-couts-mon-espace] [data-onglet-annee="2026"]')?.getAttribute('aria-selected')).toBe('true');
    // une seule année : pas de « Année | Période | Tout »
    expect(container.querySelector('[data-couts-mon-espace] [data-decouper-annees]')).toBeNull();
    const c = coutsGlobaux(E_COUTS, 2026, null);
    egal('[data-valeur-couts="total"]', c.total.htC);
    egal('[data-ligne-couts="annee"] [data-cout="vente-commissions"]', c.vente.commissions.htC);
    egal('[data-ligne-couts="annee"] [data-cout="vente-total"]', c.vente.commissions.htC + c.vente.apporteurs.htC + c.vente.exterieures.htC + c.saisis.venteSalaires.htC + c.saisis.venteAutres.htC);
    // 🔴 lot 2 — les coûts saisis de la vente (salaires, « Autres ») : ceux de « Coûts globaux »
    egal('[data-ligne-couts="annee"] [data-cout="vente-salaires"]', c.saisis.venteSalaires.htC);
    egal('[data-ligne-couts="annee"] [data-cout="vente-autres"]', c.saisis.venteAutres.htC);
    await cliquer('[data-afficher="ttc"]');
    egal('[data-valeur-couts="total"]', c.total.ttcC);
    egal('[data-ligne-couts="annee"] [data-cout="vente-commissions"]', c.vente.commissions.ttcC);
  });
  it('C10 / C11 — Location : titres et ordre des colonnes ; aucun « dont »', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-tableau-couts="location"]');
    const titres = [...container.querySelectorAll('[data-table-couts-mon-espace="location"] thead th')].map(titre);
    expect(titres).toEqual(['Mois', 'Apporteurs', 'Variable négo (calculé)', 'Primes de gestion', 'Variable négociateur', 'Salaires chargés', 'Part de gestion versée aux apporteurs',
      'Rémunération des collègues apporteurs', 'Autres', 'Total location']);
    expect(container.querySelector('[data-couts-mon-espace]')!.textContent).not.toMatch(/\bdont\b/i);
    const cellules = [...container.querySelectorAll('[data-ligne-couts="annee"] td')].map((e) => e.getAttribute('data-cout'));
    expect(cellules).toEqual(['location-apporteurs', 'location-variable-calcule', 'location-primes', 'location-variable', 'location-salaires', 'location-part-gestion', 'location-collegues',
      'location-autres', 'location-total']);
  });
  it.each(['tous', 'criterimmo'] as const)('C12 — %s : Location, Gestion, Synthèse = « Coûts globaux » au centime (2025, 2026) ; Variable négo (calculé) hors totaux', async (a) => {
    await ouvrir(a); await cliquer('[data-onglet-mon-espace="couts"]');
    for (const annee of [2025, 2026]) {
      await cliquer(`[data-couts-mon-espace] [data-onglet-annee="${annee}"]`);
      const t = coutsDeLAnnee(E_COUTS, a, annee); const c = coutsGlobaux(E_COUTS, annee, null);
      const L = t.annee.location!; const G = t.annee.gestion!;
      // les totaux de familles = les colonnes de « Coûts globaux »
      expect(L.total.htC).toBe(c.location!.apporteurs.htC + c.location!.primesDeduites.htC + c.location!.variableDeduit.htC + c.location!.salaires.htC
        + c.location!.partGestion.htC + c.location!.collegues.htC + c.saisis.locationAutres.htC);
      expect(G.total.htC).toBe(c.gestion.adhoc.htC + c.gestion.monga.htC + c.gestion.salaires.htC + c.saisis.gestionAutres.htC);
      await cliquer('[data-tableau-couts="location"]');
      egal('[data-ligne-couts="annee"] [data-cout="location-total"]', L.total.htC);
      egal('[data-ligne-couts="annee"] [data-cout="location-variable-calcule"]', L.variableCalcule.htC);
      for (let m = 1; m <= 12; m++) {
        const x = t.mois[m - 1].location!;
        const attendu = x.apporteurs.htC + x.variable.htC + x.salaires.htC + x.partGestion.htC + x.collegues.htC + x.autres.htC; // jamais le variable calculé
        // un mois à venir (décembre 2026) sans coût : « — », comme « Coûts globaux »
        if (annee === 2026 && m > 11 && attendu === 0) expect(texte(`[data-ligne-couts="${m}"] [data-cout="location-total"]`)).toBe('—');
        else egal(`[data-ligne-couts="${m}"] [data-cout="location-total"]`, attendu);
      }
      await cliquer('[data-tableau-couts="gestion"]');
      egal('[data-ligne-couts="annee"] [data-cout="gestion-total"]', G.total.htC);
      expect(container.querySelector('[data-table-couts-mon-espace="gestion"] [data-cout^="location"]')).toBeNull();
      await cliquer('[data-tableau-couts="synthese"]');
      const titres = [...container.querySelectorAll('[data-table-couts-mon-espace="synthese"] thead th')].map((e) => e.textContent);
      expect(titres).toEqual(['Mois', 'Total location', 'Total gestion', 'Total location et gestion']);
      egal('[data-table-couts-mon-espace="synthese"] [data-ligne-couts="annee"] [data-cout="location-total"]', L.total.htC);
      egal('[data-table-couts-mon-espace="synthese"] [data-ligne-couts="annee"] [data-cout="gestion-total"]', G.total.htC);
      egal('[data-table-couts-mon-espace="synthese"] [data-ligne-couts="annee"] [data-cout="location-gestion-total"]', L.total.htC + G.total.htC);
      await cliquer('[data-tableau-couts="vente"]');
    }
  });
  it('août 2026 (salaires saisis) : variable compté 0, calculé > 0 ; postes futurs vides ; TTC partout', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-tableau-couts="location"]');
    const t = coutsDeLAnnee(E_COUTS, 'tous', 2026); const aout = t.mois[7].location!;
    expect(aout.variableCalcule.htC).toBeGreaterThan(0);
    egal('[data-ligne-couts="8"] [data-cout="location-variable-calcule"]', aout.variableCalcule.htC);
    egal('[data-ligne-couts="8"] [data-cout="location-variable"]', 0);
    // 🔴 lot 2 — la part de gestion et les collègues (automatiques), « Autres » (saisi) : des montants
    egal('[data-ligne-couts="9"] [data-cout="location-part-gestion"]', 4567);
    egal('[data-ligne-couts="9"] [data-cout="location-collegues"]', 1203);
    egal('[data-ligne-couts="9"] [data-cout="location-autres"]', 15050);
    await cliquer('[data-afficher="ttc"]'); await cliquer('[data-tableau-couts="synthese"]');
    egal('[data-ligne-couts="annee"] [data-cout="location-gestion-total"]', t.annee.location!.total.ttcC + t.annee.gestion!.total.ttcC);
  });
  it('C13 / C14 — ni « (facture mensuelle) » ni « saisie au lot suivant » ; chaque colonne sans saisie : son titre simple, son picto « i » et sa phrase', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    const attendus: Record<string, string[]> = { vente: ['salaires', 'autres'], location: ['part-gestion', 'collegues', 'autres'], gestion: ['autres'], synthese: [] };
    const titres: Record<string, string> = { salaires: 'Salaires chargés', autres: 'Autres', 'part-gestion': 'Part de gestion versée aux apporteurs', collegues: 'Rémunération des collègues apporteurs' };
    for (const o of ['vente', 'location', 'gestion', 'synthese']) {
      await cliquer(`[data-tableau-couts="${o}"]`);
      const rendu = container.querySelector('[data-couts-mon-espace]')!.textContent ?? '';
      expect(rendu).not.toContain('facture mensuelle');
      expect(rendu).not.toContain('saisie au lot suivant');
      const futurs = [...container.querySelectorAll('[data-entete-futur]')];
      expect(futurs.map((e) => e.getAttribute('data-entete-futur'))).toEqual(attendus[o].map((x) => `${o}-${x}`));
      for (const th of futurs) {
        const cle = th.getAttribute('data-entete-futur')!.replace(/^(vente|location|gestion)-/, '');
        expect(titre(th)).toBe(titres[cle]);
        await act(async () => { (th.querySelector('.svv-pil-ib-btn') as HTMLElement).click(); }); await calmer();
        expect(th.querySelector('[role="tooltip"]')?.textContent).toContain(AIDE_POSTES_FUTURS[cle]); // (et son « × » pour fermer)
      }
      // les cases encore sans saisie : vides (aucun « 0 € » inventé)
      expect([...container.querySelectorAll('[data-poste-futur]')].every((e) => e.textContent === '')).toBe(true);
    }
    await cliquer('[data-tableau-couts="gestion"]');
    expect([...container.querySelectorAll('[data-table-couts-mon-espace="gestion"] thead th')].map(titre)).toEqual(['Mois', 'Salaires chargés', 'ADHOC', 'MONGA', 'Autres', 'Total gestion']);
    expect(AIDE_POSTES_FUTURS.autres).toBe('Frais saisis à la main : loyer, logiciels, portails d’annonces, assurances, comptable, banque, publicité, GLI…');
  });
  it('l’onglet du tableau est dans l’adresse ; « Vente » par défaut (rien dans l’adresse)', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect(container.querySelector('[data-tableau-couts="vente"]')?.getAttribute('aria-selected')).toBe('true');
    expect(window.location.search).not.toContain('couts-tableau');
    await cliquer('[data-tableau-couts="gestion"]');
    expect(new URLSearchParams(window.location.search).get('couts-tableau')).toBe('gestion');
  });
  it('2025 choisie : tuiles, tableau ET graphique passent à 2025 ; rien de 2026', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    await cliquer('[data-couts-mon-espace] [data-onglet-annee="2025"]');
    const c = coutsGlobaux(E_COUTS, 2025, null);
    egal('[data-valeur-couts="total"]', c.total.htC);
    expect(texte('[data-tuile-n1-couts="total"]')).toContain('en 2024');
    expect(texte('[data-ligne-couts="annee"] th')).toBe('Année 2025');
    egal('[data-ligne-couts="9"] [data-cout="vente-commissions"]', coutsDuPoint(E_COUTS, 'tous', 2025, 9).vente.commissions.htC);
    expect(container.querySelector('[data-ligne-couts="a-confirmer"]')).toBeNull(); // la vente « mois à confirmer » est de 2026
    expect(texte('#trx-g-graphe')).toContain('2025');
  });
  it('2026 : la ligne « Mois à confirmer » (vente signée sans mois) ; 12 mois + elle = l’année', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    const t = coutsDeLAnnee(E_COUTS, 'tous', 2026);
    egal('[data-ligne-couts="a-confirmer"] [data-cout="vente-commissions"]', t.aConfirmer!.vente.commissions.htC);
  });
  it('MACJ : la vente de MACJ (sa structure), « Location et gestion » : vente seulement', async () => {
    await ouvrir('macj'); await cliquer('[data-onglet-mon-espace="couts"]');
    const p = coutsDuPoint(E_COUTS, 'macj', 2026, null);
    egal('[data-valeur-couts="total"]', p.total.htC);
    egal('[data-valeur-couts="vente"]', p.vente.total.htC);
    expect(texte('[data-valeur-couts="location"]')).toBe('—');
    // C12 : Location, Gestion, Synthèse présents, chaque case « — », la mention ; rien n'est masqué
    for (const o of ['location', 'gestion', 'synthese']) {
      await cliquer(`[data-tableau-couts="${o}"]`);
      expect(texte(`[data-couts-macj="${o}"]`)).toContain('MACJ : vente seulement');
      const cases = [...container.querySelectorAll(`[data-table-couts-mon-espace="${o}"] tbody td`)];
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.every((e) => e.textContent === '—')).toBe(true);
    }
  });
  it('CRITERIMMO : sa vente + location + gestion = son total', async () => {
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]');
    const p = coutsDuPoint(E_COUTS, 'criterimmo', 2026, null);
    egal('[data-valeur-couts="total"]', p.total.htC);
    egal('[data-valeur-couts="location"]', p.location!.total.htC);
    egal('[data-valeur-couts="gestion"]', p.gestion!.total.htC);
  });
  it('le graphique : celui du CA global, en « Coûts », structure imposée (pas de filtre Mesure ni Structure)', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    const g = container.querySelector('[data-couts-mon-espace] [data-bloc="global-graphe"]');
    expect(g).not.toBeNull();
    expect(g!.querySelector('[data-famille-filtre="mesure"]')).toBeNull();
    expect(g!.querySelector('[data-famille-filtre="structure"]')).toBeNull();
    expect(g!.querySelector('[data-filtre-graphe="Période"]')).not.toBeNull(); // Mensuel | Cumul
    // l'adresse de « Mon espace » n'est pas touchée par les filtres du graphique
    expect(window.location.search).not.toContain('g-');
  });
});

describe('🔴 lot 2 — la saisie dans les tableaux (C15)', () => {
  const LIGNES = [
    { id: 31, societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 10, compteId: 3, compteLibelle: 'Bruno GESTION', libelle: null, montantHt: 2100.5, version: 88 },
  ];
  const PROFILS = [{ id: 1, libelle: 'Zoé VENTE', fonctions: ['vente'] }, { id: 3, libelle: 'Bruno GESTION', fonctions: ['gestion'] }, { id: 4, libelle: 'Amélie', fonctions: [] },
    { id: 5, libelle: 'Chloé LOCATION', fonctions: ['location'] }];
  let posts: unknown[]; let reponsePost: { status: number; corps: unknown };
  beforeEach(() => {
    posts = []; reponsePost = { status: 200, corps: { etat: 'ok', data: { id: 50 } } };
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url); urls.push(u);
      if (u.startsWith(URL_COUTS) && init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: reponsePost.status === 200, status: reponsePost.status, json: async () => reponsePost.corps }; }
      if (u.startsWith(URL_COUTS) && !u.includes('empreinte')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { ...GLOBAL, saisie: true, coutsLignes: LIGNES, profils: PROFILS,
        versionsGestion: { '2026-09': { version: 12, origine: 'saisie' } }, monga: true } }) };
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
  });
  const lectures = () => urls.filter((u) => u === URL_COUTS).length;
  it('FUSION : en lecture seule — aucune case modifiable, le message dit de choisir CRITERIMMO ou MACJ', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect(container.querySelector('[data-saisie-fusion]')?.textContent).toContain('choisissez CRITERIMMO ou MACJ');
    expect(container.querySelector('[data-case-saisie]')).toBeNull();
  });
  it('MACJ : sa vente se saisit ; la location et la gestion (CRITERIMMO) non', async () => {
    await ouvrir('macj'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect(container.querySelector('[data-case-saisie="vente-salaires-10"]')).not.toBeNull();
    await cliquer('[data-tableau-couts="gestion"]');
    expect(container.querySelector('[data-case-saisie]')).toBeNull();
  });
  it('CRITERIMMO, salaires de la gestion d’octobre : la ligne du salarié, les profils de la GESTION d’abord ; un ajout écrit la ligne et relit tout', async () => {
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-tableau-couts="gestion"]');
    egal('[data-ligne-couts="10"] [data-cout="gestion-salaires"]', 0); // l'écran montre le calcul de la page Gestion (la route l'additionne ; ici simulée)
    await cliquer('[data-case-saisie="gestion-salaires-10"]');
    expect(container.querySelector('[data-panneau-couts="lignes"] h4')?.textContent).toBe('Salaires chargés — gestion, Octobre 2026');
    expect(container.querySelector('[data-ligne-cout="31"] select')?.getAttribute('data-choix-profil')).toBe('31');
    const groupes = [...container.querySelectorAll('[data-choix-profil="nouveau"] optgroup')].map((g) => [g.getAttribute('label'), [...g.querySelectorAll('option')].map((o) => o.textContent)]);
    expect(groupes).toEqual([['Location ou gestion', ['Chloé LOCATION']], ['Autres profils', ['Amélie', 'Zoé VENTE']]]); // Bruno (gestion) a déjà sa ligne ce mois-ci
    const avant = lectures();
    await act(async () => {
      const s = container.querySelector('[data-choix-profil="nouveau"]') as HTMLSelectElement; s.value = '5'; s.dispatchEvent(new Event('change', { bubbles: true }));
      const m = container.querySelector('[data-montant-nouveau]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(m, '1 999,99'); m.dispatchEvent(new Event('input', { bubbles: true }));
    }); await calmer();
    await cliquer('[data-ajouter-ligne]');
    expect(posts).toEqual([{ action: 'ligne-ajouter', ligne: { societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 10, compteId: 5, libelle: null, montantHt: 1999.99, tva: false } }]);
    expect(lectures()).toBeGreaterThan(avant); // tous les tableaux, la synthèse et le graphique relus
  });
  it('une écriture périmée : 409, le motif et « Recharger » ; rien de plus n’est envoyé', async () => {
    reponsePost = { status: 409, corps: { etat: 'refus', motif: 'Ce coût a été modifié entre-temps' } };
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-tableau-couts="gestion"]');
    await cliquer('[data-case-saisie="gestion-salaires-10"]');
    await cliquer('[data-retirer-ligne="31"]');
    expect(posts).toEqual([{ action: 'ligne-retirer', id: 31, version: 88 }]);
    expect(container.querySelector('[data-message-couts="conflit"]')?.textContent).toContain('modifié entre-temps');
    expect(container.querySelector('[data-recharger-couts]')).not.toBeNull();
  });
  it('MONGA de septembre : le montant du mois, la version de la Gestion ; un coût automatique se corrige à la source (C4)', async () => {
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-tableau-couts="gestion"]');
    await cliquer('[data-case-saisie="gestion-monga-9"]');
    await cliquer('[data-enregistrer-gestion]');
    expect(posts).toEqual([{ action: 'gestion-poste', annee: 2026, mois: 9, poste: 'monga', montantHt: 12.34, version: 12 }]);
    await cliquer('[data-tableau-couts="vente"]');
    await cliquer('[data-case-auto="vente-commissions-3"]');
    expect(container.querySelector('[data-detail-auto="vente"]')?.textContent).toContain('PARTAGÉE');
    expect(container.querySelector('[data-lien-source="vente"]')?.getAttribute('href')).toBe('/admin/transaction/criterimmo?vue=mois&annee=2026&mois=3');
    // « Variable négo (calculé) » : jamais éditable
    await cliquer('[data-tableau-couts="location"]');
    expect(container.querySelector('[data-cout="location-variable-calcule"] button')).toBeNull();
  });
});

describe('🔴 lot 3 — « Saisir les coûts du mois » (C16, C17)', () => {
  const PROFILS = [{ id: 3, libelle: 'Bruno GESTION', fonctions: ['gestion'] }, { id: 5, libelle: 'Chloé LOCATION', fonctions: ['location'] }];
  let posts: unknown[]; let reponses: { status: number; corps: unknown }[]; let validations: unknown[] | null;
  beforeEach(() => {
    posts = []; reponses = []; validations = [];
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url); urls.push(u);
      if (u.startsWith(URL_COUTS) && init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); const r = reponses.shift() ?? { status: 200, corps: { etat: 'ok', data: { id: 1 } } };
        return { ok: r.status === 200, status: r.status, json: async () => r.corps }; }
      if (u.startsWith(`${URL_COUTS}?rappel=1`)) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { rappel: validations === null ? null : { mois: { annee: 2026, mois: 10 }, mot: 'Coûts d’octobre à saisir' } } }) };
      if (u.startsWith(URL_COUTS) && !u.includes('empreinte')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { ...GLOBAL, saisie: true, coutsLignes: [], profils: PROFILS,
        versionsGestion: {}, monga: true, validations } }) };
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
  });
  const taper = async (sel: string, valeur: string) => {
    await act(async () => { const e = container.querySelector(sel) as HTMLInputElement | HTMLSelectElement;
      if (e instanceof HTMLSelectElement) { e.value = valeur; e.dispatchEvent(new Event('change', { bubbles: true })); return; }
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, valeur); e.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer();
  };
  it('C17 — le rappel à côté de l’onglet ; un clic ouvre la page sur OCTOBRE 2026 (horloge du 03/11/2026), le sélecteur = 6 mois révolus', async () => {
    await ouvrir('macj');
    expect(texte('[data-rappel-couts]')).toBe('Coûts d’octobre à saisir');
    await cliquer('[data-rappel-couts]');
    expect(container.querySelector('[data-saisie-mois]')?.getAttribute('data-saisie-mois')).toBe('macj-2026-10');
    expect([...container.querySelectorAll('[data-choix-mois] option')].map((o) => o.textContent)).toEqual(['Octobre 2026', 'Septembre 2026', 'Août 2026', 'Juillet 2026', 'Juin 2026', 'Mai 2026']);
    // MACJ : le bloc Vente seul ; « à compléter »
    expect([...container.querySelectorAll('[data-bloc-saisie]')].map((b) => b.getAttribute('data-bloc-saisie'))).toEqual(['vente']);
    expect(texte('[data-etat-saisie="global"]')).toBe('à compléter');
  });
  it('rien à compléter (sans la 452 ou tout validé) : pas de rappel ; le bouton en tête de l’onglet ouvre quand même la page', async () => {
    validations = null;
    await ouvrir('criterimmo');
    expect(container.querySelector('[data-rappel-couts]')).toBeNull();
    await cliquer('[data-onglet-mon-espace="couts"]');
    await cliquer('[data-ouvrir-saisie]');
    expect([...container.querySelectorAll('[data-bloc-saisie]')].map((b) => b.getAttribute('data-bloc-saisie'))).toEqual(['vente', 'location', 'gestion']);
    expect(container.querySelector('[data-validation-indisponible]')).not.toBeNull();
  });
  it('CRITERIMMO : un salarié de la gestion + MONGA + « complet » → les MÊMES gestes que le tableau, puis les validations ; retour à l’onglet', async () => {
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-ouvrir-saisie]');
    await cliquer('[data-ajouter-brouillon="gestion-salaires"]');
    await taper('[data-profil-brouillon="gestion-salaires-0"]', '3');
    await taper('[data-montant-brouillon="gestion-salaires-0"]', '2 100,50');
    await taper('[data-montant-poste="gestion-monga"]', '412,5');
    await cliquer('[data-complet="gestion-salaires"]'); await cliquer('[data-complet="gestion-monga"]');
    expect(texte('[data-etat-saisie="gestion"]')).toBe('à compléter'); // ADHOC et « Autres » de la gestion restent à valider
    await cliquer('[data-enregistrer-mois]');
    expect(posts).toEqual([
      { action: 'ligne-ajouter', ligne: { societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 10, compteId: 3, libelle: null, montantHt: 2100.5, tva: false } },
      { action: 'gestion-poste', annee: 2026, mois: 10, poste: 'monga', montantHt: 412.5, version: 0 },
      { action: 'valider', validation: { societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 10 }, valide: true },
      { action: 'valider', validation: { societe: 'criterimmo', famille: 'gestion', poste: 'monga', annee: 2026, mois: 10 }, valide: true },
    ]);
    expect(container.querySelector('[data-saisie-mois]')).toBeNull(); // retour à l'onglet « Les coûts »
    expect(container.querySelector('[data-tuiles-couts]')).not.toBeNull();
  });
  it('un montant illisible : rien n’est envoyé ; un conflit (409) arrête tout et le dit', async () => {
    await ouvrir('macj'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-ouvrir-saisie]');
    await cliquer('[data-ajouter-brouillon="vente-autres"]');
    await taper('[data-libelle-brouillon="vente-autres-0"]', 'Logiciel');
    await taper('[data-montant-brouillon="vente-autres-0"]', 'douze');
    await cliquer('[data-enregistrer-mois]');
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-message-saisie="refus"]')).not.toBeNull();
    await taper('[data-montant-brouillon="vente-autres-0"]', '12');
    reponses = [{ status: 409, corps: { etat: 'refus', motif: 'Ce coût a été modifié entre-temps' } }];
    await cliquer('[data-enregistrer-mois]');
    expect(posts).toHaveLength(1);
    expect(texte('[data-message-saisie="conflit"]')).toContain('modifié entre-temps');
    expect(container.querySelector('[data-saisie-mois]')).not.toBeNull();
  });
});

describe('🔴 R2 / D22 (Arno, 03/11/2026)', () => {
  it('D22 — l’ordre des cartes : Vente | Location | Gestion | Coûts totaux', async () => {
    await ouvrir('tous'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect([...container.querySelectorAll('[data-tuile-couts]')].map((e) => e.getAttribute('data-tuile-couts'))).toEqual(['vente', 'location', 'gestion', 'total']);
    expect(texte('[data-tuile-couts="total"] .tdb-tuile-mot')).toBe('Coûts totaux HT — 2026');
  });
  it('R2 — « Autres » : TVA 20 % par défaut, au choix par ligne ; envoyée avec la ligne', async () => {
    const posts: unknown[] = [];
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url); urls.push(u);
      if (u.startsWith(URL_COUTS) && init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { id: 9 } }) }; }
      if (u.startsWith(URL_COUTS) && !u.includes('empreinte') && !u.includes('rappel')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { ...GLOBAL, saisie: true, coutsLignes: [],
        profils: [], versionsGestion: {}, monga: true, validations: null } }) };
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
    await ouvrir('macj'); await cliquer('[data-onglet-mon-espace="couts"]');
    await cliquer('[data-case-saisie="vente-autres-10"]');
    expect((container.querySelector('[data-tva-ligne="nouveau"]') as HTMLSelectElement).value).toBe('20');
    await act(async () => {
      const l = container.querySelector('[data-libelle-nouveau]') as HTMLInputElement; const m = container.querySelector('[data-montant-nouveau]') as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(l, 'Assurance'); l.dispatchEvent(new Event('input', { bubbles: true })); set.call(m, '100'); m.dispatchEvent(new Event('input', { bubbles: true }));
      const t = container.querySelector('[data-tva-ligne="nouveau"]') as HTMLSelectElement; t.value = '0'; t.dispatchEvent(new Event('change', { bubbles: true }));
    }); await calmer();
    await cliquer('[data-ajouter-ligne]');
    expect(posts).toEqual([{ action: 'ligne-ajouter', ligne: { societe: 'macj', famille: 'vente', poste: 'autres', annee: 2026, mois: 10, compteId: null, libelle: 'Assurance', montantHt: 100, tva: false } }]);
  });
});

describe('🔴 D23 / D24 (Arno, 03/11/2026) — un seul rappel ; le formulaire du mois, compact et séparé par activité', () => {
  const LIGNES = [{ id: 31, societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2026, mois: 10, compteId: 3, compteLibelle: 'Bruno', libelle: null, montantHt: 2100.5, tva: false, version: 8 },
    { id: 33, societe: 'criterimmo', famille: 'vente', poste: 'autres', annee: 2026, mois: 10, compteId: null, compteLibelle: null, libelle: 'Portail', montantHt: 349, tva: true, version: 9 }];
  beforeEach(() => {
    const avant = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url); urls.push(u);
      if (u.startsWith(`${URL_COUTS}?rappel=1`)) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { rappel: { mois: { annee: 2026, mois: 10 }, mot: 'Coûts d’octobre à saisir' } } }) };
      if (u.startsWith(URL_COUTS) && !u.includes('empreinte') && init?.method !== 'POST') return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { ...GLOBAL, saisie: true,
        coutsLignes: LIGNES, coutsSaisis: [...SAISIS_COUTS, ...LIGNES], profils: [{ id: 3, libelle: 'Bruno', fonctions: ['gestion'] }], versionsGestion: {}, monga: true, validations: [] } }) };
      return (avant as unknown as (u: string, i?: RequestInit) => Promise<unknown>)(url, init);
    }) as unknown as typeof fetch;
  });
  it('D23 — un seul cartouche (sur la ligne des onglets) ; le bouton « Saisir les coûts du mois » reste', async () => {
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]');
    expect(container.querySelectorAll('[data-rappel-couts]').length).toBe(1);
    expect(container.querySelector('[data-rappel-tete]')).toBeNull();
    expect(texte('[data-ouvrir-saisie]')).toBe('Saisir les coûts du mois');
  });
  it('D24 — trois blocs aux couleurs du graphique ; le total de chaque bloc = le tableau « Les coûts » du mois, au centime ; sous-tableaux ; pied : total + Enregistrer', async () => {
    await ouvrir('criterimmo'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-ouvrir-saisie]');
    const blocs = [...container.querySelectorAll('[data-bloc-saisie]')];
    expect(blocs.map((b) => [b.getAttribute('data-bloc-saisie'), b.classList.contains(`trx-serie--${({ vente: 1, location: 3, gestion: 5 } as Record<string, number>)[b.getAttribute('data-bloc-saisie')!]}`)]))
      .toEqual([['vente', true], ['location', true], ['gestion', true]]);
    const e = { ...E_COUTS, saisis: [...SAISIS_COUTS, ...LIGNES] as typeof E_COUTS.saisis };
    const oct = coutsDeLAnnee(e, 'criterimmo', 2026).mois[9];
    const debut = (sel: string) => (texte(sel).split(' (')[0]);
    expect(debut('[data-total-bloc="vente"]')).toBe(eur(oct.vente.total.htC / 100).replace(/\s/g, ' '));
    expect(debut('[data-total-bloc="location"]')).toBe(eur(oct.location!.total.htC / 100).replace(/\s/g, ' '));
    expect(debut('[data-total-bloc="gestion"]')).toBe(eur(oct.gestion!.total.htC / 100).replace(/\s/g, ' '));
    // les sous-tableaux : la ligne du salarié (gestion), la ligne « Autres » (vente) avec sa TVA ; le sous-total du poste
    expect(container.querySelector('[data-poste-saisie="gestion-salaires"] [data-brouillon="gestion-salaires-0"]')).not.toBeNull();
    expect((container.querySelector('[data-tva-brouillon="vente-autres-0"]') as HTMLSelectElement).value).toBe('20');
    expect(texte('[data-sous-total="gestion-salaires"]')).toBe(eur(2100.5).replace(/\s/g, ' '));
    // les calculés : une ligne repliée par bloc ; le pied, toujours là
    expect(container.querySelectorAll('details[data-auto-saisie]').length).toBe(2);
    expect(container.querySelector('[data-saisie-pied] [data-enregistrer-mois]')).not.toBeNull();
    expect(texte('[data-total-general] strong').split(' (')[0]).toBe(eur(oct.total.htC / 100).replace(/\s/g, ' '));
  });
  it('MACJ : le bloc Vente seul, et « vente seulement »', async () => {
    await ouvrir('macj'); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-ouvrir-saisie]');
    expect([...container.querySelectorAll('[data-bloc-saisie]')].map((b) => b.getAttribute('data-bloc-saisie'))).toEqual(['vente']);
    expect(texte('[data-saisie-macj]')).toContain('vente seulement');
  });
});
