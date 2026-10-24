import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (25/10/2026, migration 423) — L'INDICE DES LOYERS sur les conditions du bail, côté dépôt (base SIMULÉE) : écrit avec la valeur
 * EN VIGUEUR de son trimestre (trace) et au journal ; « Modifier » sans le bloc (fiche du locataire de la Gestion) REPORTE l'indice du
 * bail ; sans la 423, rien n'est nommé. Fragments sémantiques et paramètres liés.
 */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let avec423 = true;
let ligne: Record<string, unknown> | null = null;
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_location_conditions_entree c') && s.includes('FOR UPDATE OF c')) return { rows: ligne === null ? [] : [ligne], rowCount: 1 };
  if (s.includes('SELECT DISTINCT locataire_id::text FROM gestion_annuaire_occupation')) return { rows: [{ locataire_id: '50' }], rowCount: 1 };
  if (s.includes('FROM gestion_location_indice WHERE type = $1')) return { rows: [{ valeur: '146.680' }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'revision_le' || c === 'valeur' ? avec423 : true) }));
vi.mock('./bailRepo', () => ({ bailDisponible: async () => true, garantsDisponibles: async () => true }));
vi.mock('../gestion/schema', () => ({ honorairesGestionDisponible: async () => true }));
vi.mock('./loyerEntreeRepo', () => ({ ecrireLoyerDans: vi.fn(), loyerDeLaSaisie: () => undefined, loyerDesOccupations: async () => null }));
vi.mock('./honorairesProprietaireRepo', () => ({ calculHonorairesDuBien: vi.fn() }));

const { enregistrerConditionsEntreeDans, modifierConditionsEntree } = await import('./conditionsEntreeRepo');

const AUTEUR = { id: 3, libelle: 'arno@exemple.fr' };
const CONDITIONS = {
  depot: 'bailleur', prelevement: false, jour: null, garant: false, assurance: 'visale', assurancePrecision: null,
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  sommes: { prorataLoyer: null, prorataCharges: null, depotGarantie: null, honorairesAgence: null },
  reglement: 'cheque', reglementPrecision: null, commentaire: null,
} as const;
const INDICE = { type: 'irl', annee: 2026, trimestre: 2, revision: '2027-10-12' } as const;
const insertion = (): Appel => appels.find((a) => a.sql.startsWith('INSERT INTO gestion_location_conditions_entree'))!;
const journal = (): Appel => appels.find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
const q = (sql: string, params?: unknown[]) => query(sql, params ?? []);

beforeEach(() => { appels.length = 0; avec423 = true; ligne = null; });

describe('🔴 l’indice du bail', () => {
  it('à l’entrée : type, trimestre, valeur en vigueur (trace), date de révision ; et au journal', async () => {
    await enregistrerConditionsEntreeDans(q as never, [1], 7, { ...CONDITIONS, indice: INDICE } as never, null, AUTEUR, 536);
    expect(insertion().sql).toContain('indice_type, indice_annee, indice_trimestre, indice_valeur, revision_le)');
    expect(insertion().params.slice(-5)).toEqual(['irl', 2026, 2, 146.68, '2027-10-12']);
    expect(String(journal().params[3])).toContain('Indice des loyers : IRL T2 2026 ; Date de révision annuelle : 12/10/2027');
  });
  it('sans la 423 : aucune colonne d’indice nommée (la création se fait comme avant)', async () => {
    avec423 = false;
    await enregistrerConditionsEntreeDans(q as never, [1], 7, { ...CONDITIONS, indice: INDICE } as never, null, AUTEUR, 536);
    expect(insertion().sql).not.toContain('indice_type');
  });
  it('« Modifier » SANS le bloc (pas d’indice envoyé) : l’indice du bail est REPORTÉ tel quel', async () => {
    ligne = { id: '9', bail_cle: 'bail-x', occupation_ids: null, lot_id: '7', depot_garantie: 'agence', prelevement: false, prelevement_jour: null, garant_physique: false,
      assurance_loyers: 'aucune', assurance_precision: null, honoraires_locataire: 'agence', honoraires_proprietaire: 'gestion', prorata_loyer_centimes: null,
      prorata_charges_centimes: null, depot_garantie_centimes: null, honoraires_agence_centimes: null, mode_reglement: 'cheque', mode_reglement_precision: null,
      commentaire: null, saisi_le: '2026-10-12 10:00:00', saisi_par_libelle: 'x', hono_surface_m2: null, hono_zone: null, hono_bareme_id: null, hono_tarif_zone_m2: null,
      hono_tarif_edl_m2: null, hono_visite_bail: null, hono_etat_des_lieux: null, hono_total_proprietaire: null, hono_motif: null, bareme_depuis: null, bareme_source: null,
      bail_id: '536', hono_date_bareme: null, hono_date_supposee: null, bail_occupations: ['1'], surface_actuelle: null, bail_entree: '2026-10-12', hono_saisi_main: false,
      indice_type: 'ilc', indice_annee: 2025, indice_trimestre: 4, revision_le: '2027-10-12' };
    const brut = { depot: 'agence', prelevement: false, garant: false, assurance: 'aucune', honorairesLocataire: 'agence', honorairesProprietaire: 'gestion', sommes: {}, reglement: 'virement' };
    expect((await modifierConditionsEntree(1, brut, AUTEUR)).etat).toBe('ok');
    expect(insertion().params.slice(-5)).toEqual(['ilc', 2025, 4, 146.68, '2027-10-12']);
  });
});
