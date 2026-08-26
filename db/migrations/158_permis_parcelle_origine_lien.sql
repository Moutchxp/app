-- 158_permis_parcelle_origine_lien.sql — PARC-1 : distinguer l'ORIGINE DU LIEN parcelle↔dossier (première main vs déduit).
--
-- CONTEXTE : `permis_parcelle` contient aujourd'hui 6 lignes (2 dossiers) issues de la LECTURE DU CERFA (donnée de première
-- main, fiable). Un lot ultérieur y ajoutera des liens DÉDUITS de la référence cadastrale Sitadel (rapprochement ~fiable à
-- ~63 %). Ces deux provenances ne doivent JAMAIS se confondre ni s'écraser.
--
-- ⚠️ La colonne EXISTANTE `origine` (CHECK 'saisie'/'extraite') a une AUTRE sémantique : elle dit COMMENT la valeur cadastrale du
-- Cerfa a été capturée (saisie humaine vs OCR). Elle ne peut pas porter la valeur 'cadastral'. On ajoute donc une colonne DÉDIÉE.
--
-- CE LOT AJOUTE une colonne, strictement ADDITIVE :
-- · permis_parcelle.origine_lien text NOT NULL DEFAULT 'instruit', CHECK ('instruit','cadastral').
--   'instruit'  = lien établi par lecture du Cerfa (première main) — les 6 lignes existantes le reçoivent via le DEFAULT.
--   'cadastral' = lien DÉDUIT de la référence cadastrale Sitadel (fiabilité moindre) — écrit par la CLI `permis:rapprocher-parcelles`.
--   DÉFAUT 'instruit' = choix SÛR : une ligne non étiquetée est traitée comme première main → JAMAIS écrasée par un lien cadastral
--   (la CLI n'insère un 'cadastral' que s'il n'existe RIEN sur la paire dossier/parcelle ; elle ne touche jamais une ligne existante).
--
-- 🔴 GARDE : ne touche NI le moteur de verdict, NI le golden Asnières, NI aucune altitude. Aucune donnée réécrite (le DEFAULT
--    remplit les 6 lignes existantes en 'instruit', valeur voulue). Additive, idempotente, une seule transaction. AUCUN ENVOI.
--    Requiert permis_parcelle (112). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/158_permis_parcelle_origine_lien.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_parcelle ADD COLUMN IF NOT EXISTS origine_lien text NOT NULL DEFAULT 'instruit';
DO $$ BEGIN
  ALTER TABLE permis_parcelle ADD CONSTRAINT permis_parcelle_origine_lien_chk CHECK (origine_lien IN ('instruit', 'cadastral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN permis_parcelle.origine_lien IS
  'PARC-1 — origine du LIEN parcelle↔dossier. ''instruit'' = lecture du Cerfa (première main, fiable) ; ''cadastral'' = déduit de la référence cadastrale Sitadel (fiabilité ~63 %, à vérifier). Un lien ''instruit'' n''est JAMAIS remplacé par un lien ''cadastral'' sur la même paire dossier/parcelle. Défaut ''instruit'' = sûr (jamais écrasé). Distinct de la colonne ''origine'' (''saisie''/''extraite'') qui dit comment la valeur Cerfa a été capturée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT origine_lien, count(*) FROM permis_parcelle GROUP BY 1;   -- attendu : instruit=6
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='permis_parcelle_origine_lien_chk'; -- IN ('instruit','cadastral')
