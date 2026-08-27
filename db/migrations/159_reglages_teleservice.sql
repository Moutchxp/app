-- 159_reglages_teleservice.sql — D4 : réglages PROPRES au process TÉLÉSERVICE (dépôt manuel). Le rail e-mail garde ses réglages
-- existants (caps/heures/relance auto) ; les réglages COMMUNS restent communs (non dupliqués). Ce lot AJOUTE 3 colonnes B :
--
--  · teleservice_dossiers_par_depot int   — DÉFAUT téléservice du nb de dossiers regroupables par DÉPÔT manuel. Le vrai
--      paramètre métier du dépôt à la main (ex. Paris n'accepte qu'1 dossier/dépôt). SURCHARGÉ par la limite PROPRE de la
--      commune (`mairie_contact.max_dossiers_par_demande`, P3) quand elle existe ; ce défaut ne s'applique qu'aux communes
--      téléservice SANS limite propre. Défaut 1 (le plus contraignant / le plus sûr). Plage applicative 1..20.
--  · teleservice_alerte_non_depose_active  bool — interrupteur de l'alerte « demande téléservice préparée non déposée » (opt-in,
--      défaut false : aucune alerte tant que non activé, aucun e-mail au réveil de la veille).
--  · teleservice_alerte_non_depose_jours   int  — seuil (jours) au-delà duquel une demande téléservice prête/à déposer et non
--      déposée déclenche l'alerte. Défaut 7. Plage applicative 1..90.
--
-- 🔑 SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS), aucune écriture de donnée, aucune valeur existante modifiée,
--    idempotente, une seule transaction. Ne touche NI le moteur SVAV, NI le golden, NI aucune requête de surveillance.
--    Tant qu'elle n'est PAS appliquée, la lecture ISOLÉE `lireTeleservice` (veilleConfig.ts) retombe sur ces défauts SANS
--    dégrader le reste de la config (motif lireCapsEnvoi / lireEnvoiAutoPlafond).
--
-- Application MANUELLE (Arno), arrêt au 1er échec — TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/159_reglages_teleservice.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ».

BEGIN;

-- CHECK inline (plages applicatives) : lues par l'écran Réglages (`parserBornesCheck`) pour borner la saisie, comme les autres réglages.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_dossiers_par_depot      integer NOT NULL DEFAULT 1     CHECK (teleservice_dossiers_par_depot BETWEEN 1 AND 20);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_alerte_non_depose_active boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_alerte_non_depose_jours  integer NOT NULL DEFAULT 7     CHECK (teleservice_alerte_non_depose_jours BETWEEN 1 AND 90);

COMMENT ON COLUMN config_veille.teleservice_dossiers_par_depot IS
  'D4 — DÉFAUT téléservice du nb de dossiers par DÉPÔT manuel (surchargé par mairie_contact.max_dossiers_par_demande si la commune a sa propre limite). Défaut 1. Plage applicative 1..20. Ne concerne QUE le rail téléservice.';
COMMENT ON COLUMN config_veille.teleservice_alerte_non_depose_active IS
  'D4 — interrupteur de l''alerte « demande téléservice préparée non déposée depuis N jours » (opt-in, défaut false). Ne concerne QUE le rail téléservice.';
COMMENT ON COLUMN config_veille.teleservice_alerte_non_depose_jours IS
  'D4 — seuil (jours) de l''alerte « non déposée » du rail téléservice. Défaut 7. Plage applicative 1..90.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT teleservice_dossiers_par_depot, teleservice_alerte_non_depose_active, teleservice_alerte_non_depose_jours
--     FROM config_veille WHERE id = 1;   -- attendu : 1 | f | 7
