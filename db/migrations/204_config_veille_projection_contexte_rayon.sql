-- 204_config_veille_projection_contexte_rayon.sql — PROJ-CTX : RAYON (m) du contexte affiché autour de l'empreinte du permis.
--
-- POURQUOI : le schéma « Bâtiments et projection » ne montre que le bâti intersectant l'empreinte (sur la parcelle + mitoyens). Un
-- interrupteur « contexte » (par défaut allumé) affiche EN PLUS les parcelles voisines et leur bâti dans un RAYON autour de l'empreinte,
-- dans un 3e registre visuel distinct (jamais candidats à l'affectation). Ce rayon borne ce contexte. À 50 m ≈ 14 bâtiments, 100 m ≈ 44,
-- 200 m ≈ 164 (mesuré sur le 468) : le volume grimpe vite → rayon RÉGLABLE et borné.
--
-- OÙ : `config_veille` (singleton id=1), FRÈRE de projection_mitoyen_seuil_aire_m2 (migration 203) : même table, même patron « valeur
-- bornée, lue au runtime avec repli sûr + provenance » (cf. app/lib/permis/projectionConfig.ts). PAS dans config_scoring (moteur de
-- score / golden), PAS une constante en dur.
--
-- ENCODAGE : `integer` en MÈTRES (défaut 50). Plage [0 ; 500] m (0 = aucun contexte ; 500 = plafond large, au-delà du 200 m mesuré).
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline idempotent). Ne touche NI le moteur de verdict SVAV, NI le
-- golden, NI une ligne existante. Idempotente. Requiert `config_veille`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/204_config_veille_projection_contexte_rayon.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (elle reste en attente d'application).

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS projection_contexte_rayon_m integer NOT NULL DEFAULT 50
    CHECK (projection_contexte_rayon_m >= 0 AND projection_contexte_rayon_m <= 500);

COMMENT ON COLUMN config_veille.projection_contexte_rayon_m IS
  'PROJ-CTX — rayon (m) du CONTEXTE affiché autour de l''empreinte du permis dans le schéma « Bâtiments et projection » : parcelles voisines + leur bâti, dans un 3e registre visuel distinct (jamais candidats à l''affectation ni à l''empreinte). Défaut 50. Plage [0 ; 500]. Lu au runtime (lireRayonContexteM) avec repli sûr si la colonne est absente. Le contexte est chargé À CHAQUE ouverture (interrupteur allumé par défaut) : un rayon large alourdit l''affichage par défaut. N''alimente NI le verdict NI une altitude.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne + défaut + NOT NULL :'
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name = 'projection_contexte_rayon_m';
\echo '>>> CHECK (plage de validation) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%projection_contexte%';
\echo '>>> valeur courante (singleton) :'
SELECT projection_contexte_rayon_m FROM config_veille WHERE id = 1;
