// 🔴 LOCATION — LE DROIT « ACCÈS AU RÉSULTAT NET DE L'AGENCE » (Arno, 26/10/2026, migration 428). Une question rattachée à la tuile
// « Location » de la page Comptes (Oui / Non, Non par défaut) ; elle ne vaut qu'avec l'accès à la tuile (`perm_location`) : décocher la
// tuile retire le droit. Administrateur : implicite. Même convention que `voirCommissions.ts` : pas de `import 'server-only'`, une
// écriture = UNE ligne visée par son id, toujours journalisée dans `admin_utilisateur_log` (action `changement_permissions`, avant /
// après, et la SESSION de l'administrateur qui a changé le droit).
import { query } from '../db/client';
import { droitLocationDisponible, droitResultatNetDisponible } from './schemaDroits';

export interface EtatResultatNet {
  /** `false` aussi tant que la migration 428 n'est pas appliquée. */
  valeur: boolean;
  disponible: boolean;
}

/** L'état de la réponse pour un compte. LECTURE SEULE. */
export async function lireResultatNet(id: number): Promise<EtatResultatNet> {
  if (!(await droitResultatNetDisponible())) return { valeur: false, disponible: false };
  const { rows } = await query<{ valeur: boolean }>('SELECT perm_resultat_net AS valeur FROM admin_utilisateur WHERE id = $1', [id]);
  return { valeur: rows[0]?.valeur === true, disponible: true };
}

/**
 * Le compte connecté voit-il le bloc « Résultat net de l'agence » ? Administrateur actif : toujours ; collaborateur actif : l'accès à
 * la tuile Location ET la réponse Oui. Sans la migration 428 (ou 371) : administrateurs seulement. LECTURE SEULE.
 */
export async function peutVoirResultatNet(auteurId: number | null): Promise<boolean> {
  if (auteurId === null) return false;
  const [avecDroit, avecLocation] = await Promise.all([droitResultatNetDisponible(), droitLocationDisponible()]);
  const { rows } = await query<{ role: string; actif: boolean; droit: boolean }>(
    `SELECT role, actif, ${avecDroit && avecLocation ? 'perm_location AND perm_resultat_net' : 'false'} AS droit FROM admin_utilisateur WHERE id = $1`, [auteurId]);
  const c = rows[0];
  if (c === undefined || c.actif !== true) return false;
  return c.role === 'administrateur' || c.droit === true;
}

/**
 * Écrit la réponse d'UN collaborateur. L'UPDATE et la ligne de journal partent ensemble ; rien n'est écrit si la valeur ne change pas.
 * La valeur est FORCÉE à faux si le compte n'a pas (ou plus) la tuile Location : un compte sans Location n'a pas ce droit. Rend
 * `false` si le compte n'existe pas, s'il est administrateur (droit implicite) ou si la migration n'est pas appliquée.
 * ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la ROUTE qui l'exige (`exigerAdministrateur`, relu en base).
 */
export async function definirResultatNet(id: number, valeur: boolean, auteurId: number | null, session: string | null): Promise<boolean> {
  if (!(await droitResultatNetDisponible()) || !(await droitLocationDisponible())) return false;
  const { rows } = await query<{ id: number }>(
    `WITH avant AS (
       SELECT id, perm_resultat_net, perm_location FROM admin_utilisateur WHERE id = $1 AND role = 'collaborateur' FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET perm_resultat_net = ($2::boolean AND avant.perm_location)
         FROM avant WHERE u.id = avant.id AND avant.perm_resultat_net IS DISTINCT FROM ($2::boolean AND avant.perm_location)
       RETURNING u.id, avant.perm_resultat_net AS ancienne, u.perm_resultat_net AS nouvelle
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_permissions', maj.id, $3,
              jsonb_build_object('perm_resultat_net', maj.ancienne, 'session', $4::text),
              jsonb_build_object('perm_resultat_net', maj.nouvelle, 'session', $4::text)
         FROM maj
     )
     SELECT id FROM avant`,
    [id, valeur, auteurId, session],
  );
  return rows.length > 0;
}
