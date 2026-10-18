#!/usr/bin/env bash
# deploy/maj/serveur.sh — met la prod à jour vers UN commit, avec retour arrière automatique (lot 4 de la mise à jour
# de la prod en une commande). Lancé par scripts/prod-mettre-a-jour.sh depuis le Mac, dans une unité transitoire
# systemd (svav-maj) : une coupure ssh n'interrompt rien. Jamais à la main, sauf secours.
#
#   serveur.sh --essai     <sha40> --journal=<fichier.log> [options]   tout SAUF la bascule et l'écriture en base
#   serveur.sh --appliquer <sha40> --journal=<fichier.log> [options]
#     --empreinte-amorcage=<16 hex>        1re utilisation : amorce le registre svav_migration (liste affichée par l'essai)
#     --accepter-irreversible=<f1,f2>      migrations marquées « -- svav:irreversible » explicitement acceptées
#
# DÉROULÉ                                                        ESSAI  APPLIQUER
#   0  préconditions (verrou, current est un lien, place, sauvegarde nocturne pas en cours, registre)    ✓      ✓
#   1  miroir git à jour, le commit est bien sur origin/main                                             ✓      ✓
#   2  SAUVEGARDE de la base sans LiDAR (bascule-sans-lidar.sh exporter), vérifiée par pg_restore --list   ✓      ✓
#      dans /home/ubuntu/sauvegardes-maj/<id>/ — les 10 dernières sont gardées
#   3  version préparée À CÔTÉ : releases/<sha> (git archive, liens shared/, npm ci, next build) ;        ✓      ✓
#      le site en service n'est pas touché ; une version déjà prête (témoin PRETE) est réutilisée
#   4  plan des migrations (registre) ; 1re fois : amorçage AFFICHÉ (essai) puis écrit (appliquer)       affiché  écrit
#   5  pause des minuteries (veille, Drive, surveillance, analytics) et fin des passes en cours            —      ✓
#   6  migrations NOUVELLES seules, chacune inscrite au registre                                          —      ✓
#   7  golden pipeline.itest.ts lancé depuis la nouvelle version : tous verts (≥ 11), sinon pas de bascule  ✓      ✓
#   8  unités systemd régénérées si leurs gabarits ont changé ; BASCULE du lien current (un seul geste)   affiché  ✓
#   9  redémarrage svav-next et svav-gestion-continu, attente de stabilité, vérifications :               —      ✓
#      / et /admin/login 200 (local et public), surveillance --essai sans problème
#  10  échec en 9 → RETOUR AUTOMATIQUE : lien current remis, unités d'avant remises, redémarrage, 200      —      ✓
#  11  minuteries relancées (toujours, même en cas d'échec) ; 5 versions gardées ; ligne d'historique     ✓      ✓
#
# LA BASE N'EST JAMAIS RESTAURÉE AUTOMATIQUEMENT. Après un retour arrière, les migrations passées RESTENT (elles
# ajoutent, l'ancien code les ignore). Restaurer la sauvegarde de l'étape 2 efface tout ce qui a été écrit depuis :
# c'est une décision humaine (scripts/bascule-sans-lidar.sh restaurer, cf. docs/BASCULE_DEROULE.md).
# Codes de sortie : 0 réussi · 2 refusé avant toute modification · 1 échec (retour fait ou à faire, voir le journal).
# Ne touche jamais aux 4 tables LiDAR ; n'utilise ni stash, ni checkout, ni reset, ni clean ; n'affiche aucun secret.

set -uo pipefail

# SVAV_MAJ_BASE_ESSAI : racine factice pour les tests sur le Mac (app/lib/ops/prodMettreAJourServeur.test.ts) ; jamais
# posée par l'unité svav-maj, donc toujours /home/ubuntu/sansvisavis en prod.
BASE=${SVAV_MAJ_BASE_ESSAI:-/home/ubuntu/sansvisavis}
CURRENT=$BASE/current
RELEASES=$BASE/releases
SHARED=$BASE/shared
DEPOT=$BASE/depot.git
MAJ=$BASE/maj
SAUVMAJ=${SVAV_MAJ_BASE_ESSAI:+$SVAV_MAJ_BASE_ESSAI/sauvegardes-maj}
SAUVMAJ=${SAUVMAJ:-/home/ubuntu/sauvegardes-maj}
CONF=/etc/svav/svav.conf
UNITES=/etc/systemd/system
U=ubuntu
URL_PUBLIQUE=https://authentification.sansvisavis.com
GARDER_SAUVEGARDES=10
GARDER_VERSIONS=5
PLACE_MIN_GO=30
STABLE_S=30
STABLE_MAX_S=150
ATTENTE_PASSES_MAX_S=900
MINUTERIES=(svav-veille svav-drive-empreintes svav-surveillance svav-analytics-maintenance)
AMORCAGE_JUSQUA=357
AMORCAGE_ECARTER=148,212,216,262

