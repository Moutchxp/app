/**
 * CADA lot A — TRACE des copies champ-par-champ (table saisine_champ_copie). LECTURE/ÉCRITURE minimale, aucune règle métier de
 * verdict. Une SEULE ligne vivante par (saisine, champ) : `tracerCopieChamp` fait un UPSERT (recopier rafraîchit l'horodatage,
 * n'empile pas). ⚠️ N'écrit JAMAIS que la saisine est déposée (le marquage « déposée » reste demande_relance.statut, ailleurs).
 */
import { query } from '../db/client';
import type { HistoriqueCopiesVue } from './carteCadaChamps';

/** UPSERT d'une copie de champ : (saisine, champ) unique → met à jour copie_le + admin_id, ne duplique pas. `adminId` null = voie de secours. */
export async function tracerCopieChamp(saisineId: number, champCle: string, adminId: number | null): Promise<void> {
  await query(
    `INSERT INTO saisine_champ_copie (saisine_id, champ_cle, copie_le, admin_id)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (saisine_id, champ_cle) DO UPDATE SET copie_le = now(), admin_id = EXCLUDED.admin_id`,
    [saisineId, champCle, adminId]);
}

/** Historique des copies d'une saisine : combien de champs, la dernière copie (ISO + compte lisible), et si la saisine est déposée. */
export async function historiqueCopiesChamps(saisineId: number): Promise<HistoriqueCopiesVue> {
  const { rows } = await query<{ nb: number; derniere_le: string | null; admin_label: string | null; deposee: boolean | null }>(
    `SELECT count(sc.*)::int AS nb,
            max(sc.copie_le)::text AS derniere_le,
            -- compte de la DERNIÈRE copie (prénom+nom, sinon identifiant) ; NULL si voie de secours / compte supprimé.
            (SELECT coalesce(nullif(btrim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), ''), u.identifiant)
               FROM saisine_champ_copie s2 LEFT JOIN admin_utilisateur u ON u.id = s2.admin_id
              WHERE s2.saisine_id = $1 ORDER BY s2.copie_le DESC LIMIT 1) AS admin_label,
            -- déposée = la saisine (demande_relance) est passée à 'envoyee' (marquage explicite, écrit ailleurs).
            (SELECT dr.statut = 'envoyee' FROM demande_relance dr WHERE dr.id = $1) AS deposee
       FROM saisine_champ_copie sc WHERE sc.saisine_id = $1`, [saisineId]);
  const r = rows[0];
  return {
    nbChamps: r?.nb ?? 0,
    derniereLe: r?.derniere_le ?? null,
    dernierAdmin: r?.admin_label ?? null,
    deposee: r?.deposee === true,
  };
}

/** Efface TOUTES les traces de copie de CETTE saisine. Renvoie le nombre de lignes effacées. */
export async function reinitialiserCopiesChamps(saisineId: number): Promise<number> {
  const res = await query(`DELETE FROM saisine_champ_copie WHERE saisine_id = $1`, [saisineId]);
  return res.rowCount ?? 0;
}
