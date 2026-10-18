import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — le dépôt, sur une base SIMULÉE.
 * 🔴 On n'asserte jamais la forme d'un SQL : des FRAGMENTS sémantiques (SQL aux blancs normalisés) et les PARAMÈTRES liés.
 */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');

/** Le lot 7, bail du 01/09/2022 : Alice (occ 11) et Paul (occ 12) ; Alice occupe aussi la cave (lot 8, occ 21). */
let occupationsEnPlace: { id: string; locataire_id: string; nom: string; entree: string | null }[] = [];
let groupe: { id: string; locataire_id: string; lot_id: string; entree: string | null; sortie: string | null }[] = [];

function repondre(sql: string, params: unknown[]): { rows: unknown[]; rowCount: number } {
  appels.push({ sql: norme(sql), params });
  const s = norme(sql);
  if (s.includes('AS j')) return { rows: [{ j: '2026-10-19' }], rowCount: 1 };
  if (s.startsWith('SELECT o.lot_id::text, o.entree::text FROM gestion_annuaire_occupation o WHERE o.id = $1')) {
    return params[0] === 404 ? { rows: [], rowCount: 0 } : { rows: [{ lot_id: '7', entree: '2022-09-01' }], rowCount: 1 };
  }
  if (s.includes('FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire pr')) {
    return { rows: [{ adresse: '4 rue Fictive, 92800 Puteaux', type_logement: null, nature: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean' }], rowCount: 1 };
  }
  if (s.includes('WHERE o.lot_id = $1 AND o.sortie IS NULL')) return { rows: occupationsEnPlace, rowCount: occupationsEnPlace.length };
  if (s.includes('FROM gestion_lot_annexe a JOIN gestion_annuaire_lot al')) {
    return { rows: [{ lot_id: '8', libelle: 'Cave n° 7', occupation_id: '21', locataire_id: '101' }], rowCount: 1 };
  }
  if (s.startsWith('SELECT id::text, locataire_id::text, lot_id::text, entree::text, sortie::text FROM gestion_annuaire_occupation')) {
    return { rows: groupe, rowCount: groupe.length };
  }
  if (s.startsWith('UPDATE gestion_annuaire_occupation')) return { rows: [], rowCount: (params[0] as unknown[]).length };
  if (s.includes('FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[])')) {
    const base = { adresse: '4 rue Fictive', code_postal: '92800', commune: 'Puteaux', nature: 'Appartement', type_bien: 'Type 3', proprietaire_id: '5',
      type_local: null, parking_type: null, parking_situation: null, nom_annexe: null, meuble: 'true', num_lot_copro: '27', batiment: null, escalier: null,
      surface_carrez_m2: '41.8', surface_habitable_m2: null, surface_m2: null, surface_exterieure_m2: null, nombre_pieces: '3', ascenseur: null, digicode: null,
      digicode_code: null, precision_acces: null, dpe_classe: null, dpe_date: null, dpe_non_soumis: null, chauffage: null, epoque_construction: null, syndic_id: null };
    return { rows: [
      { ...base, id: '7', wippimmo_id: '100', categorie: 'logement', type_logement: null, etage: '3', porte: 'G' },
      { ...base, id: '8', wippimmo_id: 'app-1', categorie: 'cave', type_logement: null, etage: '-1', porte: '7', num_lot_copro: null },
    ], rowCount: 2 };
  }
  if (s.startsWith('SELECT id::text, nom_complet AS nom FROM gestion_annuaire_proprietaire')) return { rows: [{ id: '5', nom: 'DUPONT Jean' }], rowCount: 1 };
  if (s.includes('FROM gestion_location_conditions c')) return { rows: [{ loyer_hc: '1250', provisions: null, taux: '6', base: 'hc' }], rowCount: 1 };
  if (s.includes('SELECT l.wippimmo_id AS cle')) return { rows: [{ cle: 'W-101' }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}

const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) =>
    fn((sql, params) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: async () => '' }));
vi.mock('../gestion/personneVivanteSql', () => ({ sqlPersonneVivante: async () => 'true' }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: async () => ({ adresseGestion: 'gestion@criterimmo.fr' }) }));

import {
  annulerSortie, corrigerSortie, encartDuBail, enregistrerSortie, notifierSortie, rechercherOccupants, type SortieFaite,
} from './sortieLocatairesRepo';

const AUTEUR = { id: null, libelle: 'arno@exemple.fr' };
const ecritures = (): Appel[] => appels.filter((a) => /^(UPDATE|INSERT|DELETE)/.test(a.sql));

beforeEach(() => {
  appels.length = 0;
  occupationsEnPlace = [
    { id: '11', locataire_id: '101', nom: 'BERNARD Alice', entree: '2022-09-01' },
    { id: '12', locataire_id: '102', nom: 'BERNARD Paul', entree: '2022-09-01' },
  ];
  groupe = [];
});

describe('la recherche : les seuls OCCUPANTS en place à la date du jour', () => {
  it('filtre entrée passée et sortie absente ou à venir ; nom, adresse, téléphone, e-mail ; paramètres liés', async () => {
    await rechercherOccupants('bernard');
    const a = appels.find((x) => x.sql.includes('FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l'));
    expect(a).toBeDefined();
    expect(a!.sql).toContain('(o.entree IS NULL OR o.entree <=');
    expect(a!.sql).toContain('(o.sortie IS NULL OR o.sortie >');
    expect(a!.sql).toContain('l.nom_normalise LIKE');
    expect(a!.sql).toContain('lo.adresse_normalisee');
    expect(a!.params).toEqual(['', '', ['bernard']]);
    await rechercherOccupants('06 12 34 56 78');
    const t = appels.at(-1)!;
    expect(t.sql).toContain("c.sorte = 'telephone'");
    expect(t.params[0]).toBe('612345678');
  });

  it('moins de deux caractères : aucune requête', async () => {
    expect(await rechercherOccupants('b')).toEqual([]);
    expect(appels).toHaveLength(0);
  });
});

describe('enregistrerSortie — LIRE (FOR UPDATE) → REFUSER → ÉCRIRE', () => {
  it('sortie PARTIELLE : seul le sortant (et son annexe) est daté ; le bail continue', async () => {
    const r = await enregistrerSortie({ occupationId: 11, sortants: [11], date: '2026-10-15' }, AUTEUR);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.vacant).toBe(false);
    expect(r.data.restants).toEqual(['BERNARD Paul']);
    expect(r.data.annexes).toEqual(['Cave n° 7']);
    const maj = ecritures().filter((a) => a.sql.startsWith('UPDATE'));
    expect(maj).toHaveLength(1);
    expect(maj[0].sql).toContain('SET sortie = $2::date');
    expect(maj[0].sql).toContain('sortie IS NULL');
    expect(maj[0].params).toEqual([[11, 21], '2026-10-15']);
    // Les lectures verrouillées PRÉCÈDENT l'écriture.
    const iVerrou = appels.findIndex((a) => a.sql.includes('FOR UPDATE'));
    const iMaj = appels.findIndex((a) => a.sql.startsWith('UPDATE'));
    expect(iVerrou).toBeGreaterThanOrEqual(0);
    expect(iVerrou).toBeLessThan(iMaj);
  });

  it('sortie TOTALE : le logement devient vacant', async () => {
    const r = await enregistrerSortie({ occupationId: 11, sortants: [11, 12], date: '2026-10-15' }, AUTEUR);
    expect(r.etat).toBe('ok');
    if (r.etat === 'ok') { expect(r.data.vacant).toBe(true); expect(r.data.restants).toEqual([]); }
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE'))!.params).toEqual([[11, 12, 21], '2026-10-15']);
  });

  it('RIEN N’EST EFFACÉ : aucun DELETE, une date posée sur les lignes existantes', async () => {
    await enregistrerSortie({ occupationId: 11, sortants: [11, 12], date: '2026-10-15' }, AUTEUR);
    expect(appels.some((a) => /\bDELETE\b|\bTRUNCATE\b/i.test(a.sql))).toBe(false);
  });

  it('JOURNALISÉE : une ligne par sortant et une pour le logement, attribuées à l’auteur', async () => {
    await enregistrerSortie({ occupationId: 11, sortants: [11, 12], date: '2026-10-15' }, AUTEUR);
    const j = ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));
    expect(j).toHaveLength(3);
    expect(j.map((x) => [x.params[0], x.params[1], x.params[2], x.params[4], x.params[7]])).toEqual([
      ['annuaire', 101, 'location_sortie_locataire', '2026-10-15', 'arno@exemple.fr'],
      ['annuaire', 102, 'location_sortie_locataire', '2026-10-15', 'arno@exemple.fr'],
      ['annuaire_lot', 7, 'location_sortie_locataire', '2026-10-15', 'arno@exemple.fr'],
    ]);
    expect(String(j[2].params[5])).toContain('le logement devient vacant');
  });

  it('refus SANS DATE : rien n’est écrit', async () => {
    const r = await enregistrerSortie({ occupationId: 11, sortants: [11], date: '' }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    expect(ecritures()).toHaveLength(0);
  });

  it('refus d’une date ANTÉRIEURE à l’entrée : rien n’est écrit', async () => {
    const r = await enregistrerSortie({ occupationId: 11, sortants: [11], date: '2021-01-01' }, AUTEUR);
    expect(r.etat).toBe('refus');
    expect(ecritures()).toHaveLength(0);
  });

  it('occupation inconnue : « inconnu », rien n’est écrit', async () => {
    expect(await enregistrerSortie({ occupationId: 404, sortants: [404], date: '2026-10-15' }, AUTEUR)).toEqual({ etat: 'inconnu' });
    expect(ecritures()).toHaveLength(0);
  });
});

