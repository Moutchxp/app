-- 016_comptes_identite.sql — M3-4 Lot A : identité (prénom, nom) + drapeau de première connexion.
--
-- Ajoute à admin_utilisateur : prenom, nom (NOT NULL, backfillés pour la ligne existante a.jorel) et
-- doit_changer_mot_de_passe (défaut false ; passé à true UNIQUEMENT par la future UI de création — Lot C).
-- Étend le CHECK d'actions de admin_utilisateur_log pour 'changement_mot_de_passe' (self-service, Lot B/C).
--
-- REJOUABLE / IDEMPOTENTE — contrairement à 015 qui fait un `ADD CONSTRAINT` NU (non rejouable : un 2e
-- `psql -f 015` échoue « constraint ... already exists »). Ici, la rejouabilité tient à quatre choses :
--   * transaction explicite (BEGIN/COMMIT) → un échec au milieu ROLLBACK tout → état toujours cohérent ;
--   * `ADD COLUMN IF NOT EXISTS` ; backfill idempotent (`WHERE ... IS NULL`) ; `SET NOT NULL` idempotent ;
--   * les CHECK NEUFS (prenom/nom) sont ajoutés via DO-block gardé sur pg_constraint (par NOM, pas définition) ;
--   * le CHECK d'actions PRÉ-EXISTE (créé en 014 avec une liste plus courte) : on ne peut donc PAS le
--     « add if not exists » (il resterait l'ancienne définition) → on le RECRÉE par DROP IF EXISTS + ADD,
--     déterministe et rejouable.
-- AUCUN DELETE / TRUNCATE / DROP TABLE|COLUMN. AUCUN UPDATE de masse (backfill CIBLÉ WHERE identifiant=...).
--
-- ORDRE DE DÉPLOIEMENT : appliquer 016 AVANT de déployer le code M3-4 Lot A (comptes.ts/admin.ts). Le nouveau
-- SELECT_COMPTE lit prenom/nom/doit_changer_mot_de_passe ; sans les colonnes, la connexion NOMMÉE échouerait
-- (la voie de secours NAVIGATEUR, sub=null, reste elle indépendante de la base et jamais impactée).
--
-- ROLLBACK : ne PAS DROP ces colonnes (ce serait destructif : backfill 'Arnaud'/'Jorel', identités, drapeaux).
-- Elles sont ADDITIVES et ignorées par l'ancien code → pour revenir en arrière, redéployer l'ancien code SUFFIT ;
-- laisser les colonnes en place est sans effet. Si un DROP est réellement voulu, sauvegarder prenom/nom d'abord.
--
-- Application MANUELLE (Arno), avec arrêt au 1er échec (ON_ERROR_STOP) pour un échec net et un rollback lisible :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/016_comptes_identite.sql

BEGIN;

-- 1. Colonnes. `doit_changer_mot_de_passe` prend false par défaut : la ligne existante (a.jorel, mot de passe
--    déjà choisi) devient false, ce qui est correct — elle ne sera pas forcée de changer.
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS prenom text;
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS doit_changer_mot_de_passe boolean NOT NULL DEFAULT false;

-- 2. Backfill CIBLÉ de la seule ligne pré-existante, et UNIQUEMENT si non renseignée (idempotent au 2e passage).
UPDATE admin_utilisateur
   SET prenom = 'Arnaud', nom = 'Jorel'
 WHERE identifiant = 'a.jorel@sansvisavis.com'
   AND (prenom IS NULL OR nom IS NULL);

-- 3. NOT NULL sur prenom/nom (idempotent : SET NOT NULL sur colonne déjà NOT NULL est un no-op). Échoue
--    VOLONTAIREMENT si une AUTRE ligne avait prenom/nom NULL (compte pré-016 non backfillé) → le ROLLBACK
--    préserve la cohérence, et Arno backfille cette ligne avant de rejouer. Pas de DEFAULT sur ces colonnes.
ALTER TABLE admin_utilisateur ALTER COLUMN prenom SET NOT NULL;
ALTER TABLE admin_utilisateur ALTER COLUMN nom SET NOT NULL;

-- 4. CHECK non-vide : le NOT NULL ne suffit pas ('' et les blancs seuls passeraient). La regex exige AU MOINS
--    un caractère qui n'est NI un blanc ASCII ([:space:] : espace, tab, saut de ligne, retour chariot…) NI un
--    caractère de contrôle ([:cntrl:]). NB : le classement de l'espace insécable U+00A0 par [:space:] dépend de
--    la locale/glibc et n'est PAS garanti — un prénom fait d'un seul U+00A0 pourrait passer cette CHECK ; ce cas
--    est déjà rejeté en amont par la couche applicative (JS `trim()` retire l'insécable → creerCompte/exigerTexte
--    refusent). La CHECK reste un backstop contre le vide et les blancs ASCII. Ajout gardé par NOM (rejouable).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_utilisateur_prenom_non_vide_check') THEN
    ALTER TABLE admin_utilisateur ADD CONSTRAINT admin_utilisateur_prenom_non_vide_check
      CHECK (prenom ~ '[^[:space:][:cntrl:]]');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_utilisateur_nom_non_vide_check') THEN
    ALTER TABLE admin_utilisateur ADD CONSTRAINT admin_utilisateur_nom_non_vide_check
      CHECK (nom ~ '[^[:space:][:cntrl:]]');
  END IF;
END $$;

-- 5. Journal : autoriser l'action 'changement_mot_de_passe' (Q2). Le CHECK d'actions existe DÉJÀ (014) avec une
--    liste plus courte ; un simple « add if not exists » le laisserait inchangé. On le RECRÉE (DROP IF EXISTS +
--    ADD) → rejouable. Nom déterministe de la CHECK de colonne de 014 : admin_utilisateur_log_action_check.
ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check
  CHECK (action IN ('creation','desactivation','reactivation','changement_role',
                    'changement_permissions','reinitialisation_mot_de_passe','changement_mot_de_passe'));

COMMIT;
