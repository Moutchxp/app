// Opérations DB des comptes administrateurs (M3). Partagé par la route de connexion (serveur), le script CLI
// `app/scripts/admin.ts` (Node/tsx) et les tests → PAS de `import 'server-only'` (il lèverait sous tsx). Toute
// écriture est journalisée dans `admin_utilisateur_log` (append-only). Aucun DELETE/DROP/TRUNCATE ni UPDATE de masse :
// chaque mutation cible UNE ligne par identifiant/id exact.
import { query } from '../db/client';
import { hacher } from './motDePasse';
// Import TYPE-ONLY de session.ts : évite d'en charger le runtime (`import 'server-only'`) sous le script tsx.
import type { Perms, RoleAdmin } from './session';

/** Ligne brute d'un compte. `mot_de_passe` = HASH argon2id (jamais exposé hors vérification). */
export interface CompteDB {
  id: number;
  identifiant: string;
  mot_de_passe: string;
  role: RoleAdmin;
  actif: boolean;
  perm_pilotage: boolean;
  perm_cartes_annee: boolean;
  perm_statistiques: boolean;
  perm_internautes: boolean;
  perm_curation: boolean;
  perm_banc_test: boolean;
  derniere_connexion_a: string | null;
  cree_a: string;
}

/** Résultat compact d'une mutation (jamais le hash). */
export interface ResultatCompte {
  id: number;
  identifiant: string;
  role: RoleAdmin;
  actif: boolean;
}

/** Erreur métier « attendue » (identifiant déjà pris, compte introuvable…) → message propre côté CLI/route. */
export class ErreurCompte extends Error {}

/** Permissions EFFECTIVES d'un compte : administrateur → toutes ; collaborateur → ses colonnes `perm_*`.
 *  (Objet all-true inline, cohérent avec `permsToutes()` de session.ts — évité ici en import runtime, cf. en-tête.) */
export function permsDuCompte(c: CompteDB): Perms {
  if (c.role === 'administrateur') {
    return { pilotage: true, cartes_annee: true, statistiques: true, internautes: true, curation: true, banc_test: true };
  }
  return {
    pilotage: c.perm_pilotage,
    cartes_annee: c.perm_cartes_annee,
    statistiques: c.perm_statistiques,
    internautes: c.perm_internautes,
    curation: c.perm_curation,
    banc_test: c.perm_banc_test,
  };
}

const SELECT_COMPTE = `SELECT id, identifiant, mot_de_passe, role, actif,
    perm_pilotage, perm_cartes_annee, perm_statistiques, perm_internautes, perm_curation, perm_banc_test,
    derniere_connexion_a, cree_a
  FROM admin_utilisateur`;

/** Trouve un compte par identifiant, INSENSIBLE à la casse. `null` si absent. */
export async function trouverCompte(identifiant: string): Promise<CompteDB | null> {
  const { rows } = await query<CompteDB>(`${SELECT_COMPTE} WHERE lower(identifiant) = lower($1)`, [identifiant]);
  return rows[0] ?? null;
}

/** Met à jour `derniere_connexion_a = now()` pour un compte (mono-ligne, sur succès de connexion). */
export async function marquerConnexion(id: number): Promise<void> {
  await query(`UPDATE admin_utilisateur SET derniere_connexion_a = now() WHERE id = $1`, [id]);
}

/** Perms de départ selon le rôle (administrateur → toutes true ; collaborateur → toutes false, complétées au Lot 4). */
function permsInitiales(role: RoleAdmin): boolean[] {
  const t = role === 'administrateur';
  return [t, t, t, t, t, t]; // pilotage, cartes_annee, statistiques, internautes, curation, banc_test
}

