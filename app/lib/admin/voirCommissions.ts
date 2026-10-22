// LOCATION « OUTILS DE SUIVI » (Arno, 22/10/2026, migration 406) — le droit « Voir les commissions » : la section
// « Négociateurs » du tableau de bord et les montants de commission. Même convention que `serviceGestion.ts` : pas de
// `import 'server-only'`, une écriture = UNE ligne visée par son id, toujours journalisée dans `admin_utilisateur_log`
// (action `changement_permissions`, avant / après). Administrateur : implicite (la case ne s'affiche pas pour lui).
import { query } from '../db/client';
import { droitCommissionsDisponible } from './schemaDroits';

export interface EtatVoirCommissions {
  /** `false` aussi tant que la migration 406 n'est pas appliquée. */
  valeur: boolean;
  disponible: boolean;
}

/** L'état de la case pour un compte. LECTURE SEULE. */
export async function lireVoirCommissions(id: number): Promise<EtatVoirCommissions> {
  if (!(await droitCommissionsDisponible())) return { valeur: false, disponible: false };
  const { rows } = await query<{ valeur: boolean }>('SELECT perm_commissions AS valeur FROM admin_utilisateur WHERE id = $1', [id]);
  return { valeur: rows[0]?.valeur === true, disponible: true };
}

/**
 * Coche ou décoche la case d'UN compte. L'UPDATE et la ligne de journal partent ensemble ; rien n'est écrit si la valeur
 * ne change pas. Rend `false` si le compte n'existe pas ou si la migration n'est pas appliquée.
 * ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la ROUTE qui l'exige (`exigerAdministrateur`, relu en base).
 */
export async function definirVoirCommissions(id: number, valeur: boolean, auteurId: number | null): Promise<boolean> {
  if (!(await droitCommissionsDisponible())) return false;
  const { rows } = await query<{ id: number }>(
    `WITH avant AS (
       SELECT id, perm_commissions FROM admin_utilisateur WHERE id = $1 FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET perm_commissions = $2
         FROM avant WHERE u.id = avant.id AND avant.perm_commissions IS DISTINCT FROM $2
       RETURNING u.id, avant.perm_commissions AS ancienne
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_permissions', maj.id, $3,
              jsonb_build_object('perm_commissions', maj.ancienne), jsonb_build_object('perm_commissions', $2::boolean)
         FROM maj
     )
     SELECT id FROM avant`,
    [id, valeur, auteurId],
  );
  return rows.length > 0;
}
