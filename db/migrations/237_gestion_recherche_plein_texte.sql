-- 237_gestion_recherche_plein_texte.sql — MODULE « GESTION » : chercher dans tout le courrier. LOT 5c.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — CHERCHER « FUITE MARCEAU » DANS 56 000 MAILS EST AUJOURD'HUI IMPOSSIBLE.
--
-- Le module sait chercher une CARTE (titre, demandeur, adresse) depuis le lot 4d. Il ne sait pas chercher un MAIL : ni par objet,
-- ni par contenu, ni par correspondant. Sur une boîte de 56 000 messages, c'est la fonction qui manque le plus — et sans index,
-- une recherche par balayage lirait 41 Mo de texte à chaque frappe.
--
-- CE QUI EST INDEXÉ, ET POURQUOI C'EST BORNÉ. Un index plein texte PostgreSQL a des limites dures : un `tsvector` ne peut pas
-- dépasser 1 Mo de lexèmes, et l'insertion ÉCHOUE au-delà — pas un avertissement, une erreur. Or un corps HTML de cette boîte
-- atteint 31,6 MILLIONS de caractères. La règle posée ici est donc explicite :
--   · le corps HTML n'est JAMAIS indexé (c'est du balisage, il n'apporte rien à une recherche et il est énorme) ;
--   · le corps TEXTE est borné à 100 000 caractères. MESURÉ sur la vraie base : le plus long fait 68 248 caractères et AUCUN ne
--     dépasse 100 000 — la borne ne coupe donc rien aujourd'hui. Elle est là pour le jour où un mail hors norme arrivera, afin
--     que la RELÈVE ne se mette pas à échouer sur un message. Mieux vaut chercher dans les 100 000 premiers caractères d'un mail
--     démesuré que ne plus pouvoir le capturer.
--
-- ACCENTS : par `translate()`, PAS par `unaccent()`. L'extension `unaccent` EST installée sur la base d'Arno (vérifié), mais sa
-- fonction n'est pas IMMUTABLE — elle ne peut donc pas entrer dans une expression d'index sans qu'on lui fabrique un enrobage.
-- `translate()` + `lower()` sont IMMUTABLE, ne dépendent d'aucune extension, et c'est DÉJÀ la règle de normalisation du module
-- (`app/lib/gestion/recherche.ts`, lot 4d). Une seule règle d'accents dans tout le module, et elle survit à un changement de
-- serveur : c'est le raisonnement retenu au lot 4d, et il n'a pas changé.
--
-- `to_tsvector('french', …)` avec la configuration NOMMÉE EN DUR : la forme à un seul argument dépend d'un réglage de session
-- (`default_text_search_config`), elle n'est donc pas IMMUTABLE et ne s'indexe pas. Le dictionnaire français apporte les radicaux :
-- « fuites » trouve « fuite ».
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL ADDITIVE — un index GIN sur une expression, et rien d'autre. Aucune colonne ajoutée, aucune ligne modifiée, aucune
--   donnée réécrite, aucun DROP, aucun DELETE, aucun UPDATE. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI
--   le golden Asnières (29.107259068449615). Idempotente.
--
-- ⚠️ DURÉE ET VERROU. `CREATE INDEX` prend un verrou qui BLOQUE LES ÉCRITURES sur `gestion_message` le temps de la construction
--   (mesuré sur cluster jetable à 56 000 messages : voir le bloc de vérification). Les lectures, elles, continuent. Applique-la
--   quand aucune relève ne tourne — ou utilise la variante CONCURRENTLY donnée tout en bas, qui ne bloque pas mais ne peut pas
--   s'exécuter dans une transaction (donc hors de ce fichier).
--
-- ⚠️ DÉPEND DE LA MIGRATION 235 (colonnes `dest_a` / `dest_cc`), déjà appliquée. Le bloc de garde ci-dessous le vérifie et
--   s'arrête avec un message clair plutôt que d'échouer sur une colonne inconnue.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/237_gestion_recherche_plein_texte.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- GARDE : la 235 d'abord. Un message clair vaut mieux qu'une erreur « column dest_a does not exist » au milieu d'un CREATE INDEX.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'gestion_message' AND column_name = 'dest_a') THEN
    RAISE EXCEPTION 'La migration 235 (destinataires séparés) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

