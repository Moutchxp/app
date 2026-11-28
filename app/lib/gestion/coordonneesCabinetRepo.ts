import { query } from '../db/client';
import type { CoordonneeCabinet } from './syndics';

/* ══ 🔴🔴 Arno (28/11/2026, 524, décision « 1A ») — LES TÉLÉPHONES ET E-MAILS DU CABINET D'UN SYNDIC, POUR TOUS LEURS LECTEURS ══════════════════════════
 * « Tous les lecteurs de ces coordonnées (fiche syndic Location et Gestion, fiche copropriété, destinataires proposés dans les mails, téléphones par paires,
 * cases « Écrire aux adresses sélectionnées ») lisent la nouvelle liste. » UNE seule règle, la même qu'à l'écran (`coordonneesDuCabinet`) : les lignes
 * NON retirées de la liste (524) quand le syndic en a ; sinon, les trois colonnes d'avant (telephone, telephone_2, email), libellées « Standard » /
 * « Contact ». Sans la 524 : les colonnes seules, comme avant. La table est sondée une fois par processus. LECTURE SEULE.
 */
let disponibleMemo: Promise<boolean> | null = null;
export function coordonneesCabinetDisponibles(): Promise<boolean> {
  disponibleMemo ??= query<{ ok: boolean }>(`SELECT to_regclass('public.gestion_syndic_coordonnee_cabinet') IS NOT NULL AS ok`)
    .then((r) => r.rows[0]?.ok === true).catch(() => { disponibleMemo = null; return false; });
  return disponibleMemo;
}

/**
 * Le texte SQL d'une table dérivée des coordonnées du cabinet de CHAQUE syndic (supprimés compris : au lecteur de filtrer) — colonnes
 * `syndic_id` (bigint), `sorte` ('telephone' | 'email'), `libelle`, `valeur` (telle qu'enregistrée), `rang`. À placer entre parenthèses avec un alias :
 * `JOIN ${await sqlCoordonneesCabinet()} k ON k.syndic_id = s.id`. Sans paramètre lié.
 */
export async function sqlCoordonneesCabinet(): Promise<string> {
  const colonnes = `SELECT s.id AS syndic_id, v.sorte, v.libelle, btrim(v.valeur) AS valeur, v.rang
       FROM gestion_syndic s
      CROSS JOIN LATERAL (VALUES ('telephone', 'Standard', s.telephone, 0), ('telephone', 'Standard', s.telephone_2, 1), ('email', 'Contact', s.email, 2))
            AS v(sorte, libelle, valeur, rang)
      WHERE coalesce(btrim(v.valeur), '') <> ''`;
  if (!(await coordonneesCabinetDisponibles())) return `(${colonnes})`;
  return `(SELECT k.syndic_id, k.sorte, k.libelle, btrim(k.valeur) AS valeur, k.rang FROM gestion_syndic_coordonnee_cabinet k
            WHERE k.retire_le IS NULL AND btrim(k.valeur) <> ''
          UNION ALL
          ${colonnes}
            AND NOT EXISTS (SELECT 1 FROM gestion_syndic_coordonnee_cabinet k2 WHERE k2.syndic_id = s.id AND k2.retire_le IS NULL))`;
}

/** Les coordonnées du cabinet de ces syndics (lignes non retirées de la liste), par syndic ; sans la 524 : rien (le lecteur déduit des colonnes). */
export async function lireCoordonneesCabinet(syndicIds: readonly number[]): Promise<Map<number, CoordonneeCabinet[]>> {
  const m = new Map<number, CoordonneeCabinet[]>();
  if (syndicIds.length === 0 || !(await coordonneesCabinetDisponibles())) return m;
  const { rows } = await query<{ id: string; syndic_id: string; sorte: 'telephone' | 'email'; libelle: string | null; valeur: string }>(
    `SELECT id::text, syndic_id::text, sorte, libelle, valeur FROM gestion_syndic_coordonnee_cabinet
      WHERE syndic_id = ANY($1::bigint[]) AND retire_le IS NULL ORDER BY syndic_id, rang, id`, [[...syndicIds]]);
  for (const r of rows) {
    const l = m.get(Number(r.syndic_id)) ?? [];
    l.push({ id: Number(r.id), sorte: r.sorte, libelle: r.libelle, valeur: r.valeur });
    m.set(Number(r.syndic_id), l);
  }
  return m;
}
