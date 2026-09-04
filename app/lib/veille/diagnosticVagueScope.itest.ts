import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { candidatsVagueReels } from './diagnosticsVague';
import { enregistrerCompletude } from '../permis/completudeRepo';
import { marquerDossierPartiel } from '../permis/dossierPartielRepo';
import { lireCandidatsRelance } from '../sitadel/envoiRelance';
import { lireDemandesPartiellesActives } from './cascadePartielleRepo';
import { candidatsRelanceReponseReels } from './relanceReponsePartielleAuto';
import type { ResultatLectureGed } from '../permis/lectureGed';

/**
 * 🔴 LOT 56-C — TEST DE LIVRAISON (vraie base). La mesure a montré un TROU : un dossier NON partiel qui reçoit des documents en GED ne
 * recevait AUCUN diagnostic (candidature gatée sur `partiel_le` actif). On élargit la candidature à « la GED a changé », partiel ou non.
 *
 * RISQUE N°1 (prouvé ici) : élargir le DIAGNOSTIC ne doit PAS élargir les RELANCES. On prouve, sur la VRAIE base, que :
 *   ① un dossier NON partiel à GED changée EST désormais candidat au diagnostic (le trou est comblé) ;
 *   ② il n'est candidat à AUCUN des TROIS systèmes de relance — ni avant, ni APRÈS le diagnostic — et le diagnostic ne CRÉE
 *      jamais de marqueur partiel (`partiel_le` reste NULL) ; le seul effet partiel possible (`evaluerLeveeAutoPartiel`) est un
 *      no-op tant que la demande n'est pas suspendue ;
 *   ③ non-régression : un dossier PARTIEL à GED changée reste candidat (l'ancien chemin nominal marche toujours).
 * Fixtures isolées + nettoyage afterAll (patron `sortieTestRelances.itest.ts`).
 */
const demandeIds: number[] = [];
const dossierIds: number[] = [];
let seq = 0;

async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`);
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee');
  return rows[0].code_insee;
}

/** Sème une demande 'envoyee' + un dossier actif portant UN document GED réel (note ≠ fiche de synthèse). `partiel` : pose le marqueur partiel actif. */
async function seed(opts: { partiel?: boolean } = {}): Promise<{ demandeId: number; dossierId: number }> {
  const ci = await codeInseeExistant();
  seq += 1;
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO demande (reference, code_insee, statut, dest_canal, dest_email)
       VALUES ($1, $2, 'envoyee', 'email', 'mairie.test@example.invalid') RETURNING id::int AS id`,
    [`SVAV-DEM-2099-${String(940000 + seq)}`, ci]);
  const demandeId = d[0].id; demandeIds.push(demandeId);
  const { rows: s } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TEST56C${940000 + seq}`]);
  const dossierId = s[0].id; dossierIds.push(dossierId);
  await query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [demandeId, dossierId]);
  // UN document GED réel → GED « changée » (jamais mémorisée mais ≥ 1 document). cle_stockage bidon : le diagnostic testé ici ne lit aucun PDF.
  await query(
    `INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage, note) VALUES ($1, 'doc-56c.pdf', $2, 'test 56-C')`,
    [dossierId, `dossiers/${dossierId}/test-56c.pdf`]);
  if (opts.partiel) await marquerDossierPartiel(demandeId, ['etage'], 'declaree');
  return { demandeId, dossierId };
}

async function dansTroisRelances(demandeId: number): Promise<{ ordinaire: boolean; partielle: boolean; partE: boolean }> {
  const [ord, part, pe] = await Promise.all([lireCandidatsRelance(), lireDemandesPartiellesActives(), candidatsRelanceReponseReels()]);
  return {
    ordinaire: ord.some((c) => c.demandeId === demandeId),
    partielle: part.includes(demandeId),
    partE: pe.some((c) => c.demandeId === demandeId),
  };
}

afterAll(async () => {
  const del = async (sql: string, id: number) => { try { await query(sql, [id]); } catch { /* table/colonne absente : nettoyage best-effort */ } };
  for (const id of demandeIds) {
    await del(`DELETE FROM demande_reponse WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande_journal WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande_dossier WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande WHERE id = $1`, id);
  }
  for (const id of dossierIds) await del(`DELETE FROM sitadel_dossier WHERE id = $1`, id); // CASCADE : dossier_document, permis_completude
});

describe('LOT 56-C — le diagnostic suit le changement de GED (partiel ou non), SANS élargir les relances', () => {
  it('① un dossier NON partiel à GED changée est candidat au diagnostic (trou comblé)', async () => {
    const { dossierId } = await seed();
    const cands = await candidatsVagueReels();
    expect(cands.some((c) => c.dossierId === dossierId)).toBe(true);
  });

  it('② le diagnostic d’un dossier NON partiel ne crée AUCUN marqueur partiel et n’ajoute personne aux trois relances', async () => {
    const { demandeId, dossierId } = await seed();

    // AVANT : candidat au diagnostic, mais à AUCUN système de relance (pas de brouillon, pas de partiel).
    expect((await candidatsVagueReels()).some((c) => c.dossierId === dossierId), 'candidat au diagnostic').toBe(true);
    expect(await dansTroisRelances(demandeId), 'AVANT : aucune relance').toEqual({ ordinaire: false, partielle: false, partE: false });

    // LE DIAGNOSTIC (déterministe, gratuit) : écrit la complétude + evaluerLeveeAutoPartiel (no-op car non suspendue).
    await enregistrerCompletude(dossierId, { pieces: [] } as unknown as ResultatLectureGed, 'completude:vague');

    // APRÈS : partiel_le TOUJOURS NULL (aucun marqueur créé) → toujours candidat à AUCUNE relance.
    const { rows } = await query<{ partiel_le: Date | null }>(`SELECT partiel_le FROM demande WHERE id = $1`, [demandeId]);
    expect(rows[0]?.partiel_le, 'le diagnostic ne CRÉE jamais un partiel').toBeNull();
    expect(await dansTroisRelances(demandeId), 'APRÈS : toujours aucune relance').toEqual({ ordinaire: false, partielle: false, partE: false });
  });

  it('③ non-régression : un dossier PARTIEL à GED changée reste candidat au diagnostic', async () => {
    const { dossierId } = await seed({ partiel: true });
    const cands = await candidatsVagueReels();
    expect(cands.some((c) => c.dossierId === dossierId)).toBe(true);
  });
});
