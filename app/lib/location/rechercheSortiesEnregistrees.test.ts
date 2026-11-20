import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 Arno (20/11/2026, option B) — « tout ce qui touche à une sortie passe par le chemin dédié » : la page « Supprimer un/des locataire(s) »
 * retrouve aussi les SORTIES DÉJÀ ENREGISTRÉES, par la MÊME recherche que les occupants. Base SIMULÉE ; on n'asserte que des fragments du SQL
 * (blancs normalisés) et les paramètres liés. 🔒 Aucune donnée réelle.
 */
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let appels: { sql: string; params: unknown[] }[];
let trouvees: { occupation_id: string; locataire_id: string; nom: string }[];
let groupes: Record<string, { lot_id: string; adresse: string | null; sortie: string; entree: string | null; ids: string[]; noms: string[] }[]>;

vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    const s = norme(sql);
    appels.push({ sql: s, params });
    if (s.includes('o.sortie IS NOT NULL') && s.includes('AS occupation_id')) return { rows: trouvees, rowCount: trouvees.length };
    if (s.includes('AS noms')) { const r = groupes[String(params[0])] ?? []; return { rows: r, rowCount: r.length }; }
    return { rows: [], rowCount: 0 };
  },
  withTransaction: async () => { throw new Error('aucune écriture'); },
}));

import { rechercherSortiesEnregistrees } from './sortieLocatairesRepo';

beforeEach(() => { appels = []; trouvees = []; groupes = {}; });

describe('rechercherSortiesEnregistrees — la recherche des sorties déjà enregistrées', () => {
  it('la MÊME recherche que les occupants (nom, adresse, téléphone, e-mail), sur les seules occupations SORTIES ; paramètres liés', async () => {
    await rechercherSortiesEnregistrees('Bernard');
    const parNom = appels.find((a) => a.sql.includes('AS occupation_id'))!;
    expect(parNom.sql).toContain('o.sortie IS NOT NULL');
    expect(parNom.sql).toContain('l.nom_normalise LIKE');
    expect(parNom.sql).toContain("coalesce(lo.adresse_normalisee, '') LIKE");
    expect(parNom.params[2]).toEqual(['bernard']);
    appels = [];
    await rechercherSortiesEnregistrees('06 12 34 56 78');
    const parTel = appels.find((a) => a.sql.includes('AS occupation_id'))!;
    expect(parTel.sql).toContain("c.sorte = 'telephone'");
    expect(parTel.params[0]).toBe('612345678');   // la normalisation du numéro de la recherche des occupants (sans le 0 de tête)
  });

  it('un groupe de sortie par résultat (co-sortants une seule fois), avec le locataire cherché ; les groupes non visés sont écartés', async () => {
    trouvees = [
      { occupation_id: '11', locataire_id: '101', nom: 'BERNARD Alice' },
      { occupation_id: '12', locataire_id: '102', nom: 'BERNARD Paul' },
    ];
    groupes = {
      101: [{ lot_id: '7', adresse: '4 rue Fictive, Puteaux', sortie: '2026-11-30', entree: '2022-09-01', ids: ['11', '12', '21'], noms: ['BERNARD Alice', 'BERNARD Paul'] },
        { lot_id: '9', adresse: '9 rue Autre, Puteaux', sortie: '2020-01-31', entree: '2018-01-01', ids: ['5'], noms: ['BERNARD Alice'] }],
      102: [{ lot_id: '7', adresse: '4 rue Fictive, Puteaux', sortie: '2026-11-30', entree: '2022-09-01', ids: ['11', '12', '21'], noms: ['BERNARD Alice', 'BERNARD Paul'] }],
    };
    expect(await rechercherSortiesEnregistrees('bernard')).toEqual([
      { lotId: 7, adresse: '4 rue Fictive, Puteaux', sortie: '2026-11-30', entree: '2022-09-01', occupationIds: [11, 12, 21], noms: ['BERNARD Alice', 'BERNARD Paul'],
        locataireId: 101, nom: 'BERNARD Alice' },
    ]);
  });

  it('moins de deux caractères : aucune requête', async () => {
    expect(await rechercherSortiesEnregistrees('b')).toEqual([]);
    expect(appels).toEqual([]);
  });
});
