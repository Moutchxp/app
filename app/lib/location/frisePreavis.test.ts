import { describe, expect, it } from 'vitest';
import { etapesPreavis } from './frisePreavis';
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
