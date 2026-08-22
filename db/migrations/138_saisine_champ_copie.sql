-- 138_saisine_champ_copie.sql — CADA lot A : TRACE des copies champ-par-champ de la carte de saisine CADA.
--
-- CONTEXTE : la carte de saisine CADA offre un bouton « Copier » PAR CHAMP du formulaire. Chaque copie laisse une trace
-- (marquage visuel « déjà copié » + historique d'ouverture). Une SEULE ligne vivante par (saisine, champ) : recopier le même
-- champ MET À JOUR l'horodatage, n'empile pas. ⚠️ Ce n'est qu'un INDICE d'intention : copier n'est PAS déposer — le marquage
-- « déposée » reste le geste explicite existant (demande_relance.statut='envoyee'), jamais écrit ici.
--
-- ① saisine_champ_copie (saisine_id → demande_relance, champ_cle text, copie_le, admin_id → admin_utilisateur nullable).
--    UNIQUE (saisine_id, champ_cle) → l'upsert (ON CONFLICT) rafraîchit copie_le/admin_id sans dupliquer. FK ON DELETE CASCADE
--    sur la saisine (une saisine supprimée emporte ses traces) ; admin_id ON DELETE SET NULL (la trace survit à un compte supprimé).
--    champ_cle N'A PAS de CHECK : la liste des champs est la liste FERMÉE du code (carteCadaChamps.CLES_CHAMPS_CADA), validée à
--    l'écriture ; un CHECK en base serait une 2e vérité à maintenir à chaque évolution du formulaire (et une valeur inconnue est
--    inoffensive — simple trace).
--
-- ADDITIVE / SÛRE : une CREATE TABLE IF NOT EXISTS + 2 FK + 1 index unique. Aucune donnée touchée, aucun DROP/DELETE/TRUNCATE,
-- aucun trigger. N'affecte NI le moteur de score, NI config_scoring, NI le golden. Une seule transaction. Rejouable.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/138_saisine_champ_copie.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS saisine_champ_copie (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  saisine_id bigint NOT NULL REFERENCES demande_relance(id) ON DELETE CASCADE,
  champ_cle  text   NOT NULL,
  copie_le   timestamptz NOT NULL DEFAULT now(),
  admin_id   bigint REFERENCES admin_utilisateur(id) ON DELETE SET NULL,
  UNIQUE (saisine_id, champ_cle)
);

COMMENT ON TABLE saisine_champ_copie IS
  'CADA lot A — trace des copies champ-par-champ de la carte de saisine CADA. Une ligne vivante par (saisine, champ) : la copie MET À JOUR copie_le/admin_id (upsert). INDICE d''intention seulement — copier n''est pas déposer (le marquage « déposée » = demande_relance.statut, jamais écrit ici).';
COMMENT ON COLUMN saisine_champ_copie.saisine_id IS 'La saisine CADA concernée = demande_relance.id (type=''saisine_cada'').';
COMMENT ON COLUMN saisine_champ_copie.champ_cle IS 'Clé STABLE du champ du formulaire (carteCadaChamps.CLES_CHAMPS_CADA) — liste fermée validée par le code.';
COMMENT ON COLUMN saisine_champ_copie.admin_id IS 'Compte administrateur ayant copié (admin_utilisateur.id) ; NULL si voie de secours ou compte supprimé.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① table + colonnes :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'saisine_champ_copie' ORDER BY ordinal_position;
\echo '>>> ② unicité (saisine_id, champ_cle) + FKs :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'saisine_champ_copie'::regclass ORDER BY conname;
