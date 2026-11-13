// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_EMPREINTE, URL_MES_AFFAIRES } from './MesCompteurs';
import { eur } from '../../../../lib/transaction/format';
import { URL_COUTS } from '../../../../lib/mon-espace/couts';
import type { Agence } from '../../../../lib/mon-espace/agence';
import { DUS_COUTS, LIGNES_LOCATION_COUTS, RETROS_COUTS, SAISIS_COUTS, SALAIRES_LOCATION_COUTS, VENTES_COUTS } from '../../../../lib/mon-espace/__fixtures__/couts';

/**
 * 🔴🔴 MON ESPACE « COÛTS ET CA » (Arno, 13/11/2026, migration 471) — le VRAI écran, routes simulées (rien n'est écrit) :
 *   · l'onglet « Coûts et CA » ; la saisie du mois en DEUX parties séparées (Coûts : l'existant ; CA gestion : honoraires, GLI, CA global calculé),
 *     chacune son badge ; MACJ : pas de partie CA ; HT / TTC ; « Enregistrer » enregistre les deux ;
 *   · l'indicateur unifié EN HAUT de l'accueil (associés seulement) : un clic ouvre la bonne structure, le bon mois, la bonne partie ; un compte
 *     non associé : aucune lecture de l'indicateur, rien dans la page.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const JOUR = '2026-11-03';
const OCT = { annee: 2026, mois: 10 };
const VIDE = { compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, actees: { nb: 0, ids: [], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] };
const titulaire = (associe: boolean) => ({ id: 1, prenom: 'Arno', administrateur: true, associe });
const agence = (cle: Agence, associe: boolean) => ({ disponible: true, aujourdhui: JOUR, titulaire: titulaire(associe), ventes: [], compteurs: VIDE, retrocessions: [],
  statutsNegociateurs: {}, nomsNegociateurs: {}, agence: { cle, societe: cle === 'tous' ? null : cle } });
const perso = (associe: boolean) => ({ disponible: true, aujourdhui: JOUR, titulaire: titulaire(associe), ventes: [], compteurs: VIDE, retrocessions: [] });
const DONNEES = { disponible: true, aujourdhui: JOUR, ventes: VENTES_COUTS, gestion: [], location: {}, locationTtcC: {}, retrocessions: RETROS_COUTS, statutsNegociateurs: {},
  locationCa: { lignes: LIGNES_LOCATION_COUTS, retrocessions: [], salaires: SALAIRES_LOCATION_COUTS, dus: DUS_COUTS }, coutsSaisis: SAISIS_COUTS, coutsLignes: [],
  saisie: true, profils: [], versionsGestion: { '2026-10': { version: 7, origine: 'saisie' } }, monga: true, validations: [], caGestion: true };
const ALERTES: unknown[] = [{ partie: 'couts', societe: 'criterimmo', mois: OCT, mot: 'Coûts d’octobre à saisir' }, { partie: 'ca', societe: 'criterimmo', mois: OCT, mot: 'CA gestion d’octobre à saisir' }];
let associe: boolean; let urls: string[]; let posts: Record<string, unknown>[]; let version: number;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  associe = true; urls = []; posts = []; version = 7;
  ALERTES.splice(0, ALERTES.length, { partie: 'couts', societe: 'criterimmo', mois: OCT, mot: 'Coûts d’octobre à saisir' }, { partie: 'ca', societe: 'criterimmo', mois: OCT, mot: 'CA gestion d’octobre à saisir' });
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); urls.push(u);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_EMPREINTE)) return ok({ empreinte: '#0' });
    if (u.startsWith(URL_COUTS) && init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(corps);
      // la route : une écriture sur la ligne de gestion du mois rend sa nouvelle version
      if (corps.action === 'ca-gestion' || corps.action === 'gestion-poste') { version += 5; return ok({ id: null, version }); }
      return ok({ id: 1 });
    }
    if (u.startsWith(`${URL_COUTS}?rappel=1`)) return associe ? ok({ rappel: null, alertes: ALERTES }) : { ok: false, status: 403, json: async () => ({ etat: 'refus' }) };
    if (u.startsWith(URL_COUTS)) return associe ? ok(DONNEES) : { ok: false, status: 403, json: async () => ({ etat: 'refus' }) };
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
const montant = (x: number): string => eur(x).replace(/\s/g, ' ');
const ouvrir = async (espace: Agence | null) => {
  await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer();
  if (espace !== null) await cliquer(`[data-espace="${espace}"]`);
};
const taper = async (sel: string, valeur: string) => {
  await act(async () => { const e = container.querySelector(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(e, valeur); e.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer();
};
const cocher = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLInputElement).click(); }); await calmer(); };
const ouvrirSaisie = async (espace: Agence) => { await ouvrir(espace); await cliquer('[data-onglet-mon-espace="couts"]'); await cliquer('[data-ouvrir-saisie]'); };

describe('🔴 l’indicateur unifié, en haut de l’accueil de « Mon espace »', () => {
  it('un associé : l’icône rouge et les deux libellés précis, AVANT « Voir » ; l’ancien cartouche de la ligne des onglets n’existe plus (remplacé)', async () => {
    await ouvrir(null);
    const bloc = container.querySelector('[data-alertes-saisie]');
    expect(bloc).not.toBeNull();
    expect([...bloc!.querySelectorAll('[data-alerte-saisie]')].map((b) => [b.getAttribute('data-alerte-saisie'), b.textContent])).toEqual([
      ['couts', 'Coûts d’octobre à saisir'], ['ca', 'CA gestion d’octobre à saisir']]);
    expect(bloc!.querySelector('.mes-alertes-icone')).not.toBeNull();
    expect(bloc!.compareDocumentPosition(container.querySelector('[data-ligne-espace]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[data-ligne-onglets] [data-alerte-saisie]')).toBeNull();
  });
  it('un clic sur « CA gestion d’octobre à saisir » (depuis mon espace) : CRITERIMMO, l’onglet « Coûts et CA », la saisie d’OCTOBRE, sur la partie CA', async () => {
    await ouvrir(null);
    await cliquer('[data-alerte-saisie="ca"]'); await calmer();
    expect(urls.some((u) => u === `${URL_MES_AFFAIRES}?agence=criterimmo`)).toBe(true);
    expect(container.querySelector('[data-onglet-mon-espace="couts"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-saisie-mois]')?.getAttribute('data-saisie-mois')).toBe('criterimmo-2026-10');
    expect(container.querySelector('[data-partie-saisie="ca"]')).not.toBeNull();
  });
  it('🔴 un compte NON associé (collaborateur, administrateur non associé) : l’indicateur n’est jamais lu, rien n’est rendu — vue perso comme mode agence', async () => {
    associe = false;
    for (const e of [null, 'criterimmo'] as const) {
      act(() => { root.unmount(); }); root = createRoot(container); urls = [];
      await ouvrir(e);
      expect(urls.some((u) => u.includes('rappel=1'))).toBe(false);
      expect(container.querySelector('[data-alertes-saisie]')).toBeNull();
      expect(container.innerHTML).not.toMatch(/à saisir/);
      expect(container.querySelector('[data-onglet-mon-espace="couts"]')).toBeNull();
      expect(container.querySelector('[data-lien-recap]')).toBeNull(); // 🔴 le récapitulatif non plus
    }
  });
  it('🔴 Récapitulatif : le lien à côté de l’indicateur — et encore là quand tout est complet (aucune alerte)', async () => {
    await ouvrir(null);
    expect(container.querySelector('[data-tete-couts] [data-lien-recap]')?.getAttribute('href')).toBe('/admin/mon-espace/recapitulatif?agence=criterimmo');
    ALERTES.length = 0;
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir('macj');
    expect(container.querySelector('[data-alertes-saisie]')).toBeNull();
    expect(container.querySelector('[data-tete-couts] [data-lien-recap]')?.getAttribute('href')).toBe('/admin/mon-espace/recapitulatif?agence=macj');
    await cliquer('[data-onglet-mon-espace="couts"]');
    expect(container.querySelector('[data-bouton-saisie] [data-lien-recap]')).not.toBeNull(); // dans l'onglet, à côté de « Saisir les coûts du mois »
    await cliquer('[data-ouvrir-saisie]');
    expect(container.querySelector('[data-saisie-tete] [data-lien-recap]')).not.toBeNull(); // dans la saisie, à côté de « Retour aux coûts »
  });
});

describe('🔴 « Coûts et CA » : la saisie du mois en deux parties', () => {
  it('l’onglet s’appelle « Coûts et CA » ; CRITERIMMO : la partie Coûts (l’existant, ses trois blocs) PUIS la partie CA gestion, chacune son badge', async () => {
    await ouvrirSaisie('criterimmo');
    expect(container.querySelector('[data-onglet-mon-espace="couts"]')?.textContent).toBe('Coûts et CA');
    expect([...container.querySelectorAll('[data-partie-saisie]')].map((p) => p.getAttribute('data-partie-saisie'))).toEqual(['couts', 'ca']);
    expect([...container.querySelectorAll('[data-partie-saisie="couts"] [data-bloc-saisie]')].map((b) => b.getAttribute('data-bloc-saisie'))).toEqual(['vente', 'location', 'gestion']);
    expect(container.querySelector('[data-partie-saisie="ca"] [data-bloc-saisie]')).toBeNull(); // jamais mêlé aux coûts
    expect([texte('[data-etat-saisie="partie-couts"]'), texte('[data-etat-saisie="partie-ca"]')]).toEqual(['à compléter', 'à compléter']);
    expect([...container.querySelectorAll('[data-partie-saisie="ca"] [data-poste-saisie]')].map((p) => p.getAttribute('data-poste-saisie'))).toEqual(['ca-honoraires', 'ca-gli']);
    expect([(container.querySelector('[data-taux-ca="honoraires"]') as HTMLInputElement).value, (container.querySelector('[data-taux-ca="gli"]') as HTMLInputElement).value]).toEqual(['20', '20']);
    expect(container.querySelector('[data-ca-global-montant] input')).toBeNull(); // calculé, non modifiable
    expect(texte('[data-total-general]')).toMatch(/^Total des coûts du mois \(HT\)/);
    expect(texte('[data-total-ca-gestion]')).toMatch(/^Total CA gestion du mois \(HT\)/);
  });
  it('le CA global = honoraires + GLI, en direct (HT) ; cocher les deux lignes, même à 0 € : la partie CA devient « complet »', async () => {
    await ouvrirSaisie('criterimmo');
    await taper('[data-montant-ca="honoraires"]', '1000'); await taper('[data-montant-ca="gli"]', '250,50'); await taper('[data-taux-ca="gli"]', '10');
    expect(texte('[data-ca-global-montant]').split(' (')[0]).toBe(montant(1250.5));
    expect(texte('[data-ttc-ca="gli"]')).toBe(`${montant(275.55)} TTC`);
    await cocher('[data-complet="ca-honoraires"]');
    expect(texte('[data-etat-saisie="partie-ca"]')).toBe('à compléter');
    await taper('[data-montant-ca="gli"]', '0');
    await cocher('[data-complet="ca-gli"]');
    expect(texte('[data-etat-saisie="partie-ca"]')).toBe('complet');
    expect(texte('[data-etat-saisie="partie-couts"]')).toBe('à compléter'); // chaque partie le sien
  });
  it('HT | TTC : le CA global suit le bouton (1 000 € à 20 % + 250,50 € à 10 % = 1 475,55 € TTC)', async () => {
    window.localStorage.setItem('trx-affichage-montants', 'ttc');
    await ouvrirSaisie('criterimmo');
    await taper('[data-montant-ca="honoraires"]', '1000'); await taper('[data-montant-ca="gli"]', '250,50'); await taper('[data-taux-ca="gli"]', '10');
    expect(texte('[data-ca-global-montant]').split(' (')[0]).toBe(montant(1475.55));
    expect(texte('[data-total-ca-gestion]')).toContain('(TTC)');
  });
  it('« Enregistrer » enregistre les deux parties : le CA (chaque geste sur la ligne du mois avec la version À JOUR), puis les validations', async () => {
    await ouvrirSaisie('criterimmo');
    await taper('[data-montant-ca="honoraires"]', '1000'); await taper('[data-montant-ca="gli"]', '250,50'); await taper('[data-taux-ca="gli"]', '10');
    await cocher('[data-complet="ca-honoraires"]'); await cocher('[data-complet="ca-gli"]');
    await cliquer('[data-enregistrer-mois]'); await calmer();
    const ca = posts.filter((p) => p.action === 'ca-gestion');
    expect(ca).toEqual([{ action: 'ca-gestion', annee: 2026, mois: 10, poste: 'honoraires', montantHt: 1000, tauxTva: 20, version: 7 },
      { action: 'ca-gestion', annee: 2026, mois: 10, poste: 'gli', montantHt: 250.5, tauxTva: 10, version: 12 }]);
    expect(posts.filter((p) => p.action === 'valider').map((p) => p.validation)).toEqual([
      { societe: 'criterimmo', famille: 'gestion', poste: 'honoraires', annee: 2026, mois: 10 }, { societe: 'criterimmo', famille: 'gestion', poste: 'gli', annee: 2026, mois: 10 }]);
  });
  it('MACJ (pas de gestion) : la partie CA gestion n’apparaît pas, ni son total', async () => {
    await ouvrirSaisie('macj');
    expect([...container.querySelectorAll('[data-partie-saisie]')].map((p) => p.getAttribute('data-partie-saisie'))).toEqual(['couts']);
    expect(container.querySelector('[data-total-ca-gestion]')).toBeNull();
    await cliquer('[data-structure="criterimmo"]');
    expect(container.querySelector('[data-partie-saisie="ca"]')).not.toBeNull();
  });
});

describe('🔴 Récapitulatif → la saisie du mois (salaires chargés, « Autres »)', () => {
  it('?espace=criterimmo&onglet=couts&saisie=2026-03 : la saisie s’ouvre sur MARS 2026, dans la liste de tous les mois terminés', async () => {
    window.history.replaceState(null, '', '/?espace=criterimmo&onglet=couts&saisie=2026-03&partie=couts');
    await ouvrir(null);
    expect(container.querySelector('[data-saisie-mois]')?.getAttribute('data-saisie-mois')).toBe('criterimmo-2026-03');
    expect([...container.querySelectorAll('[data-choix-mois] option')].map((o) => o.textContent)).toEqual(['Octobre 2026', 'Septembre 2026', 'Août 2026', 'Juillet 2026', 'Juin 2026', 'Mai 2026', 'Avril 2026', 'Mars 2026', 'Février 2026', 'Janvier 2026']);
    expect((container.querySelector('[data-choix-mois]') as HTMLSelectElement).value).toBe('2026-03');
    expect(container.querySelector('[data-mois-hors-plage]')).toBeNull();
  });
  it.each([['2025-06', 'Juin 2025'], ['2026-11', 'Novembre 2026'], ['2027-02', 'Février 2027']])('?saisie=%s (hors de la plage) : le dernier mois écoulé (octobre 2026) et une phrase discrète — aucune erreur', async (cle, mot) => {
    window.history.replaceState(null, '', `/?espace=criterimmo&onglet=couts&saisie=${cle}&partie=couts`);
    await ouvrir(null);
    expect(container.querySelector('[data-saisie-mois]')?.getAttribute('data-saisie-mois')).toBe('criterimmo-2026-10');
    expect(texte('[data-mois-hors-plage]')).toBe(`${mot} ne se saisit pas ici (la saisie va de janvier 2026 au dernier mois terminé) : voici Octobre 2026.`);
    expect([...container.querySelectorAll('[data-choix-mois] option')].map((o) => o.textContent)).not.toContain(mot);
  });
  it('MACJ : la même liste (janvier → octobre 2026), groupée sous « 2026 »', async () => {
    window.history.replaceState(null, '', '/?espace=macj&onglet=couts&saisie=2026-01&partie=couts');
    await ouvrir(null);
    expect(container.querySelector('[data-saisie-mois]')?.getAttribute('data-saisie-mois')).toBe('macj-2026-01');
    expect([...container.querySelectorAll('[data-choix-mois] optgroup')].map((g) => g.getAttribute('label'))).toEqual(['2026']);
    expect([...container.querySelectorAll('[data-choix-mois] option')].map((o) => o.textContent)).toEqual(['Octobre 2026', 'Septembre 2026', 'Août 2026', 'Juillet 2026', 'Juin 2026', 'Mai 2026', 'Avril 2026', 'Mars 2026', 'Février 2026', 'Janvier 2026']);
  });
});

describe('🔴 ?saisie= seul (l’adresse qui reste après un passage par le récapitulatif)', () => {
  it('?saisie=2026-01&partie=couts : « Coûts et CA » s’ouvre sur CRITERIMMO, saisie de JANVIER 2026, la liste janvier → octobre 2026', async () => {
    window.history.replaceState(null, '', '/?saisie=2026-01&partie=couts');
    await ouvrir(null);
    expect(container.querySelector('[data-saisie-mois]')?.getAttribute('data-saisie-mois')).toBe('criterimmo-2026-01');
    expect([...container.querySelectorAll('[data-choix-mois] option')].length).toBe(10);
  });
});
