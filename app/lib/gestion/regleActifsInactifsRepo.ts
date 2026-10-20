import { query } from '../db/client';

/**
 * La SORTE, au registre de l'arborescence (`gestion_drive_noeud`, migration 389), de chaque dossier Drive demandé. Un
 * identifiant absent du registre n'est pas dans la carte. `null` : le registre n'a pas pu être lu (la route refuse alors de
 * déplacer un DOSSIER — ne pas savoir vaut interdit). Lecture seule.
 */
export async function sortesAuRegistre(driveIds: readonly string[]): Promise<Map<string, string> | null> {
  if (driveIds.length === 0) return new Map();
  try {
    const { rows: t } = await query<{ t: string | null }>(`SELECT to_regclass('gestion_drive_noeud')::text AS t`);
    if (t[0]?.t === null || t[0]?.t === undefined) return new Map();   // pas d'arborescence enregistrée : rien à protéger
    const { rows } = await query<{ d: string; s: string }>('SELECT drive_id AS d, sorte AS s FROM gestion_drive_noeud WHERE drive_id = ANY($1::text[])', [[...driveIds]]);
    return new Map(rows.map((r) => [r.d, r.s]));
  } catch {
    return null;
  }
}
