import { describe, expect, it } from 'vitest';
import {
  agoApres, agosOfficielles, alerteRestitution, clotureExercice, datesManquantes, libelleAlerte, libelleExercice, MENTION_INCERTAINE, MENTION_SANS_AGO,
  suiviVingtPourcent, transposer,
} from './vingtPourcent';

/**
 * 🔴🔴 Arno (23/11/2026) — LE SUIVI DES 20 % RETENUS. Exemple de référence : aujourd'hui 23/11/2026, arrêté 31/12, dernière AGO 25/03/2026.
 * A sorti le 15/11/2026 → exercice 2026 → AGO projetée 25/03/2027 → restitution ≤ 25/04/2027. B sorti le 10/01/2027 → exercice 2027 → AGO
 * projetée 25/03/2028. AGO officielle 2027 saisie au 15/03/2027 → A : 15/03/2027 (≤ 15/04/2027) ; B : projetée recalée au 15/03/2028.
 */
const AUJ = '2026-11-23';
const AU_31_12 = { jour: 31, mois: 12 };

describe('l’exemple de référence d’Arno', () => {
  const avant = ['2026-03-25'];
  const apres = ['2026-03-25', '2027-03-15'];
  it('A (sorti le 15/11/2026) : exercice clos le 31/12/2026, AGO projetée 25/03/2027, restitution au plus tard le 25/04/2027', () => {
    const a = suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: AU_31_12, officielles: avant, aujourdhui: AUJ });
    expect(a).toMatchObject({ etat: 'ok', exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' }, incertaine: false, limite: '2027-04-25' });
    expect(libelleExercice(a.exercice)).toBe('Exercice clos le 31/12/2026');
  });
  it('B (sorti le 10/01/2027) : exercice 2027, AGO projetée 25/03/2028', () => {
    expect(suiviVingtPourcent({ dateSortie: '2027-01-10', valideLe: '2027-01-12', arrete: AU_31_12, officielles: avant, aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2027-12-31', ago: { date: '2028-03-25', statut: 'projetee' }, limite: '2028-04-25' });
  });
  it('AGO officielle 2027 saisie au 15/03/2027 : A passe à l’officielle (≤ 15/04/2027), B se recale au 15/03/2028', () => {
    expect(suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: AU_31_12, officielles: apres, aujourdhui: AUJ }))
      .toMatchObject({ ago: { date: '2027-03-15', statut: 'officielle' }, limite: '2027-04-15' });
    expect(suiviVingtPourcent({ dateSortie: '2027-01-10', valideLe: '2027-01-12', arrete: AU_31_12, officielles: apres, aujourdhui: AUJ }))
      .toMatchObject({ ago: { date: '2028-03-15', statut: 'projetee' }, limite: '2028-04-15' });
  });
});

describe('les cas aux limites', () => {
  it('sortie LE JOUR de l’arrêté : cet exercice-là', () => {
    expect(clotureExercice('2026-12-31', AU_31_12)).toBe('2026-12-31');
    expect(suiviVingtPourcent({ dateSortie: '2026-12-31', valideLe: '2027-01-05', arrete: AU_31_12, officielles: ['2026-03-25'], aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2026-12-31', ago: { date: '2027-03-25' } });
    expect(clotureExercice('2027-01-01', AU_31_12)).toBe('2027-12-31');
  });
  it('sortie APRÈS l’AGO de l’année (10/05/2026, AGO tenue le 25/03/2026) : exercice 2026, AGO de 2027', () => {
    expect(suiviVingtPourcent({ dateSortie: '2026-05-10', valideLe: '2026-05-12', arrete: AU_31_12, officielles: ['2026-03-25'], aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' } });
  });
  it('arrêté au 30/06 : une sortie du 15/11/2026 relève de l’exercice clos le 30/06/2027 ; l’AGO qui suit (septembre) est projetée en 2027', () => {
    const r = suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: { jour: 30, mois: 6 }, officielles: ['2026-09-22'], aujourdhui: AUJ });
    expect(r).toMatchObject({ exercice: '2027-06-30', ago: { date: '2027-09-22', statut: 'projetee' }, limite: '2027-10-22' });
    expect(clotureExercice('2026-06-30', { jour: 30, mois: 6 })).toBe('2026-06-30');
    expect(clotureExercice('2026-07-01', { jour: 30, mois: 6 })).toBe('2027-06-30');
  });
  it('arrêté MANQUANT : la première AGO après la validation, « Projection incertaine » ; jamais avant la validation (22/09/2020 → 22/09/2027)', () => {
    const r = suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-23', arrete: null, officielles: ['2020-09-22'], aujourdhui: AUJ });
    expect(r).toMatchObject({ etat: 'ok', exercice: null, ago: { date: '2027-09-22', statut: 'projetee' }, incertaine: true, limite: '2027-10-22' });
    expect(MENTION_INCERTAINE).toBe('Projection incertaine — date d’arrêté des comptes manquante');
    expect(libelleExercice(null)).toBe('Exercice inconnu (date d’arrêté des comptes manquante)');
  });
  it('arrêté connu mais la projection tomberait AVANT la validation : reportée à l’année suivante (jamais antérieure)', () => {
    // exercice clos le 31/12/2024 ; dernière AGO 22/09/2020 → projection 2025 < validation (23/11/2026) → 22/09/2027
    expect(suiviVingtPourcent({ dateSortie: '2024-06-01', valideLe: '2026-11-23', arrete: AU_31_12, officielles: ['2020-09-22'], aujourdhui: AUJ }))
      .toMatchObject({ exercice: '2024-12-31', ago: { date: '2027-09-22', statut: 'projetee' } });
  });
  it('dernière AGO MANQUANTE : pas de projection, « Dernière AGO inconnue »', () => {
    expect(suiviVingtPourcent({ dateSortie: '2026-11-15', valideLe: '2026-11-20', arrete: AU_31_12, officielles: [], aujourdhui: AUJ }))
      .toEqual({ etat: 'sans_ago', exercice: '2026-12-31', mention: MENTION_SANS_AGO });
    expect(MENTION_SANS_AGO).toBe('Dernière AGO inconnue');
  });
  it('un 29/02 se transpose au 28/02 hors année bissextile', () => {
    expect(transposer('2024-02-29', 2027)).toBe('2027-02-28');
    expect(transposer('2024-02-29', 2028)).toBe('2028-02-29');
    expect(agoApres(['2024-02-29'], '2026-12-31', '2026-12-31')).toEqual({ date: '2027-02-28', statut: 'projetee' });
  });
});

describe('ce qui sert au calcul, et l’alerte', () => {
  it('seules les AGO OFFICIELLES comptent : ni les projetées enregistrées à la sortie, ni les AGE', () => {
    expect(agosOfficielles([
      { statut: 'officielle', date: '2026-03-25', nature: 'ago' }, { statut: 'projetee', date: '2027-03-25', nature: 'ago' },
      { statut: 'officielle', date: '2026-06-01', nature: 'age' }, { statut: 'officielle', date: null, nature: 'ago' },
      { statut: 'officielle', date: '2026-03-25' },
    ])).toEqual(['2026-03-25']);
  });
  it('alerte : à venir, proche (≤ 30 jours), dépassée — toujours avec la date en mots', () => {
    expect(alerteRestitution('2027-04-25', AUJ)).toMatchObject({ alerte: 'a_venir' });
    expect(alerteRestitution('2026-12-20', AUJ)).toEqual({ alerte: 'proche', joursRestants: 27 });
    expect(alerteRestitution('2026-11-20', AUJ)).toEqual({ alerte: 'depassee', joursRestants: -3 });
    expect(libelleAlerte('depassee', '2026-11-20', -3)).toBe('Restitution en retard — la limite du 20/11/2026 est dépassée de 3 jours');
    expect(libelleAlerte('proche', '2026-12-20', 27)).toBe('Restitution à faire bientôt — au plus tard le 20/12/2026 (dans 27 jours)');
    expect(libelleAlerte('a_venir', '2027-04-25', 153)).toBe('À restituer au plus tard le 25/04/2027');
  });
});

describe('🔴 la rubrique « Dates manquantes » (règle 5)', () => {
  const copro = (cle: string, libelle: string, id: number | null = 1) => ({ cle, coproprieteId: id, libelle, immeuble: libelle, lotId: 9 });
  it('ce qui manque, les locataires (noms, sans doublon) ; une copropriété complète n’y figure pas ; triée par nom', () => {
    expect(datesManquantes([
      { copro: copro('b', 'B rue'), arrete: null, officielles: [], locataires: ['DUPONT'] },
      { copro: copro('b', 'B rue'), arrete: null, officielles: [], locataires: ['DUPONT', 'MARTIN'] },
      { copro: copro('a', 'A rue'), arrete: null, officielles: ['2026-03-25'], locataires: ['DURAND'] },
      { copro: copro('c', 'C rue'), arrete: AU_31_12, officielles: ['2026-03-25'], locataires: ['X'] },
    ])).toEqual([
      { ...copro('a', 'A rue'), manque: ['arrete'], locataires: ['DURAND'] },
      { ...copro('b', 'B rue'), manque: ['derniere_ago', 'arrete'], locataires: ['DUPONT', 'MARTIN'] },
    ]);
  });
});
