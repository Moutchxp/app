-- 173_config_veille_exclusions_signature.sql — PART-1 : deux listes d'EXCLUSION (pilotage sans code) pour cesser de prendre notre
-- propre signature citée par une mairie pour du contenu de mairie.
--
-- ⚠️ POURQUOI (recon du 29/08, permis 0930012500081) : quand une mairie répond en CITANT notre message, notre signature revient —
-- le logo de l'agence est arrivé en PIÈCE (5× Auber-Rouge.png, byte-identiques) et son URL googleusercontent a été marquée « lien
-- fort », alors qu'aucun lien de téléchargement de mairie n'a jamais été reçu sur ce dossier. Deux garde-fous, tous deux CONFIG :
--
-- ═══ ① liens_hotes_non_fort — hôtes qui ne peuvent JAMAIS porter un « lien fort » ══════════════════════════════════════════════════
--   Un lien dont l'hôte est le nôtre (ou un hébergeur de NOS propres actifs, ex. googleusercontent utilisé par une signature Gmail
--   citée) n'est jamais un lien de téléchargement de mairie. Liste d'hôtes (virgules), comparaison par SUFFIXE de domaine. Le module
--   d'extraction (extractionLiens) reste PUR : l'appelant lui passe cette liste. Défaut sensé : nos deux hôtes connus.
--   ⚠️ N'ÉLARGIT PAS depot_adresses_connues (voie d'admission « adresse connue ») : concept distinct.
--
-- ═══ ② pieces_hachages_exclus — hachages sha256 d'actifs PROPRES à écarter du versement GED ═══════════════════════════════════════
--   Critère DÉTERMINISTE et content-based (jamais le nom de fichier) : une pièce dont l'empreinte sha256 figure ici est une image de
--   NOTRE signature (logo) citée, pas un document du permis → jamais versée en GED. Liste (virgules). Défaut sensé : le hachage du
--   logo de signature de l'agence (Auber-Rouge.png) constaté en base. Éditable : Arno ajoute un hachage si la signature change.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur de verdict SVAV, NI le golden Asnières (29.107259068449615), NI une altitude, NI
--    config_scoring, NI les gardes ETAN-1, NI aucune donnée existante (ne SUPPRIME rien : classement/affichage seulement).
--
-- SÛR : ADD COLUMN « IF NOT EXISTS » (text NOT NULL DEFAULT). Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une
-- seule transaction. Requiert config_veille (048). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/173_config_veille_exclusions_signature.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS liens_hotes_non_fort text NOT NULL DEFAULT 'googleusercontent.com,sansvisavis.com',
  ADD COLUMN IF NOT EXISTS pieces_hachages_exclus text NOT NULL DEFAULT 'e03ddb3adb387cd05867a7bf35fc731acc9a5a31075b3bf5cef1e9f5719b88e9';

COMMENT ON COLUMN config_veille.liens_hotes_non_fort IS
  'PART-1 — hôtes (virgules) qui ne peuvent JAMAIS porter un « lien fort » : les nôtres et les hébergeurs de nos propres actifs (ex. googleusercontent d''une signature Gmail citée). Comparaison par suffixe de domaine. Lu au runtime avec repli sûr. N''a rien à voir avec depot_adresses_connues.';
COMMENT ON COLUMN config_veille.pieces_hachages_exclus IS
  'PART-1 — hachages sha256 (virgules) d''actifs PROPRES (logo de signature) à NE JAMAIS verser en GED, même cités en pièce par une mairie. Critère déterministe par CONTENU (pas le nom). Défaut : le logo Auber-Rouge.png constaté en base. Lu au runtime avec repli sûr.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE) :
\echo '>>> colonnes exclusions (type + défaut + NOT NULL) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name IN ('liens_hotes_non_fort','pieces_hachages_exclus') ORDER BY column_name;
\echo '>>> valeurs courantes (singleton) :'
SELECT liens_hotes_non_fort, pieces_hachages_exclus FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS liens_hotes_non_fort; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS pieces_hachages_exclus; \
--     COMMIT;"
