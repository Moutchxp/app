-- 353_lidar_emprise_libre.sql
-- Lot « IMPORT LiDAR HD — CERCLE DE 35 KM AUTOUR DE NOTRE-DAME » (décision d'Arno, 14/10/2026).
--
-- POURQUOI : la dalle d'Asnières a été chargée à la main avec raster2pgsql + AddRasterConstraints, qui a posé sur
-- mns_lidar_brut et mnt_lidar_brut la contrainte `enforce_max_extent_rast` : l'emprise de CHAQUE tuile doit tenir dans
-- celle d'Asnières (646 000 × 6 867 000, 1 km²). Elle est NOT VALID, mais PostgreSQL la vérifie pour toute NOUVELLE
-- ligne : en l'état, aucune autre dalle ne peut entrer. On la retire, sur ces deux tables seulement.
--
-- CE QUI RESTE GARANTI (contraintes inchangées) : SRID 2154, pixel 0,5 m, une bande Float32, nodata -9999, rasters EN
-- base, tuiles de 256 ou 208 px, MÊME ALIGNEMENT de grille que la dalle d'Asnières (enforce_same_alignment_rast). Aucune
-- donnée n'est modifiée ni supprimée.
--
-- IDEMPOTENTE (IF EXISTS). NON APPLIQUÉE par le lot. À appliquer sur le SERVEUR avant `npm run lidar:import -- --charger`
-- (l'outil refuse de charger tant qu'elle n'est pas passée) :
--   psql "$DATABASE_URL" -f db/migrations/353_lidar_emprise_libre.sql

ALTER TABLE mns_lidar_brut DROP CONSTRAINT IF EXISTS enforce_max_extent_rast;
ALTER TABLE mnt_lidar_brut DROP CONSTRAINT IF EXISTS enforce_max_extent_rast;
