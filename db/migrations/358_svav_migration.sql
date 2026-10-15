-- 358_svav_migration.sql
-- Lot « MISE À JOUR DE LA PROD EN UNE COMMANDE », lot 2 (décision d'Arno du 15/10/2026).
--
-- POURQUOI : jusqu'ici, aucune trace en base des migrations appliquées — chacune était passée à la main (psql -f).
-- La mise à jour automatique doit appliquer les migrations NOUVELLES et seulement elles : il lui faut un registre.
-- Une ligne par fichier de db/migrations appliqué : nom, empreinte SHA-256 du contenu au moment de l'application
-- (un fichier modifié ensuite se voit), moment, origine, commit déployé, durée.
--
-- ORIGINE : « amorcage » = déjà appliquée avant l'existence du registre, inscrite par scripts/migrations-amorcer.ts
-- au vu de l'état réel de la base ; « mise_a_jour » = appliquée par la mise à jour de la prod ; « ecartee » = JAMAIS
-- appliquée, mise de côté sur décision d'Arno à l'amorçage (la mise à jour ne la tente pas et le rappelle à chaque
-- passage). Constaté le 15/10/2026 : 148, 212, 216 et 262 n'ont jamais été appliquées sur la base du Mac.
--
-- NE PAS APPLIQUER À LA MAIN : l'amorçage l'applique lui-même, dans la même transaction que l'inscription des
-- migrations existantes (npm run migrations:amorcer). Pas de BEGIN/COMMIT ici pour cette raison.
-- SANS RISQUE sur une base en service : une table neuve et vide. IDEMPOTENTE.

CREATE TABLE IF NOT EXISTS svav_migration (
  fichier       text         PRIMARY KEY CHECK (fichier ~ '^[0-9]{3,}_[a-z0-9_]+\.sql$'),
  sha256        text         NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  appliquee_le  timestamptz  NOT NULL DEFAULT now(),
  origine       text         NOT NULL CHECK (origine IN ('amorcage', 'mise_a_jour', 'ecartee')),
  commit_git    text         CHECK (commit_git IS NULL OR commit_git ~ '^[0-9a-f]{7,40}$'),
  duree_ms      integer      CHECK (duree_ms IS NULL OR duree_ms >= 0)
);

COMMENT ON TABLE svav_migration IS
  'Registre des migrations db/migrations appliquées (lot mise à jour de la prod, 15/10/2026) — la mise à jour n''applique que les fichiers absents d''ici.';
