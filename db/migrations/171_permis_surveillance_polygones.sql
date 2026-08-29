-- 171_permis_surveillance_polygones.sql — SURV-1 : SURVEILLANCE des polygones APRÈS validation d'un rattachement. Pose les deux
-- réglages (pilotage sans code) + la table marqueur anti-doublon. Le MOTEUR (module pur) et le déclencheur post-ingestion viennent
-- avec le code de ce même lot ; cette migration ne fait que poser le socle de données.
--
-- ⚠️ POURQUOI : une validation ACTAIT l'état des polygones d'un dossier, mais rien ne signalait ensuite que la géométrie continuait de
-- bouger (un bâtiment neuf apparaît à côté, un polygone validé disparaît d'une édition, un contour est re-numérisé). Pendant une
-- FENÊTRE réglable après la validation, ces trois changements déclenchent une ALERTE. 🔒 L'alerte n'INVALIDE RIEN : la validation
-- reste active, le dossier ne régresse pas — elle demande une vérification humaine, elle ne la remplace pas.
--
-- ═══ ① DEUX RÉGLAGES dans config_veille (singleton id=1) ═══════════════════════════════════════════════════════════════════════════
--   Patron EXACT des délais de bascule (migration 170) / des seuils (166) : integer NOT NULL DEFAULT + CHECK de plage, lu au runtime
--   avec repli sûr + provenance. PAS dans config_scoring (moteur de score / golden) : ce sont des réglages de POLITIQUE de veille.
--   · surveillance_tolerance_contour_pct — défaut 0. Écart de contour (différence symétrique relative, en %) au-DELÀ duquel un polygone
--       validé est signalé comme « contour modifié ». 0 = tout écart alerte (assumé bruité au 1er import ; c'est le rôle du réglage).
--       BORNES [0 ; 100] : 0 = strict ; 100 = plus aucune alerte de contour (bâtiment entièrement redessiné toléré).
--   · surveillance_fenetre_jours — défaut 730 (≈ 2 ans), comptée depuis la DATE DE VALIDATION du rattachement. Hors fenêtre : aucune
--       alerte, quelle que soit l'ampleur du changement. BORNES [30 ; 3650] (1 mois → 10 ans) : plancher 30 j pour un réglage court en
--       test, plafond 10 ans pour une surveillance longue d'une parcelle sensible.
--
-- ═══ ② TABLE permis_surveillance_alerte — MARQUEUR anti-doublon (une ligne par dossier × cleabs × type) ═══════════════════════════════
--   Miroir des tables d'idempotence alerte_obstacle_disparu / alerte_ged / alerte_attente_bati : garantit UN SEUL rappel par
--   (dossier, bâtiment, nature de changement) — jamais un mail à chaque tick. alerte_permis (129) NE CONVIENT PAS : pas de colonne
--   cleabs (granularité au permis entier) et CHECK type fermé sur 'superstructures'. FK sitadel_dossier ON DELETE CASCADE.
--   Le champ `type` est une GARDE à liste fermée (enum CHECK), lisible/validable par l'UI : 'nouveau' | 'disparu' | 'contour_modifie'.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur de verdict SVAV, NI le golden Asnières (29.107259068449615), NI une altitude, NI
--    config_scoring, NI les gardes ETAN-1, et N'ÉCRIT JAMAIS sur un certificat. Alerte seulement (régime « à revérifier »).
--
-- SÛR : ADD COLUMN / CREATE TABLE « IF NOT EXISTS ». Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une seule
-- transaction. AUCUN ENVOI. Requiert config_veille (048) et sitadel_dossier (Sitadel). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/171_permis_surveillance_polygones.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① Les deux réglages — patron 170 : entier + NOT NULL + DEFAULT + CHECK de plage lu par parserBornesCheck (Réglages).
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS surveillance_tolerance_contour_pct integer NOT NULL DEFAULT 0
    CHECK (surveillance_tolerance_contour_pct >= 0 AND surveillance_tolerance_contour_pct <= 100),
  ADD COLUMN IF NOT EXISTS surveillance_fenetre_jours integer NOT NULL DEFAULT 730
    CHECK (surveillance_fenetre_jours >= 30 AND surveillance_fenetre_jours <= 3650);

COMMENT ON COLUMN config_veille.surveillance_tolerance_contour_pct IS
  'SURV-1 — écart de contour (différence symétrique relative à l''aire de la référence figée à la validation, en %) au-DELÀ duquel un polygone validé est signalé « contour modifié ». Défaut 0 (tout écart alerte). Plage [0 ; 100]. Lu au runtime (lireSurveillanceConfig) avec repli sûr + provenance. N''invalide rien : signale une vérification à faire.';
COMMENT ON COLUMN config_veille.surveillance_fenetre_jours IS
  'SURV-1 — durée (JOURS), comptée depuis la DATE DE VALIDATION du rattachement, pendant laquelle les polygones d''un dossier sont surveillés (apparition / disparition / contour). Hors fenêtre : aucune alerte. Défaut 730 (≈ 2 ans). Plage [30 ; 3650]. Lu au runtime avec repli sûr + provenance.';

-- ② MARQUEUR anti-doublon — un rappel par dossier, cleabs et type de changement.
CREATE TABLE IF NOT EXISTS permis_surveillance_alerte (
  dossier_id bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  cleabs     text        NOT NULL,   -- le bâtiment (polygone BD TOPO) concerné par le changement
  type       text        NOT NULL CONSTRAINT permis_surveillance_alerte_type_chk
               CHECK (type IN ('nouveau','disparu','contour_modifie')),
  alerte_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dossier_id, cleabs, type)
);

COMMENT ON TABLE permis_surveillance_alerte IS
  'SURV-1 — idempotence : une ligne = ce dossier a reçu son alerte de surveillance pour ce cleabs et ce type de changement. Empêche un second mail à chaque tick (un seul rappel par dossier, bâtiment et nature de changement). Ne représente PAS une invalidation : la validation du rattachement reste active.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE) :
\echo '>>> ① colonnes réglages (type + défaut + NOT NULL) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name IN ('surveillance_tolerance_contour_pct','surveillance_fenetre_jours') ORDER BY column_name;
\echo '>>> ② CHECK des deux réglages (plage lue par le moteur de Réglages) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) ILIKE '%surveillance_tolerance_contour_pct%' OR pg_get_constraintdef(oid) ILIKE '%surveillance_fenetre_jours%') ORDER BY conname;
\echo '>>> ③ valeurs courantes (singleton) :'
SELECT surveillance_tolerance_contour_pct, surveillance_fenetre_jours FROM config_veille WHERE id = 1;
\echo '>>> ④ table marqueur + CHECK de type (liste fermée) :'
SELECT to_regclass('public.permis_surveillance_alerte');
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'permis_surveillance_alerte'::regclass AND contype = 'c' ORDER BY conname;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible ; les objets peuvent aussi rester sans effet) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS surveillance_tolerance_contour_pct; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS surveillance_fenetre_jours; \
--     DROP TABLE IF EXISTS permis_surveillance_alerte; \
--     COMMIT;"
