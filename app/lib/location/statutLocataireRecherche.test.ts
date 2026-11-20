import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (18/11/2026) — « Sur /admin/location, la recherche « ju » renvoie « JULDO Thomas » avec la pastille verte « LOCATAIRE ».
 * Sa fiche /admin/location/locataire/261 dit pourtant « ANCIEN LOCATAIRE » […]. Le statut d'un locataire est DÉRIVÉ, jamais stocké.
 * Il doit exister UNE SEULE définition, partagée par la fiche, le moteur de recherche de Location, celui de Gestion et toute autre
 * liste de locataires. » Puis : « la recherche (Location, Gestion, liste « Ajouter / supprimer un locataire ») doit afficher les
 * trois états de la fiche, avec exactement les mêmes mots et les mêmes couleurs : « Locataire » en vert, « Locataire en préavis »
 * en bleu, « Ancien locataire » en violet. »
 * Épreuves : la règle (pure), la pastille (pure), et les dépôts (base simulée : le COMPORTEMENT et les paramètres liés, jamais la
 * forme du SQL entier).
 */
const h = vi.hoisted(() => ({
  sql: [] as string[], params: [] as unknown[][],
  locataires: [] as Record<string, unknown>[], preavis: {} as Record<string, string>, idsPreavis: [] as number[][],
}));
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    h.sql.push(sql); h.params.push(params);
    return { rows: sql.includes('FROM gestion_annuaire_locataire p') ? h.locataires : [] };
  },
  withTransaction: async () => { throw new Error('aucune écriture dans ces épreuves'); },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./preavisEnCoursRepo', () => ({
  locatairesEnPreavis: async (ids: number[]) => { h.idsPreavis.push([...ids]); return h.preavis; },
}));
vi.mock('../gestion/statutBienRepo', () => ({ statutBienDisponible: async () => true, sqlStatutBien: async () => "'en_gestion'" }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
vi.mock('../gestion/personneVivanteSql', () => ({ sqlPersonneVivante: async (a: string) => `${a}.supprime_le IS NULL` }));
vi.mock('../gestion/coproprieteRepo', () => ({ listerCoproprietes: async () => [] }));

import { locataireEnPlace, MOT_STATUT_LOCATAIRE, occupationsDesSorties, sqlSortiesDuLocataire, statutLocataire } from '../gestion/historiqueBien';
import { aplatirResultats, pastilleRecherche, type LigneAccueil } from './recherchePortefeuille';
import { rechercherPortefeuille } from './portefeuilleRepo';
import { listeLocataires } from './locationRepo';

const jour = (decalage: number): string => new Date(Date.now() + decalage * 86_400_000).toISOString().slice(0, 10);
const HIER = jour(-1);
const DANS_UN_MOIS = jour(30);

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
  it('🔴 une sortie datée DANS LE FUTUR : EN PLACE jusqu’à cette date — 🔴 (Arno, 20/11/2026) la règle a changé : une sortie À VENIR laisse EN PLACE (« sortie prévue le … ») ; seule une sortie passée (le jour même compris) fait l’ancien', () => {
    expect(locataireEnPlace([{ sortie: DANS_UN_MOIS }])).toBe(true);
    expect(statutLocataire([{ sortie: DANS_UN_MOIS }], false)).toBe('en_place');
    // …et un bail en cours à côté le garde en place.
    expect(statutLocataire([{ sortie: DANS_UN_MOIS }, { sortie: null }], false)).toBe('en_place');
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

describe('🔴 LES TROIS ÉTATS DE LA FICHE — en place, en préavis, ancien', () => {
  it('en place sans préavis → « Locataire » ; en place avec un préavis ouvert → « Locataire en préavis »', () => {
    expect(statutLocataire([{ sortie: null }], false)).toBe('en_place');
    expect(statutLocataire([{ sortie: null }], true)).toBe('en_preavis');
    expect(MOT_STATUT_LOCATAIRE).toEqual({ en_place: 'Locataire', en_preavis: 'Locataire en préavis', ancien: 'Ancien locataire' });
  });
  it('un ancien locataire n’est jamais « en préavis » : son départ est acté', () => {
    expect(statutLocataire([{ sortie: HIER }], true)).toBe('ancien');
    expect(statutLocataire([], true)).toBe('ancien');
  });
  it('les trois MOTS diffèrent (jamais une information portée par la seule couleur)', () => {
    expect(new Set(Object.values(MOT_STATUT_LOCATAIRE)).size).toBe(3);
  });
});

const ligne = (x: Partial<LigneAccueil>): LigneAccueil => ({
  id: 1, titre: 'JULDO Thomas', telephone: null, email: null, adresse: null, detail: null, ancien: false, groupe: 'locataires', ...x,
});

describe('🔴 LA PASTILLE de la recherche de la Location — le MOT et la couleur de la fiche', () => {
  it('ancien locataire → « Ancien locataire », ton violet', () => {
    expect(pastilleRecherche(ligne({ statut: 'ancien' }))).toEqual({ mot: 'Ancien locataire', ton: 'ancien-locataire' });
  });
  it('en préavis → « Locataire en préavis », ton bleu', () => {
    expect(pastilleRecherche(ligne({ statut: 'en_preavis' }))).toEqual({ mot: 'Locataire en préavis', ton: 'preavis' });
  });
  it('locataire en place → « Locataire », ton vert (inchangé)', () => {
    expect(pastilleRecherche(ligne({ statut: 'en_place' }))).toEqual({ mot: 'Locataire', ton: 'locataires' });
  });
  it('fiche sortie du portefeuille → « Ancien · Locataire », grisée (inchangé), et les autres types inchangés', () => {
    expect(pastilleRecherche(ligne({ ancien: true, statut: 'ancien' }))).toEqual({ mot: 'Ancien · Locataire', ton: 'ancien' });
    expect(pastilleRecherche(ligne({ groupe: 'proprietaires' }))).toEqual({ mot: 'Propriétaire', ton: 'proprietaires' });
  });
  it('un ancien locataire RESTE dans les résultats, à sa place : l’ordre ne change pas', () => {
    const r = { proprietaires: [], syndics: [], coproprietes: [], biens: [], tronque: false,
      locataires: [ligne({ id: 1, statut: 'ancien' }), ligne({ id: 2, statut: 'en_preavis' }), ligne({ id: 3, statut: 'en_place' }), ligne({ id: 4, ancien: true })] };
    expect(aplatirResultats(r).map((l) => l.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('🔴 LE DÉPÔT de la recherche — le statut de la fiche pour chaque locataire', () => {
  beforeEach(() => { h.sql = []; h.params = []; h.locataires = []; h.preavis = {}; h.idsPreavis = []; });
  const loc = (id: string, nom: string, sorties: (string | null)[]) => ({ id, nom, telephone: null, email: null, adresse: null, detail: null, ancien: false, sorties });

  it('JULDO (bail terminé) ancien ; un bail terminé + un en cours en place ; un préavis ouvert en préavis ; aucun retiré', async () => {
    h.locataires = [loc('261', 'JULDO Thomas', ['2025-08-07']), loc('262', 'JUNOT Anne', ['2024-01-31', null]),
      loc('263', 'JUVIN Paul', [null]), loc('264', 'JUPIN Léo', [DANS_UN_MOIS])];
    h.preavis = { 263: '2026-12-31' };
    const r = await rechercherPortefeuille('ju');
    // 🔴 (Arno, 20/11/2026) la règle a changé : une sortie À VENIR laisse EN PLACE (« sortie prévue le … ») ; seule une sortie passée (le jour même compris) fait l’ancien
    expect(r.locataires.map((l) => [l.id, l.statut])).toEqual([[261, 'ancien'], [262, 'en_place'], [263, 'en_preavis'], [264, 'en_place']]);
    expect(r.locataires.map((l) => pastilleRecherche({ ...l, groupe: 'locataires' }).mot))
      .toEqual(['Ancien locataire', 'Locataire', 'Locataire en préavis', `Locataire, sortie prévue le ${DANS_UN_MOIS.slice(8, 10)}/${DANS_UN_MOIS.slice(5, 7)}/${DANS_UN_MOIS.slice(0, 4)}`]);
    // Le préavis est demandé pour les locataires trouvés, et eux seuls.
    expect(h.idsPreavis).toEqual([[261, 262, 263, 264]]);
  });

  it('la requête des locataires lit leurs dates de sortie, et le terme tapé part en paramètre lié', async () => {
    await rechercherPortefeuille('ju');
    const i = h.sql.findIndex((s) => s.includes('FROM gestion_annuaire_locataire p'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(h.sql[i].replace(/\s+/g, ' ')).toContain('o_st.locataire_id = p.id');
    expect(h.params[i]).toEqual(['', '', ['ju']]);
  });
});

describe('🔴 LA LISTE DES LOCATAIRES de la Location — les trois états', () => {
  beforeEach(() => { h.sql = []; h.params = []; h.locataires = []; h.preavis = {}; h.idsPreavis = []; });

  it('en place, en préavis, ancien : le statut et l’ancien drapeau « en place » s’accordent', async () => {
    h.locataires = [
      { id: '1', nom: 'A', sorties: [null], logement: 'x', lot_id: '9', total: 3 },
      { id: '2', nom: 'B', sorties: [null], logement: 'y', lot_id: '8', total: 3 },
      { id: '3', nom: 'C', sorties: ['2025-01-31'], logement: null, lot_id: null, total: 3 },
    ];
    h.preavis = { 2: '2026-12-31' };
    const p = await listeLocataires(0, 'a');
    expect(p.lignes.map((l) => [l.id, l.statut, l.enPlace])).toEqual([[1, 'en_place', true], [2, 'en_preavis', true], [3, 'ancien', false]]);
    expect(h.idsPreavis).toEqual([[1, 2, 3]]);
    // Le filtre tapé part en paramètre lié.
    expect(h.params[0]).toEqual(['%a%', 0]);
  });
});
