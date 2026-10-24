import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026, migration 402) — LES HONORAIRES PROPRIÉTAIRE SAISIS À LA MAIN, côté dépôt, sur une base SIMULÉE :
 * écrits tels quels avec la marque « saisi à la main » (sans barème ni surface) ; relus comme tels ; JAMAIS recalculés sans
 * confirmation explicite ; refusés sans la migration 402 (rien n'est écrit). Fragments sémantiques et paramètres liés.
 */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let colonnes402 = true;
let ligne: Record<string, unknown> | null = null;
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_location_conditions_entree c') && s.includes('FOR UPDATE OF c')) return { rows: ligne === null ? [] : [ligne], rowCount: 1 };
  if (s.includes('SELECT DISTINCT locataire_id::text FROM gestion_annuaire_occupation')) return { rows: [{ locataire_id: '50' }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => query(sql, params ?? [])),
}));
// 423 (l'indice des loyers) : absente ici — ce fichier éprouve la 402 ; l'indice a son propre fichier (conditionsEntreeIndice.test.ts).
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'hono_saisi_main' ? colonnes402 : c === 'revision_le' || c === 'valeur' ? false : true) }));
vi.mock('./bailRepo', () => ({ bailDisponible: async () => true, garantsDisponibles: async () => true }));
vi.mock('../gestion/schema', () => ({ honorairesGestionDisponible: async () => true }));
vi.mock('./loyerEntreeRepo', () => ({ ecrireLoyerDans: vi.fn(), loyerDeLaSaisie: () => undefined, loyerDesOccupations: async () => null }));
const calcul = vi.fn();
vi.mock('./honorairesProprietaireRepo', () => ({ calculHonorairesDuBien: (...a: unknown[]) => calcul(...a) }));

const { enregistrerConditionsEntreeDans, modifierConditionsEntree, MOTIF_SANS_402 } = await import('./conditionsEntreeRepo');

const AUTEUR = { id: 3, libelle: 'arno@exemple.fr' };
const CONDITIONS = {
  depot: 'bailleur', prelevement: false, jour: null, garant: false, assurance: 'visale', assurancePrecision: null,
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  sommes: { prorataLoyer: null, prorataCharges: null, depotGarantie: null, honorairesAgence: null },
  reglement: 'cheque', reglementPrecision: null, commentaire: null,
} as const;
const SAISI = { etat: 'saisi' as const, zone: 'tres_tendue' as const, date: '2026-11-01', dateSupposee: false, total: '935.03' };
const insertion = (): Appel => appels.find((a) => a.sql.startsWith('INSERT INTO gestion_location_conditions_entree'))!;
const q = (sql: string, params?: unknown[]) => query(sql, params ?? []);

beforeEach(() => { appels.length = 0; colonnes402 = true; ligne = null; calcul.mockReset(); });

describe('à l’entrée', () => {
  it('saisi à la main : le total EXACT, sans surface ni barème, et la marque hono_saisi_main = vrai', async () => {
    await enregistrerConditionsEntreeDans(q as never, [1], 7, CONDITIONS as never, SAISI, AUTEUR, 536);
    const i = insertion();
    expect(i.sql).toContain('hono_saisi_main)');
    // surface, zone, barème, tarif zone, tarif EDL, visite, EDL, total, motif (colonnes 21 à 29), puis bail (30-32), puis la marque (33).
    expect(i.params.slice(20, 29)).toEqual([null, 'tres_tendue', null, null, null, null, null, '935.03', null]);
    expect(i.params.at(-1)).toBe(true);
  });
  it('calculé : la marque est fausse (et les colonnes du calcul comme avant)', async () => {
    const ok = { etat: 'ok' as const, surface: '61.8', zone: 'tres_tendue' as const, date: '2026-11-01', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01',
      source: 's', tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total: '935.034' };
    await enregistrerConditionsEntreeDans(q as never, [1], 7, CONDITIONS as never, ok, AUTEUR, 536);
    expect(insertion().params.slice(20, 29)).toEqual(['61.8', 'tres_tendue', 1, '12.1', '3.03', '747.78', '187.254', '935.034', null]);
    expect(insertion().params.at(-1)).toBe(false);
  });
  it('SANS la migration 402 : un montant saisi est REFUSÉ, rien n’est écrit ; le calcul s’écrit comme avant (sans la colonne)', async () => {
    colonnes402 = false;
    await expect(enregistrerConditionsEntreeDans(q as never, [1], 7, CONDITIONS as never, SAISI, AUTEUR, 536)).rejects.toThrow(MOTIF_SANS_402);
    expect(appels.filter((a) => /^(INSERT|UPDATE|DELETE)/.test(a.sql))).toEqual([]);
    await enregistrerConditionsEntreeDans(q as never, [1], 7, CONDITIONS as never, null, AUTEUR, 536);
    expect(insertion().sql).not.toContain('hono_saisi_main');
  });
});

