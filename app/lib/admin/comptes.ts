// Opérations DB des comptes administrateurs (M3). Partagé par la route de connexion (serveur), le script CLI
// `app/scripts/admin.ts` (Node/tsx) et les tests → PAS de `import 'server-only'` (il lèverait sous tsx). Toute
// écriture est journalisée dans `admin_utilisateur_log` (append-only). Aucun DELETE/DROP/TRUNCATE ni UPDATE de masse :
// chaque mutation cible UNE ligne par identifiant/id exact.
import { query, withTransaction } from '../db/client';
import { hacher } from './motDePasse';
// Import TYPE-ONLY de session.ts : évite d'en charger le runtime (`import 'server-only'`) sous le script tsx.
import type { Perms, RoleAdmin } from './session';

/** Ligne brute d'un compte. `mot_de_passe` = HASH argon2id (jamais exposé hors vérification). */
export interface CompteDB {
  id: number;
  identifiant: string;
  prenom: string;
  nom: string;
  mot_de_passe: string;
  role: RoleAdmin;
  actif: boolean;
  perm_pilotage: boolean;
  perm_cartes_annee: boolean;
  perm_statistiques: boolean;
  perm_internautes: boolean;
  perm_curation: boolean;
  perm_banc_test: boolean;
  // Drapeau de première connexion (M3-4). Lu ici pour être DISPONIBLE ; il n'entre PAS encore dans le JWS
  // (ce sera le Lot B — enforcement). Les comptes CLI le portent false ; la future UI (Lot C) le posera true.
  doit_changer_mot_de_passe: boolean;
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

const SELECT_COMPTE = `SELECT id, identifiant, prenom, nom, mot_de_passe, role, actif,
    perm_pilotage, perm_cartes_annee, perm_statistiques, perm_internautes, perm_curation, perm_banc_test,
    doit_changer_mot_de_passe, derniere_connexion_a, cree_a
  FROM admin_utilisateur`;

/** Trouve un compte par identifiant, INSENSIBLE à la casse. `null` si absent. */
export async function trouverCompte(identifiant: string): Promise<CompteDB | null> {
  const { rows } = await query<CompteDB>(`${SELECT_COMPTE} WHERE lower(identifiant) = lower($1)`, [identifiant]);
  return rows[0] ?? null;
}

/** Trouve un compte par id (clé immuable du JWS `sub`). `null` si absent (compte supprimé). */
export async function trouverCompteParId(id: number): Promise<CompteDB | null> {
  const { rows } = await query<CompteDB>(`${SELECT_COMPTE} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Lit l'ordre personnalisé des modules d'un compte (jsonb `ordre_modules`, migration 030). Lecture SÉPARÉE et
 * RÉSILIENTE — délibérément HORS de `SELECT_COMPTE` (partagé par la connexion) : si la colonne n'existe pas
 * encore (migration 030 non appliquée) OU toute autre erreur DB, on renvoie `null` (→ ordre par défaut) au lieu
 * de lever, pour ne JAMAIS casser le layout admin ni le tableau de bord avant migration. La VALIDATION du contenu
 * (tableau ? slugs connus ?) est faite en aval par `ordonner` — ici on renvoie la valeur jsonb brute.
 */
export async function lireOrdreModules(id: number): Promise<unknown> {
  try {
    const { rows } = await query<{ ordre_modules: unknown }>(
      `SELECT ordre_modules FROM admin_utilisateur WHERE id = $1`,
      [id],
    );
    return rows[0]?.ordre_modules ?? null;
  } catch {
    return null; // colonne absente (pré-migration) ou erreur DB → ordre par défaut, jamais d'exception
  }
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

/**
 * Crée un compte. Refuse (ErreurCompte) si l'identifiant existe déjà (insensible à la casse) ou si prenom/nom
 * sont vides après trim (backstop applicatif du CHECK non-vide de 016). Journalise 'creation'.
 * `doit_changer_mot_de_passe` n'est pas fourni → prend false par défaut (016) : les comptes créés par la CLI ont
 * un mot de passe CHOISI par un humain, ils ne sont pas forcés de le changer (la future UI, Lot C, posera true).
 */
export async function creerCompte(
  identifiant: string,
  role: RoleAdmin,
  motDePasseClair: string,
  prenom: string,
  nom: string,
): Promise<ResultatCompte> {
  if (prenom.trim().length === 0 || nom.trim().length === 0) {
    throw new ErreurCompte('Prénom et nom sont obligatoires (non vides).');
  }
  if (await trouverCompte(identifiant)) {
    throw new ErreurCompte(`Un compte « ${identifiant} » existe déjà (comparaison insensible à la casse).`);
  }
  const h = await hacher(motDePasseClair);
  const [pp, pc, ps, pi, pcu, pb] = permsInitiales(role);
  const { rows } = await query<ResultatCompte>(
    `WITH nouv AS (
       INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role, actif,
         perm_pilotage, perm_cartes_annee, perm_statistiques, perm_internautes, perm_curation, perm_banc_test)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11)
       RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'creation', nouv.id, NULL, NULL, jsonb_build_object('identifiant', nouv.identifiant, 'role', nouv.role)
       FROM nouv
     )
     SELECT id, identifiant, role, actif FROM nouv`,
    [identifiant, prenom, nom, h, role, pp, pc, ps, pi, pcu, pb],
  );
  return rows[0];
}

/** Paramètres de création d'un compte depuis la tuile Administratif (M3-4 Lot C). */
export interface ParamsCreationAdmin {
  identifiant: string;
  prenom: string;
  nom: string;
  role: RoleAdmin;
  /** Permissions soumises — IGNORÉES si `role === 'administrateur'` (toutes forcées true). */
  perms: Perms;
  /** Mot de passe TEMPORAIRE en clair : haché ici, jamais stocké ni journalisé en clair. */
  motDePasseClair: string;
  /** `sub` du créateur pour le journal ; `null` pour la voie de secours (auteur inconnu). */
  auteurId: number | null;
}

/**
 * Crée un compte depuis la tuile Administratif : `doit_changer_mot_de_passe = true` (première connexion forcée,
 * Lot B), permissions explicites (toutes true pour un administrateur, les 6 soumises pour un collaborateur),
 * journal `creation` avec `auteur_id`. Refuse (ErreurCompte) prénom/nom vides ou identifiant déjà pris.
 */
export async function creerCompteAdministration(p: ParamsCreationAdmin): Promise<ResultatCompte> {
  if (p.prenom.trim().length === 0 || p.nom.trim().length === 0) {
    throw new ErreurCompte('Prénom et nom sont obligatoires (non vides).');
  }
  if (await trouverCompte(p.identifiant)) {
    throw new ErreurCompte(`Un compte « ${p.identifiant} » existe déjà (comparaison insensible à la casse).`);
  }
  const admin = p.role === 'administrateur';
  const h = await hacher(p.motDePasseClair);
  const { rows } = await query<ResultatCompte>(
    `WITH nouv AS (
       INSERT INTO admin_utilisateur (identifiant, prenom, nom, mot_de_passe, role, actif, doit_changer_mot_de_passe,
         perm_pilotage, perm_cartes_annee, perm_statistiques, perm_internautes, perm_curation, perm_banc_test)
       VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8, $9, $10, $11)
       RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'creation', nouv.id, $12, NULL, jsonb_build_object('identifiant', nouv.identifiant, 'role', nouv.role)
       FROM nouv
     )
     SELECT id, identifiant, role, actif FROM nouv`,
    [
      p.identifiant, p.prenom, p.nom, h, p.role,
      admin || p.perms.pilotage, admin || p.perms.cartes_annee, admin || p.perms.statistiques,
      admin || p.perms.internautes, admin || p.perms.curation, admin || p.perms.banc_test,
      p.auteurId,
    ],
  );
  return rows[0];
}

/**
 * Régénère un mot de passe TEMPORAIRE pour un compte existant : pose le nouveau HASH, REMET
 * `doit_changer_mot_de_passe = true` (le titulaire devra le changer), journal `reinitialisation_mot_de_passe`
 * avec `auteur_id`. Le clair n'est jamais vu ici. ErreurCompte si le compte n'existe pas.
 */
export async function regenererMotDePasseTemporaire(id: number, motDePasseClair: string, auteurId: number | null): Promise<ResultatCompte> {
  const h = await hacher(motDePasseClair);
  const { rows } = await query<ResultatCompte>(
    `WITH maj AS (
       UPDATE admin_utilisateur SET mot_de_passe = $2, doit_changer_mot_de_passe = true WHERE id = $1
       RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'reinitialisation_mot_de_passe', maj.id, $3, NULL, NULL FROM maj
     )
     SELECT id, identifiant, role, actif FROM maj`,
    [id, h, auteurId],
  );
  if (rows.length === 0) throw new ErreurCompte(`Aucun compte (id=${id}).`);
  return rows[0];
}

/**
 * Réactive un compte (actif false→true). Idempotent : renvoie false si aucune ligne modifiée (déjà actif,
 * absent, ou administrateur — cf. ci-dessous). Le cycle de vie d'un compte ADMINISTRATEUR (activer/désactiver)
 * passe UNIQUEMENT par la CLI (accès serveur), donc l'UI ne réactive QUE des collaborateurs : `role <> 'administrateur'`
 * (M3-4 Lot D, R-D) — symétrique de la désactivation, un administrateur désactivé via la CLI se réactive via la CLI.
 */
export async function reactiverCompte(id: number, auteurId: number | null): Promise<boolean> {
  const { rows } = await query<{ id: number }>(
    `WITH maj AS (
       UPDATE admin_utilisateur SET actif = true WHERE id = $1 AND actif = false AND role <> 'administrateur'
       RETURNING id
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'reactivation', maj.id, $2, jsonb_build_object('actif', false), jsonb_build_object('actif', true) FROM maj
     )
     SELECT id FROM maj`,
    [id, auteurId],
  );
  return rows.length > 0;
}

/** Clé de section critique « (dés)activation d'un compte administrateur » pour `pg_advisory_xact_lock`. */
const VERROU_DESACTIVATION_ADMIN = 71642342;

/**
 * Désactive un compte (actif true→false) avec la règle « DERNIER ADMINISTRATEUR ACTIF non désactivable ».
 *
 * ⚠️ Un simple `UPDATE ... WHERE (SELECT count(*) …) <= 1` NE SUFFIT PAS : sous READ COMMITTED, deux
 * désactivations concurrentes de DEUX administrateurs DISTINCTS lisent chacune un instantané où l'autre est
 * encore actif (count=2) → toutes deux passent → 0 admin (write-skew). On SÉRIALISE donc les désactivations par
 * un `pg_advisory_xact_lock` (verrou transactionnel sur une clé constante) : la 2ᵉ attend la 1ʳᵉ, recompte
 * (count=1) et est bloquée. Le comptage reste dans le WHERE de l'UPDATE conditionnel (défense en profondeur).
 *
 * Renvoie false si aucune ligne modifiée : compte absent, déjà inactif, ou dernier administrateur actif (bloqué).
 * Le handler distingue ces cas sur le chemin d'échec (SELECT léger, hors écriture).
 */
export async function desactiverCompte(id: number, auteurId: number | null): Promise<boolean> {
  return withTransaction(async (q) => {
    await q('SELECT pg_advisory_xact_lock($1)', [VERROU_DESACTIVATION_ADMIN]);
    const { rows } = await q<{ id: number }>(
      `WITH maj AS (
         UPDATE admin_utilisateur SET actif = false
          WHERE id = $1 AND actif = true
            -- R-D/R-E (Lot D) : l'UI ne désactive JAMAIS un administrateur (ni un autre, ni soi-même) — CLI uniquement.
            AND role <> 'administrateur'
            -- Garde « dernier administrateur actif » (Lot C) conservée en DÉFENSE EN PROFONDEUR (redondante depuis
            -- R-D : un admin n'est jamais désactivable ici, donc le count ne peut plus tomber à 0 par l'UI).
            AND NOT (role = 'administrateur'
                     AND (SELECT count(*) FROM admin_utilisateur WHERE actif AND role = 'administrateur') <= 1)
         RETURNING id
       ), jrnl AS (
         INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
         SELECT 'desactivation', maj.id, $2, jsonb_build_object('actif', true), jsonb_build_object('actif', false) FROM maj
       )
       SELECT id FROM maj`,
      [id, auteurId],
    );
    return rows.length > 0;
  });
}

/**
 * Modifie les 6 permissions d'un COLLABORATEUR (M3-4 Lot D). Écriture ATOMIQUE conditionnelle : le `WHERE role =
 * 'collaborateur'` garantit qu'on ne touche jamais un administrateur (ses permissions sont implicites/toutes true)
 * — même face à une promotion concurrente entre la lecture et l'écriture. Journalise `changement_permissions`
 * (autorisé par 016) avec l'`apres` = les nouvelles permissions. Renvoie false si aucune ligne (absent ou admin).
 */
export async function modifierPermissions(id: number, perms: Perms, auteurId: number | null): Promise<boolean> {
  const { rows } = await query<{ id: number }>(
    `WITH maj AS (
       UPDATE admin_utilisateur
          SET perm_pilotage = $2, perm_cartes_annee = $3, perm_statistiques = $4,
              perm_internautes = $5, perm_curation = $6, perm_banc_test = $7
        WHERE id = $1 AND role = 'collaborateur'
        RETURNING id
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_permissions', maj.id, $8, NULL, $9::jsonb FROM maj
     )
     SELECT id FROM maj`,
    [id, perms.pilotage, perms.cartes_annee, perms.statistiques, perms.internautes, perms.curation, perms.banc_test,
     auteurId, JSON.stringify(perms)],
  );
  return rows.length > 0;
}

/**
 * Promeut un COLLABORATEUR en administrateur (M3-4 Lot D, R-B) et force ses 6 permissions à true (cohérence Lot C :
 * le rôle administrateur implique toutes les permissions). Écriture ATOMIQUE conditionnelle `WHERE role =
 * 'collaborateur'` : idempotente (no-op si déjà administrateur) et — surtout — il n'existe AUCUNE fonction qui
 * écrive `role = 'collaborateur'` sur un compte existant → la RÉTROGRADATION est structurellement impossible (R-C).
 * Journalise `changement_role` (autorisé par 016). Renvoie false si aucune ligne (absent ou déjà administrateur).
 */
export async function promouvoirAdministrateur(id: number, auteurId: number | null): Promise<boolean> {
  const { rows } = await query<{ id: number }>(
    `WITH maj AS (
       UPDATE admin_utilisateur
          SET role = 'administrateur', perm_pilotage = true, perm_cartes_annee = true, perm_statistiques = true,
              perm_internautes = true, perm_curation = true, perm_banc_test = true
        WHERE id = $1 AND role = 'collaborateur'
        RETURNING id
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_role', maj.id, $2,
              jsonb_build_object('role', 'collaborateur'), jsonb_build_object('role', 'administrateur') FROM maj
     )
     SELECT id FROM maj`,
    [id, auteurId],
  );
  return rows.length > 0;
}

/**
 * Modifie l'IDENTITÉ (prénom, nom) d'un compte — n'importe lequel, y compris un administrateur (M3-4 Lot F2, F-2).
 * ⚠️ NE TOUCHE JAMAIS `identifiant` (adresse e-mail, IMMUABLE — F-1) : l'UPDATE ne SET que `prenom` et `nom`.
 * Refuse prénom/nom vides après trim (backstop du CHECK non-vide de 016). Écriture ATOMIQUE (CTE) + journal
 * `changement_identite` (autorisé par 017). Renvoie false si aucune ligne (compte absent). L'`avant` journalisé
 * n'est pas relu (cohérent avec les autres mutations) ; `apres` porte la nouvelle identité.
 */
export async function modifierIdentite(id: number, prenom: string, nom: string, auteurId: number | null): Promise<boolean> {
  if (prenom.trim().length === 0 || nom.trim().length === 0) {
    throw new ErreurCompte('Prénom et nom sont obligatoires (non vides).');
  }
  const { rows } = await query<{ id: number }>(
    `WITH maj AS (
       UPDATE admin_utilisateur SET prenom = $2, nom = $3 WHERE id = $1
       RETURNING id
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_identite', maj.id, $4, NULL, jsonb_build_object('prenom', $2::text, 'nom', $3::text) FROM maj
     )
     SELECT id FROM maj`,
    [id, prenom, nom, auteurId],
  );
  return rows.length > 0;
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
 * Changement de mot de passe SELF-SERVICE (M3-4 Lot B). Pose le nouveau HASH, ABAISSE `doit_changer_mot_de_passe`
 * à false, et journalise `changement_mot_de_passe` avec `auteur_id = id` (l'utilisateur agit sur SON compte).
 * Le clair n'apparaît jamais ici (seul le hash est reçu/écrit). Mono-ligne (WHERE id=$1) ; ErreurCompte si 0 ligne.
 */
export async function changerMotDePasseSelf(id: number, nouveauHash: string): Promise<ResultatCompte> {
  const { rows } = await query<ResultatCompte>(
    `WITH maj AS (
       UPDATE admin_utilisateur SET mot_de_passe = $2, doit_changer_mot_de_passe = false
        WHERE id = $1
        RETURNING id, identifiant, role, actif
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_mot_de_passe', maj.id, maj.id, NULL, NULL FROM maj
     )
     SELECT id, identifiant, role, actif FROM maj`,
    [id, nouveauHash],
  );
  if (rows.length === 0) throw new ErreurCompte(`Aucun compte (id=${id}).`);
  return rows[0];
}

/**
 * VOIE DE SECOURS / corde de rappel — RÉACTIVATION SEULE (M3-4 Lot A).
 * Un compte EXISTANT (identifiant trouvé, insensible à la casse) est réactivé : `actif=true`, repassé en
 * 'administrateur' avec toutes les permissions, et son mot de passe est réinitialisé. Ne touche JAMAIS
 * `prenom`/`nom`. Outrepasse volontairement la règle « dernier admin » (il sert à réparer un verrouillage).
 * IDEMPOTENT : rejouer `secours` sur le même compte le laisse dans le même état (administrateur actif).
 *
 * ⚠️ Il NE CRÉE PLUS de compte. Un identifiant INCONNU lève `ErreurCompte` — aucune création possible sans
 * identité (prenom/nom sont NOT NULL depuis 016 ; une valeur sentinelle serait un NULL déguisé). Pour créer,
 * utiliser `admin:creer`. La vraie corde de rappel d'Arno reste la VOIE DE SECOURS NAVIGATEUR (identifiant
 * vide + mot de passe partagé, sub=null, password.ts), qui ne dépend d'aucune ligne en base.
 */
export async function secours(identifiant: string, motDePasseClair: string): Promise<ResultatCompte> {
  const existant = await trouverCompte(identifiant);
  if (!existant) {
    throw new ErreurCompte('Aucun compte avec cet identifiant. Utilisez npm run admin:creer.');
  }
  const h = await hacher(motDePasseClair);
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
  return rows[0];
}

/** Liste des comptes pour l'affichage (CLI + tuile Administratif). JAMAIS le hash. `id` = clé pour les actions. */
export interface CompteListe {
  id: number;
  identifiant: string;
  prenom: string;
  nom: string;
  role: RoleAdmin;
  actif: boolean;
  perms: Perms;
  derniere_connexion_a: string | null;
  cree_a: string | null; // date de création du compte (déjà en base ; NULL toléré pour un compte pré-`cree_a`)
}

export async function listerComptes(): Promise<CompteListe[]> {
  const { rows } = await query<CompteDB>(`${SELECT_COMPTE} ORDER BY lower(identifiant)`);
  return rows.map((c) => ({
    id: c.id,
    identifiant: c.identifiant,
    prenom: c.prenom,
    nom: c.nom,
    role: c.role,
    actif: c.actif,
    perms: permsDuCompte(c),
    derniere_connexion_a: c.derniere_connexion_a,
    cree_a: c.cree_a ?? null,
  }));
}
