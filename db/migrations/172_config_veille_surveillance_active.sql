-- 172_config_veille_surveillance_active.sql — SURV-2 : INTERRUPTEUR dédié de la surveillance des polygones après validation.
--
-- ⚠️ POURQUOI : SURV-1 allume la surveillance dès que l'adresse d'alerte (config_veille.alerte_email) est renseignée — la MÊME adresse
-- que l'alerte « obstacle disparu ». Impossible, aujourd'hui, de couper la surveillance des polygones sans couper aussi l'alerte
-- obstacle disparu (plus importante). Ce lot ajoute l'interrupteur qui manquait, en AND avec le gate d'adresse existant (il s'y AJOUTE,
-- il ne le remplace pas).
--
-- ═══ INTERRUPTEUR surveillance_active dans config_veille (singleton id=1) ══════════════════════════════════════════════════════════
--   Patron des interrupteurs de config_veille (booléen NOT NULL + DEFAULT). DÉFAUT = true, ASSUMÉ : le comportement d'aujourd'hui
--   (surveillance active dès qu'une adresse d'alerte est configurée) est STRICTEMENT préservé après application. Le repli runtime, tant
--   que la colonne n'existe pas encore, vaut AUSSI true → sans la migration, rien ne change non plus.
--   ⚠️ Contrairement aux autres interrupteurs d'alerte (opt-in, défaut false), celui-ci est OPT-OUT (défaut true) : il ne CRÉE pas un
--   comportement, il permet d'ÉTEINDRE un comportement déjà en place depuis SURV-1.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur de verdict SVAV, NI le golden Asnières (29.107259068449615), NI une altitude, NI
--    config_scoring, NI les gardes ETAN-1, NI l'alerte « obstacle disparu » (obstacle_disparu_alerte_active reste distinct), NI
--    l'adresse d'alerte partagée. AUCUN ENVOI. Alerte seulement (régime « à vérifier »).
--
-- SÛR : ADD COLUMN « IF NOT EXISTS ». Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une seule transaction. Requiert
-- config_veille (048). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/172_config_veille_surveillance_active.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- INTERRUPTEUR (opt-OUT, défaut true → comportement SURV-1 préservé).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS surveillance_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN config_veille.surveillance_active IS
  'SURV-2 — surveiller les polygones des rattachements validés (apparition / disparition / contour) et alerter par e-mail ? Défaut true (comportement SURV-1). Quand c''est éteint, plus AUCUNE alerte de surveillance des polygones n''est envoyée ni calculée. La validation des rattachements et l''alerte « obstacle disparu » ne sont PAS concernées. Lu au runtime (lireSurveillanceConfig) avec repli sûr (true) + provenance.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE) :
\echo '>>> ① colonne interrupteur (type + défaut + NOT NULL) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name = 'surveillance_active';
\echo '>>> ② valeur courante (singleton) :'
SELECT surveillance_active FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible ; la colonne peut aussi rester sans effet) :
--   psql "$DATABASE_URL" -c "ALTER TABLE config_veille DROP COLUMN IF EXISTS surveillance_active;"
