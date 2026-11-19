import { describe, expect, it } from 'vitest';
import { grouperBiensSelonGestion, type CoproDuDetail } from './syndicLocation';
import { separerParGestion } from '../gestion/bienEnGestion';

/**
 * 🔴 Arno (19/11/2026) — « Immeubles et biens gérés » : la liste principale ne montre que les biens EN GESTION ACTUELLE ; ceux qui ne le sont plus vont dans
 * « Ancienne gestion (N) », au même format ; rien n'est écarté. Même définition que la carte du bien et l'annuaire (`bienEnGestion`).
 */
const lot = (id: number, numero: string, o: Partial<CoproDuDetail['lots'][number]> = {}) => ({ id, numero, adresse: '43 avenue Marceau', commune: 'COURBEVOIE', type: 'Appartement', proprietaires: ['Mme X'], ...o });

describe('🔴 en gestion / ancienne gestion', () => {
  it('le statut du bien fait foi ; sans statut, la date de fin de gestion ; rien n’est perdu', () => {
    const biens = [{ fin: null }, { fin: '2024-01-01' }, { fin: null, statut: 'ancienne_gestion' as const }, { fin: '2024-01-01', statut: 'en_gestion' as const }];
    const s = separerParGestion(biens);
    expect(s.enGestion).toEqual([biens[0], biens[3]]);
    expect(s.ancienne).toEqual([biens[1], biens[2]]);
    expect(s.enGestion.length + s.ancienne.length).toBe(biens.length);
  });
  it('la liste principale : les biens en gestion seuls ; « Ancienne gestion » : les autres, au même format ; une copropriété sans aucun bien garde sa ligne', () => {
    const copros: CoproDuDetail[] = [
      { libelle: '43 avenue Marceau', codePostal: '92400', commune: 'COURBEVOIE', lots: [lot(12, '202', { statut: 'ancienne_gestion', proprietaires: ['Mme BASUYAUX'] }), lot(13, '399')] },
      { libelle: '1 rue Tout Ancien', codePostal: '75011', commune: 'PARIS', lots: [lot(20, '7', { adresse: '1 rue Tout Ancien', commune: 'PARIS', fin: '2023-05-01' })] },
      { libelle: '9 rue Sans Bien', codePostal: '75011', commune: 'PARIS', lots: [] },
    ];
    const r = grouperBiensSelonGestion(copros);
    expect(r.enGestion.map((g) => [g.adresse, g.lots.map((l) => l.numero)])).toEqual([['43 avenue Marceau', ['399']], ['9 rue Sans Bien', []]]);
    expect(r.ancienne.map((g) => [g.adresse, g.lots.map((l) => l.numero)])).toEqual([['43 avenue Marceau', ['202']], ['1 rue Tout Ancien', ['7']]]);
    expect(r.nbAnciens).toBe(2);
    expect(r.ancienne[0].lots[0].proprietaires).toEqual(['Mme BASUYAUX']);
  });
});
