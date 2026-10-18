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

function repondre(sql: string, params: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('AS j')) return { rows: [{ j: '2026-10-19' }], rowCount: 1 };
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

import { annulerPreavis, corrigerPreavis, enregistrerPreavis } from './preavisRepo';

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
