#!/usr/bin/env bash
# ══ BASCULE MAC → SERVEUR, SANS JAMAIS TOUCHER AU LiDAR DU SERVEUR (lot IMPORT LiDAR HD, 14/10/2026) ═══════════════════
#
#   1) Sur le Mac     : scripts/bascule-sans-lidar.sh exporter  <base_source>  <fichier.dump>
#   2) Copier le fichier sur le serveur (scp, à la main).
#   3) Sur le serveur : scripts/bascule-sans-lidar.sh essai      <fichier.dump>  <base_cible>  (liste ce qui sera restauré)
#                       scripts/bascule-sans-lidar.sh repetition <fichier.dump>  <base_cible>  (même SQL, puis ROLLBACK)
#                       scripts/bascule-sans-lidar.sh restaurer  <fichier.dump>  <base_cible>
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
#
# ── SCHÉMA public SEUL (correctif du 15/10/2026, 2e échec à l'étape C6 : « must be owner of schema topology ») ─────────────
# Seules les entrées du schéma `public` sont restaurées (création ET suppression). Tout le reste est écarté : schémas
# d'extensions et leurs objets (topology, tables de configuration vides de postgis_topology, et leur séquence — dont le
# réglage échapperait même à un ROLLBACK), le schéma `ogr_system_tables` créé par GDAL et son déclencheur d'événement
# (réservé au superutilisateur), extensions, commentaires et droits de schéma. Sur le Mac ces schémas appartiennent au
# compte de l'utilisateur, sur le serveur à `postgres` : les recréer échoue, et ils n'ont aucune donnée métier.
# Même raison pour les DONNÉES des tables d'extension du schéma public (spatial_ref_sys de PostGIS : 0 ligne exportée,
# mais la copie exige d'en être propriétaire) : écartées, repérées de façon générique — une TABLE DATA dont l'export ne
# crée pas la table. Une table métier a toujours son entrée TABLE : elle n'est jamais écartée.
#
# ── RÉPÉTITION ────────────────────────────────────────────────────────────────────────────────────────────────────────────
# `repetition` exécute EXACTEMENT le SQL de `restaurer` sur la même base (garde LiDAR, contrôle LiDAR avant/après compris),
# mais termine par ROLLBACK au lieu de COMMIT : on éprouve les vrais droits sur la vraie base sans rien écrire. Pendant
# la répétition, les tables restaurées sont verrouillées (comme pendant la vraie restauration).
set -euo pipefail

TABLES_LIDAR=(mns_lidar_brut mnt_lidar_brut mns_bati_propre rge_alti)
# Le nom des tables, de leurs séquences (…_rid_seq), contraintes (…_pkey) et index (…_st_convexhull_idx, idx_…_rast).
MOTIF_LIDAR='(^|[^a-z_]|idx_)(mns_lidar_brut|mnt_lidar_brut|mns_bati_propre|rge_alti)'

usage() { sed -n '3,10p' "$0"; exit 2; }

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

schema_public_seul() { # liste TOC sur l'entrée → seules les entrées du schéma public (lignes de commentaire « ; » gardées)
  # Une entrée : « id; oid oid TYPE… schéma nom… propriétaire » — le schéma est le premier mot après les mots du TYPE
  # (en majuscules : TABLE, TABLE DATA, FK CONSTRAINT, SEQUENCE SET, COMMENT, EVENT TRIGGER…) ; « - » pour les objets sans
  # schéma (SCHEMA, EXTENSION, EVENT TRIGGER, COMMENT ON SCHEMA/EXTENSION).
  awk '/^;/ { print; next } { n = split($0, f, " "); i = 4; while (i <= n && f[i] ~ /^[A-Z]+$/) i++; if (f[i] == "public") print }'
}

sans_donnees_extension() { # liste TOC → sans les TABLE DATA de tables que l'export ne crée pas (tables d'extension)
  # Une table métier a toujours son entrée TABLE dans l'export ; une table de configuration d'extension (spatial_ref_sys de
  # PostGIS…) n'en a pas : elle appartient à l'extension, déjà présente sur la cible, et l'écrire exige d'en être
  # propriétaire (« permission denied for table spatial_ref_sys »). Ses données ne sont donc pas restaurées.
  awk '{ l[NR] = $0 }
       !/^;/ { n = split($0, f, " "); i = 4; ty = ""; while (i <= n && f[i] ~ /^[A-Z]+$/) { ty = ty (ty == "" ? "" : " ") f[i]; i++ }
               t[NR] = ty; k[NR] = f[i] "." f[i + 1]; if (ty == "TABLE") tables[f[i] "." f[i + 1]] = 1 }
       END { for (r = 1; r <= NR; r++) if (!(t[r] == "TABLE DATA" && !(k[r] in tables))) print l[r] }'
}

