-- 151_projection_validee.sql — Module VEILLE PERMIS (chantier PROJ-2c) : la PROJECTION d'emprises devient une FILE DE TRAVAIL
-- propre (onglet « Projection », entre Réponses et Archives), franchie à la RÉCEPTION DES DOCUMENTS.
--
-- POURQUOI (correction de PROJ-2b) : la projection avait été mise dans l'onglet Rattachement. Or le Rattachement s'ouvre quand
-- BD TOPO a livré le bâti — à ce moment le bâtiment EXISTE, projeter une emprise n'apporte plus rien. La projection sert à
-- l'INTERVALLE (1 à 3 ans) entre l'obtention des pièces et l'apparition du bâti : elle se fait donc à la réception des documents.
--
-- CE QU'ON STOCKE ICI : le fait qu'une projection a été VALIDÉE pour un dossier (qui / quand). Une ligne = le permis a quitté la
-- file « Projection ». La validation exige (côté application, fonction pure `verdictProjectionBatiments`) que CHAQUE bâtiment ait
-- soit une emprise tracée, soit une projection explicitement ignorée. À la validation, le permis est aussi MARQUÉ SUIVI (une ligne
-- permis_rattachement en `en_attente_bati`, cf. repo) pour apparaître dans le Rattachement « en attente d'une mise à jour ».
--
-- 🔴 GARDE INCHANGÉE (PROJ-2) : une emprise reste une RECONSTITUTION, jamais une mesure. Ce lot n'ouvre AUCUN chemin de la
-- reconstitution vers le moteur (verdict / altitude / certificat). Il ne fait qu'ajouter un jalon de FILE et un marquage de suivi.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE / INDEX IF NOT EXISTS). Aucun DROP, aucun ALTER d'une table existante, aucune
-- écriture de données. GOLDEN-SAFE. Idempotent. Un seul BEGIN/COMMIT. AUCUN ENVOI. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/151_projection_validee.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

CREATE TABLE IF NOT EXISTS permis_projection (
  dossier_id  bigint PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE, -- un jalon de projection par permis
  validee_le  timestamptz NOT NULL DEFAULT now(),
  validee_par text
);

COMMENT ON TABLE permis_projection IS
  'PROJ-2c — jalon de la FILE « Projection » : présence d''une ligne = la projection d''emprises du permis a été VALIDÉE (le permis a quitté la file, à la réception des documents). Condition applicative : chaque bâtiment a une emprise tracée OU une projection ignorée. À la validation, le permis est aussi marqué suivi (permis_rattachement en_attente_bati). N''alimente NI le verdict SVAV, NI l''altitude, NI un certificat.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT to_regclass('public.permis_projection'); -- non NULL
--   \d permis_projection  -- dossier_id PK (FK sitadel_dossier ON DELETE CASCADE), validee_le NOT NULL DEFAULT now(), validee_par text
