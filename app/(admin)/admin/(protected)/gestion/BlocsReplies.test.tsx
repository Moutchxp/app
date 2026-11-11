// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';
import { BlocPreavisAccueil } from '../location/PreavisAccueil';
import { ajouterJours, jourParisDe, type Tache } from '../../../../lib/gestion/taches';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';
import type { PrevisiteAffiche } from '../../../../lib/location/previsite';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';

/**
 * 🔴🔴 Arno (10/11/2026, accord explicite pour CE repli) — ÉCRAN PARTAGÉ DE LA GESTION : les blocs « Tâches » et « Locataires en préavis »
 * REPLIÉS à chaque ouverture ; fermés, la ligne de titre dit le total et, en rouge, les urgentes / en alerte (absent à zéro) ; un clic
 * l'ouvre ou la ferme ; ouvert, le bloc est celui d'avant. Le repère rouge des préavis = la pastille du menu. Les vrais écrans, routes
 * simulées : rien ne part, rien n'est écrit.
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
const AUJ = jourParisDe(new Date());
const tache = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '4 rue Fictive', evenement: null, objet: 'x', note: null,
  jour: AUJ, heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Claire Test', creeLe: '', creeParLibelle: '',
  majLe: '2026-10-01T08:00:00.000Z', faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});
const refusee = { statut: 'refusee' as const, automatique: false, destinataireId: 2, destinataireLibelle: 'Claire Test', demandeurId: 3, demandeurLibelle: 'Arno',
  demandeLe: '2026-11-01T08:00:00Z', reponduLe: '2026-11-02T08:00:00Z', reponduParLibelle: 'Claire Test', motif: 'absente', mailEtat: 'envoye' as const, mailLe: null };
const pv = (o: Partial<PrevisiteAffiche> = {}): PrevisiteAffiche => ({ statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null, ...o });
const ligne = (cle: string, occ: number, previsite: PrevisiteAffiche): LignePreavisAccueil => ({
  cle, lotId: 7, adresse: `${cle} rue Fictive`, occupationId: occ, occupationIds: [occ], locataires: [{ occupationId: occ, locataireId: occ * 10, nom: `LOCATAIRE ${cle}` }],
  recuLe: '2026-10-01', dateMax: '2027-01-01', etatDesLieuxLe: null, previsite,
});
const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0, evenementsOuverts: 0,
  messagesCaptures: 1, messagesExclus: 0, derniereReleveLe: new Date().toISOString(), dernierMailLe: new Date().toISOString(),
  veille: { derniereLe: new Date().toISOString(), resultat: 'ok', erreur: null, intervalleS: 60, toleranceIntervalles: 10 },
  suite: { resultat: null, detail: null, ms: null }, copie: { derniere: null, restantes: 0, motifs: [] },
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const json = (x: unknown) => ({ ok: true, status: 200, json: async () => x }) as unknown as Response;

let taches: Tache[]; let lignes: LignePreavisAccueil[];
let racines: { c: HTMLDivElement; r: Root }[] = [];
beforeEach(() => {
  racines = [];
  taches = [
    tache({ id: 1, objet: 'En retard', jour: ajouterJours(AUJ, -3) }),
    tache({ id: 2, objet: 'Aujourd’hui', jour: AUJ }),
    tache({ id: 3, objet: 'Refusée, à réattribuer', jour: ajouterJours(AUJ, 10), acceptation: refusee }),
    tache({ id: 4, objet: 'Dans deux jours', jour: ajouterJours(AUJ, 2) }),
    tache({ id: 5, objet: 'Plus tard', jour: ajouterJours(AUJ, 12) }),
    tache({ id: 6, objet: 'Faite', etat: 'faite', faiteLe: new Date().toISOString() }),
  ];
  lignes = [
    ligne('A', 21, pv({ statut: 'alerte' })),
    ligne('B', 31, pv({ statut: 'programmee', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 }, tacheId: 500, tousRefusent: true,
      collegues: [{ collaborateurId: 4, libelle: 'Claire Test', email: null, statut: 'refusee', motif: 'absente' }] })),
    ligne('C', 41, pv({ statut: 'recu' })),
  ];
  global.fetch = vi.fn(async (u: string | URL | Request) => {
    const s = decodeURIComponent(String(u));
    if (s.includes('preavisEnCours=1')) return ok({ disponible: true, etatDesLieux: true, planification: true, previsite: true, lignes });
    if (s.includes('encartBail=')) return ok(ENCART);
    if (s.startsWith('/api/admin/location')) return ok([]);
    if (s.includes('/api/admin/gestion/taches') && !s.includes('reglage')) return json({ etat: 'ok', taches, moi: 2, tronque: false });
    if (s.includes('reglage')) return json({ etat: 'ok', envoiMail: false, modifiable: false });
    if (s.includes('/empreinte')) return json({ messageMax: 1 });
    if (s.includes('/boite')) return json({ lignes: [], suivant: null, total: null, comptes: {} });
    if (s.includes('/syndics')) return json({ syndics: [] });
    return json(ECRAN);
  }) as unknown as typeof fetch;
});
afterEach(() => { for (const x of racines) { act(() => x.r.unmount()); x.c.remove(); } vi.restoreAllMocks(); });

const calmer = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const monter = async (el: ReturnType<typeof createElement>): Promise<HTMLDivElement> => {
  const c = document.createElement('div'); document.body.appendChild(c); const r = createRoot(c); racines.push({ c, r });
  await act(async () => { r.render(el); }); await calmer();
  return c;
};
const gestion = async (adresse: string) => { window.history.replaceState(null, '', `/admin/gestion${adresse}`); return monter(createElement(GestionVue, { location: true })); };
const clic = async (el: Element | null) => { if (el === null) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const relire = async () => { await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); await calmer(); };

describe('🔴 1 — fermés à chaque ouverture de la page', () => {
  it('« Tâches » et « Locataires en préavis » repliés : ni lignes, ni filtres ; la ligne de titre, flèche ▸', async () => {
    const c = await gestion('?ecran=partage');
    expect(c.querySelector('[data-bloc-taches]')?.getAttribute('data-bloc-taches')).toBe('replie');
    expect(c.querySelector('[data-action="creer-tache"]')).toBeNull();
    expect(c.querySelector('[data-repli-taches]')?.getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('[data-repli-taches]')?.textContent?.startsWith('▸')).toBe(true);
    const p = c.querySelector('[data-bloc-preavis-gestion]')!;
    expect(p.querySelector('[data-ligne-preavis]')).toBeNull();
    expect(p.querySelector('[data-filtre-previsite]')).toBeNull();
    expect(p.querySelector('[data-repli-preavis]')?.getAttribute('aria-expanded')).toBe('false');
    expect(p.querySelector('[data-repli-preavis]')?.textContent?.startsWith('▸')).toBe(true);
  });
});

describe('🔴 2 — fermés : le total et le repère rouge, exacts', () => {
  it('« Tâches · 5 » et « ● 3 urgentes » (en retard + aujourd’hui/demain + refusée à réattribuer ; ni la tâche à J+2, ni la faite)', async () => {
    const c = await gestion('?ecran=partage');
    expect(c.querySelector('[data-repli-taches]')?.textContent).toBe('▸RDV / Tâches · 5');
    expect(c.querySelector('[data-urgentes-taches]')?.textContent).toBe('● 3 urgentes');
  });
  it('« Préavis · 3 » et « ● 2 en alerte » (Alerte préavis + Personne n’a accepté la pré-visite)', async () => {
    const c = await gestion('?ecran=partage');
    expect(c.querySelector('[data-repli-preavis]')?.textContent).toBe('▸Préavis · 3');
    expect(c.querySelector('[data-alertes-preavis]')?.textContent).toBe('● 2 en alerte');
  });
  it('au singulier : « ● 1 urgente », « ● 1 en alerte »', async () => {
    taches = [tache({ id: 1, jour: ajouterJours(AUJ, -1) }), tache({ id: 2, jour: ajouterJours(AUJ, 9) })];
    lignes = [ligne('A', 21, pv({ statut: 'alerte' })), ligne('C', 41, pv())];
    const c = await gestion('?ecran=partage');
    expect(c.querySelector('[data-urgentes-taches]')?.textContent).toBe('● 1 urgente');
    expect(c.querySelector('[data-alertes-preavis]')?.textContent).toBe('● 1 en alerte');
  });
  it('aucune urgence, aucune alerte : pas de repère rouge — le total reste', async () => {
    taches = [tache({ id: 4, jour: ajouterJours(AUJ, 2) }), tache({ id: 5, jour: ajouterJours(AUJ, 12) })];
    lignes = [ligne('C', 41, pv()), ligne('D', 51, pv({ statut: 'effectuee' }))];
    const c = await gestion('?ecran=partage');
    expect(c.querySelector('[data-urgentes-taches]')).toBeNull();
    expect(c.querySelector('[data-alertes-preavis]')).toBeNull();
    expect(c.querySelector('[data-total-taches]')?.textContent).toBe('2');
    expect(c.querySelector('[data-total-preavis]')?.textContent).toBe('2');
  });
  it('les compteurs se mettent à jour fermés (retour sur l’onglet), sur les mêmes données que l’intérieur', async () => {
    const c = await gestion('?ecran=partage');
    taches = taches.filter((x) => x.id !== 1);
    lignes = lignes.map((l) => (l.cle === 'A' ? { ...l, previsite: pv({ statut: 'programmee' }) } : l));
    await relire();
    expect(c.querySelector('[data-total-taches]')?.textContent).toBe('4');
    expect(c.querySelector('[data-urgentes-taches]')?.textContent).toBe('● 2 urgentes');
    expect(c.querySelector('[data-alertes-preavis]')?.textContent).toBe('● 1 en alerte');
  });
});

describe('🔴 3 — un clic sur la ligne de titre ouvre ou ferme ; ouvert, le bloc d’avant', () => {
  it('Tâches : ▸ → ▾, tout l’intérieur (création, filtres, lignes) ; puis refermé', async () => {
    const c = await gestion('?ecran=partage');
    await clic(c.querySelector('[data-repli-taches]'));
    expect(c.querySelector('[data-bloc-taches]')?.getAttribute('data-bloc-taches')).toBe('ouvert');
    expect(c.querySelector('[data-repli-taches]')?.getAttribute('aria-expanded')).toBe('true');
    expect(c.querySelector('[data-repli-taches]')?.textContent).toBe('▾RDV / Tâches 5');
    expect(c.querySelector('[data-action="creer-tache"]')).not.toBeNull();
    expect(c.querySelectorAll('.tch-tableau .tch-liste > *').length).toBeGreaterThanOrEqual(5);
    await clic(c.querySelector('[data-repli-taches]'));
    expect(c.querySelector('[data-bloc-taches]')?.getAttribute('data-bloc-taches')).toBe('replie');
  });
  it('Préavis : ▸ → ▾, les pastilles et les lignes ; puis refermé', async () => {
    const c = await gestion('?ecran=partage');
    const p = c.querySelector('[data-bloc-preavis-gestion]')!;
    await clic(p.querySelector('[data-repli-preavis]'));
    expect(p.querySelector('[data-repli-preavis]')?.getAttribute('aria-expanded')).toBe('true');
    expect(p.querySelector('[data-nombre-preavis]')?.textContent).toBe('3');
    expect(p.querySelectorAll('[data-ligne-preavis]')).toHaveLength(3);
    expect(p.querySelector('[data-filtre-previsite="alerte"]')).not.toBeNull();
    await clic(p.querySelector('[data-repli-preavis]'));
    expect(p.querySelector('[data-ligne-preavis]')).toBeNull();
  });
});

describe('🔴 4 — le repère rouge des préavis = la pastille du bouton « Préavis » du menu', () => {
  it('le même nombre (2) des deux côtés', async () => {
    const partage = await gestion('?ecran=partage');
    const boite = await gestion('');
    expect(partage.querySelector('[data-alertes-preavis]')?.textContent).toBe('● 2 en alerte');
    expect(boite.querySelector('[data-pastille-preavis]')?.textContent).toBe('2');
  });
});

describe('🔴 5 — ailleurs, rien ne change', () => {
  it('le bloc de l’écran Location n’est pas replié', async () => {
    const c = await monter(createElement(BlocPreavisAccueil, { gestion: true, pleinePage: '/admin/location/preavis' }));
    expect(c.querySelector('[data-repli-preavis]')).toBeNull();
    expect(c.querySelectorAll('[data-ligne-preavis]')).toHaveLength(3);
  });
  it('la page pleine « Tâches » n’est pas repliée', async () => {
    const c = await gestion('?ecran=taches');
    expect(c.querySelector('[data-repli-taches]')).toBeNull();
    expect(c.querySelector('[data-action="creer-tache"]')).not.toBeNull();
  });
});

describe('🔴 Arno (10/11/2026) — les deux lignes de titre repliées, harmonisées (présentation seulement)', () => {
  const classes = (el: Element | null) => (el?.className ?? '').split(/\s+/).filter((x) => x.startsWith('blr-'));
  it('fermés : le même cadre, le même titre, la même flèche, le même repère rouge — une seule feuille', async () => {
    const c = await gestion('?ecran=partage');
    const t = c.querySelector('[data-bloc-taches]')!;
    const p = c.querySelector('[data-bloc-preavis-gestion] [data-bloc-preavis]')!;
    expect(classes(t)).toEqual(['blr-bloc']);
    expect(classes(p)).toEqual(['blr-bloc']);
    expect(classes(t.querySelector('h2'))).toEqual(['blr-titre']);
    expect(classes(p.querySelector('h2'))).toEqual(['blr-titre']);
    expect(classes(t.querySelector('[data-repli-taches]'))).toEqual(['blr-repli']);
    expect(classes(p.querySelector('[data-repli-preavis]'))).toEqual(['blr-repli']);
    expect(classes(t.querySelector('[data-repli-taches] [aria-hidden]'))).toEqual(['blr-fleche']);
    expect(classes(p.querySelector('[data-repli-preavis] [aria-hidden]'))).toEqual(['blr-fleche']);
    expect(classes(t.querySelector('[data-urgentes-taches]'))).toEqual(['blr-alerte']);
    expect(classes(p.querySelector('[data-alertes-preavis]'))).toEqual(['blr-alerte']);
    const { CSS_BLOC_REPLIE } = await import('./blocReplie');
    for (const bloc of [t, p]) expect([...bloc.querySelectorAll('style')].some((s) => (s.textContent ?? '').includes(CSS_BLOC_REPLIE))).toBe(true);
  });
  it('ouverts : chacun garde exactement sa présentation d’avant (aucune classe du repli)', async () => {
    const c = await gestion('?ecran=partage');
    await clic(c.querySelector('[data-repli-taches]'));
    await clic(c.querySelector('[data-bloc-preavis-gestion] [data-repli-preavis]'));
    expect(c.querySelector('[data-bloc-taches] [class*="blr-"]')).toBeNull();
    expect(classes(c.querySelector('[data-bloc-taches]'))).toEqual([]);
    expect(c.querySelector('[data-bloc-preavis-gestion] [class*="blr-"]')).toBeNull();
    expect(classes(c.querySelector('[data-bloc-preavis-gestion] [data-bloc-preavis]'))).toEqual([]);
  });
});
