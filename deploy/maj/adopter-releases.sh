#!/usr/bin/env bash
# adopter-releases.sh — passe le serveur au schéma « versions côte à côte + lien current », UNE SEULE FOIS (lot 3 de la
# mise à jour de la prod en une commande). Le comportement de la prod ne change pas : seul le CHEMIN change.
#
# ÉTAT AVANT                                   ÉTAT APRÈS
#   /home/ubuntu/sansvisavis/app  (le code)      /home/ubuntu/sansvisavis/app        inchangé = « version zéro »
#   app/.env  (vrai fichier)                     app/.env -> /home/ubuntu/sansvisavis/shared/.env
#   app/data  (absent)                           app/data -> /home/ubuntu/sansvisavis/shared/data   (data/sitadel de la veille)
#                                                /home/ubuntu/sansvisavis/current -> /home/ubuntu/sansvisavis/app
#                                                /home/ubuntu/sansvisavis/releases/  (vide ; rempli au lot 4)
#   /etc/svav/svav.conf APP_DIR=…/app            APP_DIR=/home/ubuntu/sansvisavis/current, unités réinstallées (installer.sh)
#   svav-sauvegarde archive app/.env             archive /home/ubuntu/sansvisavis/shared (le CONTENU réel, pas un lien)
#
# USAGE (depuis le Mac ; le serveur lit ce fichier sur son entrée — rien n'est copié à la main) :
#   ssh svav-prod 'sudo bash -s -- --essai'      < deploy/maj/adopter-releases.sh   # montre tout, N'ÉCRIT RIEN
#   ssh svav-prod 'sudo bash -s -- --appliquer'  < deploy/maj/adopter-releases.sh   # adopte, vérifie, revient seul si échec
#   ssh svav-prod 'sudo bash -s -- --retour'     < deploy/maj/adopter-releases.sh   # revient à l'état d'avant, à la main
#   Sans argument = --essai.
#
# PROCÉDURE DE RETOUR (écrite AVANT l'adoption ; c'est exactement ce que fait --retour, et ce que --appliquer lance seul
# si une vérification échoue) — chaque geste ne s'applique que si l'état l'exige, on peut donc la relancer sans risque :
#   1. /etc/svav/svav.conf et /usr/local/bin/svav-sauvegarde remis depuis /home/ubuntu/sansvisavis/adoption-avant/ ;
#   2. les fichiers d'unités svav-*.service remis depuis la même copie, puis systemctl daemon-reload ;
#   3. app/.env redevient un vrai fichier (copie de shared/.env posée d'un seul geste par mv -T) ;
#   4. le lien app/data est retiré (son contenu éventuel est recopié dans un vrai app/data) ;
#   5. le lien current est retiré, releases/ supprimé s'il est vide ;
#   6. svav-next et svav-gestion-continu redémarrés, puis / et /admin/login doivent répondre 200 ;
#   7. adoption-avant/ est renommé adoption-avant.annulee-<date> (trace gardée). shared/ est laissé en place (une copie du
#      .env, mêmes droits 600, sans effet) ; une nouvelle adoption le réutilise s'il n'a pas changé (shared_residuel).
#
# GARANTIES : ne touche ni la base ni les 4 tables LiDAR, ni MinIO, ni Caddy, ni les sauvegardes existantes ; n'utilise
# aucune commande git ; n'affiche aucune valeur du .env. La rotation de svav-sauvegarde (find "$RACINE" -mindepth 1
# -maxdepth 1 …) n'atteint ni /home/ubuntu/sauvegardes-maj ni releases/ : le script REFUSE si RACINE n'est pas
# /home/ubuntu/sauvegardes.

set -uo pipefail

BASE=/home/ubuntu/sansvisavis
APP=$BASE/app
SHARED=$BASE/shared
CURRENT=$BASE/current
RELEASES=$BASE/releases
AVANT=$BASE/adoption-avant
CONF=/etc/svav/svav.conf
SAUV=/usr/local/bin/svav-sauvegarde
UNITES=/etc/systemd/system
U=ubuntu
RACINE_ATTENDUE=/home/ubuntu/sauvegardes
CIBLE_ENV_SAUV=/home/ubuntu/sansvisavis/app/.env
URL_PUBLIQUE=https://authentification.sansvisavis.com

STABLE_S=30       # une unité redémarrée doit rester active au moins autant…
STABLE_MAX_S=150  # …avant ce délai, sinon c'est un échec

