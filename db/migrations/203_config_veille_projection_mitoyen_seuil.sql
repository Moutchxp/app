-- 203_config_veille_projection_mitoyen_seuil.sql — PROJ-MIT : SEUIL d'aire réelle séparant « sur la parcelle » de « mitoyen (contexte) ».
--
-- POURQUOI : le bâti du schéma « Bâtiments et projection » est sélectionné par ST_Intersects(b.geom, empreinte) — donc « touche
-- l'empreinte ». Paris étant massivement mitoyen, un gros immeuble VOISIN accolé par un mur (aire réelle dans l'empreinte ≈ 0 m²)
-- ressort au même titre qu'un bâtiment réellement SUR la parcelle. On GARDE ces mitoyens (un immeuble accolé crée précisément du
-- vis-à-vis) mais on les QUALIFIE « contexte » (et non candidats à l'affectation). Ce seuil est l'aire d'intersection minimale, en m²,
-- au-dessus (ou égale) de laquelle un polygone est réputé « sur la parcelle ». En dessous : « mitoyen (contexte) ». RIEN n'est écarté :
-- la qualification ne change QUE le rendu, jamais le critère de sélection.
--
-- OÙ : `config_veille` (singleton id=1), FRÈRE des seuils spatiaux du rattachement (rattachement_seuil_surface_pct / _bordure_pct /
-- marge_altitude_cm — migration 115 ; rattachement_seuil_recouvrement_pct — migration 166) : même table, même patron « valeur bornée,
-- lue au runtime avec repli sûr + provenance » (cf. app/lib/permis/projectionConfig.ts, sur le modèle de rattachementConfig.ts).
-- PAS dans config_scoring (moteur de score / golden), PAS une constante en dur.
--
-- ENCODAGE : `numeric` en m² (défaut 0,5 — « toute intersection réelle non nulle »), pour porter nativement une valeur fractionnaire.
--   Plage [0 ; 1000] m². Le code compare aire_m2 >= seuil_m2 (borne INCLUSE = « sur la parcelle »).
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline idempotent). Ne touche NI le moteur de verdict SVAV, NI le
-- golden, NI une ligne existante. Idempotente. Requiert `config_veille`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/203_config_veille_projection_mitoyen_seuil.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (elle reste en attente d'application).

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS projection_mitoyen_seuil_aire_m2 numeric NOT NULL DEFAULT 0.5
    CHECK (projection_mitoyen_seuil_aire_m2 >= 0 AND projection_mitoyen_seuil_aire_m2 <= 1000);

COMMENT ON COLUMN config_veille.projection_mitoyen_seuil_aire_m2 IS
  'PROJ-MIT — seuil (m²) d''AIRE RÉELLE d''intersection avec l''empreinte du permis, séparant « sur la parcelle » (aire ≥ seuil) de « mitoyen (contexte) » (aire < seuil, ex. immeuble voisin accolé par un mur, aire ≈ 0). Défaut 0,5 (toute intersection réelle non nulle). Ne CHANGE PAS le critère de sélection du bâti (ST_Intersects) : rien n''est écarté, seul le RENDU distingue le contexte. Lu au runtime (lireSeuilMitoyenAireM2) avec repli sûr si la colonne est absente. N''alimente NI le verdict NI une altitude.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne + défaut + NOT NULL :'
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name = 'projection_mitoyen_seuil_aire_m2';
\echo '>>> CHECK (plage de validation) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%projection_mitoyen%';
\echo '>>> valeur courante (singleton) :'
SELECT projection_mitoyen_seuil_aire_m2 FROM config_veille WHERE id = 1;
