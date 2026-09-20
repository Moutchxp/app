import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResultRow } from 'pg';

/**
 * RATT-EDIT (lot C1) — restaurerVersionGel + versionsRestaurables. `db/client` mocké (routé par fragment SQL) + `gelRepo` mocké.
 * On éprouve la LOGIQUE, pas la base (le SQL réel est prouvé sur données réelles au navigateur, rollback à l'appui) :
 *   · un corps figé DONT L'ID N'EXISTE PLUS est RECRÉÉ (INSERT, nouvel id) ; un corps encore présent est REMIS à l'état figé (UPDATE) ;
 *   · l'emprise figée est réinsérée avec le corps_id REMAPPÉ (lien corps ↔ emprise reconstitué) — LE test central ;
 *   · les corps ajoutés-après sont désactivés en SOFT (jamais de DELETE dur de corps) ;
 *   · une version 'restauration:<par>' est appendée (figerVersionValidation, préfixe RESTAURATION) + un événement 'restauration' ;
 *   · gardes : version absente / sans snapshot / requête invalide → refus.
 */
const H = vi.hoisted(() => {
  const state = {
    gelExiste: true as boolean,
    nGelCorps: 1 as number,
    corpsExistants: new Set<number>(),                  // ids de permis_corps_batiment « encore présents » (le reste = supprimé → recréé)
    gelCorps: [] as { id: number; corps_id: number | null; emprise_validee_id: number | null }[],
    gelEmprises: [] as { id: number; emprise_id: number | null; corps_id: number | null }[],
    nextCorpsId: 500 as number,
    nextEmpriseId: 900 as number,
    calls: [] as { sql: string; params: unknown[] }[],
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    state.calls.push({ sql, params: params ?? [] });
    const p = params ?? [];
    if (/FROM permis_gel g WHERE g\.id = \$1 AND g\.dossier_id/i.test(sql)) return { rows: state.gelExiste ? [{ n: state.nGelCorps }] : [] };
    if (/SELECT id, corps_id, emprise_validee_id FROM permis_gel_corps/i.test(sql)) return { rows: state.gelCorps };
    if (/EXISTS\(SELECT 1 FROM permis_corps_batiment WHERE id = \$1/i.test(sql)) return { rows: [{ e: state.corpsExistants.has(Number(p[0])) }] };
    if (/INSERT INTO permis_corps_batiment/i.test(sql)) return { rows: [{ id: state.nextCorpsId++ }], rowCount: 1 };
    if (/UPDATE permis_corps_batiment cb SET/i.test(sql)) return { rows: [], rowCount: 1 };            // remise à l'état figé d'un corps existant
    if (/UPDATE permis_corps_batiment SET actif = false/i.test(sql)) return { rows: [], rowCount: 0 }; // désactivation soft des ajoutés-après
    if (/DELETE FROM permis_emprise_reconstruite/i.test(sql)) return { rows: [], rowCount: 0 };
    if (/SELECT id, emprise_id, corps_id FROM permis_gel_emprise/i.test(sql)) return { rows: state.gelEmprises };
    if (/INSERT INTO permis_emprise_reconstruite/i.test(sql)) return { rows: [{ id: state.nextEmpriseId++ }], rowCount: 1 };
    if (/UPDATE permis_corps_batiment SET emprise_validee_id/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/SELECT id FROM permis_rattachement WHERE dossier_id/i.test(sql)) return { rows: [{ id: 99 }] };
    if (/INSERT INTO permis_rattachement_evenement/i.test(sql)) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const figeCalls: { dossierId: number; par: string; prefixe: string }[] = [];
  return { state, queryMock, figeCalls };
});
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => H.queryMock(sql, params),
  withTransaction: async (fn: (q: unknown) => unknown) => fn((sql: string, params?: unknown[]) => H.queryMock(sql, params)),
}));
vi.mock('./gelRepo', () => ({
  PREFIXE_GEL_VALIDATION: 'validation:',
  PREFIXE_GEL_RESTAURATION: 'restauration:',
  figerVersionValidation: async (dossierId: number, par: string, prefixe = 'validation:') => { H.figeCalls.push({ dossierId, par, prefixe }); return { enregistre: true, version: 7 }; },
}));

import { restaurerVersionGel, versionsRestaurables } from './restaurationGel';

const sqlDe = (re: RegExp) => H.state.calls.filter((c) => re.test(c.sql));
beforeEach(() => {
  H.state.gelExiste = true; H.state.nGelCorps = 1; H.state.corpsExistants = new Set(); H.state.gelCorps = []; H.state.gelEmprises = [];
  H.state.nextCorpsId = 500; H.state.nextEmpriseId = 900; H.state.calls = []; H.figeCalls.length = 0;
});