MODE=${1:-}; SHA=${2:-}; shift 2 2>/dev/null || true
JOURNAL=""; EMPREINTE_AMORCAGE=""; ACCEPTER_IRREV=""; ERREUR_ARGS=""
for a in "$@"; do
  case $a in
    --journal=*) JOURNAL=${a#*=} ;;
    --empreinte-amorcage=*) EMPREINTE_AMORCAGE=${a#*=} ;;
    --accepter-irreversible=*) ACCEPTER_IRREV=${a#*=} ;;
    *) ERREUR_ARGS=${ERREUR_ARGS:-"option inconnue : $a"} ;;
  esac
done
# 🔴 Arno (18/10/2026) : une erreur d'appel ne sort plus AVANT le journal — elle y est écrite, avec la ligne finale
#    « ═══ REFUSÉ … ═══ » (plus bas, une fois `refuser` défini), sinon le Mac croit à une connexion perdue. Seul un appel
#    SANS journal (jamais celui du Mac) sort ici : il n'y a nulle part où écrire.
[[ $MODE == --essai || $MODE == --appliquer ]] || ERREUR_ARGS=${ERREUR_ARGS:-"usage : serveur.sh --essai|--appliquer <sha40> --journal=…"}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || ERREUR_ARGS=${ERREUR_ARGS:-"commit invalide : « $SHA » (40 caractères hexadécimaux attendus)"}
[[ -n $JOURNAL ]] || { echo "--journal manquant"; exit 2; }
ESSAI=0; [[ $MODE == --essai ]] && ESSAI=1
ID=$(basename "$JOURNAL" .log)

install -d -o $U -g $U -m 0755 "$MAJ"
exec >>"$JOURNAL" 2>&1
chown $U:$U "$JOURNAL"

T0=$SECONDS
ECHECS=0
PAUSE=0
BASCULE=0
ANCIENNE=""
MIGRATIONS_PASSEES=()
SAUVEGARDE="—"
RESULTAT="?"

heure()  { date '+%H:%M:%S'; }
etape()  { printf '\n[%s] ▶ %s\n' "$(heure)" "$*"; }
dire()   { printf '  %s\n' "$*"; }
ok()     { printf '  OK   %s\n' "$*"; }
ko()     { printf '  ⛔   %s\n' "$*"; ECHECS=$((ECHECS + 1)); }
commeU() { runuser -u $U -- env HOME=/home/$U PATH=/usr/bin:/bin:/usr/local/bin "$@"; }
avecEnv() { commeU bash -c 'set -a; . ./.env; set +a; exec "$@"' _ "$@"; } # dans le dossier courant, avec son .env
sqlv()    { commeU bash -c 'set -a; . ./.env; set +a; exec psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 "$@"' _ "$@"; } # idem, psql sur DATABASE_URL (jamais affichée)

