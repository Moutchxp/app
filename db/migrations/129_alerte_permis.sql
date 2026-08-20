-- 129_alerte_permis.sql — N10-B : registre d'idempotence des alertes au niveau PERMIS (indépendantes d'une réponse de mairie).
--
-- CONTEXTE : l'alerte « superstructures au-dessus de la toiture » est une alerte de PERMIS (le sommet retenu peut sous-estimer
-- l'obstacle, car le MNS LiDAR mesure la surface pleine la plus haute — une ombrière PV serait captée). La table `alerte_ged`
-- est VERROUILLÉE sur une réponse de mairie (reponse_id NOT NULL, CHECK type ∈ {j3,h24}) : y loger un concept étranger
-- pourrirait le schéma. On crée donc une petite table DÉDIÉE, générique pour de futures alertes permis-level. L'ENVOI reste
-- celui de G1 (transporteur, adresse d'alerte, URL signées) : seule la cheville d'idempotence est neuve.
--
-- IDEMPOTENCE : UNE alerte par (dossier, type) — l'UNIQUE + `ON CONFLICT DO NOTHING` garantit qu'une passe ne réémet jamais.
--
-- ⚠️ PAS de pré-ensemencement (décision Arno) : un seul permis porte aujourd'hui la réserve (07512024V0037), qui est
-- justement celui pour lequel l'alerte est demandée — pré-ensemencer éteindrait la seule alerte attendue. À N=1, aucune
-- avalanche à craindre (garde de comptage appliquée avant l'envoi). Toute alerte future part une fois, puis est journalisée ici.
--
-- ADDITIVE PURE : une table + un index unique, IF NOT EXISTS. Aucun UPDATE/DELETE/DROP, aucun trigger. Ne touche NI le moteur de
-- score ni aucune table existante. Repli applicatif : tant que la table n'existe pas, la passe d'alerte dégrade (lecture best-effort).
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/129_alerte_permis.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS alerte_permis (
  id         bigserial   PRIMARY KEY,
  dossier_id bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  type       text        NOT NULL CONSTRAINT alerte_permis_type_chk CHECK (type IN ('superstructures')),
  sujet      text,
  envoye_le  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE alerte_permis IS
  'N10-B — registre d''idempotence des alertes de niveau PERMIS (sans réponse de mairie). Une ligne = une alerte déjà partie pour (dossier_id, type). type=''superstructures'' : cotes au-dessus de la toiture retenue. L''envoi réutilise le mécanisme G1 ; cette table ne fait qu''empêcher la réémission.';

-- UNE alerte par (dossier, type) : le garde-fou dur derrière la vérification applicative « déjà envoyé ? ».
CREATE UNIQUE INDEX IF NOT EXISTS alerte_permis_uniq ON alerte_permis (dossier_id, type);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> table + colonnes :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'alerte_permis' ORDER BY ordinal_position;
\echo '>>> liste fermée du type + index unique :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'alerte_permis'::regclass AND contype = 'c';
SELECT indexdef FROM pg_indexes WHERE tablename = 'alerte_permis' AND indexname = 'alerte_permis_uniq';
\echo '>>> registre vide (aucun pré-ensemencement) :'
SELECT count(*) AS lignes FROM alerte_permis;
