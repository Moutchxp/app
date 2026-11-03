import { describe, expect, it } from 'vitest';
import { aUnePrincipaleAuMois, fonctionsAuMois, joursDuMois, mentionProrata, principaleALaDate, repartirSalaire, type VersionPrincipale } from './activitePrincipale';

// 🔴 D35 (Arno, 03/11/2026, option C) — l'activité principale porte 100 % du salaire ; le mois d'un changement, prorata en jours calendaires
const LOC_PUIS_GESTION_16_11: VersionPrincipale[] = [{ activite: 'location', depuis: null }, { activite: 'gestion', depuis: '2026-11-16' }];
const somme = (ps: { htC: number }[]): number => ps.reduce((s, p) => s + p.htC, 0);

describe('repartirSalaire — Location → Gestion le 16', () => {
  it('mois de 30 jours (novembre), 3 000 € → 1 500 / 1 500, « prorata 15/30 j »', () => {
    const ps = repartirSalaire(LOC_PUIS_GESTION_16_11, 2026, 11, 3000);
    expect(ps).toEqual([{ famille: 'location', htC: 150000, jours: 15, joursMois: 30 }, { famille: 'gestion', htC: 150000, jours: 15, joursMois: 30 }]);
    expect(ps.map(mentionProrata)).toEqual(['prorata 15/30 j', 'prorata 15/30 j']);
  });
  it('mois de 31 jours (le 16 décembre) → 15/31 et 16/31, la somme exacte, le reste sur la nouvelle', () => {
    const vs: VersionPrincipale[] = [{ activite: 'location', depuis: null }, { activite: 'gestion', depuis: '2026-12-16' }];
    const ps = repartirSalaire(vs, 2026, 12, 3000);
    expect(ps.map((p) => [p.famille, p.jours, p.joursMois])).toEqual([['location', 15, 31], ['gestion', 16, 31]]);
    expect(ps[0]!.htC).toBe(Math.round((300000 * 15) / 31)); // 145 161
    expect(ps[1]!.htC).toBe(300000 - 145161);
    expect(somme(ps)).toBe(300000);
  });
  it('un montant au centime qui ne se divise pas : somme = le salaire saisi', () => {
    const vs: VersionPrincipale[] = [{ activite: 'vente', depuis: null }, { activite: 'location', depuis: '2027-01-11' }];
    for (const m of [0.01, 2345.67, 3999.99, 1234.5]) expect(somme(repartirSalaire(vs, 2027, 1, m))).toBe(Math.round(m * 100));
  });
  it('le mois suivant : 100 % Gestion ; le mois précédent : inchangé, 100 % Location', () => {
    expect(repartirSalaire(LOC_PUIS_GESTION_16_11, 2026, 12, 3000)).toEqual([{ famille: 'gestion', htC: 300000, jours: 31, joursMois: 31 }]);
    expect(repartirSalaire(LOC_PUIS_GESTION_16_11, 2026, 10, 3000)).toEqual([{ famille: 'location', htC: 300000, jours: 31, joursMois: 31 }]);
    expect(mentionProrata({ jours: 31, joursMois: 31 })).toBeNull();
  });
  it('un changement le 1er : 100 % la nouvelle activité dès ce mois, sans prorata', () => {
    const vs: VersionPrincipale[] = [{ activite: 'location', depuis: null }, { activite: 'gestion', depuis: '2026-11-01' }];
    expect(repartirSalaire(vs, 2026, 11, 3000)).toEqual([{ famille: 'gestion', htC: 300000, jours: 30, joursMois: 30 }]);
    expect(repartirSalaire(vs, 2026, 10, 3000)).toEqual([{ famille: 'location', htC: 300000, jours: 31, joursMois: 31 }]);
  });
  it('février (28 / 29 jours)', () => {
    expect(joursDuMois(2027, 2)).toBe(28);
    expect(joursDuMois(2028, 2)).toBe(29);
    const vs: VersionPrincipale[] = [{ activite: 'vente', depuis: null }, { activite: 'gestion', depuis: '2028-02-15' }];
    expect(repartirSalaire(vs, 2028, 2, 2900).map((p) => [p.famille, p.jours, p.htC])).toEqual([['vente', 14, 140000], ['gestion', 15, 150000]]);
  });
  it('un aller-retour dans le mois (A → B → A) : une part par activité', () => {
    const vs: VersionPrincipale[] = [{ activite: 'location', depuis: null }, { activite: 'gestion', depuis: '2026-11-11' }, { activite: 'location', depuis: '2026-11-21' }];
    const ps = repartirSalaire(vs, 2026, 11, 3000);
    expect(ps.map((p) => [p.famille, p.jours])).toEqual([['location', 20], ['gestion', 10]]);
    expect(somme(ps)).toBe(300000);
  });
  it('aucune activité principale : aucune part (un salaire ne peut pas être saisi)', () => {
    expect(repartirSalaire([], 2026, 11, 3000)).toEqual([]);
    expect(aUnePrincipaleAuMois([], 2026, 11)).toBe(false);
  });
});

describe('Jean-Baptiste PONS — Location depuis toujours (décision d’Arno)', () => {
  const PONS: VersionPrincipale[] = [{ activite: 'location', depuis: null }];
  it('chaque mois, 100 % de son salaire en Location', () => {
    for (const [a, m] of [[2025, 1], [2026, 2], [2026, 11], [2027, 7]] as const) {
      const ps = repartirSalaire(PONS, a, m, 2850.42);
      expect(ps).toEqual([{ famille: 'location', htC: 285042, jours: joursDuMois(a, m), joursMois: joursDuMois(a, m) }]);
    }
    expect(aUnePrincipaleAuMois(PONS, 2019, 1)).toBe(true);
  });
});

describe('principaleALaDate / fonctionsAuMois', () => {
  it('la dernière version commencée', () => {
    expect(principaleALaDate(LOC_PUIS_GESTION_16_11, '2026-11-15')).toBe('location');
    expect(principaleALaDate(LOC_PUIS_GESTION_16_11, '2026-11-16')).toBe('gestion');
    expect(principaleALaDate([{ activite: 'vente', depuis: '2026-11-16' }], '2026-11-15')).toBeNull();
  });
  it('une principale posée en cours de mois : le salaire de ce mois peut être saisi, il lui revient entier', () => {
    const vs: VersionPrincipale[] = [{ activite: 'vente', depuis: '2026-11-16' }];
    expect(aUnePrincipaleAuMois(vs, 2026, 11)).toBe(true);
    expect(aUnePrincipaleAuMois(vs, 2026, 10)).toBe(false);
    expect(repartirSalaire(vs, 2026, 11, 3000)).toEqual([{ famille: 'vente', htC: 300000, jours: 30, joursMois: 30 }]);
  });
  it('les fonctions en vigueur au moins un jour du mois (fin exclue)', () => {
    const ps = [{ fonction: 'location' as const, depuis: null, jusqua: '2026-11-16' }, { fonction: 'gestion' as const, depuis: '2026-11-16', jusqua: null }];
    expect(fonctionsAuMois(ps, 2026, 10)).toEqual(['location']);
    expect(fonctionsAuMois(ps, 2026, 11)).toEqual(['location', 'gestion']);
    expect(fonctionsAuMois(ps, 2026, 12)).toEqual(['gestion']);
    expect(fonctionsAuMois([{ fonction: 'location', depuis: null, jusqua: '2026-11-01' }], 2026, 11)).toEqual([]);
  });
});