describe('corriger / annuler une sortie — gestes dédiés, journalisés', () => {
  it('corriger : nouvelle date sur tout le groupe, journal avant → après', async () => {
    groupe = [
      { id: '11', locataire_id: '101', lot_id: '7', entree: '2022-09-01', sortie: '2026-10-15' },
      { id: '21', locataire_id: '101', lot_id: '8', entree: '2022-09-01', sortie: '2026-10-15' },
    ];
    const r = await corrigerSortie({ occupationIds: [11, 21], date: '2026-10-17' }, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { date: '2026-10-17' } });
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE'))!.params).toEqual([[11, 21], '2026-10-17']);
    const j = ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect([j.params[2], j.params[3], j.params[4]]).toEqual(['location_sortie_corrigee', '2026-10-15', '2026-10-17']);
  });

  it('annuler : la sortie est retirée des lignes (qui restent), le journal garde la date annulée', async () => {
    groupe = [{ id: '11', locataire_id: '101', lot_id: '7', entree: '2022-09-01', sortie: '2026-10-15' }];
    const r = await annulerSortie({ occupationIds: [11] }, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { annulee: '2026-10-15' } });
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE'))!.sql).toContain('SET sortie = NULL');
    const j = ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect([j.params[2], j.params[3]]).toEqual(['location_sortie_annulee', '2026-10-15']);
    expect(appels.some((a) => /\bDELETE\b/i.test(a.sql))).toBe(false);
  });

  it('un groupe incohérent (dates différentes) est refusé sans écriture', async () => {
    groupe = [
      { id: '11', locataire_id: '101', lot_id: '7', entree: null, sortie: '2026-10-15' },
      { id: '12', locataire_id: '102', lot_id: '7', entree: null, sortie: '2026-10-16' },
    ];
    expect((await annulerSortie({ occupationIds: [11, 12] }, AUTEUR)).etat).toBe('refus');
    expect(ecritures()).toHaveLength(0);
  });
});

