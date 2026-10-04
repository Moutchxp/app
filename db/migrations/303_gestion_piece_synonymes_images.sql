-- 303_gestion_piece_synonymes_images.sql — MODULE « GESTION » : `image/jpg`, `image/x-png` et `image/webp` sont
-- gardés. LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1.
--
-- 🔴 MIGRATION LIVRÉE. Sur la base d'Arno, le réglage a été posé le 04/10/2026 avec son accord écrit (il demande
--    explicitement le rattrapage des 11 photos, impossible sans lui) ; la valeur d'avant est conservée dans
--    ~/Desktop/sauvegarde-avant-synonymes-images.sql. Ce fichier existe pour que TOUTE base reparte du même
--    réglage — il est écrit IDEMPOTENT et ne fera donc rien de plus ici.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI, ET CE QUE LA BASE DISAIT LE 04/10/2026, APRÈS LE RATTRAPAGE DE LA MIGRATION 302.
--
-- 229 pièces restaient sans octets. Parmi elles, ONZE sont des photos ordinaires, perdues pour une ORTHOGRAPHE de
-- type MIME :
--
--   image/jpg     5 pièces ·  5 mails · 2 483 ko   (dont « image_6209779.JPG » 2,1 Mo et « IMG_9622.jpg »)
--   image/x-png   4 pièces ·  4 mails ·    32 ko   (quatre fois « logo 2.png »)
--   image/webp    2 pièces ·  2 mails ·    42 ko   (« download-1_….webp », deux fois)
--
-- DÉCISION D'ARNO (04/10/2026) : « autorise image/jpg, image/x-png et image/webp (synonymes de jpeg/png, à ajouter
-- dans la liste blanche unique), puis rattrape les 11 photos. »
--
-- ═══ 🔴 CE QUE LE CODE FAIT EN PLUS, ET POURQUOI IL FAUT LE SAVOIR ═════════════════════════════════════════════════
--
-- `image/jpg` et `image/x-png` sont des SYNONYMES EXACTS de `image/jpeg` et `image/png` — des orthographes anciennes,
-- encore écrites par certains clients de messagerie. Le code les NORMALISE désormais vers leur forme canonique
-- (`pieceSecurite.typeCanonique`), et le type stocké est la forme canonique.
--
-- 🔴 SANS CETTE NORMALISATION, IL AURAIT FALLU INSCRIRE `image/x-png` DANS TROIS AUTRES LISTES pour qu'une photo se
-- comporte comme une photo : `pieces.IMAGES_MINIATURABLES` (sinon une icône au lieu d'une miniature),
-- `apercuDrive.IMAGES` (sinon pas d'œil, pas de visionneuse) et `stockage.EXTENSIONS_GESTION` (sinon un fichier
-- stocké sous le nom `.bin`). Trois listes à tenir d'accord pour une orthographe.
--
-- 🔴 LA LISTE BLANCHE PORTE QUAND MÊME LES TROIS, comme Arno l'a demandé : elle est le REGISTRE DE LA DÉCISION, et
-- elle autoriserait ces types même si la normalisation disparaissait un jour. Ceinture en plus de la bretelle.
--
-- ⚠️ `image/webp` N'EST PAS UN SYNONYME : c'est un format à lui. Il n'est pas normalisé, seulement autorisé — et il
-- était déjà connu des deux listes d'affichage ; il ne manquait qu'ici.
--
-- 🔒 CE QUE CE RÉGLAGE N'OUVRE PAS. Le refus des programmes, des scripts et des signatures électroniques
-- (`app/lib/gestion/pieceSecurite.ts`) n'est PAS configurable et s'applique AVANT cette liste : un exécutable
-- renommé « photo.jpg » reste refusé.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : trois UPDATE de données BORNÉS au singleton de configuration (`id = 1`) et IDEMPOTENTS (clauses NOT LIKE :
--   rejouer n'ajoute rien une seconde fois), plus un ALTER … SET DEFAULT qui ne touche aucune ligne existante. Aucun
--   DROP, aucun DELETE, aucune colonne modifiée en place, aucune donnée de message ni de pièce touchée. Ne touche NI
--   le module Permis, NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). Une seule
--   transaction. Rejouable.
--
-- Application MANUELLE, arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/303_gestion_piece_synonymes_images.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.

BEGIN;

-- ① LES TROIS TYPES D'ARNO — ajout SANS ÉCRASEMENT, un type à la fois.
UPDATE gestion_config SET types_pieces_acceptes = types_pieces_acceptes || ',image/jpg', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%image/jpg%';

UPDATE gestion_config SET types_pieces_acceptes = types_pieces_acceptes || ',image/x-png', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%image/x-png%';

UPDATE gestion_config SET types_pieces_acceptes = types_pieces_acceptes || ',image/webp', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%image/webp%';

-- ② LA VALEUR PAR DÉFAUT DE LA COLONNE — pour qu'une base CRÉÉE DEMAIN parte du bon réglage, sans dépendre de
--    l'ordre dans lequel les migrations ont été jouées. Elle ne touche aucune ligne existante.
ALTER TABLE gestion_config
  ALTER COLUMN types_pieces_acceptes
  SET DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic,text/calendar,application/ics,video/quicktime,image/heif,application/zip,application/x-zip-compressed,application/octet-stream,image/jpg,image/x-png,image/webp';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (après COMMIT) :
--   SELECT types_pieces_acceptes FROM gestion_config WHERE id = 1;
--     → doit contenir image/jpg, image/x-png et image/webp
--   SELECT count(*) FROM gestion_piece WHERE cle_stockage IS NULL
--    AND type_mime IN ('image/jpg','image/x-png','image/webp');
--     → les photos que la commande de rattrapage reprendra (11 avant rattrapage, 0 après)
--
-- ROLLBACK (si Arno revient sur sa décision) :
--   BEGIN;
--   UPDATE gestion_config
--      SET types_pieces_acceptes = replace(replace(replace(types_pieces_acceptes,
--            ',image/webp',''), ',image/x-png',''), ',image/jpg',''), maj_le = now()
--    WHERE id = 1;
--   ALTER TABLE gestion_config ALTER COLUMN types_pieces_acceptes
--     SET DEFAULT 'application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/heic,text/calendar,application/ics,video/quicktime,image/heif,application/zip,application/x-zip-compressed,application/octet-stream';
--   COMMIT;
--   ⚠️ Les photos DÉJÀ rattrapées gardent leurs octets : annuler l'autorisation n'efface rien. C'est voulu — on ne
--      supprime jamais un contenu reçu pour un changement de réglage. Leur `type_mime` reste la forme canonique.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
