/**
 * ══ 🔴🔴 LA MENTION « EN INDIVISION AVEC » — SUR UNE COPIE DES DONNÉES DE LA RECETTE (Arno, 20/10/2026) ═════════════════════
 *
 *   ① la fiche 146 de la recette : ses cinq biens ne portent que des liens vers des fiches ARCHIVÉES → aucune mention ;
 *   ② bien sans indivision → aucune mention ; bien en indivision → seuls ses copropriétaires actifs ;
 *   ③ copropriétaire archivé, ou lien terminé → exclu ; jamais le propriétaire de la fiche affichée ;
 *   ④ deux biens du même propriétaire, copropriétaires différents → chaque bien affiche les siens.
 *
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`) : rien ne reste. REFUSE toute base hors `svav_test…` :
 *   createdb svav_test_indivision && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_indivision
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_indivision \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/indivision.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { ficheProprietaire } from './annuaireRepo';
import { motIndivision } from './indivision';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const S = `i${Date.now().toString(36)}`;
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const id = async (sql: string, p: unknown[]): Promise<number> => Number((await query<{ id: string }>(sql, p)).rows[0].id);
const mentions = async (proprietaire: number): Promise<Map<number, string | null>> =>
  new Map(ok(await ficheProprietaire(proprietaire)).biens.map((b) => [b.id, motIndivision(b.indivisionAvec)]));

let essai: EssaiAnnule | null = null;
beforeAll(async () => { if (baseEssai) essai = await ouvrirEssaiAnnule(); });
afterAll(async () => { if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴 « en indivision avec » : les autres copropriétaires ACTIFS de CE bien, sinon rien', () => {
  it('① la fiche 146 (recette) : cinq biens, liens vers des fiches archivées seulement → aucune mention', async () => {
    const m = await mentions(146);
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([7, 40, 49, 176, 299]);
    expect([...m.values()]).toEqual([null, null, null, null, null]);
  });

  it('②③④ sans indivision, indivision active, archivé, lien terminé, deux biens aux copropriétaires différents', async () => {
    const proprio = (nom: string): Promise<number> => id(
      `INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise) VALUES ($1, $2, $2, lower($2)) RETURNING id::text`,
      [`IND-${nom}-${S}`, `${nom} ${S}`]);
    const [moi, actif, archive, termine, autre] = [await proprio('MOI'), await proprio('ACTIF'), await proprio('ARCHIVE'), await proprio('TERMINE'), await proprio('AUTRE')];
    await query('UPDATE gestion_annuaire_proprietaire SET archive_le = now(), archive_par_libelle = $2 WHERE id = $1', [archive, 'itest']);
    const bien = (n: string): Promise<number> => id(
      `INSERT INTO gestion_annuaire_lot (wippimmo_id, adresse, commune, proprietaire_id, proprietaire_texte) VALUES ($1, $2, 'VILLE-TEST', $3, 'MOI') RETURNING id::text`,
      [`IND-LOT-${n}-${S}`, `${n} rue Indivision ${S}`, moi]);
    const [seul, partage, second] = [await bien('1'), await bien('2'), await bien('3')];
    const lier = (lot: number, p: number, depuis: string | null, jusqua: string | null): Promise<unknown> => query(
      `INSERT INTO gestion_annuaire_lot_proprietaire (lot_id, proprietaire_id, rang, depuis, jusqu_a, cree_par_libelle) VALUES ($1, $2, 1, $3::date, $4::date, 'itest')`,
      [lot, p, depuis, jusqua]);
    await lier(partage, actif, '2026-01-01', null);      // en cours, fiche active → cité
    await lier(partage, archive, '2026-01-01', null);    // en cours, fiche ARCHIVÉE → exclu
    await lier(partage, termine, '2020-01-01', '2025-12-31'); // lien TERMINÉ → exclu
    await lier(partage, moi, '2026-01-01', null);        // moi-même → jamais cité
    await lier(second, autre, null, null);               // un autre copropriétaire, sur un autre bien
    const m = await mentions(moi);
    expect(m.get(seul)).toBeNull();
    expect(m.get(partage)).toBe(`Copropriétaire : ACTIF ${S}`);
    expect(m.get(second)).toBe(`Copropriétaire : AUTRE ${S}`);
    // Vu de l'autre côté : le copropriétaire actif voit le bien partagé, avec le titulaire — jamais lui-même.
    expect((await mentions(actif)).get(partage)).toBe(`Copropriétaire : MOI ${S}`);
  });
});
