import { describe, expect, it } from 'vitest';
import type { LigneExcel } from './lectureExcel';
import { type CandidatBail, mots, proximiteMois, rapprocher, ressemblance } from './rapprochementImport';

/** 🔴 Arno (22/10/2026) — l'import rapproche chaque ligne de son bail, avec un score ; rien n'est perdu. Noms fictifs. */
const L = (o: Partial<LigneExcel>): LigneExcel => ({ cle: o.cle ?? '2026-03#3', mois: '2026-03', rang: 3, proprietaire: 'DUPONT', locataire: 'MARTIN',
  honoProprietaireHt: 400, honoLocataireHt: 400, caFichier: 800, prime: 0, apporteurTexte: null, commission: 0, tauxCommission: null, avenant: false, parking: false, avecGestion: true, ...o });
const C = (o: Partial<CandidatBail>): CandidatBail => ({ bailId: 1, lotId: 10, entree: '2026-03-15', proprietaireId: 4, proprietaire: 'M. DUPONT Jean', locataires: 'MARTIN Paul',
  locataireId: 9, avecGestion: true, parking: false, ...o });

describe('rapprochement des lignes du suivi', () => {
  it('les noms : majuscules, sans accents, sans mots vides ni numéros', () => {
    expect(mots('SCI CAP FORTIUS (Parking)')).toEqual(['CAP', 'FORTIUS']);
    expect(mots('CAUCHY 416 ')).toEqual(['CAUCHY']);
    expect(ressemblance('HAMZAOUI - KORT', 'Mme Hamzaoui Leïla et M. Kort Samir')).toBe(1);
    expect(ressemblance('TATA CONSULTANCY', 'TATA CONSULTANCY SERVICES')).toBe(1);
    expect(ressemblance('BENKIRANE', 'MARTIN')).toBe(0);
    // Une faute de frappe sur un nom de 5 lettres ou plus : le même nom ; sur un nom court, non.
    expect(ressemblance('GANMIEN', 'GNAMIEN Koffi')).toBe(1);
    expect(ressemblance('MILLION', 'MILLON Hugo')).toBe(1);
    expect(ressemblance('NOUN-MOURA', 'MOURRA Rana et NOUN Charbel')).toBe(1);
    expect(ressemblance('LAI', 'LEI')).toBe(0);
    expect(ressemblance('DUPONT', 'DUPUIS')).toBe(0);
  });
  it('le mois : même mois 1, un mois d’écart 0,7, deux 0,4, au-delà 0', () => {
    expect([proximiteMois('2026-03', '2026-03-31'), proximiteMois('2026-03', '2026-04-01'), proximiteMois('2026-03', '2026-01-10'), proximiteMois('2026-03', '2025-12-01')]).toEqual([1, 0.7, 0.4, 0]);
  });
  it('rapprochée, douteuse, non trouvée ; un bail ne sert qu’une fois', () => {
    const r = rapprocher([
      L({ cle: 'a', proprietaire: 'DUPONT', locataire: 'MARTIN' }),
      L({ cle: 'b', proprietaire: 'DUPONT', locataire: 'MARTIN' }),
      L({ cle: 'c', proprietaire: 'DURAND', locataire: 'LEROY' }),
      L({ cle: 'd', proprietaire: 'INCONNU', locataire: 'PERSONNE' }),
    ], [C({}), C({ bailId: 2, proprietaire: 'DURAND Marc', locataires: 'PETIT Anne' })]);
    expect(r.map((x) => [x.cle, x.statut, x.candidat?.bailId ?? null])).toEqual([['a', 'rattache', 1], ['b', 'non_rattache', null], ['c', 'douteux', 2], ['d', 'non_rattache', null]]);
    expect(r[0].score).toBe(1);
    expect(r[2].score).toBeCloseTo(0.55, 10);
  });
  it('un avenant : un bail ancien, rapproché par les noms seuls', () => {
    const r = rapprocher([L({ avenant: true, proprietaire: 'DUPONT (Avenant)' })], [C({ entree: '2019-05-01' })]);
    expect(r[0]).toMatchObject({ statut: 'rattache', score: 1 });
  });
  it('hors de la fenêtre de deux mois : pas un candidat (sauf avenant)', () => {
    expect(rapprocher([L({})], [C({ entree: '2025-09-01' })])[0].statut).toBe('non_rattache');
  });
});