/** Crée un compte. Refuse (ErreurCompte) si l'identifiant existe déjà (insensible à la casse). Journalise 'creation'. */
export async function creerCompte(identifiant: string, role: RoleAdmin, motDePasseClair: string): Promise<ResultatCompte> {
  if (await trouverCompte(identifiant)) {
    throw new ErreurCompte(`Un compte « ${identifiant} » existe déjà (comparaison insensible à la casse).`);
  }
  const h = await hacher(motDePasseClair);
  const [pp, pc, ps, pi, pcu, pb] = permsInitiales(role);
  const { rows } = await query<ResultatCompte>(
    `WITH nouv AS (
       INSERT INTO admin_utilisateur (identifiant, mot_de_passe, role, actif,
         perm_pilotage, perm_cartes_annee, perm_statistiques, perm_internautes, perm_curation, perm_banc_test)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9)
       RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'creation', nouv.id, NULL, NULL, jsonb_build_object('identifiant', nouv.identifiant, 'role', nouv.role)
       FROM nouv
     )
     SELECT id, identifiant, role, actif FROM nouv`,
    [identifiant, h, role, pp, pc, ps, pi, pcu, pb],
  );
  return rows[0];
}

/** Réinitialise le mot de passe d'un compte existant. Journalise 'reinitialisation_mot_de_passe'. */
export async function reinitialiserMotDePasse(identifiant: string, motDePasseClair: string): Promise<ResultatCompte> {
  const h = await hacher(motDePasseClair);
  const { rows } = await query<ResultatCompte>(
    `WITH maj AS (
       UPDATE admin_utilisateur SET mot_de_passe = $2 WHERE lower(identifiant) = lower($1)
       RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'reinitialisation_mot_de_passe', maj.id, NULL, NULL, NULL FROM maj
     )
     SELECT id, identifiant, role, actif FROM maj`,
    [identifiant, h],
  );
  if (rows.length === 0) throw new ErreurCompte(`Aucun compte « ${identifiant} ».`);
  return rows[0];
}

/**
 * VOIE DE SECOURS / corde de rappel. IDEMPOTENT : crée le compte en 'administrateur' actif s'il n'existe pas ;
 * sinon le réactive (actif=true), le repasse en 'administrateur' avec toutes les permissions, et réinitialise
 * son mot de passe. Outrepasse volontairement la règle « dernier admin » (il sert à réparer un verrouillage).
 */
export async function secours(identifiant: string, motDePasseClair: string): Promise<ResultatCompte & { action: 'creation' | 'reactivation' }> {
  const existant = await trouverCompte(identifiant);
  const h = await hacher(motDePasseClair);
  if (existant) {
    const { rows } = await query<ResultatCompte>(
      `WITH maj AS (
         UPDATE admin_utilisateur
            SET actif = true, role = 'administrateur', mot_de_passe = $2,
                perm_pilotage = true, perm_cartes_annee = true, perm_statistiques = true,
                perm_internautes = true, perm_curation = true, perm_banc_test = true
          WHERE id = $1
          RETURNING id, identifiant, role, actif
       ), jrnl AS (
         INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
         SELECT 'reactivation', maj.id, NULL,
                jsonb_build_object('actif', $3::boolean, 'role', $4::text),
                jsonb_build_object('actif', maj.actif, 'role', maj.role)
         FROM maj
       )
       SELECT id, identifiant, role, actif FROM maj`,
      [existant.id, h, existant.actif, existant.role],
    );
    return { ...rows[0], action: 'reactivation' };
  }
  const { rows } = await query<ResultatCompte>(
    `WITH nouv AS (
       INSERT INTO admin_utilisateur (identifiant, mot_de_passe, role, actif,
         perm_pilotage, perm_cartes_annee, perm_statistiques, perm_internautes, perm_curation, perm_banc_test)
       VALUES ($1, $2, 'administrateur', true, true, true, true, true, true, true)
       RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'creation', nouv.id, NULL, NULL, jsonb_build_object('identifiant', nouv.identifiant, 'role', nouv.role)
       FROM nouv
     )
     SELECT id, identifiant, role, actif FROM nouv`,
    [identifiant, h],
  );
  return { ...rows[0], action: 'creation' };
}

/** Liste des comptes pour l'affichage CLI (jamais le hash). */
export interface CompteListe {
  identifiant: string;
  role: RoleAdmin;
  actif: boolean;
  perms: Perms;
  derniere_connexion_a: string | null;
}

export async function listerComptes(): Promise<CompteListe[]> {
  const { rows } = await query<CompteDB>(`${SELECT_COMPTE} ORDER BY lower(identifiant)`);
  return rows.map((c) => ({
    identifiant: c.identifiant,
    role: c.role,
    actif: c.actif,
    perms: permsDuCompte(c),
    derniere_connexion_a: c.derniere_connexion_a,
  }));
}
