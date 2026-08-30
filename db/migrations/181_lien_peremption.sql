-- 181_lien_peremption.sql — PART-D : PÉREMPTION des liens de téléchargement d'une mairie (alerte à Arno, sans jamais suivre le lien).
--
-- ⚠️ RÈGLE MÉTIER (Arno, 30/08) : un lien de téléchargement expire (Paris annonçait 7 jours) ; passé le terme, il faut TOUT
-- redemander à la mairie. La durée réelle n'est PAS connue de façon fiable (le lien ne la porte pas toujours, les mairies varient)
-- → on n'affiche JAMAIS « expire dans N jours » comme un fait : on affiche le fait MESURÉ « reçu il y a N jours », et le seuil
-- ci-dessous est une HYPOTHÈSE de travail (pour décider quand alerter), pas une donnée.
--
-- Trois colonnes ADDITIVES :
--  1) demande_reponse_lien.alerte_peremption_le : date d'envoi de l'UNIQUE alerte de péremption pour ce lien (idempotence — la
--     veille passe toutes les 15 min, jamais de répétition).
--  2) config_veille.lien_validite_presumee_jours : durée de validité PRÉSUMÉE d'un lien (hypothèse), défaut 7.
--  3) config_veille.lien_alerte_avant_jours : combien de jours AVANT ce terme présumé alerter, défaut 3 (→ alerte à « reçu il y a 4 j »).
--
-- 🔴 GARDE : n'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI `batiment`. AUCUN envoi
--    vers une mairie. On ne SUIT jamais un lien. DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS). GOLDEN-SAFE. Idempotente.
-- Requiert demande_reponse_lien (097) + config_veille. Application MANUELLE (arrêt au 1er échec) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/181_lien_peremption.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». (PART-D : APPLIQUÉE dans le lot.)

BEGIN;

ALTER TABLE demande_reponse_lien ADD COLUMN IF NOT EXISTS alerte_peremption_le timestamptz; -- NULL = pas encore alerté (idempotence)

COMMENT ON COLUMN demande_reponse_lien.alerte_peremption_le IS
  'PART-D — date d''envoi de l''UNIQUE alerte de péremption pour ce lien (à Arno). NULL = pas encore alerté. Empêche la répétition à chaque tic de veille.';

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS lien_validite_presumee_jours integer NOT NULL DEFAULT 7
  CHECK (lien_validite_presumee_jours BETWEEN 1 AND 90);   -- HYPOTHÈSE de durée de validité d'un lien (défaut 7)
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS lien_alerte_avant_jours integer NOT NULL DEFAULT 3
  CHECK (lien_alerte_avant_jours BETWEEN 0 AND 30);        -- jours avant le terme présumé pour alerter (défaut 3)

COMMENT ON COLUMN config_veille.lien_validite_presumee_jours IS
  'PART-D — durée de validité PRÉSUMÉE (hypothèse, jamais affichée comme un fait) d''un lien de téléchargement de mairie, en jours. Sert à décider quand alerter Arno. Défaut 7.';
COMMENT ON COLUMN config_veille.lien_alerte_avant_jours IS
  'PART-D — nombre de jours AVANT le terme présumé (lien_validite_presumee_jours) à partir duquel on alerte Arno qu''un lien en attente approche de sa péremption. Défaut 3 (→ alerte quand le lien a « reçu il y a 4 jours » ou plus).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonnes + valeurs par défaut :'
SELECT lien_validite_presumee_jours, lien_alerte_avant_jours FROM config_veille WHERE id = 1;
\echo '>>> colonne idempotence des liens :'
SELECT count(*) FILTER (WHERE alerte_peremption_le IS NOT NULL) AS deja_alertes, count(*) AS total_liens FROM demande_reponse_lien;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   ALTER TABLE demande_reponse_lien DROP COLUMN IF EXISTS alerte_peremption_le;
--   ALTER TABLE config_veille DROP COLUMN IF EXISTS lien_validite_presumee_jours, DROP COLUMN IF EXISTS lien_alerte_avant_jours;
