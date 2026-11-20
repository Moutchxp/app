#!/bin/bash
# ══ LES ADRESSES OFFICIELLES EN RECETTE (Arno, 20/11/2026, « Adresse officielle BAN », LOT 1) ══════════════════════════════════════════════════
#
#   bash scripts/recette-adresses-officielles.sh            → comptages et communes visées, AUCUNE écriture
#   bash scripts/recette-adresses-officielles.sh --copier   → copie, puis comptages après
#
# Copie la Base Adresse Nationale (`adresse_ban`) et le cadastre (`parcelle`) des COMMUNES DU PORTEFEUILLE (celles des biens de la recette),
# depuis la base principale du Mac (`sansvisavis`) vers `svav_recette`. La recette n'en avait que des lignes d'essai : Courbevoie y manquait.
#   · SOURCE en lecture seule STRICTE (PGOPTIONS default_transaction_read_only=on) : rien ne peut s'y écrire ;
#   · FLUX DIRECT (COPY … TO STDOUT | \copy … FROM pstdin) : aucun fichier de dump, nulle part ;
#   · 🔴 GARDE ABSOLUE : la première instruction de la transaction d'écriture vérifie current_database() = 'svav_recette' ; sinon tout s'arrête,
#     rien n'est écrit (une transaction, ON_ERROR_STOP) ;
#   · REJOUABLE SANS DOUBLON : les lignes passent par une table temporaire et n'entrent que si leur `fid` (clé unique des deux tables, la même
#     numérotation que la source) est absent — ON CONFLICT (fid) DO NOTHING. Rien n'est jamais modifié ni supprimé (les lignes d'essai restent).
# Le rapport va dans `.captures/recette-adresses-officielles/`.
cd "$(dirname "$0")/.."

SOURCE=sansvisavis
DEST=svav_recette
COPIER=0; [[ "${1:-}" == "--copier" ]] && COPIER=1
RAPPORT_DIR=.captures/recette-adresses-officielles
mkdir -p "$RAPPORT_DIR"
RAPPORT="$RAPPORT_DIR/$( [[ $COPIER == 1 ]] && echo copie || echo a-blanc )-$(date +%Y-%m-%d-%H%M%S).txt"

lire_source() { PGOPTIONS="-c default_transaction_read_only=on" psql -X -At -v ON_ERROR_STOP=1 -d "$SOURCE" "$@"; }
lire_dest() { PGOPTIONS="-c default_transaction_read_only=on" psql -X -At -v ON_ERROR_STOP=1 -d "$DEST" "$@"; }
# la normalisation des communes, la même des deux côtés (casse, accents, tirets, apostrophes)
NORM="btrim(regexp_replace(lower(unaccent(%s)), '[^a-z0-9]+', ' ', 'g'))"

