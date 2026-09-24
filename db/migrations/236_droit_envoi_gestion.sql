-- 236_droit_envoi_gestion.sql — DROIT COMPLÉMENTAIRE « peut envoyer des mails au nom de gestion@criterimmo.fr ». LOT 5-DROITS.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — LIRE LE COURRIER ET ÉCRIRE AU NOM DE L'AGENCE NE SONT PAS LE MÊME MÉTIER.
--
-- `perm_gestion` ouvre aujourd'hui TOUT le module : lire les mails, trier, classer, rattacher à une carte. Le lot 5e y ajoutera
-- l'ENVOI. Or trier du courrier et signer un mail au nom de gestion@criterimmo.fr n'engagent pas la même chose : le premier est
-- interne et réversible, le second part chez un locataire, un artisan, un propriétaire, et ne se rattrape pas. Décision d'Arno du
-- 24/09/2026 : deux droits distincts.
--
-- 🔴 TROIS ÉTATS, ET C'EST TOUT L'OBJET DE CETTE MIGRATION — la colonne est NULLABLE, à dessein :
--     · `true`  = OUI, cette personne peut écrire au nom de gestion@ ;
--     · `false` = NON, elle lit et trie, elle n'écrit pas ;
--     · `NULL`  = « À DÉCIDER ». C'est l'état des collaborateurs qui ont DÉJÀ `perm_gestion` au moment où cette migration passe :
--                 personne ne leur a jamais posé la question, et le système ne doit pas y répondre à leur place.
--
--   « À décider » VAUT NON tant que la réponse n'est pas donnée (`capaciteEnvoiGestion`, app/lib/admin/comptes.ts) : on ne laisse
--   jamais un droit d'écriture s'ouvrir par défaut. Mais il est SIGNALÉ sur la fiche, en toutes lettres et pas par une couleur
--   seule, pour qu'on sache qu'une décision est en attente — un NON silencieux et un NON assumé ne se valent pas.
--
--   ⚠️ C'est pour cela qu'il n'y a NI `NOT NULL`, NI `DEFAULT false`, contrairement aux neuf colonnes `perm_*` existantes. Un
--   `DEFAULT false` répondrait « non » à la place d'Arno pour tous les comptes d'aujourd'hui, et effacerait pour toujours la
--   distinction entre « on a décidé que non » et « on n'a pas encore décidé ». C'est exactement l'erreur qu'on évite.
--
-- CE QUI NE CHANGE PAS : les neuf colonnes `perm_*` existantes, leurs valeurs, et l'effet de `perm_permis_modif`. Ce lot ne touche
--   qu'à l'AFFICHAGE de ce dernier (regroupement sous sa tuile), jamais à ce qu'il autorise.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL ADDITIVE — une colonne NULLABLE sans DEFAULT (donc aucune réécriture de table : changement de catalogue seul) et un
--   index partiel qui sert l'écran d'administration. Aucune ligne existante n'est modifiée. Aucun DROP de table, aucun DELETE,
--   aucun UPDATE. Ne touche NI le module Permis (ni `perm_permis`, ni `perm_permis_modif`), NI le moteur SVAV, NI le verdict, NI
--   le golden Asnières (29.107259068449615). Une transaction. Idempotente.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/236_droit_envoi_gestion.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- NULLABLE et SANS DEFAULT : c'est le NULL qui porte « à décider » (voir l'encadré ci-dessus).
ALTER TABLE admin_utilisateur
  ADD COLUMN IF NOT EXISTS perm_gestion_envoi boolean;

COMMENT ON COLUMN admin_utilisateur.perm_gestion_envoi IS
  'LOT 5-DROITS — droit complémentaire de la tuile Gestion : envoyer des mails au nom de gestion@criterimmo.fr. true = oui ; false = non ; NULL = « à décider » (question jamais posée). NULL VAUT NON pour l''envoi, mais il est signalé à l''écran : un non silencieux et un non assumé ne se valent pas. Sans objet si perm_gestion est false. Un administrateur a le droit implicitement, sans case à cocher.';

-- L'écran d'administration demande « qui reste à décider ? » à chaque affichage de la liste. Index PARTIEL : il ne contient que
--   les comptes concernés, et se vide à mesure qu'Arno répond.
CREATE INDEX IF NOT EXISTS admin_utilisateur_envoi_a_decider_idx
  ON admin_utilisateur (id) WHERE perm_gestion IS TRUE AND perm_gestion_envoi IS NULL;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① la colonne existe, elle est NULLABLE et SANS défaut :'
--   SELECT column_name, data_type, is_nullable, coalesce(column_default, 'AUCUN') AS defaut
--     FROM information_schema.columns
--    WHERE table_name = 'admin_utilisateur' AND column_name = 'perm_gestion_envoi';
--
-- \echo '>>> ② qui a l''accès Gestion, et où en est la question de l''envoi :'
--   SELECT identifiant, role,
--          CASE WHEN role = 'administrateur'   THEN 'oui (implicite, administrateur)'
--               WHEN perm_gestion IS NOT TRUE  THEN 'sans objet (pas d''accès Gestion)'
--               WHEN perm_gestion_envoi IS TRUE  THEN 'oui'
--               WHEN perm_gestion_envoi IS FALSE THEN 'non'
--               ELSE 'À DÉCIDER' END AS envoi
--     FROM admin_utilisateur ORDER BY role, lower(identifiant);
--
-- \echo '>>> ③ les neuf droits existants n''ont pas bougé (aucune valeur NULL n''est apparue) :'
--   SELECT count(*) FILTER (WHERE perm_gestion IS NULL) AS gestion_null,
--          count(*) FILTER (WHERE perm_permis_modif IS NULL) AS permis_modif_null
--     FROM admin_utilisateur;   -- attendu : 0 et 0
--
-- \echo '>>> ④ l''index de suivi est là, et le planificateur le PREND :'
--   EXPLAIN (ANALYZE, BUFFERS)
--     SELECT id FROM admin_utilisateur WHERE perm_gestion IS TRUE AND perm_gestion_envoi IS NULL;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (personne ne perd un droit existant : cette colonne n'en contient aucun qui préexistait) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     DROP INDEX IF EXISTS admin_utilisateur_envoi_a_decider_idx; \
--     ALTER TABLE admin_utilisateur DROP COLUMN IF EXISTS perm_gestion_envoi; \
--     COMMIT;"
--   (le code retombe alors tout seul sur le comportement d'avant : la sonde `droitEnvoiGestionDisponible` répondra « non »,
--    et SEULS les administrateurs pourront envoyer.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
