-- 300_gestion_piece_quicktime.sql — MODULE « GESTION » : les vidéos `.mov` sont gardées comme les `.mp4`.
-- LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 0.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI, ET CE QUE LA BASE DISAIT LE 03/10/2026.
--
-- 117 vidéos en base, 1,1 Go. 80 `.mp4` (`video/mp4`, 783 Mo), dont 76 avec leurs octets. Et 37 `.mov`
-- (`video/quicktime`, 337 Mo) dont AUCUNE n'avait d'octets : toutes refusées à la relève, motif écrit en toutes
-- lettres dans `gestion_piece.motif_non_stocke` — « type non autorisé pour la gestion : “video/quicktime” ».
--
-- Autrement dit : un film arrivé en `.mp4` était gardé, le même film filmé par un iPhone en `.mov` était perdu. La
-- différence n'a aucun sens métier — c'est le réglage par défaut d'un téléphone, pas une décision de qui que ce soit.
--
-- DÉCISION D'ARNO (03/10/2026) : « accord pour autoriser video/quicktime dans la relève ».
--
-- ⚠️ CETTE MIGRATION NE RATTRAPE RIEN. Elle autorise pour L'AVENIR. Les 37 pièces déjà refusées se rattrapent par la
-- commande dédiée, qui va rechercher leurs octets dans le message d'origine (Gmail) :
--   npm run gestion:pieces:rattraper-refusees -- --type=video/quicktime            # simulation
--   npm run gestion:pieces:rattraper-refusees -- --type=video/quicktime --appliquer
--
-- ⚠️ LE RÉGLAGE EST DÉJÀ EN PLACE SUR LA BASE D'ARNO : il y a été posé à la main le 03/10/2026, avec son accord, et
-- les 37 pièces ont été rattrapées dans la foulée (37/37). Cette migration existe pour que TOUTE base reparte du
-- même réglage — elle est écrite IDEMPOTENTE et ne fera donc rien ici.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : un seul UPDATE de données, BORNÉ au singleton de configuration (`id = 1`) et IDEMPOTENT (clause NOT LIKE :
--   rejouer n'ajoute rien une seconde fois), plus un ALTER … SET DEFAULT qui ne touche aucune ligne existante. Aucun
--   DROP, aucun DELETE, aucune colonne modifiée en place, aucune donnée de message touchée. Ne touche NI le module
--   Permis, NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). Une seule transaction.
--   Rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/300_gestion_piece_quicktime.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.

BEGIN;

-- ① LE RÉGLAGE VIVANT — ajout SANS ÉCRASEMENT : un réglage fait à la main par Arno n'est jamais remplacé, on ne
--    fait que compléter la liste si le type n'y figure pas déjà.
UPDATE gestion_config
   SET types_pieces_acceptes = types_pieces_acceptes || ',video/quicktime', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%video/quicktime%';

-- ② LA VALEUR PAR DÉFAUT DE LA COLONNE — pour qu'une base CRÉÉE DEMAIN parte du bon réglage, sans dépendre de
--    l'ordre dans lequel les migrations ont été jouées. Elle ne touche aucune ligne existante.
ALTER TABLE gestion_config
  ALTER COLUMN types_pieces_acceptes
  SET DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic,text/calendar,application/ics,video/quicktime';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (après COMMIT) :
--   SELECT types_pieces_acceptes FROM gestion_config WHERE id = 1;
--     → doit se terminer par « ,video/quicktime »
--   SELECT count(*) FROM gestion_piece
--    WHERE lower(type_mime) = 'video/quicktime' AND stocke_le IS NULL;
--     → les pièces encore sans octets, celles que la commande de rattrapage reprendra
--
-- ROLLBACK (si Arno revient sur sa décision) :
--   BEGIN;
--   UPDATE gestion_config
--      SET types_pieces_acceptes = replace(types_pieces_acceptes, ',video/quicktime', ''), maj_le = now()
--    WHERE id = 1;
--   ALTER TABLE gestion_config ALTER COLUMN types_pieces_acceptes
--     SET DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic,text/calendar,application/ics';
--   COMMIT;
--   ⚠️ Les pièces DÉJÀ rattrapées gardent leurs octets : annuler l'autorisation n'efface rien. C'est voulu — on ne
--      supprime jamais un contenu reçu pour un changement de réglage.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
