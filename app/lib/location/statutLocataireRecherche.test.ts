import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (18/11/2026) — « Sur /admin/location, la recherche « ju » renvoie « JULDO Thomas » avec la pastille verte « LOCATAIRE ».
 * Sa fiche /admin/location/locataire/261 dit pourtant « ANCIEN LOCATAIRE » […]. Le statut d'un locataire est DÉRIVÉ, jamais stocké.
 * Il doit exister UNE SEULE définition, partagée par la fiche, le moteur de recherche de Location, celui de Gestion et toute autre
 * liste de locataires. »
 * Épreuves : la règle (pure), la pastille (pure), et le dépôt de la recherche (base simulée : le COMPORTEMENT et les paramètres
 * liés, jamais la forme du SQL entier).
 */
const h = vi.hoisted(() => ({ sql: [] as string[], params: [] as unknown[][], locataires: [] as Record<string, unknown>[] }));
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    h.sql.push(sql); h.params.push(params);
    return { rows: sql.includes('FROM gestion_annuaire_locataire p') ? h.locataires : [] };
  },
  withTransaction: async () => { throw new Error('aucune écriture dans ces épreuves'); },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/statutBienRepo', () => ({ statutBienDisponible: async () => true, sqlStatutBien: async () => "'en_gestion'" }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
vi.mock('../gestion/personneVivanteSql', () => ({ sqlPersonneVivante: async (a: string) => `${a}.supprime_le IS NULL` }));
vi.mock('../gestion/coproprieteRepo', () => ({ listerCoproprietes: async () => [] }));

import { locataireEnPlace, occupationsDesSorties, sqlSortiesDuLocataire } from '../gestion/historiqueBien';
import { aplatirResultats, LIBELLE_ANCIEN_LOCATAIRE, pastilleRecherche, type LigneAccueil } from './recherchePortefeuille';
import { rechercherPortefeuille } from './portefeuilleRepo';

const HIER = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

describe('🔴 LA RÈGLE UNIQUE — en place ou ancien locataire, d’après TOUTES ses occupations', () => {
  it('un bail en cours (aucune date de sortie) : en place', () => {
    expect(locataireEnPlace([{ sortie: null }])).toBe(true);
  });
  it('un bail terminé hier : ancien locataire', () => {
    expect(locataireEnPlace([{ sortie: HIER }])).toBe(false);
  });
  it('un bail terminé ET un autre en cours : reste en place, quel que soit l’ordre', () => {
    expect(locataireEnPlace([{ sortie: '2025-08-07' }, { sortie: null }])).toBe(true);
    expect(locataireEnPlace([{ sortie: null }, { sortie: '2025-08-07' }])).toBe(true);
  });
  it('un bail sans date de sortie (vide ou blanche) : en place ; tous terminés : ancien', () => {
    expect(locataireEnPlace([{ sortie: '' }])).toBe(true);
    expect(locataireEnPlace([{ sortie: '  ' }])).toBe(true);
    expect(locataireEnPlace([{ sortie: '2020-12-18' }, { sortie: '2025-02-24' }])).toBe(false);
  });
  it('les dates lues en base passent telles quelles (tableau, null toléré)', () => {
    expect(occupationsDesSorties(['2025-08-07', null])).toEqual([{ sortie: '2025-08-07' }, { sortie: null }]);
    expect(occupationsDesSorties(null)).toEqual([]);
  });
  it('le SQL ne fait que LIRE les dates de sortie du locataire désigné par l’alias (le verdict reste à la règle)', () => {
    const sql = sqlSortiesDuLocataire('lc').replace(/\s+/g, ' ');
    expect(sql).toContain('array_agg(o_st.sortie::text');
    expect(sql).toContain('FROM gestion_annuaire_occupation o_st WHERE o_st.locataire_id = lc.id');
    expect(sql).not.toContain('sortie IS NULL');
  });
});

const ligne = (x: Partial<LigneAccueil>): LigneAccueil => ({
  id: 1, titre: 'JULDO Thomas', telephone: null, email: null, adresse: null, detail: null, ancien: false, groupe: 'locataires', ...x,
});

describe('🔴 LA PASTILLE de la recherche de la Location — le MOT et la couleur de la fiche', () => {
  it('ancien locataire → « Ancien locataire », ton violet', () => {
    expect(LIBELLE_ANCIEN_LOCATAIRE).toBe('Ancien locataire');
    expect(pastilleRecherche(ligne({ enPlace: false }))).toEqual({ mot: 'Ancien locataire', ton: 'ancien-locataire' });
  });
  it('locataire en place → « Locataire », ton vert (inchangé)', () => {
    expect(pastilleRecherche(ligne({ enPlace: true }))).toEqual({ mot: 'Locataire', ton: 'locataires' });
  });
  it('fiche sortie du portefeuille → « Ancien · Locataire », grisée (inchangé), et les autres types inchangés', () => {
    expect(pastilleRecherche(ligne({ ancien: true, enPlace: false }))).toEqual({ mot: 'Ancien · Locataire', ton: 'ancien' });
    expect(pastilleRecherche(ligne({ groupe: 'proprietaires' }))).toEqual({ mot: 'Propriétaire', ton: 'proprietaires' });
  });
  it('un ancien locataire RESTE dans les résultats, à sa place : l’ordre ne change pas', () => {
    const r = { proprietaires: [], syndics: [], coproprietes: [], biens: [], tronque: false,
      locataires: [ligne({ id: 1, enPlace: false }), ligne({ id: 2, enPlace: true }), ligne({ id: 3, ancien: true })] };
    expect(aplatirResultats(r).map((l) => l.id)).toEqual([1, 2, 3]);
  });
});

describe('🔴 LE DÉPÔT — la recherche rend le statut de la fiche pour chaque locataire', () => {
  beforeEach(() => { h.sql = []; h.params = []; h.locataires = []; });

  it('JULDO (bail terminé le 07/08/2025) → enPlace faux ; un bail terminé + un en cours → vrai ; aucun retiré', async () => {
    h.locataires = [
      { id: '261', nom: 'JULDO Thomas', telephone: null, email: null, adresse: null, detail: null, ancien: false, sorties: ['2025-08-07'] },
      { id: '262', nom: 'JUNOT Anne', telephone: null, email: null, adresse: null, detail: null, ancien: false, sorties: ['2024-01-31', null] },
      { id: '263', nom: 'JUVIN Paul', telephone: null, email: null, adresse: null, detail: null, ancien: false, sorties: [null] },
    ];
    const r = await rechercherPortefeuille('ju');
    expect(r.locataires.map((l) => [l.id, l.enPlace])).toEqual([[261, false], [262, true], [263, true]]);
    expect(pastilleRecherche({ ...r.locataires[0], groupe: 'locataires' }).mot).toBe('Ancien locataire');
  });

  it('la requête des locataires lit leurs dates de sortie, et le terme tapé part en paramètre lié', async () => {
    await rechercherPortefeuille('ju');
    const i = h.sql.findIndex((s) => s.includes('FROM gestion_annuaire_locataire p'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(h.sql[i].replace(/\s+/g, ' ')).toContain('o_st.locataire_id = p.id');
    expect(h.params[i]).toEqual(['', '', ['ju']]);
  });
});
