import { describe, expect, it } from 'vitest';
import { chiffresSource, groupesDoublons, normaliserAdresse, texteRapportDoublons, type AdresseLue } from './adressesDoublons';

/** 🔴 Arno (17/11/2026, « Adresses uniformisées », lot 1) — repérer les doublons probables, sans jamais rien réécrire. */
const A = (source: string, id: number, adresse: string | null, codePostal: string | null = '92400'): AdresseLue => ({ source, id, adresse, codePostal });

describe('la normalisation', () => {
  it('niveau 1 : majuscules, accents, ponctuation, espaces', () => {
    expect(normaliserAdresse('4 Rue  Kléber', 1)).toBe('4 rue kleber');
    expect(normaliserAdresse("1 rue des Lilas d'Espagne", 1)).toBe('1 rue des lilas d espagne');
  });
  it('niveau 2 : abréviations, petits mots, « 12ter » = « 12 ter »', () => {
    expect(normaliserAdresse('54 av. du Puvis de Chavannes', 2)).toBe(normaliserAdresse('54 Avenue Puvis De Chavannes', 2));
    expect(normaliserAdresse('12ter r. des Pavillons', 2)).toBe(normaliserAdresse('12 ter rue des Pavillons', 2));
    expect(normaliserAdresse('3 bd St-Denis', 2)).toBe('3 boulevard saint denis');
  });
});

describe('les groupes', () => {
  const lignes = [A('biens', 1, '4 rue Kléber'), A('locataires', 7, '4 Rue Kleber'), A('biens', 2, '4 rue Kléber'),
    A('biens', 3, '54 av du Puvis de Chavannes'), A('biens', 4, '54 Avenue Puvis de Chavannes'),
    A('biens', 5, '4 rue Kléber', '75016'), A('biens', 6, null)];
  it('niveau 1 : toutes sources confondues, même code postal seulement ; une écriture identique n’est pas un doublon', () => {
    const g = groupesDoublons(lignes, 1);
    expect(g).toHaveLength(1);
    expect(g[0].codePostal).toBe('92400');
    expect(g[0].ecritures).toEqual([{ ecriture: '4 rue Kléber', codePostal: '92400', fiches: [{ source: 'biens', id: 1 }, { source: 'biens', id: 2 }] },
      { ecriture: '4 Rue Kleber', codePostal: '92400', fiches: [{ source: 'locataires', id: 7 }] }]);
  });
  it('niveau 2 : les abréviations et les petits mots en plus', () => {
    expect(groupesDoublons(lignes, 2).map((g) => g.ecritures.length)).toEqual([2, 2]);
  });
  it('les chiffres d’une source et le rapport, qui dit qu’il ne réécrit rien', () => {
    expect(chiffresSource([A('biens', 1, '4 rue Kléber'), A('biens', 2, '4 rue Kléber'), A('biens', 3, '1 rue X', null), A('biens', 4, ' ')]))
      .toEqual({ lignes: 3, ecritures: 2, sansCodePostal: 1 });
    const t = texteRapportDoublons([{ nom: 'biens', lignes }], 'recette', '17/11/2026');
    expect(t).toContain('aucune adresse n’est réécrite');
    expect(t).toContain('niveau 1 (majuscules, accents, ponctuation, espaces) : 1 groupes');
    expect(t).toContain('« 4 Rue Kleber » — locataires 7');
    expect(t).toContain('NIVEAU 2 — 1 groupes de plus');
  });
});