dire()  { printf '%s\n' "$*"; }
titre() { printf '\n== %s ==\n' "$*"; }
ok()    { printf '  OK   %s\n' "$*"; }
ko()    { printf '  ⛔   %s\n' "$*"; ECHECS=$((ECHECS + 1)); }
ECHECS=0

# Le retour laisse shared/ en place (étape 7). Une nouvelle adoption le réutilise SEULEMENT s'il est exactement ce reste :
# un retour tracé (adoption-avant.annulee-…), et dedans rien d'autre qu'un .env identique à app/.env et un data/ vide.
shared_residuel() {
  compgen -G "$AVANT.annulee-*" > /dev/null || return 1
  [[ -d $SHARED && ! -L $SHARED && -f $SHARED/.env && ! -L $SHARED/.env ]] || return 1
  cmp -s "$SHARED/.env" "$APP/.env" || return 1
  [[ -z $(ls -A "$SHARED" | grep -vx -e '.env' -e 'data') ]] || return 1
  [[ ! -e $SHARED/data ]] || { [[ -d $SHARED/data && ! -L $SHARED/data && -z $(ls -A "$SHARED/data") ]] || return 1; }
}

preconditions() {
  titre "Préconditions"
  [[ $(id -u) == 0 ]] && ok "lancé en root" || ko "doit être lancé avec sudo"
  [[ -d $APP && -f $APP/package.json ]] && ok "$APP existe" || ko "$APP introuvable"
  if [[ -f $APP/.env && ! -L $APP/.env ]]; then ok "app/.env est un vrai fichier ($(stat -c '%U:%G %a' "$APP/.env"))"; else ko "app/.env n'est pas un vrai fichier"; fi
  [[ ! -e $APP/data && ! -L $APP/data ]] && ok "app/data absent" || ko "app/data existe déjà"
  if [[ ! -e $SHARED ]]; then ok "shared/ absent"
  elif shared_residuel; then ok "shared/ laissé par un retour précédent (seulement .env identique à app/.env + data/ vide) : réutilisé"
  else ko "$SHARED existe déjà, et ce n'est pas le reste d'un retour (contenu : $(ls -A "$SHARED" | tr '\n' ' '))"; fi
  [[ ! -e $CURRENT && ! -L $CURRENT ]] && ok "current absent" || ko "$CURRENT existe déjà"
  [[ ! -e $RELEASES ]] && ok "releases/ absent" || ko "$RELEASES existe déjà"
  [[ ! -e $AVANT ]] && ok "aucune adoption précédente" || ko "$AVANT existe : adoption déjà tentée (--retour pour revenir)"
  [[ $(grep -c '^APP_DIR=' "$CONF") == 1 && $(grep '^APP_DIR=' "$CONF") == "APP_DIR=$APP" ]] && ok "svav.conf : APP_DIR=$APP" || ko "svav.conf : APP_DIR inattendu"
  [[ -x $APP/deploy/systemd/installer.sh ]] || [[ -f $APP/deploy/systemd/installer.sh ]] && ok "installer.sh présent" || ko "installer.sh introuvable"
  # Sans ces deux lignes, l'arrêt propre de la relève et de next est compté comme une panne (adoption du 15/10/2026 annulée).
  grep -qx 'KillMode=mixed' "$APP/deploy/systemd/svav-gestion-continu.service.in" && grep -qx 'SuccessExitStatus=143' "$APP/deploy/systemd/svav-next.service.in" \
    && ok "gabarits d'unités à jour (KillMode=mixed, SuccessExitStatus=143)" || ko "gabarits d'unités du serveur pas à jour : réaligner d'abord app/ sur origin/main"
  # Lancé par le lien current, un script qui compare argv[1] à import.meta.url sans chemin réel se croit importé et sort
  # en silence avec le code 0 (relève Gestion, adoption du 15/10/2026 19:21).
  local anciens; anciens=$(grep -l 'pathToFileURL(process.argv\[1\])' "$APP"/app/scripts/*.ts "$APP"/scripts/*.ts 2>/dev/null | wc -l)
  (( anciens == 0 )) && ok "aucun script avec l'ancienne garde de point d'entrée (sensible aux liens)" \
    || ko "$anciens script(s) avec l'ancienne garde de point d'entrée : réaligner d'abord app/ sur origin/main"
  [[ $(grep -c -F "$CIBLE_ENV_SAUV" "$SAUV") == 1 ]] && ok "svav-sauvegarde : une seule mention de app/.env" || ko "svav-sauvegarde : app/.env absent ou cité plusieurs fois"
  local racine; racine=$(grep -E '^RACINE=' "$SAUV" | head -1 | cut -d= -f2- | tr -d "\"'")
  [[ $racine == "$RACINE_ATTENDUE" ]] && ok "svav-sauvegarde : RACINE=$racine" || ko "svav-sauvegarde : RACINE=« $racine » (attendu $RACINE_ATTENDUE)"
  grep -qE 'find "\$RACINE" -mindepth 1 -maxdepth 1 ' "$SAUV" && ok "rotation bornée aux sous-dossiers directs de RACINE (ni sauvegardes-maj ni releases)" || ko "rotation de svav-sauvegarde inattendue"
  for u in svav-veille svav-drive-empreintes svav-surveillance svav-analytics-maintenance svav-sauvegarde; do
    [[ $(systemctl is-active "$u.service" < /dev/null) == activating || $(systemctl is-active "$u.service" < /dev/null) == active ]] && dire "  …    $u en cours (sans gêne : il garde son dossier jusqu'à la fin)"
  done
}

conf_nouvelle() { sed -e "s|^APP_DIR=.*$|APP_DIR=$CURRENT|" "$CONF"; }
sauv_nouvelle() { sed -e "s|$CIBLE_ENV_SAUV|$SHARED|" "$SAUV"; }

apercu() {
  titre "Changement de /etc/svav/svav.conf"
  diff -u "$CONF" <(conf_nouvelle) | tail -n +3
  titre "Changement de /usr/local/bin/svav-sauvegarde"
  diff -u "$SAUV" <(sauv_nouvelle) | tail -n +3
  bash -n <(sauv_nouvelle) && ok "syntaxe du nouveau svav-sauvegarde" || ko "syntaxe du nouveau svav-sauvegarde"
  titre "Unités régénérées par installer.sh (différences avec celles installées)"
  # current n'existe pas encore (installer.sh refuserait) : on génère avec la conf ACTUELLE, puis on remplace le chemin —
  # exactement ce que fera installer.sh, qui ne fait que substituer @APP_DIR@.
  local t; t=$(mktemp -d)
  if bash "$APP/deploy/systemd/installer.sh" --essai "$t/units" "$CONF" < /dev/null > "$t/log" 2>&1; then
    sed -i "s|$APP|$CURRENT|g" "$t"/units/*
    for f in "$t"/units/*; do
      n=$(basename "$f")
      if [[ -f $UNITES/$n ]]; then diff -q "$UNITES/$n" "$f" > /dev/null && dire "  =    $n identique" || { dire "  ~    $n :"; diff "$UNITES/$n" "$f" | grep '^[<>]' | sed 's/^/         /'; }
      else dire "  +    $n (nouveau)"; fi
    done
    grep -h -E 'ATTENTION' "$t/log" | sed 's/^/  /'
  else ko "installer.sh --essai a échoué :"; sed 's/^/     /' "$t/log"; fi
  rm -rf "$t"
}

# Attend qu'une unité redémarrée soit STABLE : active depuis au moins STABLE_S s, sans redémarrage automatique (NRestarts
# inchangé depuis l'appel) ni changement de processus principal, en STABLE_MAX_S s au plus. Un service qui « tient »
# 2 secondes puis retombe n'est pas un service qui marche (adoption du 15/10/2026 : vérifié trop tôt).
attendre_stable() {
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

verifier() {
  titre "Vérifications"
  local code
  attendre_stable svav-next; attendre_stable svav-gestion-continu
  for chemin in / /admin/login; do
    for base in http://127.0.0.1:3000 "$URL_PUBLIQUE"; do
      local t; t=$(mktemp); code=$(curl -s -o "$t" -w '%{http_code}' "$base$chemin" < /dev/null)
      if [[ $code == 200 ]] && ! grep -q -e 'Build Error' -e 'Module not found' "$t"; then ok "$base$chemin → 200"; else ko "$base$chemin → $code"; fi
      rm -f "$t"
    done
  done
  for u in svav-next svav-gestion-continu; do
    [[ $(systemctl is-active $u < /dev/null) == active ]] && ok "$u actif (dossier $(readlink /proc/$(systemctl show -p MainPID --value $u < /dev/null)/cwd))" || ko "$u inactif"
  done
  local n; n=$(grep -l "WorkingDirectory=$CURRENT" "$UNITES"/svav-*.service 2>/dev/null | wc -l)
  [[ $n -ge 7 ]] && ok "$n unités travaillent dans current" || ko "seulement $n unités dans current"
  if [[ -L $APP/.env ]] && cmp -s "$APP/.env" "$SHARED/.env"; then ok "app/.env → shared/.env (contenu identique)"; else ko "app/.env"; fi
  local sortie; sortie=$(cd "$CURRENT" && timeout 120 /usr/bin/node node_modules/tsx/dist/cli.mjs scripts/surveillance.ts --essai < /dev/null 2>&1)
  if grep -q 'Mode essai' <<<"$sortie" && ! grep -q '^  ⚠' <<<"$sortie"; then ok "surveillance --essai : aucun problème ($(grep -c '^  OK' <<<"$sortie") contrôles OK)"
  else ko "surveillance --essai :"; grep -E '^  ⚠|ERR|Error' <<<"$sortie" | head -10 | sed 's/^/     /'; fi
}

preuve_sauvegarde() {
  titre "Preuve : ce que la sauvegarde archivera (tar -tzvf, sans rien garder)"
  local ligne t; ligne=$(grep -F "$SHARED" "$SAUV" | head -1)
  t=$(umask 077; mktemp --suffix=.tgz)
  # La ligne réelle du script, avec seulement la destination remplacée — puis le fichier est effacé (il contient le .env).
  local motif='"$DEST/reglages.tgz"'
  [[ $ligne == *"$motif"* ]] || { ko "ligne d'archivage de svav-sauvegarde sans « $motif » : preuve impossible"; rm -f "$t"; return; }
  bash -c "${ligne/"$motif"/$t}" < /dev/null
  local l; l=$(tar -tzvf "$t" 2>/dev/null | grep -E 'home/ubuntu/sansvisavis/shared/\.env$')
  rm -f "$t"
  if [[ $l == -* ]]; then ok "shared/.env archivé comme VRAI fichier : $(awk '{print $1, $3, "octets"}' <<<"$l")"; else ko "shared/.env absent de l'archive ou archivé comme lien : « $l »"; fi
}

retour() {
  titre "Retour à l'état d'avant l'adoption"
  [[ -d $AVANT ]] || { dire "  rien à faire : $AVANT absent"; return 0; }
  [[ -f $AVANT/svav.conf ]] && cp -p "$AVANT/svav.conf" "$CONF" && ok "svav.conf remis"
  [[ -f $AVANT/svav-sauvegarde ]] && cp -p "$AVANT/svav-sauvegarde" "$SAUV" && ok "svav-sauvegarde remis"
  if compgen -G "$AVANT/unites/svav-*.service" > /dev/null; then
    for f in "$AVANT"/unites/svav-*.service; do install -m 0644 -o root -g root "$f" "$UNITES/$(basename "$f")"; done
    systemctl daemon-reload < /dev/null && ok "unités remises, daemon-reload"
  fi
  if [[ -L $APP/.env && -f $SHARED/.env ]]; then cp -p "$SHARED/.env" "$APP/.env.retour" && mv -T "$APP/.env.retour" "$APP/.env" && ok "app/.env redevenu un vrai fichier"; fi
  if [[ -L $APP/data ]]; then
    rm "$APP/data"
    if [[ -n $(ls -A "$SHARED/data" 2>/dev/null) ]]; then cp -a "$SHARED/data" "$APP/data" && ok "app/data recopié depuis shared/data"; else ok "lien app/data retiré"; fi
  fi
  [[ -L $CURRENT ]] && rm "$CURRENT" && ok "lien current retiré"
  [[ -d $RELEASES ]] && rmdir "$RELEASES" 2>/dev/null && ok "releases/ (vide) retiré"
  systemctl restart svav-next svav-gestion-continu < /dev/null && ok "svav-next et svav-gestion-continu redémarrés"
  attendre_stable svav-next; attendre_stable svav-gestion-continu
  local code; code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/admin/login < /dev/null)
  [[ $code == 200 ]] && ok "/admin/login → 200" || ko "/admin/login → $code APRÈS RETOUR — à voir tout de suite"
  mv "$AVANT" "$AVANT.annulee-$(date +%Y%m%d-%H%M%S)" && ok "trace gardée dans $AVANT.annulee-…"
}

appliquer() { # chaque geste s'arrête au premier échec (return 1 → retour automatique)
  titre "Adoption"
  { mkdir -p "$AVANT/unites" && cp -p "$CONF" "$SAUV" "$AVANT/" && cp -p "$UNITES"/svav-*.service "$AVANT/unites/"; } \
    && ok "copie de l'existant dans $AVANT" || { ko "copie de l'existant"; return 1; }
  { install -d -o $U -g $U -m 0700 "$SHARED" && install -d -o $U -g $U -m 0755 "$SHARED/data" "$RELEASES"; } \
    && ok "shared/, shared/data, releases/ créés" || { ko "création des dossiers"; return 1; }
  { cp -p "$APP/.env" "$SHARED/.env" && cmp -s "$APP/.env" "$SHARED/.env"; } && ok "shared/.env = app/.env" || { ko "copie du .env"; return 1; }
  { ln -s "$SHARED/.env" "$APP/.env.lien" && chown -h $U:$U "$APP/.env.lien" && mv -T "$APP/.env.lien" "$APP/.env"; } \
    && ok "app/.env → shared/.env (posé d'un seul geste)" || { ko "lien app/.env"; return 1; }
  { ln -s "$SHARED/data" "$APP/data" && chown -h $U:$U "$APP/data"; } && ok "app/data → shared/data" || { ko "lien app/data"; return 1; }
  { ln -s "$APP" "$CURRENT" && chown -h $U:$U "$CURRENT"; } && ok "current → app" || { ko "lien current"; return 1; }
  { conf_nouvelle > "$CONF.nouveau" && chmod --reference="$CONF" "$CONF.nouveau" && mv -T "$CONF.nouveau" "$CONF"; } \
    && ok "svav.conf : APP_DIR=$CURRENT" || { ko "svav.conf"; return 1; }
  local log; log=$(bash "$CURRENT/deploy/systemd/installer.sh" "$CONF" < /dev/null 2>&1) \
    && ok "installer.sh : $(grep -c '^installé' <<<"$log") fichiers d'unités installés, daemon-reload" \
    || { ko "installer.sh :"; sed 's/^/     /' <<<"$log"; return 1; }
  { sauv_nouvelle > "$SAUV.nouveau" && chmod --reference="$SAUV" "$SAUV.nouveau" && chown --reference="$SAUV" "$SAUV.nouveau" && mv -T "$SAUV.nouveau" "$SAUV"; } \
    && ok "svav-sauvegarde archive désormais $SHARED" || { ko "svav-sauvegarde"; return 1; }
  systemctl restart svav-next svav-gestion-continu < /dev/null && ok "svav-next et svav-gestion-continu redémarrés" || { ko "redémarrage"; return 1; }
}

main() {
  local mode=${1:---essai}
  case $mode in
    --essai)
      preconditions; apercu
      titre "Bilan de l'essai"
      (( ECHECS == 0 )) && dire "RIEN ÉCRIT. Aucun blocage : --appliquer peut être lancé." || dire "RIEN ÉCRIT. $ECHECS blocage(s) ci-dessus : --appliquer refuserait."
      ;;
    --appliquer)
      preconditions
      (( ECHECS == 0 )) || { titre "Bilan"; dire "REFUSÉ : $ECHECS blocage(s), rien n'a été modifié."; exit 2; }
      if appliquer; then verifier; (( ECHECS == 0 )) && preuve_sauvegarde; fi
      if (( ECHECS > 0 )); then
        dire ""; dire "⛔ $ECHECS vérification(s) en échec : RETOUR AUTOMATIQUE à l'état d'avant."
        ECHECS=0; retour; titre "Bilan"; dire "Adoption ANNULÉE (retour fait, $ECHECS problème(s) pendant le retour)."; exit 1
      fi
      titre "Bilan"; dire "ADOPTION RÉUSSIE. Copie de l'état d'avant : $AVANT (pour --retour)."
      dire "Prochaine sauvegarde nocturne (03 h 30) : vérifier qu'elle contient shared/.env comme vrai fichier."
      ;;
    --retour) retour; titre "Bilan"; (( ECHECS == 0 )) && dire "RETOUR FAIT." || { dire "RETOUR avec $ECHECS problème(s)."; exit 1; } ;;
    *) dire "usage : --essai | --appliquer | --retour"; exit 2 ;;
  esac
}

main "$@"