liste_sans_lidar() { # dump → liste TOC filtrée sur la sortie standard : sans LiDAR, schéma public seul, sans données d'extension
  pg_restore -l "$1" | grep -v -E "$MOTIF_LIDAR" | schema_public_seul | sans_donnees_extension
}

donnees_extension() { # dump → les TABLE DATA écartées parce que leur table appartient à une extension
  pg_restore -l "$1" | grep -v -E "$MOTIF_LIDAR" | schema_public_seul | grep -v '^;' \
    | grep -v -x -F -f <(pg_restore -l "$1" | grep -v -E "$MOTIF_LIDAR" | schema_public_seul | sans_donnees_extension | grep -v '^;') || true
}

hors_public() { # dump → les entrées écartées parce qu'hors du schéma public (LiDAR non compris)
  pg_restore -l "$1" | grep -v -E "$MOTIF_LIDAR" | grep -v '^;' \
    | grep -v -x -F -f <(pg_restore -l "$1" | grep -v -E "$MOTIF_LIDAR" | schema_public_seul | grep -v '^;') || true
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
    echo "[bascule] entrées LiDAR retirées de la restauration :"
    pg_restore -l "$2" | grep -E "$MOTIF_LIDAR" || true
    echo "[bascule] entrées hors du schéma public écartées : $(hors_public "$2" | wc -l | tr -d ' ')"
    hors_public "$2"
    echo "[bascule] données de tables d'extension écartées : $(donnees_extension "$2" | wc -l | tr -d ' ')"
    donnees_extension "$2"
    echo "[bascule] entrées restaurées : $(liste_sans_lidar "$2" | grep -c -v '^;')"
    liste=$(mktemp); ecartees=$(mktemp)
    trap 'rm -f "$liste" "$ecartees"' EXIT
    liste_sans_lidar "$2" > "$liste"
    contraintes_heritees "$liste" > "$ecartees"
    echo "[bascule] suppressions de contraintes héritées écartées (tables partitionnées) : $(wc -l < "$ecartees" | tr -d ' ')"
    pg_restore -f - --schema-only --clean --if-exists --no-owner --no-privileges -L "$liste" "$2" | filtre_suppressions "$ecartees" | garde_lidar
    ;;
  restaurer|repetition)
    [ $# -eq 3 ] || usage
    if [ "$1" = repetition ]; then fin='ROLLBACK;'; else fin='COMMIT;'; fi
    liste=$(mktemp); ecartees=$(mktemp); statut=$(mktemp)
    trap 'rm -f "$liste" "$ecartees" "$statut"' EXIT
    liste_sans_lidar "$2" > "$liste"
    echo "[bascule] entrées hors du schéma public écartées : $(hors_public "$2" | wc -l | tr -d ' ')"
    echo "[bascule] données de tables d'extension écartées : $(donnees_extension "$2" | wc -l | tr -d ' ')"
    contraintes_heritees "$liste" > "$ecartees"
    echo "[bascule] suppressions de contraintes héritées écartées (tables partitionnées) : $(wc -l < "$ecartees" | tr -d ' ')"
    # GARDE LiDAR, AVANT toute écriture, sur le SQL de schéma qui va être exécuté.
    pg_restore -f - --schema-only --clean --if-exists --no-owner --no-privileges -L "$liste" "$2" | filtre_suppressions "$ecartees" | garde_lidar
    avant=$(comptes_lidar "$3")
    echo "[bascule] LiDAR de la cible avant : $avant"
    # UNE transaction : BEGIN, le SQL filtré, puis COMMIT (restaurer) ou ROLLBACK (repetition) — émis SEULEMENT si
    # pg_restore et le filtre ont réussi. Une erreur SQL arrête psql (ON_ERROR_STOP) et la déconnexion annule tout.
    echo 0 > "$statut"
    if ! { echo 'BEGIN;'
           if pg_restore -f - --clean --if-exists --no-owner --no-privileges -L "$liste" "$2" | filtre_suppressions "$ecartees"; then
             echo "$fin"
           else
             echo 1 > "$statut"
           fi
         } | psql -X -q -v ON_ERROR_STOP=1 -d "$3"; then
      echo "[bascule] ⚠️ $1 en ÉCHEC — erreur SQL ci-dessus ; transaction annulée, RIEN n'a été écrit" >&2; exit 1
    fi
    if [ "$(cat "$statut")" != "0" ]; then echo "[bascule] ⚠️ lecture de l'export en échec — RIEN n'a été validé" >&2; exit 1; fi
    apres=$(comptes_lidar "$3")
    echo "[bascule] LiDAR de la cible après : $apres"
    if [ "$avant" != "$apres" ]; then echo "[bascule] ⚠️ LE LiDAR A CHANGÉ — à examiner immédiatement" >&2; exit 1; fi
    if [ "$1" = repetition ]; then
      echo "[bascule] répétition réussie — ROLLBACK, rien écrit"
    else
      echo "[bascule] terminé : LiDAR du serveur intact"
    fi
    ;;
  *) usage ;;
esac
