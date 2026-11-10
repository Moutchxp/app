// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';
import { BlocPreavisAccueil, CLE_TRI_PLEINE_PAGE } from '../location/PreavisAccueil';
import { INTERVALLE_PREAVIS_MS } from '../location/preavisSynchro';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';
import type { PrevisiteAffiche } from '../../../../lib/location/previsite';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';

/**
 * 🔴🔴 LES PRÉAVIS DANS LA GESTION, SYNCHRONISÉS AVEC LA LOCATION (Arno, 10/11/2026) — les VRAIS écrans, routes simulées (une seule
 * « base » en mémoire pour les deux côtés) : rien ne part, rien n'est écrit.
 *   · le bloc sous les Tâches = LE MÊME composant que la Location, la même donnée : une action d'un côté se voit de l'autre ;
 *   · relu toutes les 30 s, au retour sur l'onglet, aussitôt après un geste ;
 *   · « Préavis » dans le menu, entre « Tâches » et « Syndics », pastille = nombre EXACT de préavis en alerte, absente à zéro ;
 *   · « Ouvrir en pleine page » depuis les deux blocs ; la pleine page : chaque tri dans les deux sens, filtres, recherche, tri conservé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ENCART: EncartLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: false, etage: '3', porte: 'G', numLotCopro: null,
  numeroLot: '100', batiment: 'B', escalier: null, surfaceCarrez: null, surfaceHabitable: null, surface: null, surfaceExterieure: null,
  nombrePieces: null, ascenseur: true, digicode: true, digicodeCode: '4521A', precisionAcces: 'Code au portail', dpeClasse: null, dpeDate: null,
  dpeNonSoumis: null, chauffage: null, epoqueConstruction: null,
  lots: [
    { lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: null, numeroLot: '100', porte: 'G', place: false },
    { lotId: 8, role: 'annexe', type: 'Parking', etage: '-1', numLotCopro: null, numeroLot: null, porte: '12', place: true },
  ],
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: null,
  bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null },
  coordonnees: {
    proprietaire: { telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] },
    locataires: [
      { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: ['06 55 66 77 88'], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] },
    ],
  },
};
const pv = (o: Partial<PrevisiteAffiche> = {}): PrevisiteAffiche => ({ statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null, ...o });
const ligne = (cle: string, occ: number, nom: string, adresse: string, recuLe: string, dateMax: string, previsite: PrevisiteAffiche, edl: string | null = null): LignePreavisAccueil => ({
  cle, lotId: 7, adresse, occupationId: occ, occupationIds: [occ], locataires: [{ occupationId: occ, locataireId: occ * 10, nom }],
  recuLe, dateMax, etatDesLieuxLe: edl, previsite,
});
const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0, evenementsOuverts: 0,
  messagesCaptures: 1, messagesExclus: 0, derniereReleveLe: new Date().toISOString(), dernierMailLe: new Date().toISOString(),
  veille: { derniereLe: new Date().toISOString(), resultat: 'ok', erreur: null, intervalleS: 60, toleranceIntervalles: 10 },
  suite: { resultat: null, detail: null, ms: null }, copie: { derniere: null, restantes: 0, motifs: [] },
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

let racines: { c: HTMLDivElement; r: Root }[] = [];
let lignes: LignePreavisAccueil[];
let lecturesPreavis = 0;
let lecturesGestion = 0;
let postsLocation: Record<string, unknown>[] = [];
let lecturesLocation = 0;
beforeEach(() => {
  racines = []; lecturesPreavis = 0; lecturesGestion = 0; postsLocation = []; lecturesLocation = 0;
  try { window.localStorage.clear(); } catch { /* sans stockage */ }
  lignes = [
    ligne('A', 21, 'ALERTE Alice', '1 rue Alpha, Paris', '2026-09-01', '2026-12-01', pv({ statut: 'alerte' }), '2026-12-02'),
    ligne('B', 31, 'BERNARD Bob', '2 rue Beta, Lyon', '2026-10-15', '2027-01-15', pv({ statut: 'programmee', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 }, tacheId: 500 }), '2027-01-10'),
    ligne('C', 41, 'CHARLES Carla', '3 rue Gamma, Nice', '2026-10-01', '2027-02-01', pv({ statut: 'alerte' })),
  ];
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const s = decodeURIComponent(String(u));
    if (init?.method === 'POST' && s.startsWith('/api/admin/location')) {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      postsLocation.push(corps);
      if (corps.action === 'apercu-refus-previsite') return ok({ mails: [{ sorte: 'previsite_refus', objet: 'x', a: ['c@exemple.test'], cc: [], texte: String(corps.texte) }], sansEmail: [] });
      if (corps.action === 'refus-previsite') {
        // La « base » change : la ligne C passe en refusée (un seul serveur pour la Location et la Gestion).
        lignes = lignes.map((l) => (l.occupationIds.includes(41) ? { ...l, previsite: pv({ statut: 'refusee' }) } : l));
        return ok({ envois: [{ sorte: 'previsite_refus', objet: 'x', a: ['c@exemple.test'], cc: [], envoye: true, motif: null }], statut: 'refusee', tacheAnnulee: null });
      }
      return ok({});
    }
    // 🔴 Option A — la Gestion lit par SA route de lecture ; la Location par la sienne : une seule « base » derrière.
    if (s.includes('/api/admin/gestion/preavis?preavisEnCours=1')) { lecturesPreavis += 1; lecturesGestion += 1; return ok({ disponible: true, etatDesLieux: true, planification: true, previsite: true, lignes }); }
    if (s.includes('/api/admin/gestion/preavis?encartBail=')) return ok(ENCART);
    if (s.startsWith('/api/admin/location')) lecturesLocation += 1;
    if (s.includes('/api/admin/location?preavisEnCours=1')) { lecturesPreavis += 1; return ok({ disponible: true, etatDesLieux: true, planification: true, previsite: true, lignes }); }
    if (s.includes('/api/admin/location?encartBail=')) return ok(ENCART);
    if (s.includes('/api/admin/location?previsiteRefus=')) return ok({ texte: 'Bonjour,\n\nMalgré nos recommandations…', objet: 'Pré-visite d’état des lieux de sortie', sansEmail: [] });
    if (s.includes('/api/admin/location')) return ok([]);
    if (s.includes('/empreinte')) return { ok: true, json: async () => ({ messageMax: 1 }) } as unknown as Response;
    if (s.includes('/taches')) return { ok: true, json: async () => ({ taches: [], collaborateurs: [], evenements: [] }) } as unknown as Response;
    if (s.includes('/boite')) return { ok: true, json: async () => ({ lignes: [], suivant: null, total: null, comptes: {} }) } as unknown as Response;
    if (s.includes('/syndics')) return { ok: true, json: async () => ({ syndics: [] }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { for (const x of racines) { act(() => x.r.unmount()); x.c.remove(); } document.querySelectorAll('.mis-voile').forEach((n) => n.remove()); vi.useRealTimers(); vi.restoreAllMocks(); });

const calmer = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const monter = async (el: ReturnType<typeof createElement>): Promise<HTMLDivElement> => {
  const c = document.createElement('div'); document.body.appendChild(c); const r = createRoot(c); racines.push({ c, r });
  await act(async () => { r.render(el); }); await calmer();
  return c;
};
const gestion = async (adresse: string, location = true) => {
  window.history.replaceState(null, '', `/admin/gestion${adresse}`);
  const c = await monter(createElement(GestionVue, { location }));
  // 🔴 Arno (10/11/2026) — sous les Tâches, le bloc est REPLIÉ à l'ouverture : ces épreuves portent sur son intérieur, on l'ouvre.
  const repli = c.querySelector('[data-bloc-preavis-gestion] [data-repli-preavis]');
  if (repli !== null) { await act(async () => { (repli as HTMLElement).click(); }); await calmer(); }
  return c;
};
const clic = async (el: Element | null) => { if (el === null) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const ordre = (c: HTMLElement) => [...c.querySelectorAll('[data-ligne-preavis]')].map((li) => li.getAttribute('data-ligne-preavis'));
const statutLigne = (c: HTMLElement, cle: string) => c.querySelector(`[data-ligne-preavis="${cle}"] .pva-detail`)?.textContent ?? '';

describe('🔴 1 — sous les Tâches de la Gestion : LE bloc de la Location, la même donnée', () => {
  it('le bloc est rendu sous les Tâches (écran partagé), avec les pastilles et le cartouche', async () => {
    const c = await gestion('?ecran=partage');
    const bloc = c.querySelector('[data-bloc-preavis-gestion] [data-bloc-preavis]');
    expect(bloc).not.toBeNull();
    expect(c.querySelector('[data-bloc-preavis-gestion] [data-filtre-previsite="alerte"]')?.textContent).toBe('Alerte préavis 2');
    expect(c.querySelector('[data-bloc-preavis-gestion] [data-ligne-preavis="A"] [data-cartouche-previsite="alerte"]')).not.toBeNull();
    // sous les Tâches : après le tableau des tâches dans le document
    const taches = c.querySelector('.gst-taches, [data-tableau-taches]') ?? [...c.querySelectorAll('section, div')].find((x) => /Tâches/.test(x.querySelector('h2')?.textContent ?? ''));
    if (taches) expect(taches.compareDocumentPosition(bloc as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('MÊME DONNÉE DES DEUX CÔTÉS APRÈS UNE ACTION : le refus envoyé depuis la Location se voit aussitôt dans la Gestion (et inversement, même composant)', async () => {
    const loc = await monter(createElement(BlocPreavisAccueil, { gestion: true, pleinePage: '/admin/location/preavis' }));
    const ges = await gestion('?ecran=partage');
    expect(statutLigne(ges, 'C')).toContain('Alerte préavis');
    await clic(loc.querySelector('[data-ouvrir-preavis="C"]'));
    await clic(loc.querySelector('[data-refus-previsite]'));
    await clic(document.querySelector('[data-recap-previsite]'));
    await clic(document.querySelector('[data-confirmer-previsite]'));
    await clic(document.querySelector('[data-fermer-previsite]'));
    await calmer();
    expect(statutLigne(loc, 'C')).toContain('Pré-visite refusée / absente');
    expect(statutLigne(ges, 'C')).toContain('Pré-visite refusée / absente');
    expect(ges.querySelector('[data-bloc-preavis-gestion] [data-filtre-previsite="alerte"]')?.textContent).toBe('Alerte préavis 1');
  });
  it('relu au retour sur l’onglet et toutes les 30 secondes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const c = await monter(createElement(BlocPreavisAccueil, { gestion: true }));
    const avant = lecturesPreavis;
    lignes = lignes.map((l) => (l.cle === 'B' ? { ...l, previsite: pv({ statut: 'effectuee', rdv: l.previsite!.rdv }) } : l));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); await calmer();
    expect(lecturesPreavis).toBeGreaterThan(avant);
    expect(statutLigne(c, 'B')).toContain('Pré-visite effectuée');
    const apres = lecturesPreavis;
    await act(async () => { vi.advanceTimersByTime(INTERVALLE_PREAVIS_MS); }); await calmer();
    expect(lecturesPreavis).toBeGreaterThan(apres);
  });
});

describe('🔴 Option A — compte Gestion SANS le droit « Location » : lecture OK, boutons visibles mais inactifs, aucune écriture', () => {
  it('le bloc, la pastille et la pleine page sont lus par la route de la Gestion (jamais par celle de la Location)', async () => {
    const c = await gestion('?ecran=partage', false);
    expect(c.querySelector('[data-bloc-preavis-gestion] [data-bloc-preavis]')?.getAttribute('data-ecriture')).toBe('non');
    expect(c.querySelector('[data-bloc-preavis-gestion] [data-filtre-previsite="alerte"]')?.textContent).toBe('Alerte préavis 2');
    expect(lecturesGestion).toBeGreaterThan(0);
    expect(lecturesLocation).toBe(0);
    const m = await gestion('', false);
    expect(m.querySelector('[data-pastille-preavis]')?.textContent).toBe('2');
    await clic(m.querySelector('[data-raccourci="preavis"]'));
    expect(m.querySelector('.pe-preavis [data-bloc-preavis]')?.getAttribute('data-ecriture')).toBe('non');
    expect(lecturesLocation).toBe(0);
  });
  it('dépliée : chaque bouton qui écrit est visible, INACTIF, avec « Réservé aux comptes Location » ; un clic n’ouvre rien et n’envoie rien', async () => {
    const c = await gestion('?ecran=partage', false);
    await clic(c.querySelector('[data-bloc-preavis-gestion] [data-ouvrir-preavis="B"]'));
    const ligneB = c.querySelector('[data-bloc-preavis-gestion] [data-ligne-depliee="B"]')!;
    for (const sel of ['[data-deplacer-previsite]', '[data-refus-previsite]', '[data-planifier-edls]', '[data-valider-sortie]']) {
      const b = ligneB.querySelector(sel) as HTMLButtonElement | null;
      expect(b, sel).not.toBeNull();
      expect(b!.disabled, sel).toBe(true);
      expect(b!.title, sel).toBe('Réservé aux comptes Location');
      await clic(b);
    }
    expect([...ligneB.querySelectorAll('[data-reserve-location]')].map((x) => x.textContent)).toContain('Réservé aux comptes Location');
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    expect(ligneB.querySelector('[data-formulaire-edls]')).toBeNull();
    await clic(c.querySelector('[data-bloc-preavis-gestion] [data-ouvrir-preavis="C"]'));
    const ligneC = c.querySelector('[data-bloc-preavis-gestion] [data-ligne-depliee="C"]')!;
    const rdv = ligneC.querySelector('[data-rdv-previsite]') as HTMLButtonElement;
    expect(rdv.disabled).toBe(true);
    await clic(rdv);
    expect(document.querySelector('[data-fenetre-previsite]')).toBeNull();
    expect(postsLocation).toEqual([]);
    // l'encart du logement est lu, lui aussi, par la route de la Gestion
    expect(lecturesLocation).toBe(0);
  });
  it('avec le droit « Location » : les mêmes boutons sont actifs, sans la mention', async () => {
    const c = await gestion('?ecran=partage', true);
    await clic(c.querySelector('[data-bloc-preavis-gestion] [data-ouvrir-preavis="C"]'));
    const ligneC = c.querySelector('[data-bloc-preavis-gestion] [data-ligne-depliee="C"]')!;
    expect((ligneC.querySelector('[data-rdv-previsite]') as HTMLButtonElement).disabled).toBe(false);
    expect(ligneC.querySelector('[data-reserve-location]')).toBeNull();
  });
});

describe('🔴 2 — « Préavis » dans le menu de gauche, entre « Tâches » et « Syndics » ; pastille = préavis en alerte', () => {
  const entrees = (c: HTMLElement) => [...c.querySelectorAll('.cm-liste--apres .cm-entree')].map((b) => b.querySelector('.cm-texte')?.textContent);
  it('l’entrée est entre « Tâches » et « Syndics » ; la pastille dit 2 (deux préavis en alerte)', async () => {
    const c = await gestion('');
    const e = entrees(c);
    expect(e.indexOf('Préavis')).toBe(e.indexOf('Tâches') + 1);
    expect(e.indexOf('Syndics')).toBe(e.indexOf('Préavis') + 1);
    expect(c.querySelector('[data-pastille-preavis]')?.textContent).toBe('2');
  });
  it('aucun préavis en alerte : aucune pastille', async () => {
    lignes = lignes.map((l) => ({ ...l, previsite: pv({ statut: 'recu' }) }));
    const c = await gestion('');
    expect(entrees(c)).toContain('Préavis');
    expect(c.querySelector('[data-pastille-preavis]')).toBeNull();
  });
  it('la pastille suit une action faite ailleurs sur la page (même signal que le bloc)', async () => {
    const c = await gestion('');
    expect(c.querySelector('[data-pastille-preavis]')?.textContent).toBe('2');
    lignes = lignes.map((l) => (l.cle === 'A' ? { ...l, previsite: pv({ statut: 'programmee' }) } : l));
    await act(async () => { window.dispatchEvent(new Event('svav:preavis-change')); }); await calmer();
    expect(c.querySelector('[data-pastille-preavis]')?.textContent).toBe('1');
  });
  it('le bouton « Préavis » ouvre le module en pleine page', async () => {
    const c = await gestion('');
    await clic(c.querySelector('[data-raccourci="preavis"]'));
    expect(window.location.search).toContain('ecran=preavis');
    expect(c.querySelector('.pe-preavis [data-recherche-preavis]')).not.toBeNull();
  });
});

describe('🔴 3 — « Ouvrir en pleine page » depuis les deux blocs', () => {
  it('le bloc de la Location : un lien vers /admin/location/preavis', async () => {
    const c = await monter(createElement(BlocPreavisAccueil, { gestion: true, pleinePage: '/admin/location/preavis' }));
    expect(c.querySelector('a[data-pleine-page-preavis]')?.getAttribute('href')).toBe('/admin/location/preavis');
  });
  it('le bloc sous les Tâches : ouvre ?ecran=preavis', async () => {
    const c = await gestion('?ecran=partage');
    await clic(c.querySelector('[data-bloc-preavis-gestion] [data-pleine-page-preavis]'));
    expect(window.location.search).toContain('ecran=preavis');
    expect(c.querySelector('.pe-preavis [data-bloc-preavis]')).not.toBeNull();
  });
});

describe('🔴 4 — la pleine page : chaque tri dans les deux sens, filtres, recherche, tri conservé', () => {
  const plein = () => monter(createElement(BlocPreavisAccueil, { gestion: true, plein: true }));
  it('tri par défaut = celui du bloc (fin de préavis, la plus proche d’abord)', async () => {
    const c = await plein();
    expect(ordre(c)).toEqual(['A', 'B', 'C']);
  });
  it.each([
    ['recu:asc', ['A', 'C', 'B']], ['recu:desc', ['B', 'C', 'A']],
    ['fin:asc', ['A', 'B', 'C']], ['fin:desc', ['C', 'B', 'A']],
    ['previsite:asc', ['B', 'A', 'C']], ['previsite:desc', ['B', 'A', 'C']],
    ['edl:asc', ['A', 'B', 'C']], ['edl:desc', ['B', 'A', 'C']],
    ['statut:asc', ['A', 'C', 'B']], ['statut:desc', ['B', 'A', 'C']],
  ])('tri %s', async (cle, attendu) => {
    const c = await plein();
    await clic(c.querySelector(`[data-tri="${cle}"]`));
    expect(ordre(c)).toEqual(attendu);
  });
  it('le tri choisi est conservé quand on revient sur la page', async () => {
    const c = await plein();
    await clic(c.querySelector('[data-tri="recu:desc"]'));
    expect(window.localStorage.getItem(CLE_TRI_PLEINE_PAGE)).toBe('recu:desc');
    const c2 = await plein();
    expect(ordre(c2)).toEqual(['B', 'C', 'A']);
  });
  it('filtres par statut (pastilles), seuls ou cumulés', async () => {
    const c = await plein();
    await clic(c.querySelector('[data-filtre-previsite="alerte"]'));
    expect(ordre(c)).toEqual(['A', 'C']);
    await clic(c.querySelector('[data-filtre-previsite="programmee"]'));
    expect(ordre(c)).toEqual(['A', 'B', 'C']);
    await clic(c.querySelector('[data-filtre-previsite="tous"]'));
    await clic(c.querySelector('[data-filtre-previsite="effectuee"]'));
    expect(ordre(c)).toEqual([]);
  });
  it('recherche par nom de locataire ou adresse (sans accents ni casse)', async () => {
    const c = await plein();
    const champ = c.querySelector('[data-recherche-preavis]') as HTMLInputElement;
    const saisir = async (v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, v); champ.dispatchEvent(new Event('input', { bubbles: true })); }); };
    await saisir('bernard'); expect(ordre(c)).toEqual(['B']);
    await saisir('GAMMA'); expect(ordre(c)).toEqual(['C']);
    await saisir(''); expect(ordre(c)).toHaveLength(3);
  });
  it('le bloc (hors pleine page) garde ses tris d’avant, sans recherche', async () => {
    const c = await monter(createElement(BlocPreavisAccueil, { gestion: true }));
    expect(c.querySelector('[data-recherche-preavis]')).toBeNull();
    expect(c.querySelector('[data-tri="recu:asc"]')).toBeNull();
    expect(c.querySelector('[data-tri="fin:asc"]')).not.toBeNull();
  });
});
