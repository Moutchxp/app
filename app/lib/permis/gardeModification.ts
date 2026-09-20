import { query } from '../db/client';

/**
 * RATT-EDIT (lot A3) — DÉCLENCHEUR CONTEXTUEL du sous-droit « modifier après validation ». Vit dans le domaine PERMIS (le garde
 * générique `exigerCapaciteModif`, dans lib/admin/garde.ts, ne connaît pas les tables permis). Un dossier est « passé en Rattachement »
 * dès qu'il porte une `permis_projection` (marqueur de passage, `passageAcquis` — persistant). Tant qu'il ne l'a pas, il est en Analyse :
 * l'instruction normale suffit (perm_permis, déjà vérifié par exigerModule) et le sous-droit N'EST PAS réclamé.
 */
export async function dossierPasseEnRattachement(dossierId: number): Promise<boolean> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return false;
  const { rows } = await query<{ e: boolean }>(`SELECT EXISTS(SELECT 1 FROM permis_projection WHERE dossier_id = $1) AS e`, [dossierId]);
  return rows[0]?.e === true;
}

/** RATT-EDIT (lot A3) — dossier d'un corps de bâtiment, pour résoudre la cible d'un geste porté par `corpsId` (et non `dossierId`). null si inconnu. */
export async function dossierDuCorps(corpsId: number): Promise<number | null> {
  if (!Number.isInteger(corpsId) || corpsId <= 0) return null;
  const { rows } = await query<{ dossier_id: number }>(`SELECT dossier_id FROM permis_corps_batiment WHERE id = $1`, [corpsId]);
  return rows[0] ? Number(rows[0].dossier_id) : null;
}