FINI=0
terminer() { # $1 code, $2 résultat lisible
  local code=$1; RESULTAT=$2
  reprendre_minuteries
  printf '\n[%s] ═══ %s ═══ (%d s)\n' "$(heure)" "$RESULTAT" $((SECONDS - T0))
  FINI=1
  local migs; migs=$(IFS=,; echo "${MIGRATIONS_PASSEES[*]:-aucune}")
  [[ -f $MAJ/historique.tsv ]] || printf 'date\tde\tvers\tmode\tmigrations\tsauvegarde\tresultat\tduree_s\tjournal\n' > "$MAJ/historique.tsv"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$(basename "${ANCIENNE:-?}")" "${SHA:0:12}" "${MODE#--}" \
    "$migs" "$SAUVEGARDE" "$RESULTAT" $((SECONDS - T0)) "$JOURNAL" >> "$MAJ/historique.tsv"
  chown $U:$U "$MAJ/historique.tsv"
  echo "$code" > "$MAJ/$ID.code"
  exit "$code"
}
refuser() { ko "$*"; terminer 2 "REFUSÉ (rien n'a été modifié en service)"; }

# 🔴 TOUTE fin du script écrit une ligne finale (Arno, 18/10/2026) : un arrêt imprévu (commande qui tue le script, arrêt
#    de l'unité, erreur non rattrapée) conclut « ÉCHEC — ARRÊT INATTENDU », pour que « RÉSULTAT INCONNU » côté Mac reste
#    réservé aux vraies pertes de connexion.
fin_inattendue() {
  local c=$1
  (( FINI )) && return 0
  ko "le script s'est arrêté avant sa conclusion (code $c)"
  terminer 1 "ÉCHEC — ARRÊT INATTENDU DU SCRIPT (code $c) : lire le journal, l'état en service est à vérifier"
}
trap 'fin_inattendue $?' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP

reprendre_minuteries() {
  (( PAUSE )) || return 0
  for m in "${MINUTERIES[@]}"; do systemctl start "$m.timer" < /dev/null; done
  PAUSE=0; ok "minuteries relancées : ${MINUTERIES[*]}"
}

attendre_stable() { # même règle que adopter-releases.sh : actif ≥ STABLE_S s, NRestarts et processus inchangés
  local u=$1 debut=$SECONDS n0 n etat pid pid0="" depuis
  n0=$(systemctl show -p NRestarts --value "$u" < /dev/null)
  while (( SECONDS - debut < STABLE_MAX_S )); do
    etat=$(systemctl show -p ActiveState --value "$u" < /dev/null)
    n=$(systemctl show -p NRestarts --value "$u" < /dev/null)
    pid=$(systemctl show -p MainPID --value "$u" < /dev/null)
    if [[ $n != "$n0" ]]; then ko "$u redémarré seul (NRestarts $n0 → $n)"; return 1; fi
    if [[ $etat == active ]]; then
      [[ -z $pid0 ]] && pid0=$pid
      if [[ $pid != "$pid0" ]]; then ko "$u : processus principal changé ($pid0 → $pid)"; return 1; fi
      depuis=$(( $(date +%s) - $(date -d "$(systemctl show -p ActiveEnterTimestamp --value "$u" < /dev/null)" +%s) ))
      if (( depuis >= STABLE_S )); then ok "$u stable : actif depuis $depuis s, NRestarts=$n, PID $pid"; return 0; fi
    fi
    sleep 2
  done
  ko "$u pas stable après $STABLE_MAX_S s (état $etat, NRestarts $n0 → $n)"; return 1
}

verifier_site() {
  local chemin base code t
  for chemin in / /admin/login; do
    for base in http://127.0.0.1:3000 "$URL_PUBLIQUE"; do
      t=$(mktemp); code=$(curl -s -m 30 -o "$t" -w '%{http_code}' "$base$chemin" < /dev/null)
      if [[ $code == 200 ]] && ! grep -q -e 'Build Error' -e 'Module not found' "$t"; then ok "$base$chemin → 200"; else ko "$base$chemin → $code"; fi
      rm -f "$t"
    done
  done
}

# Bilan du golden lu dans le RAPPORT JSON de vitest (--reporter=json), jamais à l'écran : la sortie lisible est colorée
# (codes ANSI) et la ligne « Tests » n'était pas reconnue (essai du 15/10/2026 19:53, 11/11 refusé). Affiche passés/total ;
# vrai SEULEMENT si : rapport lisible, un seul fichier = pipeline.itest.ts, success, au moins 11 tests, tous passés,
# aucun échoué, sauté ni « à faire ».
golden_ok() {
  /usr/bin/env node -e '
    let r; try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch { console.log("rapport JSON absent ou illisible"); process.exit(1); }
    const t = r.numTotalTests ?? 0, p = r.numPassedTests ?? 0, e = r.numFailedTests ?? 0, s = r.numPendingTests ?? 0, a = r.numTodoTests ?? 0;
    const fichiers = (r.testResults ?? []).map((x) => x.name);
    const bonFichier = fichiers.length === 1 && /\/app\/lib\/db\/pipeline\.itest\.ts$/.test(fichiers[0]);
    console.log(`${p}/${t}` + (e + s + a ? ` (${e} échoué(s), ${s} sauté(s), ${a} à faire)` : "") + (bonFichier ? "" : ` — fichier(s) inattendu(s) : ${fichiers.join(", ") || "aucun"}`));
    process.exit(r.success === true && bonFichier && t >= 11 && p === t && e + s + a === 0 ? 0 : 1);
  ' "$1"
}

# Garde au plus GARDER_VERSIONS versions dans releases/ : la nouvelle et celle d'avant (retour) TOUJOURS, puis les
# plus récentes. Ne retire que des dossiers nommés par un sha de 40 caractères ; app/ (version zéro) est hors releases/.
menage_versions() {
  etape "11. Ménage des versions"
  local v gardees=0
  mapfile -t versions < <(ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::' | grep -E '/[0-9a-f]{40}$')
  for v in "${versions[@]}"; do
    if [[ $v == "$REL" || $v == "$ANCIENNE" || $v == "$(readlink -f "$CURRENT")" ]] || (( gardees < GARDER_VERSIONS )); then gardees=$((gardees + 1)); continue; fi
    rm -rf -- "$v" && dire "ancienne version retirée : $(basename "$v")"
  done
  ok "versions dans releases/ : $(ls -1d "$RELEASES"/*/ 2>/dev/null | grep -cE '/[0-9a-f]{40}/$') (au plus $GARDER_VERSIONS, plus celle en service et la précédente si plus anciennes)"
}

# ── 0. Préconditions ─────────────────────────────────────────────────────────────────────────────────────────────
printf '══ Mise à jour de la prod — %s — %s ══\n' "$(date '+%F %T')" "${MODE#--}"
etape "0. Préconditions"
[[ -z $ERREUR_ARGS ]] || refuser "appel invalide — $ERREUR_ARGS"
exec 9> "$MAJ/verrou"
flock -n 9 || refuser "une autre mise à jour tient le verrou $MAJ/verrou"
[[ $(id -u) == 0 ]] || refuser "doit tourner en root (unité svav-maj)"
[[ -L $CURRENT ]] || refuser "$CURRENT n'est pas un lien (adoption du lot 3 non faite ?)"
ANCIENNE=$(readlink -f "$CURRENT"); ok "en service : $ANCIENNE ($(cat "$ANCIENNE/REVISION" 2>/dev/null || echo 'version zéro, sans REVISION'))"
# Une fin NORMALE, comme les autres : la ligne finale de succès (le Mac affiche « Terminé : déjà en service — rien à faire »).
[[ $ANCIENNE == "$(readlink -f "$RELEASES/$SHA" 2>/dev/null || echo "$RELEASES/$SHA")" ]] && { ok "ce commit est DÉJÀ en service — rien à faire"; terminer 0 "DÉJÀ EN SERVICE — rien à faire"; }
[[ $(systemctl is-active svav-sauvegarde.service < /dev/null) != activ* ]] && ok "sauvegarde nocturne pas en cours" || refuser "sauvegarde nocturne en cours : réessayer après sa fin"
place=$(df -BG --output=avail /home | tail -1 | tr -dc 0-9)
(( place >= PLACE_MIN_GO )) && ok "place libre : ${place} Go" || refuser "place libre ${place} Go < ${PLACE_MIN_GO} Go"
REGISTRE=$(cd "$ANCIENNE" && sqlv -c "select coalesce(to_regclass('public.svav_migration')::text, 'absent')" < /dev/null 2>&1 | tail -1)
case $REGISTRE in
  svav_migration) ok "registre des migrations présent" ;;
  absent) if (( ESSAI )) || [[ -n $EMPREINTE_AMORCAGE ]]; then ok "registre absent : amorçage à cette mise à jour (1re utilisation)"
          else refuser "registre absent : lancer d'abord --essai, qui affiche l'amorçage, puis --appliquer --empreinte-amorcage=<empreinte affichée>"; fi ;;
  *) refuser "lecture du registre impossible : $REGISTRE" ;;
