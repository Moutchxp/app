#!/usr/bin/env bash
# Import d'un raster LiDAR HD (MNS ou MNT) dans PostGIS.
# Reproduit la méthode de mns_lidar_brut : même SRID, tuilage et contraintes
# -> garantit ST_SameAlignment entre les rasters (indispensable pour MNS - MNT).
# Usage : ./import_lidar_raster.sh <fichier.tif> <nom_table>
set -euo pipefail
TIF="${1:?Chemin du .tif requis}"
TABLE="${2:?Nom de table requis (ex: mnt_lidar_brut)}"
DB="sansvisavis"
[ -f "$TIF" ] || { echo "Fichier introuvable : $TIF" >&2; exit 1; }
echo "Import de $TIF -> public.$TABLE (db=$DB)…"
raster2pgsql -s 2154 -I -C -t 256x256 "$TIF" "public.$TABLE" | psql -d "$DB"
echo "Termine. Verifie : SELECT count(*) FROM public.$TABLE;"
