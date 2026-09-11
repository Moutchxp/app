-- 218_permis_nb_batiments_valide.sql — BAT-1 : NOMBRE DE BÂTIMENTS VALIDÉ (distinct du nombre DÉTECTÉ), niveau permis.
--
-- POURQUOI : « Bâtiments identifiés : N » est un DÉCOMPTE d'affichage (corps.length), jamais stocké ; le nombre de bâtiments n'existe
-- qu'en trace d'audit (nb_batiments_declares). BAT-1 introduit un nombre VALIDÉ — une décision — distinct du nombre détecté (qui peut
-- évoluer). Il gouverne l'auto-création des cartes de bâtiment et (BAT-2) l'état de cohérence de la section « Caractéristiques et
-- bâtiments d'origine ». NULL = pas encore validé, à DISTINGUER de 0 (aucun bâtiment). Trace _le/_par sur le patron du sommet confirmé.
--
-- SÛR : DDL additive, IDEMPOTENTE (ADD COLUMN IF NOT EXISTS). N'écrit AUCUNE donnée (aucun UPDATE/DELETE/TRUNCATE/DROP). Le code est
-- RÉSILIENT si ces colonnes MANQUENT (sonde de disponibilité to_regclass-like → l'auto-création est un NO-OP complet, aucune carte
-- créée). Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/218_permis_nb_batiments_valide.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS nb_batiments_valide     integer;      -- NULL = pas encore validé (≠ 0)
ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS nb_batiments_valide_le  timestamptz;  -- horodatage de la validation
ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS nb_batiments_valide_par text;         -- auteur (id admin / 'analyse:auto' / …)

-- Borne de sûreté : jamais négatif (0 autorisé, NULL autorisé). Idempotente.
ALTER TABLE permis_caracteristique DROP CONSTRAINT IF EXISTS permis_carac_nb_batiments_valide_chk;
ALTER TABLE permis_caracteristique ADD  CONSTRAINT permis_carac_nb_batiments_valide_chk CHECK (nb_batiments_valide IS NULL OR nb_batiments_valide >= 0);

COMMENT ON COLUMN permis_caracteristique.nb_batiments_valide IS
  'BAT-1 — nombre de bâtiments VALIDÉ (décision), distinct du nombre DÉTECTÉ (corps.length). NULL = pas encore validé (≠ 0). Accepté par défaut = N détecté à la 1re analyse ; jamais recalculé par-dessus une décision humaine.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
\echo '>>> Colonnes nb_batiments_valide* après 218 (attendu : integer, timestamptz, text) :'
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'permis_caracteristique' AND column_name LIKE 'nb_batiments_valide%' ORDER BY column_name;
