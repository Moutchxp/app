import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LE PRÉAVIS DU LOCATAIRE (Arno, 18/10/2026) — le dépôt, sur une base SIMULÉE. Fragments sémantiques et paramètres liés,
 * jamais la forme exacte d'un SQL. 🔴 Le préavis ne touche JAMAIS l'occupation : le locataire reste occupant.
 */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let occupations: { id: string; locataire_id: string; entree: string | null; sortie: string | null; nom: string }[] = [];
let ouverts: { occupation_id: string }[] = [];
let ligne: Record<string, unknown> | null = null;
let groupe: Record<string, unknown>[] = [];
let edl: { id: string; locataire_id: string; sortie: string | null; edl: string | null; recu_le: string | null; date_max: string | null }[] = [];

function repondre(sql: string, params: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FOR UPDATE OF p, o')) return { rows: groupe, rowCount: groupe.length };
  if (s.includes('AS j')) return { rows: [{ j: '2026-10-19' }], rowCount: 1 };
  if (s.includes('AS edl') && s.includes('FOR UPDATE OF o')) return { rows: edl, rowCount: edl.length };
  if (s.includes('FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l') && s.includes('FOR UPDATE')) return { rows: occupations, rowCount: occupations.length };
  if (s.includes('FROM gestion_location_preavis WHERE occupation_id = ANY') && s.includes('FOR UPDATE')) return { rows: ouverts, rowCount: ouverts.length };
  if (s.includes('FROM gestion_location_preavis p WHERE p.id = $1 FOR UPDATE')) return { rows: ligne === null ? [] : [ligne], rowCount: ligne === null ? 0 : 1 };
  if (s.startsWith('SELECT locataire_id::text, entree::text, sortie::text FROM gestion_annuaire_occupation')) return { rows: [{ locataire_id: '101', entree: '2022-09-01', sortie: null }], rowCount: 1 };
  if (s.startsWith('SELECT id::text, occupation_id::text, date_max::text')) return { rows: ligne === null ? [] : [ligne], rowCount: 1 };
  if (s.startsWith('SELECT locataire_id::text FROM gestion_annuaire_occupation')) return { rows: [{ locataire_id: '101' }], rowCount: 1 };
  if (s.includes('nextval(')) return { rows: [{ id: '99' }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./sortieLocatairesRepo', () => ({ lireBail: vi.fn(async () => null) }));

import { annulerPreavis, annulerPreavisGroupe, corrigerPreavis, corrigerPreavisGroupe, enregistrerEtatDesLieux, enregistrerPreavis, MOTIF_GROUPE_INCOHERENT } from './preavisRepo';

const AUTEUR = { id: 3, libelle: 'arno@exemple.fr' };
const ecritures = (): Appel[] => appels.filter((a) => /^(UPDATE|INSERT|DELETE)/.test(a.sql));

beforeEach(() => {
  appels.length = 0;
  occupations = [
    { id: '11', locataire_id: '101', entree: '2022-09-01', sortie: null, nom: 'BERNARD Alice' },
    { id: '12', locataire_id: '102', entree: '2022-09-01', sortie: null, nom: 'BERNARD Paul' },
  ];
  ouverts = [];
  ligne = null;
  groupe = [];
});

/** `enregistrerPreavis` lit d'abord le contexte (durée proposée) : on le simule par la lecture du bail. */
async function enregistrer(o: Partial<Parameters<typeof enregistrerPreavis>[0]> = {}) {
  const { lireBail } = await import('./sortieLocatairesRepo');
  (lireBail as ReturnType<typeof vi.fn>).mockResolvedValue({
    lotId: 7, adresse: null, type: null, etage: null, porte: null, proprietaire: null, entree: '2022-09-01', annexes: [], autresOccupants: [],
    locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' }],
  });
  return enregistrerPreavis({ occupationIds: [11, 12], recuLe: '2026-10-15', choix: { mode: 'mois', duree: 1 }, motif: ' mutation ', ...o }, AUTEUR);
}

describe('enregistrerPreavis', () => {
  it('un préavis par locataire coché ; date maximale calculée ; journalisé ; l’OCCUPATION n’est JAMAIS touchée (le logement reste occupé)', async () => {
    const r = await enregistrer();
    expect(r).toEqual({ etat: 'ok', data: { dateMax: '2026-11-15', preavis: 2 } });
    const ins = ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_location_preavis'));
    expect(ins).toHaveLength(2);
    expect(ins.map((a) => [a.params[0], a.params[1], a.params[2], a.params[3], a.params[4], a.params[8], a.params[10]])).toEqual([
      [11, '2026-10-15', 'mois', 1, '2026-11-15', 'mutation', 'arno@exemple.fr'],
      [12, '2026-10-15', 'mois', 1, '2026-11-15', 'mutation', 'arno@exemple.fr'],
    ]);
    expect(ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal')).map((a) => a.params[1])).toEqual(['location_preavis_enregistre', 'location_preavis_enregistre']);
    expect(appels.some((a) => /UPDATE gestion_annuaire_occupation/.test(a.sql))).toBe(false);
    // LIRE (FOR UPDATE) avant ÉCRIRE.
    expect(appels.findIndex((a) => a.sql.includes('FOR UPDATE'))).toBeLessThan(appels.findIndex((a) => a.sql.startsWith('INSERT')));
  });

  it('refus AVANT toute écriture : réception manquante, réception future, déjà en préavis, locataire déjà sorti', async () => {
    expect((await enregistrer({ recuLe: '' })).etat).toBe('refus');
    expect((await enregistrer({ recuLe: '2026-10-25' })).etat).toBe('refus');
    ouverts = [{ occupation_id: '11' }];
    const deja = await enregistrer();
    expect(deja).toEqual({ etat: 'refus', motif: 'Déjà en préavis : BERNARD Alice. Corrigez son préavis plutôt que d’en saisir un second.' });
    ouverts = [];
    occupations[0].sortie = '2026-10-01';
    expect((await enregistrer()).etat).toBe('refus');
    expect(ecritures()).toHaveLength(0);
  });
});

describe('corriger / annuler un préavis — rien n’est effacé', () => {
  const OUVERT = { id: '50', occupation_id: '11', recu_le: '2026-10-15', date_max: '2026-11-15', mode: 'mois', duree_mois: 1, duree_proposee_mois: 1,
    motif: null, cree_par_libelle: 'x', cree_le: '2026-10-15', remplace_le: null, annule_le: null, meuble: false, zone_tendue: true };

  it('corriger : RÉSERVER l’identifiant, CLORE l’ancienne ligne (pointée vers la nouvelle), puis INSÉRER — journalisé', async () => {
    ligne = OUVERT;
    const r = await corrigerPreavis({ preavisId: 50, recuLe: '2026-10-15', choix: { mode: 'mois', duree: 3 } }, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { dateMax: '2027-01-15' } });
    const ordre = appels.map((a) => (a.sql.includes('nextval(') ? 'reserver' : a.sql.startsWith('UPDATE gestion_location_preavis') ? 'clore'
      : a.sql.startsWith('INSERT INTO gestion_location_preavis') ? 'inserer' : null)).filter((x) => x !== null);
    expect(ordre).toEqual(['reserver', 'clore', 'inserer']);
    const clore = ecritures().find((a) => a.sql.startsWith('UPDATE gestion_location_preavis'))!;
    expect(clore.sql).toContain('SET remplace_le = now(), remplace_par_id = $2');
    expect(clore.params).toEqual([50, 99]);
    expect(ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_location_preavis'))!.params.slice(0, 7)).toEqual([99, 11, '2026-10-15', 'mois', 3, '2027-01-15', 1]);
    expect(ecritures().some((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === 'location_preavis_corrige')).toBe(true);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
  });

  it('annuler : la ligne est CLOSE (annule_le), jamais effacée ; journalisé', async () => {
    ligne = OUVERT;
    expect(await annulerPreavis({ preavisId: 50 }, AUTEUR)).toEqual({ etat: 'ok', data: { annule: 50 } });
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE gestion_location_preavis'))!.sql).toContain('SET annule_le = now()');
    expect(ecritures().some((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === 'location_preavis_annule')).toBe(true);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
  });

  it('un préavis déjà clos ne se corrige ni ne s’annule (refus, aucune écriture)', async () => {
    ligne = { ...OUVERT, annule_le: '2026-10-16' };
    expect((await annulerPreavis({ preavisId: 50 }, AUTEUR)).etat).toBe('refus');
    expect((await corrigerPreavis({ preavisId: 50, recuLe: '2026-10-15', choix: { mode: 'mois', duree: 1 } }, AUTEUR)).etat).toBe('refus');
    expect(ecritures()).toHaveLength(0);
  });
});

describe('la date d’état des lieux de sortie prévu (accueil, Arno 18/10/2026)', () => {
  const OCC = (id: string, o: Partial<(typeof edl)[number]> = {}) => ({ id, locataire_id: `1${id}`, sortie: null, edl: null, recu_le: '2026-10-01', date_max: '2026-11-01', ...o });

  it('LIRE (FOR UPDATE) → ÉCRIRE sur l’OCCUPATION (jamais la date de sortie) ; chaque occupation au journal', async () => {
    edl = [OCC('11'), OCC('12', { edl: '2026-11-03' })];
    expect(await enregistrerEtatDesLieux({ occupationIds: [11, 12], date: '2026-11-05' }, AUTEUR)).toEqual({ etat: 'ok', data: { date: '2026-11-05' } });
    const maj = ecritures().find((a) => a.sql.startsWith('UPDATE gestion_annuaire_occupation'))!;
    expect(maj.sql).toContain('SET etat_des_lieux_prevu_le = $2::date');
    expect(maj.sql).not.toMatch(/\bsortie\s*=/);
    expect(maj.params).toEqual([[11, 12], '2026-11-05']);
    expect(appels.findIndex((a) => a.sql.includes('FOR UPDATE OF o'))).toBeLessThan(appels.indexOf(maj));
    const j = ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));
    expect(j.map((a) => a.params[1])).toEqual(['location_edl_prevu', 'location_edl_prevu']);
  });

  it('effacer (date vide) : NULL posé, journalisé « effacé » — rien n’est supprimé', async () => {
    edl = [OCC('11', { edl: '2026-11-03' })];
    expect(await enregistrerEtatDesLieux({ occupationIds: [11], date: '' }, AUTEUR)).toEqual({ etat: 'ok', data: { date: null } });
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE gestion_annuaire_occupation'))!.params).toEqual([[11], null]);
    expect(ecritures().some((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === 'location_edl_efface')).toBe(true);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
  });

  it('refus AVANT toute écriture : hors bornes, locataire sorti, plus en préavis', async () => {
    edl = [OCC('11')];
    expect((await enregistrerEtatDesLieux({ occupationIds: [11], date: '2026-09-30' }, AUTEUR)).etat).toBe('refus');
    expect((await enregistrerEtatDesLieux({ occupationIds: [11], date: '2027-05-02' }, AUTEUR)).etat).toBe('refus');
    edl = [OCC('11', { sortie: '2026-10-10' })];
    expect((await enregistrerEtatDesLieux({ occupationIds: [11], date: '2026-11-05' }, AUTEUR)).etat).toBe('refus');
    edl = [OCC('11', { recu_le: null, date_max: null })];
    expect((await enregistrerEtatDesLieux({ occupationIds: [11], date: '2026-11-05' }, AUTEUR)).etat).toBe('refus');
    expect(ecritures()).toHaveLength(0);
  });
});

describe('🔴 Arno (21/11/2026) — le préavis des N colocataires reçu le même jour : corriger / annuler en UN geste', () => {
  const COLOC = (id: string, occ: string, loc: string, o: Record<string, unknown> = {}) => ({
    id, occupation_id: occ, recu_le: '2026-10-15', date_max: '2026-11-15', mode: 'mois', duree_mois: 1, duree_proposee_mois: 3, motif: null,
    cree_par_libelle: 'x', cree_le: '2026-10-15', remplace_le: null, annule_le: null, meuble: false, zone_tendue: false,
    locataire_id: loc, entree: '2022-09-01', sortie: null, lot_id: '7', ...o });
  const journal = (action: string) => ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal') && a.params[1] === action);

  it('annuler : chaque préavis CLOS (jamais effacé), UNE ligne de journal PAR locataire', async () => {
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102')];
    expect(await annulerPreavisGroupe({ preavisIds: [50, 51] }, AUTEUR)).toEqual({ etat: 'ok', data: { annules: [50, 51] } });
    const clos = ecritures().filter((a) => a.sql.startsWith('UPDATE gestion_location_preavis'));
    expect(clos.map((a) => a.params[0])).toEqual([50, 51]);
    expect(clos.every((a) => a.sql.includes('SET annule_le = now()'))).toBe(true);
    expect(journal('location_preavis_annule').map((a) => a.params[0])).toEqual([101, 102]);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
  });

  it('corriger : pour chacun, l’ancienne ligne close et une nouvelle insérée avec la MÊME date ; un journal par locataire', async () => {
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102')];
    const r = await corrigerPreavisGroupe({ preavisIds: [50, 51], recuLe: '2026-10-15', choix: { mode: 'mois', duree: 3 }, motif: ' mutation ' }, AUTEUR);
    expect(r).toEqual({ etat: 'ok', data: { dateMax: '2027-01-15', corriges: 2 } });
    const inserts = ecritures().filter((a) => a.sql.startsWith('INSERT INTO gestion_location_preavis'));
    expect(inserts.map((a) => [a.params[1], a.params[5], a.params[9]])).toEqual([[11, '2027-01-15', 'mutation'], [12, '2027-01-15', 'mutation']]);
    expect(ecritures().filter((a) => a.sql.startsWith('UPDATE gestion_location_preavis')).map((a) => a.params[0])).toEqual([50, 51]);
    expect(journal('location_preavis_corrige').map((a) => a.params[0])).toEqual([101, 102]);
  });

  it('les MÊMES contrôles que le geste d’un seul : saisie invalide, préavis déjà clos, locataire sorti → refus, AUCUNE écriture', async () => {
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102')];
    expect((await corrigerPreavisGroupe({ preavisIds: [50, 51], recuLe: '2026-12-31', choix: { mode: 'mois', duree: 3 } }, AUTEUR)).etat).toBe('refus');
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102', { annule_le: '2026-10-16' })];
    expect((await annulerPreavisGroupe({ preavisIds: [50, 51] }, AUTEUR)).etat).toBe('refus');
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102', { sortie: '2026-10-18' })];
    expect((await corrigerPreavisGroupe({ preavisIds: [50, 51], recuLe: '2026-10-15', choix: { mode: 'mois', duree: 3 } }, AUTEUR)).etat).toBe('refus');
    expect(ecritures()).toHaveLength(0);
  });

  it('un groupe ne mêle jamais deux logements ni deux dates de réception ; il faut au moins deux préavis', async () => {
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102', { recu_le: '2026-10-14' })];
    expect(await annulerPreavisGroupe({ preavisIds: [50, 51] }, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_GROUPE_INCOHERENT });
    groupe = [COLOC('50', '11', '101'), COLOC('51', '12', '102', { lot_id: '8' })];
    expect(await annulerPreavisGroupe({ preavisIds: [50, 51] }, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_GROUPE_INCOHERENT });
    expect((await annulerPreavisGroupe({ preavisIds: [50, 50] }, AUTEUR)).etat).toBe('refus');
    groupe = [COLOC('50', '11', '101')];
    expect(await annulerPreavisGroupe({ preavisIds: [50, 51] }, AUTEUR)).toEqual({ etat: 'inconnu' });
    expect(ecritures()).toHaveLength(0);
  });
});
