import { describe, expect, it } from 'vitest';
import { ETAPE_EN_COURS, etapesPreavis, lignesSousTitre } from './frisePreavis';
import type { LignePreavisAccueil } from './preavis';

/** 🔴🔴 Arno (11/11/2026, lot 3) — la frise des étapes d'un préavis : ordre, statuts, couleurs, étape en cours (module pur). */
const L = (o: Partial<LignePreavisAccueil> = {}): LignePreavisAccueil => ({
  cle: 'A', lotId: 7, adresse: '4 rue Fictive', occupationId: 11, occupationIds: [11], locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice' }],
  recuLe: '2026-10-01', dateMax: '2026-11-01', etatDesLieuxLe: null, edls: null,
  previsite: { statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null }, ...o,
});
const vue = (l: LignePreavisAccueil, o = {}) => etapesPreavis(l, '2026-11-11', o).map((e) => [e.cle, e.statut, e.enCours]);

describe('la frise', () => {
  it('l’ordre 1 → 4 ; préavis reçu toujours fait (VERT) ; l’étape en cours = la première à faire', () => {
    const e = etapesPreavis(L(), '2026-11-11');
    expect(e.map((x) => `${x.numero}. ${x.titre}`)).toEqual(['1. Préavis reçu', '2. Pré-visite', '3. État des lieux de sortie', '4. Sortie validée']);
    expect(vue(L())).toEqual([['preavis', 'faite', false], ['previsite', 'a_faire', true], ['edls', 'a_faire', false], ['sortie', 'a_faire', false]]);
    expect(e[0].libelle).toBe('Reçu le 01/10/2026 — fin du préavis le 01/11/2026');
  });
  it('pré-visite effectuée : VERTE, l’état des lieux devient l’étape en cours', () => {
    const l = L({ previsite: { statut: 'effectuee', rdv: { jour: '2026-10-10', heure: '10:00', dureeMinutes: 60 }, tacheId: 1, collegues: [], tousRefusent: false, rdvPasse: true, alerteEnvoyeeLe: null } });
    expect(vue(l)).toEqual([['preavis', 'faite', false], ['previsite', 'faite', false], ['edls', 'a_faire', true], ['sortie', 'a_faire', false]]);
  });
  it('pré-visite refusée / absente : ORANGE, et l’on passe à l’état des lieux', () => {
    const l = L({ previsite: { statut: 'refusee', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } });
    expect(vue(l)).toEqual([['preavis', 'faite', false], ['previsite', 'refusee', false], ['edls', 'a_faire', true], ['sortie', 'a_faire', false]]);
  });
  it('pré-visite programmée : en cours ; état des lieux prévu (à venir) puis passé (fait) ; sortie validée : tout est vert', () => {
    const prog = L({ previsite: { statut: 'programmee', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 }, tacheId: 1, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null } });
    expect(vue(prog)[1]).toEqual(['previsite', 'programmee', true]);
    expect(etapesPreavis(prog, '2026-11-11')[1].libelle).toBe('Programmée le 20/11/2026 de 10h00 à 11h00');
    expect(vue(L({ etatDesLieuxLe: '2026-11-30' }))[2]).toEqual(['edls', 'programmee', false]);
    expect(vue(L({ etatDesLieuxLe: '2026-11-02' }))[2]).toEqual(['edls', 'faite', false]);
    expect(vue(L(), { sortieValidee: '2026-11-05' }).map((x) => x[1])).toEqual(['faite', 'a_faire', 'faite', 'faite']);
  });
});

describe('🔴 Arno (13/11/2026) — les lignes sous le titre, sans doublon du cartouche', () => {
  const RDV = { jour: '2026-11-14', heure: '15:00', dureeMinutes: 60 };
  const avec = (statut: 'programmee' | 'effectuee' | 'refusee' | 'recu' | 'alerte', o: Partial<LignePreavisAccueil> = {}) =>
    L({ previsite: { statut, rdv: statut === 'programmee' || statut === 'effectuee' ? RDV : null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null }, ...o });
  const sous = (l: LignePreavisAccueil, cle: string, planification = true) => {
    const e = etapesPreavis(l, '2026-11-11').find((x) => x.cle === cle)!;
    return lignesSousTitre(e, l, { planification });
  };
  it('pré-visite programmée / effectuée (le cartouche le dit) : plus de ligne ; « étape en cours » seule si c’est la courante', () => {
    expect(sous(avec('programmee'), 'previsite')).toEqual([ETAPE_EN_COURS]);
    expect(sous(avec('effectuee'), 'previsite')).toEqual([]);
  });
  it('sans cartouche de rendez-vous : la ligne telle quelle (« À programmer · étape en cours », refus)', () => {
    expect(sous(avec('recu'), 'previsite')).toEqual(['À programmer · étape en cours']);
    expect(sous(avec('refusee'), 'previsite')).toEqual(['Refusée / absente']);
  });
  it('état des lieux de sortie : fixé (planification) → plus de ligne ; refusé, ou sans planification → la ligne reste ; « Préavis reçu » inchangé', () => {
    const edls = { edlsId: 1, tacheId: 2, jour: '2026-12-01', heure: '10:00', dureeMinutes: 60, confieA: 'Claire', confieAId: 4, statut: 'acceptee' as const, reponduPar: null, motifRefus: null };
    expect(sous(avec('effectuee', { edls }), 'edls')).toEqual([ETAPE_EN_COURS]);
    expect(sous(avec('effectuee', { edls }), 'edls', false)).toEqual(['Prévu le 01/12/2026 — confié à Claire · étape en cours']);
    expect(sous(avec('effectuee', { edls: { ...edls, statut: 'refusee' as const } }), 'edls')).toEqual(['Prévu le 01/12/2026 — confié à Claire · étape en cours']);
    expect(sous(avec('effectuee'), 'preavis')).toEqual(['Reçu le 01/10/2026', 'Fin du préavis le 01/11/2026']);
  });
});
