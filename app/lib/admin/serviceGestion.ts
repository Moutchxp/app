// LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE — « Appartient au service gestion » (migration 341). Même convention que
// `comptes.ts` : PAS de `import 'server-only'` (lu aussi sous tsx et par les tests), une écriture = UNE ligne visée par
// son id exact, et toujours journalisée dans `admin_utilisateur_log` (append-only).
//
// 🔒 CETTE CASE NE DONNE AUCUN DROIT. Aucune garde ne la lit : elle ne change ni l'accès à la tuile Gestion, ni le droit
// d'envoi. Elle décide d'une seule chose : le cartouche d'alerte sur le nom, dans l'objet des mails pré-remplis.
import { query } from '../db/client';
import { serviceGestionDisponible } from './schemaDroits';

export interface EtatServiceGestion {
  /** `false` aussi tant que la migration 341 n'est pas appliquée. */
  valeur: boolean;
  /** La case peut-elle être cochée ? (migration appliquée) */
  disponible: boolean;
  /** Le dernier changement, tel que le journal le porte : sa date et son auteur. `null` = jamais changée. */
  modifieLe: string | null;
  modifiePar: string | null;
}

/** L'état de la case pour un compte, avec son dernier changement. LECTURE SEULE. */
export async function lireServiceGestion(id: number): Promise<EtatServiceGestion> {
  if (!(await serviceGestionDisponible())) return { valeur: false, disponible: false, modifieLe: null, modifiePar: null };
  const { rows } = await query<{ valeur: boolean; ts: string | null; auteur: string | null }>(
    `SELECT u.service_gestion AS valeur, j.ts::text AS ts,
            nullif(btrim(concat_ws(' ', a.prenom, a.nom)), '') AS auteur
       FROM admin_utilisateur u
       LEFT JOIN LATERAL (
         SELECT l.ts, l.auteur_id FROM admin_utilisateur_log l
          WHERE l.cible_id = u.id AND l.action = 'changement_service_gestion'
          ORDER BY l.ts DESC, l.id DESC LIMIT 1) j ON true
       LEFT JOIN admin_utilisateur a ON a.id = j.auteur_id
      WHERE u.id = $1`, [id]);
  const r = rows[0];
  return { valeur: r?.valeur === true, disponible: true, modifieLe: r?.ts ?? null, modifiePar: r?.auteur ?? null };
}

/** La case pour PLUSIEURS comptes (liste des comptes, objet du mail). Migration absente ⇒ tous `false`. LECTURE SEULE. */
export async function servicesGestion(ids: readonly number[]): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>();
  if (ids.length === 0 || !(await serviceGestionDisponible())) return out;
  const { rows } = await query<{ id: number; valeur: boolean }>(
    'SELECT id, service_gestion AS valeur FROM admin_utilisateur WHERE id = ANY($1::bigint[])', [[...ids]]);
  for (const r of rows) out.set(Number(r.id), r.valeur === true);
  return out;
}

/**
 * Coche ou décoche la case d'UN compte (administrateur ou collaborateur). Écriture ATOMIQUE : l'UPDATE et la ligne de
 * journal (action `changement_service_gestion`, avant / après, auteur) partent ensemble. Rien n'est écrit si la valeur
 * ne change pas. Rend `false` si le compte n'existe pas ou si la migration n'est pas appliquée.
 * ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la ROUTE qui l'exige (`exigerAdministrateur`, relu en base).
 */
export async function definirServiceGestion(id: number, valeur: boolean, auteurId: number | null): Promise<boolean> {
  if (!(await serviceGestionDisponible())) return false;
  const { rows } = await query<{ id: number }>(
    `WITH avant AS (
       SELECT id, service_gestion FROM admin_utilisateur WHERE id = $1 FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET service_gestion = $2
         FROM avant WHERE u.id = avant.id AND avant.service_gestion IS DISTINCT FROM $2
       RETURNING u.id, avant.service_gestion AS ancienne
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_service_gestion', maj.id, $3,
              jsonb_build_object('service_gestion', maj.ancienne), jsonb_build_object('service_gestion', $2::boolean)
         FROM maj
     )
     SELECT id FROM avant`,
    [id, valeur, auteurId],
  );
  return rows.length > 0;
}