describe('« Modifier » et « Calculer les honoraires avec la surface actuelle » dans la fiche', () => {
  const LIGNE = {
    id: '1', bail_cle: 'bail-x', occupation_ids: null, lot_id: '7', depot_garantie: 'bailleur', prelevement: false, prelevement_jour: null,
    garant_physique: false, assurance_loyers: 'visale', assurance_precision: null, honoraires_locataire: 'agence', honoraires_proprietaire: 'gestion',
    prorata_loyer_centimes: null, prorata_charges_centimes: null, depot_garantie_centimes: null, honoraires_agence_centimes: null,
    mode_reglement: 'cheque', mode_reglement_precision: null, commentaire: null, saisi_le: '2026-10-21 10:00:00+02', saisi_par_libelle: 'x',
    hono_surface_m2: null, hono_zone: 'tres_tendue', hono_bareme_id: null, hono_tarif_zone_m2: null, hono_tarif_edl_m2: null, hono_visite_bail: null,
    hono_etat_des_lieux: null, hono_total_proprietaire: '935.03', hono_motif: null, bareme_depuis: null, bareme_source: null,
    bail_id: '536', hono_date_bareme: '2026-11-01', hono_date_supposee: false, bail_occupations: ['1'], surface_actuelle: '61.8', bail_entree: '2026-11-01',
    hono_saisi_main: true,
  };
  const ENVOI = { depot: 'bailleur', prelevement: false, garant: false, assurance: 'visale', honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
    sommes: {}, reglement: 'cheque' };
  it('« Modifier » : le montant saisi est REPORTÉ tel quel, toujours marqué saisi à la main', async () => {
    ligne = LIGNE;
    expect(await modifierConditionsEntree(1, ENVOI, AUTEUR)).toEqual({ etat: 'ok', data: undefined });
    expect(insertion().params.slice(20, 29)).toEqual([null, 'tres_tendue', null, null, null, null, null, '935.03', null]);
    expect(insertion().params.at(-1)).toBe(true);
    expect(calcul).not.toHaveBeenCalled();
  });
  it('recalcul SANS confirmation : refusé, rien n’est écrit ni calculé', async () => {
    ligne = LIGNE;
    const r = await modifierConditionsEntree(1, ENVOI, AUTEUR, true);
    expect(r).toEqual({ etat: 'refus', motif: 'Ce montant d’honoraires propriétaire a été saisi à la main : confirmez son remplacement par le calcul.' });
    expect(appels.filter((a) => /^(INSERT|UPDATE|DELETE)/.test(a.sql))).toEqual([]);
    expect(calcul).not.toHaveBeenCalled();
  });
  it('recalcul AVEC confirmation : le calcul remplace le montant saisi (marque fausse)', async () => {
    ligne = LIGNE;
    calcul.mockResolvedValue({ etat: 'ok', surface: '61.8', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01',
      source: 's', tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total: '935.034' });
    expect(await modifierConditionsEntree(1, ENVOI, AUTEUR, true, true)).toEqual({ etat: 'ok', data: undefined });
    expect(calcul).toHaveBeenCalledWith(7, '2026-11-01');
    expect(insertion().params.slice(27, 28)).toEqual(['935.034']);
    expect(insertion().params.at(-1)).toBe(false);
  });
});
