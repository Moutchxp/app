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
import { E_COUTS, GESTION_COUTS, LIGNES_LOCATION_COUTS, RETROS_COUTS, SALAIRES_LOCATION_COUTS, VENTES_COUTS } from '../../../../lib/mon-espace/__fixtures__/couts';

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
  locationCa: { lignes: LIGNES_LOCATION_COUTS, retrocessions: [], salaires: SALAIRES_LOCATION_COUTS } };
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
    egal('[data-ligne-couts="annee"] [data-cout="vente-total"]', c.vente.commissions.htC + c.vente.apporteurs.htC + c.vente.exterieures.htC);
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
    const cellules = [...container.querySelectorAll('[data-ligne-couts="annee"] td')].map((e) => e.getAttribute('data-cout') ?? (e.hasAttribute('data-poste-futur') ? 'futur' : ''));
    expect(cellules).toEqual(['location-apporteurs', 'location-variable-calcule', 'location-primes', 'location-variable', 'location-salaires', 'futur', 'futur', 'futur', 'location-total']);
  });
  it.each(['tous', 'criterimmo'] as const)('C12 — %s : Location, Gestion, Synthèse = « Coûts globaux » au centime (2025, 2026) ; Variable négo (calculé) hors totaux', async (a) => {
    await ouvrir(a); await cliquer('[data-onglet-mon-espace="couts"]');
    for (const annee of [2025, 2026]) {
      await cliquer(`[data-couts-mon-espace] [data-onglet-annee="${annee}"]`);
      const t = coutsDeLAnnee(E_COUTS, a, annee); const c = coutsGlobaux(E_COUTS, annee, null);
      const L = t.annee.location!; const G = t.annee.gestion!;
      // les totaux de familles = les colonnes de « Coûts globaux »
      expect(L.total.htC).toBe(c.location!.apporteurs.htC + c.location!.primesDeduites.htC + c.location!.variableDeduit.htC + c.location!.salaires.htC);
      expect(G.total.htC).toBe(c.gestion.adhoc.htC + c.gestion.monga.htC + c.gestion.salaires.htC);
      await cliquer('[data-tableau-couts="location"]');
      egal('[data-ligne-couts="annee"] [data-cout="location-total"]', L.total.htC);
      egal('[data-ligne-couts="annee"] [data-cout="location-variable-calcule"]', L.variableCalcule.htC);
      for (let m = 1; m <= 12; m++) {
        const x = t.mois[m - 1].location!;
        const attendu = x.apporteurs.htC + x.variable.htC + x.salaires.htC; // jamais le variable calculé
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
    expect(container.querySelectorAll('[data-ligne-couts="annee"] [data-poste-futur]').length).toBe(3);
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
