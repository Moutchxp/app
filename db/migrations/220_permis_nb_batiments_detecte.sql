-- 220_permis_nb_batiments_detecte.sql — NOMBRE DE BÂTIMENTS DÉTECTÉ PAR L'ANALYSE (constat), niveau permis.
--
-- POURQUOI : « Futur(s) bâtiment(s) identifié(s) dans le permis : N (d'après les pièces) » affichait `corps.length` (un COMPTAGE des
-- cartes présentes) — il suivait donc les gestes MANUELS (+ ajouter / supprimer / « changer le nombre »), ce qui est faux : cette ligne
-- doit être un CONSTAT DE L'ANALYSE, immunisé contre tout geste manuel. On introduit un SNAPSHOT du nombre DÉTECTÉ, écrit UNIQUEMENT par
-- l'analyse (autocreerCartes, majPar 'analyse:auto' / 'rattrapage:*') = max(corps matérialisés au moment de l'analyse, décompte corroboré
-- du champ libre — LOT 69). Il ne bouge QU'À une nouvelle analyse ; les gestes manuels ne l'exécutent jamais. Distinct de
-- `nb_batiments_valide` (218, une DÉCISION, modifiable à la main) et du champ manuel « changer le nombre » (corrélé aux cartes réelles).
-- NULL = aucune analyse n'a encore posé de valeur (l'UI affiche alors « aucun bâtiment identifié dans les pièces », jamais corps.length).
--
-- SÛR : DDL additive, IDEMPOTENTE (ADD COLUMN IF NOT EXISTS). N'écrit AUCUNE donnée (aucun UPDATE/DELETE/TRUNCATE/DROP). Le code est
-- RÉSILIENT si ces colonnes MANQUENT : l'écriture (poserNombreBatimentsDetecte) est un NO-OP (try/catch) et la lecture
-- (lireNombreBatimentsDetecte) renvoie NULL → l'UI affiche « aucun bâtiment identifié dans les pièces », comportement neutre. Après
-- application, la valeur apparaît à la PROCHAINE analyse de chaque permis (aucun backfill). Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/220_permis_nb_batiments_detecte.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS nb_batiments_detecte     integer;      -- NULL = aucune analyse n'a posé de valeur
ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS nb_batiments_detecte_le  timestamptz;  -- horodatage de la dernière analyse ayant posé la valeur
ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS nb_batiments_detecte_par text;         -- auteur/origine ('analyse:auto' / 'rattrapage:*')

-- Borne de sûreté : jamais négatif (0 autorisé, NULL autorisé). Idempotente.
ALTER TABLE permis_caracteristique DROP CONSTRAINT IF EXISTS permis_carac_nb_batiments_detecte_chk;
ALTER TABLE permis_caracteristique ADD  CONSTRAINT permis_carac_nb_batiments_detecte_chk CHECK (nb_batiments_detecte IS NULL OR nb_batiments_detecte >= 0);

COMMENT ON COLUMN permis_caracteristique.nb_batiments_detecte IS
  'Nombre de bâtiments DÉTECTÉ par l''analyse (constat « d''après les pièces »), snapshot posé UNIQUEMENT par l''analyse (autocreerCartes). Immunisé contre les gestes manuels ; ne bouge qu''à une nouvelle analyse. Distinct de nb_batiments_valide (décision). NULL = aucune analyse n''a posé de valeur.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
\echo '>>> Colonnes nb_batiments_detecte* après 220 (attendu : integer, timestamptz, text) :'
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'permis_caracteristique' AND column_name LIKE 'nb_batiments_detecte%' ORDER BY column_name;