esac

# ── 1. Miroir git ────────────────────────────────────────────────────────────────────────────────────────────────
etape "1. Miroir git et commit visé"
ORIGINE=$(commeU git -C "$BASE/app" remote get-url origin 2>/dev/null) # en ubuntu : root refuserait un dépôt qui ne lui appartient pas (safe.directory)
if [[ ! -d $DEPOT ]]; then
  commeU git clone -q --mirror "$ORIGINE" "$DEPOT" < /dev/null && ok "miroir créé : $DEPOT" || refuser "clonage du miroir impossible"
else
  commeU git --git-dir="$DEPOT" fetch -q --prune origin < /dev/null && ok "miroir à jour" || refuser "lecture de GitHub impossible (git fetch)"
fi
commeU git --git-dir="$DEPOT" cat-file -e "$SHA^{commit}" 2>/dev/null || refuser "commit $SHA introuvable sur GitHub (pas poussé ?)"
commeU git --git-dir="$DEPOT" merge-base --is-ancestor "$SHA" refs/heads/main || refuser "commit $SHA absent de main"
ok "commit $(commeU git --git-dir="$DEPOT" log -1 --format='%h %s' "$SHA")"

# ── 2. Sauvegarde ────────────────────────────────────────────────────────────────────────────────────────────────
etape "2. Sauvegarde de la base sans LiDAR (TOUJOURS)"
install -d -o $U -g $U -m 0700 "$SAUVMAJ" "$SAUVMAJ/$ID"
DUMP=$SAUVMAJ/$ID/base-sans-lidar.dump
t=$SECONDS
commeU bash "$ANCIENNE/scripts/bascule-sans-lidar.sh" exporter sansvisavis "$DUMP" < /dev/null | sed 's/^/  /' \
  || refuser "export de la base en échec"
