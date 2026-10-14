#!/usr/bin/env bash
# ══ BASCULE MAC → SERVEUR, SANS JAMAIS TOUCHER AU LiDAR DU SERVEUR (lot IMPORT LiDAR HD, 14/10/2026) ═══════════════════
#
#   1) Sur le Mac     : scripts/bascule-sans-lidar.sh exporter  <base_source>  <fichier.dump>
#   2) Copier le fichier sur le serveur (scp, à la main).
#   3) Sur le serveur : scripts/bascule-sans-lidar.sh essai     <fichier.dump>  <base_cible>   (liste ce qui sera restauré)
#                       scripts/bascule-sans-lidar.sh restaurer <fichier.dump>  <base_cible>
#
# Le LiDAR (mns_lidar_brut, mnt_lidar_brut, mns_bati_propre, rge_alti) n'est NI exporté (données exclues), NI restauré
# (tables, séquences, index, contraintes et données retirés de la liste de restauration) : celui du serveur, chargé par
# `npm run lidar:import`, reste tel quel. Les extensions et le schéma public ne sont pas recréés non plus (un DROP
# EXTENSION postgis emporterait les rasters).
#
# La restauration se fait en UNE transaction (--single-transaction --exit-on-error) : une erreur annule tout. Les comptes
# de tuiles LiDAR sont relevés avant et après ; s'ils diffèrent, le script le dit et sort en erreur.
# ⚠️ C'est une COPIE FRAÎCHE : hors LiDAR, chaque objet du fichier remplace celui du serveur (--clean --if-exists).
set -euo pipefail

TABLES_LIDAR=(mns_lidar_brut mnt_lidar_brut mns_bati_propre rge_alti)
# Le nom des tables, de leurs séquences (…_rid_seq), contraintes (…_pkey) et index (…_st_convexhull_idx, idx_…_rast).
MOTIF_LIDAR='(^|[^a-z_]|idx_)(mns_lidar_brut|mnt_lidar_brut|mns_bati_propre|rge_alti)'

usage() { sed -n '3,9p' "$0"; exit 2; }

comptes_lidar() { # base → « table=nombre … »
  local base="$1" sortie=""
  for t in "${TABLES_LIDAR[@]}"; do
    if [ "$(psql -X -A -t -d "$base" -c "SELECT to_regclass('public.$t') IS NOT NULL")" = "t" ]; then
      n=$(psql -X -A -t -d "$base" -c "SELECT count(*) FROM public.$t")
    else
      n=absente
    fi
    sortie+="$t=$n "
  done
  echo "$sortie"
}

liste_sans_lidar() { # dump → liste TOC filtrée sur la sortie standard
  pg_restore -l "$1" \
    | grep -v -E "$MOTIF_LIDAR" \
    | grep -v -E '; [0-9]+ [0-9]+ (EXTENSION|SCHEMA) ' \
    | grep -v -E 'COMMENT - EXTENSION '
}

case "${1:-}" in
  exporter)
    [ $# -eq 3 ] || usage
    exclusions=()
    for t in "${TABLES_LIDAR[@]}"; do exclusions+=(--exclude-table-data="public.$t"); done
    pg_dump -Fc --no-owner --no-privileges "${exclusions[@]}" -d "$2" -f "$3"
    echo "[bascule] export : $3 ($(du -h "$3" | cut -f1)) — données LiDAR exclues"
    ;;
  essai)
    [ $# -eq 3 ] || usage
    echo "[bascule] LiDAR de la cible (intouché) : $(comptes_lidar "$3")"
    echo "[bascule] entrées retirées de la restauration (LiDAR, extensions, schéma) :"
    pg_restore -l "$2" | grep -E "$MOTIF_LIDAR|; [0-9]+ [0-9]+ (EXTENSION|SCHEMA) |COMMENT - EXTENSION " || true
    echo "[bascule] entrées restaurées : $(liste_sans_lidar "$2" | grep -c -v '^;')"
    ;;
  restaurer)
    [ $# -eq 3 ] || usage
    liste=$(mktemp)
    trap 'rm -f "$liste"' EXIT
    liste_sans_lidar "$2" > "$liste"
    avant=$(comptes_lidar "$3")
    echo "[bascule] LiDAR de la cible avant : $avant"
    pg_restore --clean --if-exists --single-transaction --exit-on-error --no-owner --no-privileges -L "$liste" -d "$3" "$2"
    apres=$(comptes_lidar "$3")
    echo "[bascule] LiDAR de la cible après : $apres"
    if [ "$avant" != "$apres" ]; then echo "[bascule] ⚠️ LE LiDAR A CHANGÉ — à examiner immédiatement" >&2; exit 1; fi
    echo "[bascule] terminé : LiDAR du serveur intact"
    ;;
  *) usage ;;
esac
