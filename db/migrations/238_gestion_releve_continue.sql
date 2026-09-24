-- 238_gestion_releve_continue.sql — MODULE « GESTION » : l'intervalle de la relève CONTINUE, réglable en base. LOT 5-DIRECT.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — LE COURRIER METTAIT 25 HEURES À APPARAÎTRE.
--
-- MESURÉ sur la vraie base (200 messages les plus récemment reçus, hors rapatriement) : entre l'heure d'un message et l'heure où
-- nous l'avions capturé, la MÉDIANE était de 1 500 minutes — vingt-cinq heures. Maximum : 26 h 12. La cause n'est pas une lenteur,
-- c'est une absence : la relève Gestion n'avait AUCUN déclencheur automatique. Elle ne tournait que lorsqu'Arno cliquait
-- « Relever maintenant » (`app/(admin)/api/admin/gestion/relever/route.ts`, dont l'en-tête dit « DÉCLENCHEUR MANUEL ») ou
-- lorsqu'on lançait le CLI. La veille Sitadel, elle, a son déclencheur launchd depuis le chantier S11b ; la gestion n'en a jamais eu.
--
-- Ce que cette migration ajoute est donc minuscule mais décide de tout : À QUELLE FRÉQUENCE le processus continu redemande. Le
-- réglage vit en base pour se changer sans redéploiement — même principe que les huit autres réglages de `gestion_config` depuis
-- la migration 228.
--
-- LE DÉFAUT EST 60 SECONDES. Un mail apparaît donc dans la minute, et Gmail reçoit une interrogation par minute — très en deçà de
-- ce qu'il tolère. Les bornes [15 s, 3600 s] sont posées EN BASE (CHECK) autant que dans le code
-- (`intervalleContinuValide`, app/lib/gestion/config.ts) : en dessous de 15 s on harcèle le serveur pour un gain que personne ne
-- perçoit ; au-delà d'une heure, ce n'est plus une relève continue.
--
-- ⚠️ SANS CETTE MIGRATION, TOUT FONCTIONNE QUAND MÊME. `chargerConfigGestion` se replie sur 60 s quand la colonne n'existe pas
-- (le repli 42703 posé au lot 3-quater, hors transaction). La relève continue peut donc être lancée AVANT d'appliquer ceci ; la
-- migration ne sert qu'à pouvoir changer l'intervalle sans toucher au code.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL ADDITIVE — une colonne avec DEFAULT et CHECK, sur une table qui contient UNE seule ligne (singleton id=1). Aucune
--   autre table touchée, aucun DROP, aucun DELETE. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le golden
--   Asnières (29.107259068449615). Une transaction. Idempotente.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/238_gestion_releve_continue.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_config
  ADD COLUMN IF NOT EXISTS releve_continue_secondes integer NOT NULL DEFAULT 60;

-- Les bornes en BASE autant que dans le code : un réglage se change en SQL, et rien ne garantit qu'il passera par le code.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_releve_continue_chk') THEN
    ALTER TABLE gestion_config
      ADD CONSTRAINT gestion_config_releve_continue_chk
      CHECK (releve_continue_secondes BETWEEN 15 AND 3600);
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.releve_continue_secondes IS
  'LOT 5-DIRECT — intervalle, en secondes, entre deux passes de la relève CONTINUE (npm run gestion:relever-continu). Défaut 60 : un mail apparaît dans la minute. Bornes 15 à 3600, tenues ici ET dans app/lib/gestion/config.ts. Sans cette colonne, le code se replie sur 60 s — la relève continue fonctionne donc avant même que cette migration soit appliquée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① la colonne existe, avec son défaut :'
--   SELECT releve_continue_secondes FROM gestion_config WHERE id = 1;   -- attendu : 60
--
-- \echo '>>> ② les bornes MORDENT (les deux doivent ÉCHOUER) :'
--   BEGIN; UPDATE gestion_config SET releve_continue_secondes = 5    WHERE id = 1; ROLLBACK;
--   BEGIN; UPDATE gestion_config SET releve_continue_secondes = 7200 WHERE id = 1; ROLLBACK;
--
-- \echo '>>> ③ le décalage se résorbe-t-il ? (à relancer quelques heures après avoir activé la relève continue) :'
--   SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (cree_le - recu_le))/60)) AS mediane_minutes
--     FROM (SELECT cree_le, recu_le FROM gestion_message
--            WHERE cree_le - recu_le < interval '30 days' ORDER BY recu_le DESC LIMIT 200) x;
--   -- Avant ce lot : 1500 minutes (25 h). Attendu avec la relève continue active : quelques minutes.
--
-- \echo '>>> ④ pour changer l''intervalle (exemple : toutes les 30 secondes) :'
--   UPDATE gestion_config SET releve_continue_secondes = 30, maj_le = now() WHERE id = 1;
--   -- Pris en compte à la passe suivante : le processus relit la configuration à chaque tour, il n'y a rien à redémarrer.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (la relève continue retombe sur 60 s, elle ne s'arrête pas) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE gestion_config DROP CONSTRAINT IF EXISTS gestion_config_releve_continue_chk; \
--     ALTER TABLE gestion_config DROP COLUMN IF EXISTS releve_continue_secondes; \
--     COMMIT;"
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
