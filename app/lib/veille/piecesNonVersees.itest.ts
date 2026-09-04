import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { piecesNonVerseesParDemande } from './reponsesSuivi';

/**
 * 🔴 LOT 57 — TEST DE LIVRAISON (vraie base) du signal « pièces reçues mais non versées au permis ». On PROUVE, sur des fixtures
 * isolées, que `piecesNonVerseesParDemande` :
 *   ① signale une pièce stockée d'une demande MULTI-DOSSIER (motif 'multi_dossier') ;
 *   ② signale une pièce stockée d'une réponse NON classée 'documents' (motif 'pas_documents') ;
 *   ③ NE signale PAS une pièce d'une réponse 'documents' MONO-DOSSIER (elle SERA versée au prochain tic — pas un blocage) ;
 *   ④ NE signale PAS une pièce déjà en GED (même sha256) — faux positif « doublon » écarté.
 * Nettoyage afterAll (patron `sortieTestRelances.itest.ts`).
 */
const demandeIds: number[] = [];
const dossierIds: number[] = [];
let seq = 0;

async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`);
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee');
  return rows[0].code_insee;
}

/** Sème une demande 'envoyee' avec `nbDossiers` dossiers actifs et UNE réponse `nature` portant une pièce stockée `sha256`. */
async function seed(opts: { nbDossiers: number; nature: string; sha256: string | null; enGed?: boolean }): Promise<{ demandeId: number; dossierId: number; pieceId: number }> {
  const ci = await codeInseeExistant();
  seq += 1;
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO demande (reference, code_insee, statut, dest_canal, dest_email)
       VALUES ($1, $2, 'envoyee', 'email', 'mairie.test@example.invalid') RETURNING id::int AS id`,
    [`SVAV-DEM-2099-${String(950000 + seq)}`, ci]);
  const demandeId = d[0].id; demandeIds.push(demandeId);
  let premierDossier = 0;
  for (let k = 0; k < opts.nbDossiers; k += 1) {
    const { rows: s } = await query<{ id: number }>(
      `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
         VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TEST57${950000 + seq}${k}`]);
    dossierIds.push(s[0].id);
    if (k === 0) premierDossier = s[0].id;
    await query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [demandeId, s[0].id]);
  }
  const { rows: r } = await query<{ id: number }>(
    `INSERT INTO demande_reponse (demande_id, profil_boite, message_id, de_adresse, recu_le, nature)
       VALUES ($1, 'entreprise', $2, 'mairie@example.invalid', now(), $3) RETURNING id::int AS id`,
    [demandeId, `<lot57-${demandeId}@example.invalid>`, opts.nature]);
  const { rows: pr } = await query<{ id: number }>(
    `INSERT INTO demande_reponse_piece (reponse_id, nom_fichier, type_mime, cle_stockage, empreinte_sha256, stocke_le)
       VALUES ($1, 'piece-57.pdf', 'application/pdf', $2, $3, now()) RETURNING id::int AS id`,
    [r[0].id, `demandes/${demandeId}/reponses/${r[0].id}/piece-57.pdf`, opts.sha256]);
  if (opts.enGed && opts.sha256) {
    await query(
      `INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage, empreinte_sha256, note)
         VALUES ($1, 'piece-57.pdf', $2, $3, 'test 57')`,
      [premierDossier, `dossiers/${premierDossier}/piece-57.pdf`, opts.sha256]);
  }
  return { demandeId, dossierId: premierDossier, pieceId: pr[0].id };
}

afterAll(async () => {
  const del = async (sql: string, id: number) => { try { await query(sql, [id]); } catch { /* best-effort */ } };
  for (const id of demandeIds) {
    await del(`DELETE FROM demande_reponse WHERE demande_id = $1`, id); // CASCADE : demande_reponse_piece
    await del(`DELETE FROM demande_dossier WHERE demande_id = $1`, id);
    await del(`DELETE FROM demande WHERE id = $1`, id);
  }
  for (const id of dossierIds) await del(`DELETE FROM sitadel_dossier WHERE id = $1`, id); // CASCADE : dossier_document
});

describe('LOT 57 — piecesNonVerseesParDemande : révèle les blocages STRUCTURELS, écarte les faux positifs', () => {
  it('① multi-dossier + documents → signalé (motif multi_dossier)', async () => {
    const { demandeId, pieceId } = await seed({ nbDossiers: 2, nature: 'documents', sha256: 'sha57multi000000000000000000000000000000000000000000000000000001' });
    const m = await piecesNonVerseesParDemande();
    const liste = m.get(demandeId) ?? [];
    expect(liste.some((p) => p.id === pieceId && p.motif === 'multi_dossier')).toBe(true);
  });

  it('② mono-dossier + nature ≠ documents → signalé (motif pas_documents)', async () => {
    const { demandeId, pieceId } = await seed({ nbDossiers: 1, nature: 'autre', sha256: 'sha57autre000000000000000000000000000000000000000000000000000002' });
    const liste = (await piecesNonVerseesParDemande()).get(demandeId) ?? [];
    expect(liste.some((p) => p.id === pieceId && p.motif === 'pas_documents')).toBe(true);
  });

  it('③ mono-dossier + documents → NON signalé (en attente de versement, pas un blocage)', async () => {
    const { demandeId } = await seed({ nbDossiers: 1, nature: 'documents', sha256: 'sha57mono0000000000000000000000000000000000000000000000000000003' });
    expect((await piecesNonVerseesParDemande()).get(demandeId) ?? []).toEqual([]);
  });

  it('④ multi-dossier mais pièce DÉJÀ en GED (même sha256) → NON signalé (faux positif doublon écarté)', async () => {
    const { demandeId } = await seed({ nbDossiers: 2, nature: 'documents', sha256: 'sha57doublon00000000000000000000000000000000000000000000000000004', enGed: true });
    expect((await piecesNonVerseesParDemande()).get(demandeId) ?? []).toEqual([]);
  });
});