liste=$(commeU pg_restore --list "$DUMP" 2>/dev/null) || refuser "pg_restore --list illisible sur $DUMP"
n=$(grep -c -v '^;' <<<"$liste")
grep -q 'TABLE DATA public gestion_message ' <<<"$liste" || refuser "la sauvegarde ne contient pas les données de gestion_message"
grep -qE 'TABLE DATA public (mns_lidar_brut|mnt_lidar_brut|mns_bati_propre|rge_alti) ' <<<"$liste" && refuser "la sauvegarde contient des données LiDAR (inattendu)"
echo "$n entrées" > "$SAUVMAJ/$ID/LISTE_VERIFIEE"; chown $U:$U "$SAUVMAJ/$ID/LISTE_VERIFIEE"
SAUVEGARDE=$DUMP
ok "sauvegarde vérifiée : $DUMP ($(du -h "$DUMP" | cut -f1), $n entrées, $((SECONDS - t)) s)"
mapfile -t vieilles < <(ls -1d "$SAUVMAJ"/20*/ 2>/dev/null | sort | head -n -$GARDER_SAUVEGARDES)
for d in "${vieilles[@]}"; do rm -rf -- "$d" && dire "ancienne sauvegarde retirée : $d"; done
ok "sauvegardes de mise à jour gardées : $(ls -1d "$SAUVMAJ"/20*/ | wc -l) (au plus $GARDER_SAUVEGARDES)"

# ── 3. Version préparée à côté ───────────────────────────────────────────────────────────────────────────────────
etape "3. Préparation de $RELEASES/$SHA (le site en service n'est pas touché)"
REL=$RELEASES/$SHA
install -d -o $U -g $U -m 0755 "$RELEASES"
if [[ -f $REL/PRETE && $(cat "$REL/REVISION" 2>/dev/null) == "$SHA" ]]; then
  ok "version déjà prête (témoin PRETE) : réutilisée"
else
  [[ -e $REL ]] && { rm -rf -- "$REL"; dire "préparation inachevée précédente retirée"; }
  commeU mkdir "$REL"
  commeU bash -c "git --git-dir='$DEPOT' archive '$SHA' | tar -x -C '$REL'" < /dev/null || refuser "extraction du commit impossible"
  commeU ln -s "$SHARED/.env" "$REL/.env" && commeU ln -s "$SHARED/data" "$REL/data" && ok "liens .env et data → shared/"
  echo "$SHA" | commeU tee "$REL/REVISION" > /dev/null
  t=$SECONDS
  (cd "$REL" && commeU nice -n 10 npm ci --no-audit --no-fund < /dev/null > "$MAJ/$ID.npm-ci.log" 2>&1) \
    && ok "npm ci ($((SECONDS - t)) s)" || { tail -20 "$MAJ/$ID.npm-ci.log" | sed 's/^/     /'; refuser "npm ci en échec (détail : $MAJ/$ID.npm-ci.log)"; }
  t=$SECONDS
  (cd "$REL" && commeU env NEXT_TELEMETRY_DISABLED=1 nice -n 10 ionice -c3 npm run build < /dev/null > "$MAJ/$ID.build.log" 2>&1) \
    && ok "next build ($((SECONDS - t)) s)" || { tail -30 "$MAJ/$ID.build.log" | sed 's/^/     /'; refuser "next build en échec (détail : $MAJ/$ID.build.log)"; }
  commeU touch "$REL/PRETE"
fi

