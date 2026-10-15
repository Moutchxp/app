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
# La restauration se fait en UNE transaction : une erreur annule tout. Les comptes de tuiles LiDAR sont relevés avant et
# après ; s'ils diffèrent, le script le dit et sort en erreur.
# ⚠️ C'est une COPIE FRAÎCHE : hors LiDAR, chaque objet du fichier remplace celui du serveur (--clean --if-exists).
#
# ── TABLES PARTITIONNÉES (correctif du 15/10/2026, échec de la bascule à l'étape C6) ──────────────────────────────────────
# `pg_restore --clean` supprime la contrainte de chaque PARTITION (ex. analytics_session_default_pkey) AVANT celle de sa
# table mère ; or une partition attachée ne peut pas perdre une contrainte héritée : « cannot drop inherited constraint »,
# et toute la restauration était annulée. Ces suppressions sont inutiles : supprimer la contrainte de la mère emporte
# celles des partitions, et chaque partition est supprimée ensuite avec sa table. `pg_restore` ne sachant pas écarter une
# entrée de la seule phase de suppression, la restauration passe par son SQL : `pg_restore -f -`, d'où l'on retire
# EXACTEMENT ces lignes (« ALTER TABLE IF EXISTS ONLY <partition> DROP CONSTRAINT IF EXISTS <contrainte>; », partitions et
# contraintes lues dans la table des matières : TABLE ATTACH + CONSTRAINT, toutes tables partitionnées), dans la seule
# phase de suppression (avant le premier « -- Name: »), puis `psql` l'exécute entre BEGIN et COMMIT — COMMIT émis
# SEULEMENT si pg_restore et le filtre ont réussi ; sinon rien n'est validé.
# GARDE LiDAR : avant toute écriture, le SQL de schéma qui sera exécuté est relu ; une instruction DROP, TRUNCATE ou ALTER
# qui nomme une table LiDAR, ou une suppression en CASCADE, fait refuser la restauration.
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

contraintes_heritees() { # liste TOC (filtrée) → lignes SQL EXACTES de suppression à écarter (contraintes des partitions)
  awk '
    / TABLE ATTACH / { for (i = 1; i <= NF; i++) if ($i == "ATTACH") { partition[$(i + 1) "." $(i + 2)] = 1; break } }
    / CONSTRAINT / && !/ FK CONSTRAINT / { for (i = 1; i <= NF; i++) if ($i == "CONSTRAINT") { c[++n] = $(i + 1) "." $(i + 2) " " $(i + 3); break } }
    END { for (k = 1; k <= n; k++) { split(c[k], t, " "); if (t[1] in partition) print "ALTER TABLE IF EXISTS ONLY " t[1] " DROP CONSTRAINT IF EXISTS " t[2] ";" } }
  ' "$1"
}

filtre_suppressions() { # SQL de pg_restore sur l'entrée → même SQL, sans les lignes de $1, dans la phase de suppression seule
  awk -v fichier="$1" '
    BEGIN { while ((getline l < fichier) > 0) ecarte[l] = 1 }
    !creation && /^-- Name: / { creation = 1 }
    !creation && ($0 in ecarte) { next }
    { print }
  '
}

garde_lidar() { # SQL de schéma sur l'entrée → refus si une instruction vise le LiDAR ou supprime en CASCADE
  local motif_ddl='^[[:space:]]*(DROP|TRUNCATE|ALTER)[^;]*(mns_lidar_brut|mnt_lidar_brut|mns_bati_propre|rge_alti)'
  local sql; sql=$(cat)
  if grep -n -i -E "$motif_ddl" <<<"$sql"; then echo "[bascule] ⛔ instruction visant le LiDAR — restauration REFUSÉE" >&2; return 1; fi
  if grep -n -E '^(DROP|ALTER)[^;]* CASCADE' <<<"$sql"; then echo "[bascule] ⛔ suppression en CASCADE — restauration REFUSÉE" >&2; return 1; fi
  echo "[bascule] garde LiDAR : aucune instruction DROP/TRUNCATE/ALTER ne vise mns_lidar_brut, mnt_lidar_brut, mns_bati_propre, rge_alti"
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
    liste=$(mktemp); ecartees=$(mktemp)
    trap 'rm -f "$liste" "$ecartees"' EXIT
    liste_sans_lidar "$2" > "$liste"
    contraintes_heritees "$liste" > "$ecartees"
    echo "[bascule] suppressions de contraintes héritées écartées (tables partitionnées) : $(wc -l < "$ecartees" | tr -d ' ')"
    pg_restore -f - --schema-only --clean --if-exists --no-owner --no-privileges -L "$liste" "$2" | filtre_suppressions "$ecartees" | garde_lidar
    ;;
  restaurer)
    [ $# -eq 3 ] || usage
    liste=$(mktemp); ecartees=$(mktemp); statut=$(mktemp)
    trap 'rm -f "$liste" "$ecartees" "$statut"' EXIT
    liste_sans_lidar "$2" > "$liste"
    contraintes_heritees "$liste" > "$ecartees"
    echo "[bascule] suppressions de contraintes héritées écartées (tables partitionnées) : $(wc -l < "$ecartees" | tr -d ' ')"
    # GARDE LiDAR, AVANT toute écriture, sur le SQL de schéma qui va être exécuté.
    pg_restore -f - --schema-only --clean --if-exists --no-owner --no-privileges -L "$liste" "$2" | filtre_suppressions "$ecartees" | garde_lidar
    avant=$(comptes_lidar "$3")
    echo "[bascule] LiDAR de la cible avant : $avant"
    # UNE transaction : BEGIN, le SQL filtré, et COMMIT SEULEMENT si pg_restore et le filtre ont réussi. Une erreur SQL
    # arrête psql (ON_ERROR_STOP) et la déconnexion annule tout ; un échec de pg_restore n'émet pas de COMMIT.
    echo 0 > "$statut"
    { echo 'BEGIN;'
      if pg_restore -f - --clean --if-exists --no-owner --no-privileges -L "$liste" "$2" | filtre_suppressions "$ecartees"; then
        echo 'COMMIT;'
      else
        echo 1 > "$statut"
      fi
    } | psql -X -q -v ON_ERROR_STOP=1 -d "$3"
    if [ "$(cat "$statut")" != "0" ]; then echo "[bascule] ⚠️ lecture de l'export en échec — RIEN n'a été validé" >&2; exit 1; fi
    apres=$(comptes_lidar "$3")
    echo "[bascule] LiDAR de la cible après : $apres"
    if [ "$avant" != "$apres" ]; then echo "[bascule] ⚠️ LE LiDAR A CHANGÉ — à examiner immédiatement" >&2; exit 1; fi
    echo "[bascule] terminé : LiDAR du serveur intact"
    ;;
  *) usage ;;
esac