-- L'INDEX. L'expression est recopiée À L'IDENTIQUE dans `app/lib/gestion/rechercheBoite.ts` : si les deux divergent d'un
--   espace, PostgreSQL n'utilisera PAS l'index et la recherche balaiera 41 Mo sans que rien ne le signale. Un test compare les
--   deux chaînes, précisément pour que cette divergence ne puisse pas passer.
CREATE INDEX IF NOT EXISTS gestion_message_recherche_idx
  ON gestion_message USING gin (
    to_tsvector('french', translate(lower(coalesce(coalesce(objet, '') || ' ' ||
        left(coalesce(corps_texte, ''), 100000) || ' ' ||
        coalesce(de_nom, '') || ' ' ||
        coalesce(de_adresse, '') || ' ' ||
        coalesce(destinataires, '') || ' ' ||
        coalesce(regexp_replace(coalesce(dest_a::text, '') || ' ' || coalesce(dest_cc::text, ''),
                                '"(nom|adresse)":|[][{}",]', ' ', 'g'), ''), '')), 'àâäáãåÀÂÄÁÃÅéèêëÉÈÊËíìîïÍÌÎÏóòôöõÓÒÔÖÕúùûüÚÙÛÜçÇñÑýÿÝ', 'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnNyyY'))
  );

COMMENT ON INDEX gestion_message_recherche_idx IS
  'LOT 5c — recherche plein texte du courrier : objet, corps TEXTE borné à 100 000 caractères, expéditeur et destinataires. Le corps HTML n''est jamais indexé (balisage, et jusqu''à 31,6 M de caractères : au-delà d''1 Mo de lexèmes PostgreSQL REFUSE l''écriture). Accents par translate() et non unaccent(), qui n''est pas IMMUTABLE. Expression à garder identique à celle de app/lib/gestion/rechercheBoite.ts, sinon l''index cesse d''être pris SANS erreur.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① l''index existe, et ce qu''il pèse :'
--   SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS taille
--     FROM pg_indexes WHERE indexname = 'gestion_message_recherche_idx';
--
-- \echo '>>> ② le planificateur le PREND vraiment (on veut voir « Bitmap Index Scan … recherche_idx ») :'
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT m.id FROM gestion_message m
--    WHERE to_tsvector('french', translate(lower(coalesce(coalesce(objet, '') || ' ' ||
--                  left(coalesce(corps_texte, ''), 100000) || ' ' ||
--                  coalesce(de_nom, '') || ' ' ||
--                  coalesce(de_adresse, '') || ' ' ||
--                  coalesce(destinataires, '') || ' ' ||
--                  coalesce(regexp_replace(coalesce(dest_a::text, '') || ' ' || coalesce(dest_cc::text, ''),
--                                          '"(nom|adresse)":|[][{}",]', ' ', 'g'), ''), '')), 'àâäáãåÀÂÄÁÃÅéèêëÉÈÊËíìîïÍÌÎÏóòôöõÓÒÔÖÕúùûüÚÙÛÜçÇñÑýÿÝ', 'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnNyyY'))
--          @@ websearch_to_tsquery('french', 'fuite')
--    LIMIT 50;
--
-- \echo '>>> ③ les accents et la casse ne comptent pas (les trois doivent rendre le même nombre) :'
--   SELECT (SELECT count(*) FROM gestion_message WHERE objet ILIKE '%fenetre%') AS sans_accent_like,
--          (SELECT count(*) FROM gestion_message WHERE objet ILIKE '%fenêtre%') AS avec_accent_like;
--
-- \echo '>>> ④ aucune relève n''a été gênée : le nombre de messages n''a pas bougé :'
--   SELECT count(*) FROM gestion_message;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔁 VARIANTE SANS BLOCAGE D'ÉCRITURE (si une relève doit pouvoir tourner pendant la construction). À lancer SEULE, hors
--    transaction — `CONCURRENTLY` est interdit dans un BEGIN/COMMIT. Plus lente, mais elle ne bloque personne :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS gestion_message_recherche_idx ON gestion_message USING gin (…même expression…);"
--    ⚠️ Si elle échoue en cours de route, elle laisse un index INVALIDE : le repérer par
--       SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;  puis le DROP et recommencer.
--
-- 🔙 ROLLBACK (la recherche retombe alors en mode réduit, l'écran le DIT ; aucune donnée n'est touchée) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "DROP INDEX IF EXISTS gestion_message_recherche_idx;"
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
