-- 083_saisine_cada.sql — Module VEILLE PERMIS (chantier X1) : SOCLE MATÉRIEL de la saisine CADA. AUCUN CODE FONCTIONNEL
-- (ni éligibilité, ni texte, ni envoi, ni écran) : cette migration ne fait qu'ouvrir le schéma pour les chantiers suivants.
-- TU NE L'APPLIQUES PAS. Requiert 082.
--
-- ⚠️ PAS STRICTEMENT ADDITIVE (comme la 080) : recréation (DROP + ADD) de la SEULE contrainte CHECK du TYPE de
-- demande_relance, pour ÉLARGIR la liste fermée 'relance' → ('relance','saisine_cada'). ÉLARGISSEMENT, jamais
-- rétrécissement : toutes les lignes existantes (aujourd'hui type='relance' uniquement) restent valides. Le reste est
-- strictement ADDITIF (ADD COLUMN IF NOT EXISTS, ADD CONSTRAINT idempotent). Aucun DROP de table/colonne/index.
-- GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/083_saisine_cada.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) demande_relance.type : ÉLARGIR la liste fermée à la saisine CADA (recréation DROP+ADD de la SEULE contrainte, modèle
--    080). Élargissement : les lignes existantes (type='relance') restent toutes valides.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_relance DROP CONSTRAINT IF EXISTS demande_relance_type_chk;
ALTER TABLE demande_relance ADD CONSTRAINT demande_relance_type_chk CHECK (type IN ('relance', 'saisine_cada'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) demande_relance : AVIS de la CADA — RENSEIGNÉ uniquement pour type='saisine_cada', TOUJOURS NULL pour une relance.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_relance ADD COLUMN IF NOT EXISTS avis_recu_le timestamptz;
ALTER TABLE demande_relance ADD COLUMN IF NOT EXISTS avis_sens text
  CHECK (avis_sens IS NULL OR avis_sens IN ('favorable', 'defavorable', 'sans_suite'));

COMMENT ON COLUMN demande_relance.avis_recu_le IS
  'X1 — date de réception de l''avis de la CADA. Ne concerne QUE les saisines (type=''saisine_cada'') ; reste NULL pour une relance (qui n''appelle aucun avis) et tant qu''aucun avis n''est reçu.';
COMMENT ON COLUMN demande_relance.avis_sens IS
  'X1 — sens de l''avis de la CADA (favorable / defavorable / sans_suite). Ne concerne QUE les saisines (type=''saisine_cada'') ; NULL pour une relance et tant qu''aucun avis n''est reçu.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) config_veille : destinataire + formulaire de la CADA (pilotage sans code).
--    cada_email VIDE = saisine par FORMULAIRE EN LIGNE (dépôt MANUEL sur cada_url_formulaire) — ce n'est PAS « envoi
--    impossible », c'est un AUTRE canal. CHECK : '' ou adresse valide (modèle 071 adresse_reponse).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cada_email text NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE config_veille ADD CONSTRAINT config_veille_cada_email_check
    CHECK (cada_email = '' OR cada_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cada_url_formulaire text NOT NULL DEFAULT 'https://www.cada.fr/formulaire-de-saisine';

COMMENT ON COLUMN config_veille.cada_email IS
  'X1 — adresse e-mail de la CADA pour une saisine PAR E-MAIL (pièce jointe = copie de la demande initiale, R343-1). '''' (défaut) = saisine par FORMULAIRE EN LIGNE, dépôt MANUEL sur cada_url_formulaire — ce n''est PAS « envoi impossible », c''est un autre canal. Éditable dans l''écran Réglages. CHECK : '''' ou adresse valide.';
COMMENT ON COLUMN config_veille.cada_url_formulaire IS
  'X1 — URL du formulaire de saisine en ligne de la CADA (dépôt manuel quand cada_email est vide). Éditable dans l''écran Réglages.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_relance_type_chk';  -- doit lister relance + saisine_cada
--   SELECT cada_email, cada_url_formulaire FROM config_veille WHERE id = 1;  -- '' / https://www.cada.fr/formulaire-de-saisine
--   \d demande_relance   -- avis_recu_le (timestamptz, NULL) + avis_sens (text, NULL, CHECK)
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE demande_relance SET type = 'autre' WHERE false; ROLLBACK;          -- viole la liste fermée du type
--   -- BEGIN; UPDATE demande_relance SET avis_sens = 'peut-etre' WHERE false; ROLLBACK; -- viole le CHECK avis_sens
--   -- BEGIN; UPDATE config_veille SET cada_email = 'pas-une-adresse' WHERE id = 1; ROLLBACK; -- viole le CHECK cada_email