describe('le mail : envoyé après, jamais bloquant, jamais un faux « envoyé »', () => {
  const FAITE: SortieFaite = {
    bail: {
      lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
      locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }], annexes: [], autresOccupants: [],
    },
    date: '2026-10-15', sortants: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }],
    occupationIds: [11], vacant: true, restants: [], annexes: [],
  };

  it('destinataires : l’auteur + comptes actifs Location OU Gestion ; objet et formulation « VACANT »', async () => {
    query.mockImplementationOnce(async (sql: string, params: unknown[] = []) => repondre(sql, params));
    const envois: { a: string[]; objet: string; corps: string }[] = [];
    const transport = { envoyer: vi.fn(async (m: { a: string[]; objet: string; corps: string }) => { envois.push(m); return { ok: true as const, id: null, factice: true } }) };
    const r = await notifierSortie(FAITE, AUTEUR, { transport: transport as never });
    expect(r.envoye).toBe(true);
    expect(envois[0].objet).toBe('Sortie de locataire — 4 rue Fictive, 92800 Puteaux');
    expect(envois[0].corps).toContain('Le logement sera VACANT après ce départ');
    expect(envois[0].a).toContain('arno@exemple.fr');
    const dest = appels.find((a) => a.sql.includes('FROM admin_utilisateur WHERE actif'))!;
    expect(dest.sql).toContain('perm_gestion IS TRUE');
    expect(dest.sql).toContain('perm_location IS TRUE');
    expect(appels.some((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === 'envoye')).toBe(true);
  });

  it('ÉCHEC d’envoi : rendu (envoye=false + motif), journalisé, et AUCUNE écriture ne défait la sortie', async () => {
    const transport = { envoyer: vi.fn(async () => ({ ok: false as const, motif: 'Gmail injoignable' })) };
    const r = await notifierSortie(FAITE, AUTEUR, { transport: transport as never });
    expect(r).toMatchObject({ envoye: false, motif: 'Gmail injoignable' });
    expect(appels.some((a) => a.sql.startsWith('UPDATE'))).toBe(false);
    expect(appels.some((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === 'echec')).toBe(true);
  });

  it('un transport qui LÈVE ne remonte pas d’exception', async () => {
    const transport = { envoyer: vi.fn(async () => { throw new Error('panne réseau'); }) };
    await expect(notifierSortie(FAITE, AUTEUR, { transport: transport as never })).resolves.toMatchObject({ envoye: false, motif: 'panne réseau' });
  });
});

describe('encartDuBail — lecture seule', () => {
  it('le logement PUIS les annexes du bail ; aucune écriture ; une valeur absente vaut null', async () => {
    const e = await encartDuBail(11);
    expect(e).not.toBeNull();
    expect(e!.adresse).toBe('4 rue Fictive, 92800 Puteaux');
    expect(e!.lots.map((l) => [l.lotId, l.role, l.numeroLot])).toEqual([[7, 'logement', '100'], [8, 'annexe', null]]);
    expect(e!.lots[1].type).toBe('Cave');
    expect(e!.meuble).toBe(true);
    expect(e!.surfaceCarrez).toBe(41.8);
    expect(e!.ascenseur).toBeNull();
    expect(e!.proprietaire).toEqual({ id: 5, nom: 'DUPONT Jean' });
    expect(e!.bail).toEqual({ entree: '2022-09-01', loyerHc: 1250, provisions: null, taux: 6, base: 'hc' });
    expect([e!.locataireCle, e!.lotCle]).toEqual(['W-101', '100']);
    expect(ecritures()).toHaveLength(0);
  });
});