{
echo "Adresses officielles en recette — $( [[ $COPIER == 1 ]] && echo COPIE || echo 'À BLANC (rien n’est écrit)' ) — $(date '+%d/%m/%Y %H:%M:%S')"

# ── 0. la destination est bien la recette (lecture) ──────────────────────────────────────────────────────────────────────────────────────────
BASE_DEST="$(lire_dest -c "SELECT current_database()")"
if [[ "$BASE_DEST" != "svav_recette" ]]; then echo "⛔ La destination est « $BASE_DEST », pas svav_recette : rien n'est fait."; exit 2; fi

# ── 1. les communes du portefeuille (biens de la recette) : noms normalisés, et codes postaux de Paris (75xxx → 751xx) ──────────────────────
NOMS="$(lire_dest -c "SELECT string_agg(DISTINCT quote_literal($(printf "$NORM" 'commune')), ',') FROM gestion_annuaire_lot WHERE btrim(coalesce(commune, '')) <> ''")"
PARIS="$(lire_dest -c "SELECT string_agg(DISTINCT quote_literal('751' || right(code_postal, 2)), ',') FROM gestion_annuaire_lot WHERE code_postal ~ '^75[0-9]{3}$'")"
INSEE="$(lire_source -c "SELECT string_agg(DISTINCT quote_literal(insee_commune), ',' ORDER BY quote_literal(insee_commune)) FROM adresse_ban
                         WHERE $(printf "$NORM" 'nom_commune') IN (${NOMS:-NULL}) OR insee_commune IN (${PARIS:-NULL})")"
if [[ -z "$INSEE" ]]; then echo "⛔ Aucune commune du portefeuille trouvée dans la BAN de $SOURCE : rien n'est fait."; exit 3; fi
echo "Communes du portefeuille retrouvées dans la BAN de $SOURCE : $(echo "$INSEE" | tr ',' '\n' | wc -l | tr -d ' ') — ${INSEE//\'/}"
echo "Communes des biens ABSENTES de la BAN locale (non copiées) :"
lire_dest -c "SELECT DISTINCT '  · ' || commune || ' (' || coalesce(code_postal, '?') || ')' FROM gestion_annuaire_lot
               WHERE btrim(coalesce(commune, '')) <> '' AND code_postal !~ '^75[0-9]{3}$'
                 AND $(printf "$NORM" 'commune') NOT IN ($(lire_source -c "SELECT string_agg(DISTINCT quote_literal($(printf "$NORM" 'nom_commune')), ',') FROM adresse_ban"))
               ORDER BY 1"

comptages() {
  echo "── $1 (svav_recette)"
  lire_dest -F ' : ' -c "SELECT 'adresses ' || coalesce(left(insee_commune, 2), '??'), count(*) FROM adresse_ban GROUP BY 1 ORDER BY 1" \
    -c "SELECT 'parcelles', count(*) FROM parcelle" \
    -c "SELECT 'adresses de Courbevoie (92026)', count(*) FROM adresse_ban WHERE insee_commune = '92026'" \
    -c "SELECT 'parcelles de Courbevoie (92026)', count(*) FROM parcelle WHERE commune = '92026'" \
    -c "SELECT '92026_7184_00054 (54 avenue Puvis de Chavannes)', coalesce(string_agg(numero || coalesce(' ' || suffixe, '') || ' ' || nom_voie || ', ' || nom_commune, ' | '), 'ABSENTE') FROM adresse_ban WHERE cle_d_interoperabilite = '92026_7184_00054'"
}
comptages "AVANT"
echo "── à copier depuis $SOURCE (lecture seule) :"
lire_source -F ' : ' -c "SELECT 'adresses', count(*) FROM adresse_ban WHERE insee_commune IN ($INSEE)" -c "SELECT 'parcelles', count(*) FROM parcelle WHERE commune IN ($INSEE)"

if [[ $COPIER == 1 ]]; then
  # ── 2. la copie, une table puis l'autre : source en lecture seule | destination gardée, dans UNE transaction chacune ─────────────────────────
  for T in adresse_ban parcelle; do
    FILTRE=$([[ $T == adresse_ban ]] && echo "insee_commune IN ($INSEE)" || echo "commune IN ($INSEE)")
    lire_source -c "COPY (SELECT * FROM $T WHERE $FILTRE ORDER BY fid) TO STDOUT" \
    | psql -X -q -v ON_ERROR_STOP=1 -1 -d "$DEST" \
        -c "DO \$\$ BEGIN IF current_database() <> 'svav_recette' THEN RAISE EXCEPTION 'GARDE : la destination n''est pas svav_recette, rien n''est écrit.'; END IF; END \$\$" \
        -c "CREATE TEMP TABLE copie_entrante (LIKE $T INCLUDING DEFAULTS) ON COMMIT DROP" \
        -c "\\copy copie_entrante FROM pstdin" \
        -c "WITH n AS (INSERT INTO $T SELECT * FROM copie_entrante ON CONFLICT (fid) DO NOTHING RETURNING 1) SELECT '$T : ' || count(*) || ' ligne(s) ajoutée(s)' FROM n" \
      || { echo "⛔ Copie de $T interrompue : la transaction est annulée, rien de $T n'est écrit."; exit 4; }
  done
  psql -X -q -v ON_ERROR_STOP=1 -d "$DEST" -c "DO \$\$ BEGIN IF current_database() <> 'svav_recette' THEN RAISE EXCEPTION 'GARDE'; END IF; END \$\$" -c "ANALYZE adresse_ban" -c "ANALYZE parcelle"
  comptages "APRÈS"
fi
} 2>&1 | tee "$RAPPORT"
echo "Rapport : $RAPPORT"