describe('restaurerVersionGel — recréation + remap + version restauration', () => {
  it('TEST CENTRAL : corps SUPPRIMÉ recréé (INSERT) et emprise réinsérée avec le corps_id REMAPPÉ (lien reconstitué)', async () => {
    // Le gel a le corps 4 (supprimé depuis : absent de corpsExistants) et l'emprise 119 (liée au corps 4).
    H.state.nGelCorps = 1;
    H.state.gelCorps = [{ id: 10, corps_id: 4, emprise_validee_id: null }];
    H.state.gelEmprises = [{ id: 20, emprise_id: 119, corps_id: 4 }];
    const r = await restaurerVersionGel(531, 17, '2');
    expect(r.ok).toBe(true);
    expect(r.nbCorps).toBe(1); expect(r.nbEmprises).toBe(1);
    // corps 4 absent → RECRÉÉ (INSERT), pas d'UPDATE de corps existant
    expect(sqlDe(/INSERT INTO permis_corps_batiment/i)).toHaveLength(1);
    expect(sqlDe(/UPDATE permis_corps_batiment cb SET/i)).toHaveLength(0);
    // emprise réinsérée avec corps_id = NOUVEL id du corps recréé (500), jamais l'ancien 4
    const insEmp = sqlDe(/INSERT INTO permis_emprise_reconstruite/i);
    expect(insEmp).toHaveLength(1);
    expect(insEmp[0].params).toEqual([20, 531, 500]); // $1=gel_emprise.id, $2=dossierId, $3=corps_id REMAPPÉ
  });

  it('corps ENCORE présent → remis à l’état figé (UPDATE), pas de recréation', async () => {
    H.state.corpsExistants = new Set([4]);
    H.state.gelCorps = [{ id: 10, corps_id: 4, emprise_validee_id: null }];
    H.state.gelEmprises = [{ id: 20, emprise_id: 119, corps_id: 4 }];
    const r = await restaurerVersionGel(531, 17, '2');
    expect(r.ok).toBe(true);
    expect(sqlDe(/UPDATE permis_corps_batiment cb SET/i)).toHaveLength(1);
    expect(sqlDe(/INSERT INTO permis_corps_batiment/i)).toHaveLength(0);
    // l'emprise garde le lien vers le corps existant (id 4, non remappé)
    expect(sqlDe(/INSERT INTO permis_emprise_reconstruite/i)[0].params).toEqual([20, 531, 4]);
  });

  it('désactive en SOFT les corps ajoutés-après + appende la version « restauration: » + un événement', async () => {
    H.state.gelCorps = [{ id: 10, corps_id: 4, emprise_validee_id: null }];
    await restaurerVersionGel(531, 17, '2');
    expect(sqlDe(/UPDATE permis_corps_batiment SET actif = false/i)).toHaveLength(1); // soft, jamais DELETE de corps
    expect(sqlDe(/DELETE FROM permis_corps_batiment/i)).toHaveLength(0);
    expect(H.figeCalls).toEqual([{ dossierId: 531, par: '2', prefixe: 'restauration:' }]); // version restauration (pas validation)
    expect(sqlDe(/INSERT INTO permis_rattachement_evenement/i)).toHaveLength(1);
    expect(sqlDe(/INSERT INTO permis_rattachement_evenement/i)[0].params[1]).toContain('gelIdSource'); // détails de l'événement
  });

  it('emprise sans corps (corps_id null) → réinsérée avec corps_id null (pas de crash de remap)', async () => {
    H.state.gelCorps = [{ id: 10, corps_id: 4, emprise_validee_id: null }];
    H.state.gelEmprises = [{ id: 20, emprise_id: 119, corps_id: null }];
    await restaurerVersionGel(531, 17, '2');
    expect(sqlDe(/INSERT INTO permis_emprise_reconstruite/i)[0].params).toEqual([20, 531, null]);
  });

  it('GARDES : version introuvable → refus ; version sans snapshot → refus ; requête invalide → refus (aucun figeage)', async () => {
    H.state.gelExiste = false;
    expect((await restaurerVersionGel(531, 17, '2')).ok).toBe(false);
    H.state.gelExiste = true; H.state.nGelCorps = 0;
    expect((await restaurerVersionGel(531, 17, '2')).ok).toBe(false);
    expect((await restaurerVersionGel(0, 17, '2')).ok).toBe(false);
    expect((await restaurerVersionGel(531, 0, '2')).ok).toBe(false);
    expect(H.figeCalls).toHaveLength(0);
  });
});

describe('versionsRestaurables — liste typée (validation d’origine / revalidation / restauration)', () => {
  const rows = (rs: QueryResultRow[]) => { H.queryMock = (async () => ({ rows: rs })) as never; };
  it('type dérivé de l’ordre + du préfixe ; date ISO ; auteur résolu ou générique', async () => {
    // On remplace le mock query juste pour cette lecture (versionsRestaurables n'émet qu'une requête).
    const orig = H.queryMock;
    rows([
      { id: 2, version: 2, gele_par: 'validation:admin:decision', gele_le: new Date('2026-09-07T09:00:00Z'), auteur_nom: null },
      { id: 3, version: 3, gele_par: 'validation:admin:decision', gele_le: new Date('2026-09-10T09:00:00Z'), auteur_nom: null },
      { id: 4, version: 4, gele_par: 'restauration:2', gele_le: new Date('2026-09-20T09:00:00Z'), auteur_nom: 'Arnaud Jorel' },
    ]);
    const v = await versionsRestaurables(531);
    H.queryMock = orig;
    expect(v.map((x) => x.type)).toEqual(['validation_initiale', 'revalidation', 'restauration']);
    expect(v[0]).toMatchObject({ gelId: 2, version: 2, auteurNom: 'un administrateur' });
    expect(v[0].dateIso).toBe('2026-09-07T09:00:00.000Z');
    expect(v[2]).toMatchObject({ type: 'restauration', auteurNom: 'Arnaud Jorel' });
  });
  it('liste vide (invalide) → []', async () => {
    expect(await versionsRestaurables(0)).toEqual([]);
  });
});
