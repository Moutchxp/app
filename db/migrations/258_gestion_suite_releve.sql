-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 258 — LOT RATTACHEMENT-2 : CE QUE LA PASSE A FAIT *APRÈS* AVOIR RELEVÉ LE COURRIER.
--
-- ═══ CE QU'ELLE SERT À ══════════════════════════════════════════════════════════════════════════════════════════
-- Depuis ce lot, une passe de relève ne s'arrête plus à l'import : elle enchaîne le relevé des adresses des messages
-- nouveaux, puis le rattachement des échanges touchés. Cet enchaînement peut échouer tout seul — l'annuaire est
-- absent, une migration manque, une requête tombe — SANS que la relève du courrier, elle, ait échoué.
--
-- 🔴 IL FAUT DONC UN ENDROIT OÙ LE DIRE QUI NE MENTE PAS. Écrire ce motif dans `gestion_releve_run.erreur` ferait
-- passer pour ratée une passe qui a parfaitement rapatrié le courrier, et le bandeau de veille crierait à tort — la
-- pire des alertes, celle qu'on apprend à ignorer. Trois colonnes SÉPARÉES, donc, avec leur propre verdict.
--
-- ⚠️ SANS CETTE MIGRATION, TOUT FONCTIONNE QUAND MÊME. La sonde de schéma (`suiteReleveDisponible`) le vérifie avant
-- d'écrire : l'enchaînement tourne, et son échec éventuel est consigné dans `gestion_journal` (entité
-- « rattachement », action « suite »). Ce qui manque alors, et seulement cela : la ligne du bandeau qui le signale.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE N'EST ÉCRITE : elle ajoute trois colonnes vides.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/258_gestion_suite_releve.sql
--
-- ⚠️ ELLE NE CRÉE AUCUN INDEX, ET C'EST UNE DÉCISION MESURÉE le 26/09/2026. La question posée à chaque passe —
-- « quels messages n'ont aucune adresse relevée ? » — a d'abord été écrite en anti-jointure sur toute la table :
-- 124 ms, dont un balayage séquentiel complet de `gestion_message` (9 564 pages), une fois par minute pour découvrir
-- le plus souvent qu'il n'y a rien à faire. Bornée aux 1 000 derniers identifiants et la borne passée en PARAMÈTRE
-- (et non en sous-requête, que le planificateur ne sait pas constanter), la même question coûte 4,8 ms sur
-- `gestion_message_pkey` et `gestion_message_adresse_msg_idx`, tous deux déjà en place. Un index de plus n'aurait
-- rien accéléré et aurait fallu être maintenu à chaque écriture.
--
-- POUR REVENIR EN ARRIÈRE (l'enchaînement continue de tourner ; seul le bandeau redevient muet) :
--   ALTER TABLE gestion_releve_run DROP COLUMN IF EXISTS suite_resultat,
--     DROP COLUMN IF EXISTS suite_detail, DROP COLUMN IF EXISTS suite_ms;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_rattachement') IS NULL THEN
    RAISE EXCEPTION 'La migration 257 (rattachements) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

-- ── ① LE VERDICT DE L'ENCHAÎNEMENT, À CÔTÉ DE CELUI DE LA RELÈVE ────────────────────────────────────────────────
ALTER TABLE gestion_releve_run
  -- NULL = l'enchaînement n'a pas eu lieu (passe en simulation, passe d'avant ce lot). 'ignore' = il n'y avait rien
  -- à faire, ce qui est son état ordinaire : la plupart des passes ne rapportent aucun message nouveau.
  ADD COLUMN IF NOT EXISTS suite_resultat text,
  ADD COLUMN IF NOT EXISTS suite_detail   text,
  -- Le temps AJOUTÉ à la passe, en millisecondes. Mesuré et gardé : c'est la seule façon de répondre plus tard à
  -- « la relève est-elle devenue plus lente depuis ce lot ? » sans avoir à le refaire à la main.
  ADD COLUMN IF NOT EXISTS suite_ms       integer;

ALTER TABLE gestion_releve_run DROP CONSTRAINT IF EXISTS gestion_releve_run_suite_chk;
ALTER TABLE gestion_releve_run
  ADD CONSTRAINT gestion_releve_run_suite_chk
  CHECK (suite_resultat IS NULL OR suite_resultat IN ('ok', 'erreur', 'ignore'));

COMMENT ON COLUMN gestion_releve_run.suite_resultat IS
  'LOT RATTACHEMENT-2 — issue de l''enchaînement adresses + rattachement, DISTINCTE de `resultat` qui ne juge que '
  'l''import du courrier. Un échec ici ne rend pas la passe ratée : le courrier est bien arrivé.';
COMMENT ON COLUMN gestion_releve_run.suite_ms IS
  'LOT RATTACHEMENT-2 — durée AJOUTÉE à la passe par l''enchaînement, en millisecondes.';

COMMIT;
