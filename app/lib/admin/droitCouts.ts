// 🔴 D37 (Arno, 04/11/2026, option A, migration 454) — la case « Les coûts » (onglet de Mon espace, dans « Voir ») : elle remplace la
// condition « associé » de la décision C1. Même convention que `voirCommissions.ts` : pas de `import 'server-only'`, une écriture = UNE
// ligne visée par son id, toujours journalisée dans `admin_utilisateur_log` (action `changement_permissions`, avant / après).
// Seule case modifiable pour un ADMINISTRATEUR (l'exception voulue par Arno) : l'onglet est dans « Voir », réservé aux administrateurs ;
// la case d'un collaborateur s'affiche, sans effet tant que « Voir » ne lui est pas ouvert.
import { query } from '../db/client';
import { droitsD37Disponibles } from './schemaDroits';

export interface EtatDroitCouts {
  /** `false` aussi tant que la migration 454 n'est pas appliquée. */
  valeur: boolean;
  disponible: boolean;
}

/** L'état de la case pour un compte. LECTURE SEULE. */
export async function lireDroitCouts(id: number): Promise<EtatDroitCouts> {
  if (!(await droitsD37Disponibles())) return { valeur: false, disponible: false };
  const { rows } = await query<{ valeur: boolean }>('SELECT perm_couts AS valeur FROM admin_utilisateur WHERE id = $1', [id]);
  return { valeur: rows[0]?.valeur === true, disponible: true };
}

/**
 * Coche ou décoche la case d'UN compte. L'UPDATE et la ligne de journal partent ensemble ; rien n'est écrit si la valeur ne change pas.
 * Rend `false` si le compte n'existe pas ou si la migration n'est pas appliquée.
 * ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la ROUTE qui l'exige (`exigerAdministrateur`, relu en base).
 */
export async function definirDroitCouts(id: number, valeur: boolean, auteurId: number | null): Promise<boolean> {
  if (!(await droitsD37Disponibles())) return false;
  const { rows } = await query<{ id: number }>(
    `WITH avant AS (
       SELECT id, perm_couts FROM admin_utilisateur WHERE id = $1 FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET perm_couts = $2
         FROM avant WHERE u.id = avant.id AND avant.perm_couts IS DISTINCT FROM $2
       RETURNING u.id, avant.perm_couts AS ancienne
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_permissions', maj.id, $3,
              jsonb_build_object('perm_couts', maj.ancienne), jsonb_build_object('perm_couts', $2::boolean)
         FROM maj
     )
     SELECT id FROM avant`,
    [id, valeur, auteurId],
  );
  return rows.length > 0;
}