# ── 4. Plan des migrations ───────────────────────────────────────────────────────────────────────────────────────
etape "4. Migrations"
cd "$REL" || refuser "dossier $REL inaccessible"
if [[ $REGISTRE == absent ]]; then
  dire "1re utilisation : amorçage du registre (001 → $AMORCAGE_JUSQUA déjà appliquées, $AMORCAGE_ECARTER écartées)"
  sortie=$(avecEnv node_modules/.bin/tsx scripts/migrations-amorcer.ts --jusqua=$AMORCAGE_JUSQUA --ecarter=$AMORCAGE_ECARTER < /dev/null 2>&1)
  grep -E '^== |^  \[|Écartées|Empreinte|RIEN ÉCRIT|ABSENTS' <<<"$sortie" | sed 's/^/  /'
  attendue=$(grep -oE 'Empreinte de cette liste : [0-9a-f]{16}' <<<"$sortie" | grep -oE '[0-9a-f]{16}$')
  [[ -n $attendue ]] || refuser "l'amorçage n'a pas produit d'empreinte"
  if (( ESSAI )); then
    ok "amorçage AFFICHÉ, rien écrit — pour l'écrire : --appliquer --empreinte-amorcage=$attendue"
  else
    [[ $EMPREINTE_AMORCAGE == "$attendue" ]] || refuser "empreinte d'amorçage « $EMPREINTE_AMORCAGE » ≠ liste actuelle $attendue : relancer l'essai"
  fi
