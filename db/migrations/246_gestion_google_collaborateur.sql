-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 246 — LOT 5-PJ-C : CHAQUE COLLABORATEUR CONNECTE SON PROPRE COMPTE GOOGLE.
--
-- 🔴 LE DÉFAUT QU'ELLE RÉPARE, constaté par Arno à l'écran le 25/09/2026. Le sélecteur de dossiers utilisait UN SEUL
-- jeton Google, celui de `gestion@criterimmo.fr` (mesuré). Conséquence : toute personne ouvrant la tuile Gestion
-- voyait l'arborescence de ce compte-là — ni plus, ni moins. Ni plus : le raccourci vers le Drive partagé qu'Arno
-- utilise n'existe pas dans le Drive de gestion@, donc il n'apparaissait pas. Ni moins, et c'est le point grave :
-- les droits affichés étaient ceux d'un compte PARTAGÉ, pas ceux de la personne connectée.
--
-- LE PRINCIPE RETENU : on ne recopie AUCUNE liste de droits dans notre base. Chaque collaborateur relie son compte
-- Google une fois, et le sélecteur parle à Google AVEC SON JETON. C'est donc Google qui applique ses droits, comme
-- il le fait dans drive.google.com. Une table de droits maison serait, elle, fausse dès le lendemain.
--
-- 🔴 LE JETON DE RAFRAÎCHISSEMENT EST CHIFFRÉ AU REPOS (AES-256-GCM, clé dans `.env`, jamais en base ni committée).
-- Un jeton Drive en clair dans une sauvegarde de base donnerait un accès complet au Drive d'une personne, sans mot
-- de passe et sans expiration. La colonne s'appelle `refresh_token_chiffre` exprès : on doit voir, en lisant le
-- schéma, que son contenu n'est pas lisible.
--
-- 🔴 LES DOMAINES AUTORISÉS SONT UN RÉGLAGE, PAS UNE CONSTANTE. `gestion_config.domaines_google_autorises` est
-- éditable sans redéploiement — le jour où l'agence ajoute un domaine, personne ne doit avoir à toucher au code.
--
-- ⚠️ LA MIGRATION 245 DOIT ÊTRE APPLIQUÉE AVANT CELLE-CI : elle ajoute au registre des dépôts la colonne qui dit
-- AVEC QUEL COMPTE GOOGLE le dépôt a été fait. Le contrôle ci-dessous le dit clairement plutôt que de laisser une
-- erreur « relation inconnue » sans explication.
--
-- POUR APPLIQUER (245 puis 246) :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/245_gestion_piece_drive.sql
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/246_gestion_google_collaborateur.sql
--
-- POUR REVENIR EN ARRIÈRE (les comptes reliés sont perdus, chacun devra se reconnecter — rien d'autre) :
--   DROP TABLE IF EXISTS gestion_google_compte;
--   ALTER TABLE gestion_config DROP COLUMN IF EXISTS domaines_google_autorises;
--   ALTER TABLE gestion_piece_drive DROP COLUMN IF EXISTS compte_google;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_piece_drive') IS NULL THEN
    RAISE EXCEPTION 'La migration 245 (registre des dépôts Drive) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

-- ── LE COMPTE GOOGLE D'UN COLLABORATEUR ─────────────────────────────────────────────────────────────────────────
-- UN SEUL compte par collaborateur (clé primaire sur l'utilisateur) : deux comptes reliés poseraient la question
-- « avec lequel ? » à chaque clic, et la mauvaise réponse déposerait chez le mauvais propriétaire.
CREATE TABLE IF NOT EXISTS gestion_google_compte (
  utilisateur_id        bigint      PRIMARY KEY REFERENCES admin_utilisateur(id) ON DELETE CASCADE,
  -- L'adresse Google reliée. Sert à l'afficher (« connecté en tant que … ») et à la journaliser avec chaque dépôt.
  email                 text        NOT NULL,
  -- ⚠️ CHIFFRÉ (AES-256-GCM). Jamais lisible en base, jamais rendu à un navigateur, jamais journalisé.
  refresh_token_chiffre text        NOT NULL,
  portees               text,
  connecte_le           timestamptz NOT NULL DEFAULT now(),
  maj_le                timestamptz NOT NULL DEFAULT now(),
  -- Renseignée quand Google refuse le jeton (autorisation retirée, mot de passe changé). L'écran propose alors de
  --   se reconnecter, au lieu d'afficher une erreur technique à chaque clic.
  derniere_erreur       text,
  CONSTRAINT gestion_google_compte_email_chk CHECK (btrim(email) <> '' AND email LIKE '%@%'),
  CONSTRAINT gestion_google_compte_jeton_chk CHECK (btrim(refresh_token_chiffre) <> '')
);

COMMENT ON TABLE gestion_google_compte IS
  'LOT 5-PJ-C — le compte Google PERSONNEL d''un collaborateur, relié à la tuile Gestion. C''est SON jeton qui sert à '
  'parcourir le Drive et à y déposer : Google applique donc SES droits, exactement comme dans drive.google.com. '
  'Aucune liste de droits n''est recopiée ici — une telle liste serait fausse dès le lendemain.';
COMMENT ON COLUMN gestion_google_compte.refresh_token_chiffre IS
  'Jeton de rafraîchissement CHIFFRÉ (AES-256-GCM ; clé dans .env, jamais en base). En clair, il donnerait un accès '
  'complet au Drive de la personne depuis n''importe quelle copie de la base, sans mot de passe et sans expiration.';
COMMENT ON COLUMN gestion_google_compte.derniere_erreur IS
  'Pourquoi Google a refusé le jeton la dernière fois. Sert à proposer une RECONNEXION plutôt qu''à afficher une '
  'erreur technique : « autorisation retirée » et « jamais connecté » ne se réparent pas de la même façon.';

-- ── LES DOMAINES ACCEPTÉS, ÉDITABLES ────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_config
  ADD COLUMN IF NOT EXISTS domaines_google_autorises text NOT NULL DEFAULT 'criterimmo.fr,sansvisavis.com';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_domaines_google_chk') THEN
    ALTER TABLE gestion_config
      ADD CONSTRAINT gestion_config_domaines_google_chk CHECK (btrim(domaines_google_autorises) <> '');
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.domaines_google_autorises IS
  'LOT 5-PJ-C — domaines dont un compte Google peut être relié à la tuile Gestion, séparés par des virgules. '
  'RÉGLAGE et non constante : ajouter un domaine ne doit demander ni code ni redéploiement. Un compte hors de cette '
  'liste est refusé, avec un message qui dit lequel est attendu.';

-- ── QUEL COMPTE A DÉPOSÉ ────────────────────────────────────────────────────────────────────────────────────────
-- Le journal disait DÉJÀ qui (le collaborateur). Il doit aussi dire AVEC QUEL COMPTE GOOGLE : c'est ce compte-là,
-- et lui seul, qui apparaîtra comme propriétaire du fichier dans le Drive.
ALTER TABLE gestion_piece_drive
  ADD COLUMN IF NOT EXISTS compte_google text;

COMMENT ON COLUMN gestion_piece_drive.compte_google IS
  'LOT 5-PJ-C — l''adresse Google AVEC LAQUELLE le dépôt a été fait. C''est elle qui figure comme propriétaire du '
  'fichier côté Drive : sans elle, on saurait qui a cliqué sans savoir sous quelle identité le fichier est parti.';

-- Relier ou délier un compte est un GESTE : il se journalise comme les autres.
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi',          -- 243 : un courrier PARTI de chez nous
    'piece_drive',    -- 245 : une pièce jointe COPIÉE dans le Drive
    'compte_google'   -- 246 : un collaborateur relie ou délie son compte Google
  ]));

COMMIT;
