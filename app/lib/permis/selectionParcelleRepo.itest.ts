/**
 * Test d'INTÉGRATION PL-C2 (vraie base PostGIS) — la SUPERPOSITION de sélection, prouvée de bout en bout :
 *   ① BYTE-IDENTIQUE : état d'origine → valider une sélection (sous-ensemble) → l'empreinte effective = union de la sélection →
 *      retirer → l'empreinte revient BYTE-IDENTIQUE à l'origine (ST_AsEWKB égal) — pas supposé, asserté.
 *   ② GARDE « SÉLECTION D'ABORD » : une ré-analyse (figerEmpreinte direct, comme executerExtraction) NE clobbère PAS la sélection.
 *   ③ permis_parcelle INTACT (compte avant/après) — la superposition ne le touche jamais.
 *   ④ PROVENANCE : valide_par = l'auteur réel passé (jamais un harnais gelant).
 * AUTO-RESTAURATION : l'état dérivé du dossier (empreinte + bâti) est capturé puis restauré VERBATIM (EWKB) → le dossier témoin
 * ressort intact. Se saute proprement si la base n'est pas peuplée / migration 202 absente. Motif *.itest.ts (npm run test:integration).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, closePool } from '../db/client';
import { validerSelection, retirerSelection, lireSelection } from './selectionParcelleRepo';

const DOSSIER = 11430; // 07512024V0037 : 4 parcelles (DH 18/26, DI 6/7), empreinte complète

let pret = false;
let idus: string[] = [];
let ewkbOrigine: string | null = null;
let backupEmp: Record<string, unknown> | null = null;
let backupBs: Record<string, unknown>[] = [];
let backupBc: Record<string, unknown> | null = null;

const AUTEUR = 'itest-plc2'; // dans un vrai flux ce serait l'id admin ; ici un marqueur de test (le dossier est restauré ensuite)

async function capturerDerive() {
  backupEmp = (await query(`SELECT dossier_id, encode(ST_AsEWKB(geom),'hex') AS geom_hex, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0] ?? null;
  backupBs = (await query(`SELECT cleabs, encode(ST_AsEWKB(geom),'hex') AS geom_hex, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2, snapshot_le, snapshot_par FROM permis_bati_snapshot WHERE dossier_id = $1`, [DOSSIER])).rows;
  backupBc = (await query(`SELECT capture, nb_batiments, motif, source_millesime, capture_le, capture_par FROM permis_bati_capture WHERE dossier_id = $1`, [DOSSIER])).rows[0] ?? null;
}
async function restaurerDerive() {
  await query(`DELETE FROM permis_parcelle_selection WHERE dossier_id = $1`, [DOSSIER]);
  await query(`DELETE FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER]);
  if (backupEmp) await query(
    `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
       VALUES ($1, ST_GeomFromEWKB(decode($2,'hex')), $3,$4,$5,$6,$7,$8,$9)`,
    [DOSSIER, backupEmp.geom_hex, backupEmp.surface_m2, backupEmp.nb_parcelles, backupEmp.complete, backupEmp.motif, backupEmp.millesime, backupEmp.maj_le, backupEmp.maj_par]);
  await query(`DELETE FROM permis_bati_snapshot WHERE dossier_id = $1`, [DOSSIER]);
  for (const b of backupBs) await query(
    `INSERT INTO permis_bati_snapshot (dossier_id, cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2, snapshot_le, snapshot_par)
       VALUES ($1,$2, ST_GeomFromEWKB(decode($3,'hex')), $4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [DOSSIER, b.cleabs, b.geom_hex, b.nombre_d_etages, b.altitude_max_toit, b.hauteur, b.date_modification, b.etat_de_l_objet, b.usage_1, b.usage_2, b.snapshot_le, b.snapshot_par]);
  await query(`DELETE FROM permis_bati_capture WHERE dossier_id = $1`, [DOSSIER]);
  if (backupBc) await query(
    `INSERT INTO permis_bati_capture (dossier_id, capture, nb_batiments, motif, source_millesime, capture_le, capture_par)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [DOSSIER, backupBc.capture, backupBc.nb_batiments, backupBc.motif, backupBc.source_millesime, backupBc.capture_le, backupBc.capture_par]);
}

beforeAll(async () => {
  try {
    if ((await query(`SELECT to_regclass('public.permis_parcelle_selection') AS t`)).rows[0]?.t == null) return; // migration 202 absente → skip
    const emp = (await query<{ complete: boolean; a: boolean }>(`SELECT complete, (geom IS NOT NULL) AS a FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0];
    idus = (await query<{ idu: string }>(`SELECT par.id AS idu FROM permis_parcelle pp JOIN parcelle par ON par.id = pp.idu WHERE pp.dossier_id = $1 AND pp.role='origine' ORDER BY par.section, par.numero`, [DOSSIER])).rows.map((r) => r.idu);
    if (!emp?.complete || !emp.a || idus.length < 2) return; // dossier non peuplé comme attendu → skip
    ewkbOrigine = (await query<{ h: string }>(`SELECT encode(ST_AsEWKB(geom),'hex') AS h FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0]?.h ?? null;
    await capturerDerive();
    pret = ewkbOrigine !== null;
  } catch { pret = false; }
});
afterAll(async () => { if (pret) await restaurerDerive(); await closePool(); });

describe('PL-C2 — superposition de sélection (aller-retour byte-identique, garde, provenance)', () => {
  it('① BYTE-IDENTIQUE : origine → valider un sous-ensemble → empreinte = union sélection → retirer → retour byte-identique', async () => {
    if (!pret) { expect(pret).toBe(false); return; } // base non peuplée → test neutralisé proprement
    const sousEnsemble = idus.slice(0, 2); // 2 des 4 parcelles → union STRICTEMENT plus petite que l'origine

    const parcelleAvant = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM permis_parcelle`)).rows[0].n;

    const rv = await validerSelection(DOSSIER, sousEnsemble, AUTEUR);
    expect(rv.ok).toBe(true);
    expect(rv.nbSelectionnees).toBe(2);
    expect((await lireSelection(DOSSIER)).length).toBe(2);
    // l'empreinte effective est l'union de la SÉLECTION (donc DIFFÉRENTE de l'origine) :
    const ewkbSelection = (await query<{ h: string }>(`SELECT encode(ST_AsEWKB(geom),'hex') AS h FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0].h;
    expect(ewkbSelection).not.toBe(ewkbOrigine);
    expect(rv.empreinte.complete).toBe(true);

    const rr = await retirerSelection(DOSSIER, AUTEUR);
    expect(rr.ok).toBe(true);
    expect((await lireSelection(DOSSIER)).length).toBe(0);
    // 🔑 RETOUR BYTE-IDENTIQUE à l'origine (pas « équivalent » : le même EWKB) :
    const ewkbApres = (await query<{ h: string }>(`SELECT encode(ST_AsEWKB(geom),'hex') AS h FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0].h;
    expect(ewkbApres).toBe(ewkbOrigine);

    // ③ permis_parcelle INTACT (compte inchangé) — la superposition ne l'a jamais touché.
    const parcelleApres = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM permis_parcelle`)).rows[0].n;
    expect(parcelleApres).toBe(parcelleAvant);
  });

  it('② GARDE « sélection d’abord » : une ré-analyse (figerEmpreinte direct) NE clobbère PAS la sélection', async () => {
    if (!pret) { expect(pret).toBe(false); return; }
    const { figerEmpreinte } = await import('./parcellesRepo');
    const sousEnsemble = idus.slice(0, 2);
    await validerSelection(DOSSIER, sousEnsemble, AUTEUR);
    const ewkbSelection = (await query<{ h: string }>(`SELECT encode(ST_AsEWKB(geom),'hex') AS h FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0].h;

    // Simule executerExtraction qui rappelle figerEmpreinte : la sélection existe → l'empreinte NE bouge PAS.
    await figerEmpreinte(DOSSIER, 'rejeu-auto');
    const ewkbApresRejeu = (await query<{ h: string }>(`SELECT encode(ST_AsEWKB(geom),'hex') AS h FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER])).rows[0].h;
    expect(ewkbApresRejeu).toBe(ewkbSelection); // toujours l'empreinte de la sélection, jamais l'origine
    expect(ewkbApresRejeu).not.toBe(ewkbOrigine);

    await retirerSelection(DOSSIER, AUTEUR); // nettoyage (restauration complète en afterAll)
  });

  it('④ PROVENANCE : valide_par = l’auteur réel passé (jamais un harnais anonyme)', async () => {
    if (!pret) { expect(pret).toBe(false); return; }
    await validerSelection(DOSSIER, idus.slice(0, 2), AUTEUR);
    const rows = (await query<{ valide_par: string }>(`SELECT DISTINCT valide_par FROM permis_parcelle_selection WHERE dossier_id = $1`, [DOSSIER])).rows;
    expect(rows.map((r) => r.valide_par)).toEqual([AUTEUR]);
    await retirerSelection(DOSSIER, AUTEUR);
  });
});
