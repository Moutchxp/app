-- 230_gestion_reconnexion.sql — MODULE « GESTION » : REPRISE AUTOMATIQUE après une coupure réseau. LOT 3-quater.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — DEUX ESSAIS, DEUX COUPURES, À DES ENDROITS DIFFÉRENTS.
--
-- Essai 1 : coupure « Socket timeout » au message 363 sur 400 (362 capturés). Essai 2, sur les MÊMES 400 messages une heure plus
-- tard : coupure au message 131, avec des compteurs identiques jusqu'au 125ᵉ. Ce n'est donc PAS un message qui fait tomber la
-- connexion : c'est le serveur (ou le réseau) qui cesse de répondre plus de cinq minutes, à un moment VARIABLE.
--
-- Contre un incident variable, s'arrêter n'est pas la bonne réponse : il faut se reconnecter et reprendre. Le lot 3-ter a rendu la
-- panne VISIBLE et non destructrice (plus de processus tué, plus de faux succès) ; celui-ci la rend SURMONTABLE.
--
-- CE QUI EST PILOTÉ ICI, ET POURQUOI EN BASE : le nombre de tentatives et le délai entre elles dépendent d'une qualité de réseau
-- qu'aucun code ne peut deviner — ils se règlent en regardant ce qui se passe, sans redéploiement. Les deux bornes sont dans les
-- CHECK, que l'écran de réglage lira plutôt que de les recopier.
--
-- ⚠️ `reconnexions_max = 0` REND EXACTEMENT LE COMPORTEMENT D'AVANT (aucune reprise, arrêt propre à la première coupure). C'est la
-- porte de sortie si la reprise se révélait indésirable : un réglage, pas un redéploiement.
--
-- 🔒 LA RELÈVE FONCTIONNE SANS CETTE MIGRATION. Tant qu'elle n'est pas appliquée, la lecture de configuration retombe sur les
-- mêmes valeurs par défaut (3 tentatives, 5 s) SANS perdre les autres réglages : la requête est rejouée sans les deux colonnes
-- quand PostgreSQL répond « colonne inconnue » (42703). Appliquer la 230 ne fait donc que rendre ces deux valeurs MODIFIABLES.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL strictement ADDITIVE — deux ADD COLUMN IF NOT EXISTS sur `gestion_config` (singleton), avec DEFAULT et CHECK NOMMÉ.
--   Aucune écriture de données, aucun DROP, aucun DELETE. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le
--   golden Asnières (29.107259068449615). Une seule transaction. Idempotente, rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/230_gestion_reconnexion.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Nombre maximum de RECONNEXIONS pour UNE passe (budget global, jamais remis à zéro en cours de passe : une liaison qui tombe
--   toutes les dix lectures doit finir par s'arrêter, pas tourner indéfiniment). 0 = aucune reprise (comportement d'avant).
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS reconnexions_max integer NOT NULL DEFAULT 3;

-- Délai de BASE avant une reconnexion, en secondes. Le délai RÉEL croît à chaque tentative (base, puis ×2, puis ×4 : 5 s, 10 s,
--   20 s avec le défaut) : réessayer aussitôt après une coupure ne fait que retomber dessus, et un serveur qui étrangle une
--   connexion rend la main d'autant plus vite qu'on le laisse respirer.
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS reconnexion_delai_s integer NOT NULL DEFAULT 5;

ALTER TABLE gestion_config DROP CONSTRAINT IF EXISTS gestion_config_reconnexion_chk;
ALTER TABLE gestion_config ADD CONSTRAINT gestion_config_reconnexion_chk
  CHECK (reconnexions_max BETWEEN 0 AND 10 AND reconnexion_delai_s BETWEEN 1 AND 300);

COMMENT ON COLUMN gestion_config.reconnexions_max IS
  'LOT 3-quater — nombre maximum de reconnexions pour UNE passe de relève. Budget GLOBAL (jamais remis à zéro en cours de passe) : une liaison qui tombe sans cesse doit finir par s''arrêter. 0 = aucune reprise, arrêt propre à la première coupure (comportement d''avant le lot). Défaut 3.';
COMMENT ON COLUMN gestion_config.reconnexion_delai_s IS
  'LOT 3-quater — délai de BASE avant une reconnexion, en secondes. Le délai réel CROÎT (base, ×2, ×4 : 5 s, 10 s, 20 s par défaut) : réessayer aussitôt ne fait que retomber sur la coupure. Défaut 5.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① les deux réglages existent, aux valeurs par défaut :'
--   SELECT reconnexions_max, reconnexion_delai_s FROM gestion_config WHERE id = 1;
--   -- attendu : 3 | 5   (soit trois reprises au plus, après 5 s, 10 s puis 20 s)
--
-- \echo '>>> ② les bornes sont EN BASE, lisibles par l''écran de réglage :'
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'gestion_config'::regclass AND conname = 'gestion_config_reconnexion_chk';
--
-- \echo '>>> ③ les bornes MORDENT (les deux doivent ÉCHOUER, et rien ne doit rester) :'
--   BEGIN;
--     UPDATE gestion_config SET reconnexions_max = 99 WHERE id = 1;     -- doit échouer (maximum 10)
--   ROLLBACK;
--   BEGIN;
--     UPDATE gestion_config SET reconnexion_delai_s = 0 WHERE id = 1;   -- doit échouer (minimum 1)
--   ROLLBACK;
--
-- \echo '>>> ④ le reste de la configuration est INTACT :'
--   SELECT dossier_imap, rattrapage_jours, plafond_par_passe, piece_taille_max_mo FROM gestion_config WHERE id = 1;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (la relève retombe alors sur ses valeurs de repli : 3 tentatives, 5 s) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE gestion_config DROP CONSTRAINT IF EXISTS gestion_config_reconnexion_chk; \
--     ALTER TABLE gestion_config DROP COLUMN IF EXISTS reconnexion_delai_s; \
--     ALTER TABLE gestion_config DROP COLUMN IF EXISTS reconnexions_max; \
--     COMMIT;"
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