fi
if [[ $REGISTRE == absent ]] && (( ESSAI )); then
  # Sans registre, le plan se déduit de l'amorçage : sont nouveaux les fichiers au-delà de AMORCAGE_JUSQUA, hors 358.
  PLAN=$(ls db/migrations/*.sql | xargs -n1 basename | awk -F_ -v j=$AMORCAGE_JUSQUA '$1+0 > j && $0 != "358_svav_migration.sql" { print "NOUVELLE\t" $0 "\t?\t?\t?" }')
else
  PLAN=""  # calculé après l'amorçage, en 6
fi

# ── 5-6. Pause et migrations (appliquer seulement) ───────────────────────────────────────────────────────────────
if (( ! ESSAI )); then
  etape "5. Pause des minuteries et fin des passes en cours"
  for m in "${MINUTERIES[@]}"; do systemctl stop "$m.timer" < /dev/null; done; PAUSE=1
  ok "minuteries arrêtées : ${MINUTERIES[*]} (relancées à la fin, quoi qu'il arrive)"
  debut=$SECONDS
  while :; do
    encours=(); for m in "${MINUTERIES[@]}"; do [[ $(systemctl is-active "$m.service" < /dev/null) == activ* ]] && encours+=("$m"); done
    (( ${#encours[@]} == 0 )) && { ok "aucune passe en cours"; break; }
    (( SECONDS - debut > ATTENTE_PASSES_MAX_S )) && refuser "passes encore en cours après $ATTENTE_PASSES_MAX_S s : ${encours[*]}"
    dire "attente de la fin de : ${encours[*]}"; sleep 15
  done

  etape "6. Migrations nouvelles"
  if [[ $REGISTRE == absent ]]; then
    avecEnv node_modules/.bin/tsx scripts/migrations-amorcer.ts --jusqua=$AMORCAGE_JUSQUA --ecarter=$AMORCAGE_ECARTER \
      --appliquer --empreinte="$EMPREINTE_AMORCAGE" < /dev/null 2>&1 | grep -E 'INSCRIT|ERREUR|Empreinte attendue' | sed 's/^/  /'
    [[ $(sqlv -c "select count(*) from svav_migration" < /dev/null 2>/dev/null) -gt 300 ]] \
      && ok "registre amorcé" || refuser "amorçage du registre en échec"
  fi
fi
if (( ! ESSAI )) || [[ $REGISTRE != absent ]]; then
  PLAN=$(avecEnv node_modules/.bin/tsx scripts/migrations-plan.ts < /dev/null 2>&1); code=$?
  (( code == 0 )) || { sed 's/^/     /' <<<"$PLAN"; refuser "calcul du plan des migrations en échec (code $code)"; }
fi
grep -P '^AVERT\t' <<<"$PLAN" | cut -f2 | sed 's/^/  ⚠    /'
if grep -qP '^REFUS\t' <<<"$PLAN"; then grep -P '^REFUS\t' <<<"$PLAN" | cut -f2 | sed 's/^/  ⛔   /'; refuser "migration(s) refusée(s) par le garde"; fi
mapfile -t NOUVELLES < <(grep -P '^NOUVELLE\t' <<<"$PLAN")
if (( ${#NOUVELLES[@]} == 0 )); then ok "aucune migration nouvelle"
else
  for l in "${NOUVELLES[@]}"; do IFS=$'\t' read -r _ f mode irrev _ <<<"$l"; dire "nouvelle : $f (mode $mode$([[ $irrev == 1 ]] && echo ', IRRÉVERSIBLE'))"; done
fi
for l in "${NOUVELLES[@]}"; do
  IFS=$'\t' read -r _ f mode irrev sha256 <<<"$l"
  if [[ $irrev == 1 && ",$ACCEPTER_IRREV," != *",$f,"* ]]; then refuser "$f est marquée irréversible : relancer avec --accepter-irreversible=$f si c'est voulu"; fi
done
if (( ! ESSAI )); then
  for l in "${NOUVELLES[@]}"; do
    IFS=$'\t' read -r _ f mode irrev sha256 <<<"$l"
    ins="insert into svav_migration (fichier, sha256, origine, commit_git, duree_ms) values ('$f', '$sha256', 'mise_a_jour', '$SHA', null)"
    t0=$(date +%s%3N)
    if [[ $mode == enveloppee ]]; then
      avecEnv bash -c 'psql "$DATABASE_URL" -X -q -1 -v ON_ERROR_STOP=1 -f "$1" -c "$2"' _ "db/migrations/$f" "$ins" < /dev/null 2>&1 | sed 's/^/     /'
    else
      avecEnv bash -c 'psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$1" -c "$2"' _ "db/migrations/$f" "$ins" < /dev/null 2>&1 | sed 's/^/     /'
    fi
    rc=${PIPESTATUS[0]}; duree=$(( $(date +%s%3N) - t0 ))
    if (( rc != 0 )); then
      ko "migration $f en ÉCHEC (code $rc)$([[ $mode == enveloppee ]] && echo ' — annulée entière (une transaction)' || echo ' — le fichier gère ses transactions : état à vérifier')"
      terminer 1 "ÉCHEC À LA MIGRATION $f — pas de bascule, version en service inchangée"
    fi
    sqlv -q -c "update svav_migration set duree_ms = $duree where fichier = '$f'" < /dev/null
    MIGRATIONS_PASSEES+=("$f"); ok "migration $f appliquée et inscrite ($duree ms, mode $mode)"
  done
fi

# ── 7. Golden ────────────────────────────────────────────────────────────────────────────────────────────────────
etape "7. Golden (pipeline.itest.ts) depuis la nouvelle version"
t=$SECONDS
RAPPORT=$MAJ/$ID.golden.json; rm -f "$RAPPORT"
sortie=$(avecEnv env NO_COLOR=1 node_modules/.bin/vitest run --config vitest.integration.config.ts app/lib/db/pipeline.itest.ts \
  --reporter=default --reporter=json --outputFile.json="$RAPPORT" < /dev/null 2>&1)
if bilan=$(golden_ok "$RAPPORT"); then ok "golden : $bilan ($((SECONDS - t)) s)"
else
  tail -25 <<<"$sortie" | sed 's/^/     /'
  ko "golden : $bilan (rapport : $RAPPORT)"
  terminer 1 "GOLDEN EN ÉCHEC — pas de bascule$( (( ${#MIGRATIONS_PASSEES[@]} )) && echo " (migrations passées, elles restent : ${MIGRATIONS_PASSEES[*]})")"
fi

# ── 8. Unités et bascule ─────────────────────────────────────────────────────────────────────────────────────────
etape "8. Unités systemd et bascule"
GEN=$(mktemp -d)
bash "$REL/deploy/systemd/installer.sh" --essai "$GEN/u" "$CONF" < /dev/null > "$GEN/log" 2>&1 || { sed 's/^/     /' "$GEN/log"; rm -rf "$GEN"; refuser "gabarits d'unités de la nouvelle version invalides"; }
CHANGEES=()
for f in "$GEN"/u/*; do cmp -s "$f" "$UNITES/$(basename "$f")" || CHANGEES+=("$(basename "$f")"); done
rm -rf "$GEN"
if (( ${#CHANGEES[@]} )); then dire "unités dont le gabarit change : ${CHANGEES[*]}"; else ok "unités inchangées"; fi
if (( ESSAI )); then
  dire "ESSAI : bascule NON faite. Elle ferait : current → $REL, redémarrage de svav-next et svav-gestion-continu."
  menage_versions
  terminer 0 "ESSAI RÉUSSI — rien n'a changé en service (sauvegarde et version préparée gardées)"
fi
AVANT_UNITES=$MAJ/$ID.unites-avant
if (( ${#CHANGEES[@]} )); then
  mkdir -p "$AVANT_UNITES" && cp -p "$UNITES"/svav-*.service "$UNITES"/svav-*.timer "$AVANT_UNITES/"
fi


retour_arriere() {
  etape "10. RETOUR ARRIÈRE AUTOMATIQUE vers $ANCIENNE"
  ECHECS=0
  ln -sfn "$ANCIENNE" "$CURRENT.retour" && chown -h $U:$U "$CURRENT.retour" && mv -T "$CURRENT.retour" "$CURRENT" && ok "current → $ANCIENNE"
  if [[ -d $AVANT_UNITES ]]; then
    for f in "$AVANT_UNITES"/*; do install -m 0644 -o root -g root "$f" "$UNITES/$(basename "$f")"; done
    systemctl daemon-reload < /dev/null && ok "unités d'avant remises"
  fi
  systemctl restart svav-next svav-gestion-continu < /dev/null && ok "svav-next et svav-gestion-continu redémarrés"
  attendre_stable svav-next; attendre_stable svav-gestion-continu; verifier_site
  (( ${#MIGRATIONS_PASSEES[@]} )) && dire "⚠ migrations passées, elles RESTENT en base : ${MIGRATIONS_PASSEES[*]} (restaurer $SAUVEGARDE = décision humaine)"
  (( ECHECS == 0 )) && terminer 1 "ÉCHEC — RETOUR ARRIÈRE FAIT, ancienne version en service et vérifiée" \
                    || terminer 1 "ÉCHEC — RETOUR ARRIÈRE AVEC $ECHECS PROBLÈME(S) : à voir tout de suite"
}

if (( ${#CHANGEES[@]} )); then
  if journal_inst=$(bash "$REL/deploy/systemd/installer.sh" "$CONF" < /dev/null 2>&1); then
    ok "unités régénérées depuis la nouvelle version (copie d'avant : $AVANT_UNITES)"
  else
    sed 's/^/     /' <<<"$journal_inst"
    for f in "$AVANT_UNITES"/*; do install -m 0644 -o root -g root "$f" "$UNITES/$(basename "$f")"; done; systemctl daemon-reload < /dev/null
    ko "installation des nouvelles unités en échec — unités d'avant remises"
    terminer 1 "ÉCHEC AUX UNITÉS — pas de bascule, version en service inchangée$( (( ${#MIGRATIONS_PASSEES[@]} )) && echo " (migrations passées, elles restent : ${MIGRATIONS_PASSEES[*]})")"
  fi
fi
ln -sfn "$REL" "$CURRENT.nouveau" && chown -h $U:$U "$CURRENT.nouveau" && mv -T "$CURRENT.nouveau" "$CURRENT" \
  && { BASCULE=1; ok "BASCULE : current → $REL"; } || { ko "pose du lien current"; retour_arriere; }

# ── 9. Redémarrages et vérifications ─────────────────────────────────────────────────────────────────────────────
etape "9. Redémarrages et vérifications"
ECHECS=0
systemctl restart svav-next svav-gestion-continu < /dev/null && ok "svav-next et svav-gestion-continu redémarrés" || ko "redémarrage"
attendre_stable svav-next; attendre_stable svav-gestion-continu
verifier_site
reprendre_minuteries
sortie=$(cd "$CURRENT" && timeout 180 /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/surveillance.ts --essai < /dev/null 2>&1)
if grep -q 'Mode essai' <<<"$sortie" && ! grep -q '^  ⚠' <<<"$sortie"; then ok "surveillance --essai : aucun problème ($(grep -c '^  OK' <<<"$sortie") contrôles OK)"
else ko "surveillance --essai :"; grep -E '^  ⚠|ERR|Error' <<<"$sortie" | head -10 | sed 's/^/     /'; fi
(( ECHECS == 0 )) || retour_arriere

# ── 11. Ménage ───────────────────────────────────────────────────────────────────────────────────────────────────
menage_versions
terminer 0 "MISE À JOUR RÉUSSIE — ${SHA:0:12} en service"
