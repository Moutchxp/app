-- 302_gestion_piece_heif_zip_octets_50mo.sql — MODULE « GESTION » : HEIF/HEIC, zip et octet-stream sont gardés ;
-- le plafond passe de 25 à 50 Mo. LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1.
--
-- 🔴 MIGRATION LIVRÉE. Sur la base d'Arno, le réglage a été posé le 04/10/2026 avec son accord écrit (il demande
--    explicitement le rattrapage des 394 pièces, qui est impossible sans lui) ; la valeur d'avant est conservée dans
--    ~/Desktop/sauvegarde-avant-elargissement-pieces.sql. Ce fichier existe pour que TOUTE base reparte du même
--    réglage — il est écrit IDEMPOTENT et ne fera donc rien de plus ici.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI, ET CE QUE LA BASE DISAIT LE 04/10/2026.
--
-- 394 pièces sur 27 143 n'ont AUCUN octet conservé (323 mails). Chacune porte sa raison, écrite à la capture :
--   · 389 « type non autorisé pour la gestion : “<type>” » — le type n'était pas dans la liste blanche ;
--   ·   5 « pièce trop volumineuse : X Mo (maximum 25.0 Mo) ».
--
-- Ce n'est donc PAS une panne de la relève : elle n'a pas échoué, elle a refusé. Les octets sont encore chez Gmail.
--
-- DÉCISION D'ARNO (04/10/2026), mot pour mot :
--   « À RÉCUPÉRER : images HEIF/HEIC ; zip et application/octet-stream : stockés tels quels, proposés en
--     TÉLÉCHARGEMENT SEULEMENT (jamais ouverts, prévisualisés ni décompressés par l'application), avec la mention
--     “Fichier à ouvrir avec précaution” ; plafond relevé à 50 Mo pour les 5 pièces trop volumineuses. »
--
-- CE QUE CE RÉGLAGE REND ÉLIGIBLE, MESURÉ AVANT APPLICATION — 169 pièces, 343 Mo, sur 117 mails :
--   application/octet-stream       90 pièces ·  70 mails ·  18 Mo
--   application/x-zip-compressed   29 pièces ·  17 mails · 113 Mo
--   image/heif                     28 pièces ·   8 mails ·  52 Mo
--   application/zip                13 pièces ·  13 mails ·  20 Mo
--   video/mp4                       4 pièces ·   4 mails · 111 Mo   (déjà permis : SEUL le plafond les bloquait)
--   application/pdf                 1 pièce  ·   1 mail  ·  28 Mo   (idem)
--   text/calendar + application/ics 4 pièces ·   4 mails ·   3 ko    (déjà permis : refusées AVANT la migration 231)
--   → aucune au-delà de 50 Mo : le nouveau plafond suffit aux 5 pièces visées.
--
-- ⚠️ CE QUI N'EST **PAS** AJOUTÉ, ET CE N'EST PAS UN OUBLI. Arno a nommé trois familles ; je n'en ajoute pas une
--    quatrième de mon propre chef. Restent donc refusées, et ce sont des questions à lui poser :
--      xlsx 70 · text/plain 34 · application/txt 28 · text/x-amp-html 19 · msword 16 · email-reaction+json 13 ·
--      richtext 9 · image/jpg 5 · text/csv 5 · image/x-png 4 · text/html 4 · text/xml 4 · ms-tnef 2 · odt 2 ·
--      pages 2 · image/webp 2
--    (`image/jpg`, `image/x-png` et `image/webp` sont des PHOTOS ordinaires : 11 pièces perdues pour une
--     orthographe de type MIME. C'est le premier point à trancher.)
--
-- ⚠️ CETTE MIGRATION NE RATTRAPE RIEN. Elle autorise pour L'AVENIR. Les pièces déjà refusées se rattrapent par :
--      npm run gestion:pieces:rattraper-refusees                      # simulation, tous les types désormais permis
--      npm run gestion:pieces:rattraper-refusees -- --appliquer
--
-- 🔒 CE QUE CE RÉGLAGE N'OUVRE **PAS**. Le refus des programmes, des scripts et des signatures électroniques
--    (`app/lib/gestion/pieceSecurite.ts`) n'est PAS configurable, et il s'applique AVANT cette liste : un
--    exécutable renommé « photo.jpg » reste refusé, et un `.exe` arrivé en `application/octet-stream` aussi. Une
--    règle de sécurité rangée dans une table se débranche d'un UPDATE ; celle-là est dans le code, elle y reste.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : deux UPDATE de données BORNÉS au singleton de configuration (`id = 1`) et IDEMPOTENTS (clauses NOT LIKE et
--   comparaison de valeur : rejouer n'ajoute rien une seconde fois), plus deux ALTER … SET DEFAULT qui ne touchent
--   aucune ligne existante. Aucun DROP, aucun DELETE, aucune colonne modifiée en place, aucune donnée de message ni
--   de pièce touchée. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le golden Asnières
--   (29.107259068449615). Une seule transaction. Rejouable.
--
-- Application MANUELLE, arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/302_gestion_piece_heif_zip_octets_50mo.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.

BEGIN;

-- ① LES TROIS FAMILLES D'ARNO — ajout SANS ÉCRASEMENT, un type à la fois. Un réglage fait à la main n'est jamais
--    remplacé : on ne complète que ce qui manque.
UPDATE gestion_config SET types_pieces_acceptes = types_pieces_acceptes || ',image/heif', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%image/heif%';

UPDATE gestion_config SET types_pieces_acceptes = types_pieces_acceptes || ',application/zip', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%application/zip%';

-- ⚠️ `application/x-zip-compressed` EST LE MÊME FORMAT, annoncé par Outlook et par Windows. 29 des 42 zip de cette
--    base le portent : n'autoriser que `application/zip` aurait laissé les deux tiers dehors.
UPDATE gestion_config
   SET types_pieces_acceptes = types_pieces_acceptes || ',application/x-zip-compressed', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%application/x-zip-compressed%';

UPDATE gestion_config
   SET types_pieces_acceptes = types_pieces_acceptes || ',application/octet-stream', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%application/octet-stream%';

-- ② LE PLAFOND — 25 → 50 Mo. Comparaison de valeur, donc idempotent, et il ne BAISSE jamais un plafond déjà plus
--    haut (un réglage plus généreux posé à la main reste en place).
UPDATE gestion_config SET piece_taille_max_mo = 50, maj_le = now()
 WHERE id = 1 AND piece_taille_max_mo < 50;

-- ③ LES VALEURS PAR DÉFAUT DE LA COLONNE — pour qu'une base CRÉÉE DEMAIN parte du bon réglage, sans dépendre de
--    l'ordre dans lequel les migrations ont été jouées. Elles ne touchent aucune ligne existante.
ALTER TABLE gestion_config
  ALTER COLUMN types_pieces_acceptes
  SET DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic,text/calendar,application/ics,video/quicktime,image/heif,application/zip,application/x-zip-compressed,application/octet-stream';

ALTER TABLE gestion_config
  ALTER COLUMN piece_taille_max_mo SET DEFAULT 50;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (après COMMIT) :
--   SELECT types_pieces_acceptes, piece_taille_max_mo FROM gestion_config WHERE id = 1;
--     → la liste doit contenir image/heif, application/zip, application/x-zip-compressed, application/octet-stream
--     → piece_taille_max_mo = 50
--   SELECT count(*) FROM gestion_piece WHERE stocke_le IS NULL
--    AND lower(split_part(coalesce(type_mime,''),';',1)) = ANY(
--          string_to_array((SELECT types_pieces_acceptes FROM gestion_config WHERE id = 1), ','));
--     → les pièces que la commande de rattrapage reprendra
--
-- ROLLBACK (si Arno revient sur sa décision) :
--   BEGIN;
--   UPDATE gestion_config
--      SET types_pieces_acceptes = replace(replace(replace(replace(types_pieces_acceptes,
--            ',application/octet-stream',''), ',application/x-zip-compressed',''),
--            ',application/zip',''), ',image/heif',''),
--          piece_taille_max_mo = 25, maj_le = now()
--    WHERE id = 1;
--   ALTER TABLE gestion_config ALTER COLUMN piece_taille_max_mo SET DEFAULT 25;
--   ALTER TABLE gestion_config ALTER COLUMN types_pieces_acceptes
--     SET DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic,text/calendar,application/ics,video/quicktime';
--   COMMIT;
--   ⚠️ Les pièces DÉJÀ rattrapées gardent leurs octets : annuler l'autorisation n'efface rien. C'est voulu — on ne
--      supprime jamais un contenu reçu pour un changement de réglage.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
