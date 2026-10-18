#!/usr/bin/env bash
# prod-mettre-a-jour.sh — LA commande du Mac qui met la prod à jour vers le commit poussé (lot 4).
#
#   npm run prod:mettre-a-jour -- --essai                  tout sauf la bascule et l'écriture en base (défaut)
#   npm run prod:mettre-a-jour -- --appliquer [options]    met à jour, retour arrière automatique si une vérification échoue
#   npm run prod:mettre-a-jour -- --suivre                 se raccroche au journal de la mise à jour en cours (ou de la dernière)
#   npm run prod:mettre-a-jour -- --verifier-seulement     contrôles locaux seulement, rien n'est envoyé
#   options : --empreinte-amorcage=<16 hex>   (1re utilisation, affichée par l'essai)
#             --accepter-irreversible=<f1,f2> (migrations marquées « -- svav:irreversible »)
#
# REFUSE DE PARTIR si : un fichier SUIVI est modifié (sauf PASSATION.md) ; une migration non suivie traîne dans
# db/migrations ; HEAD n'est pas exactement origin/main (non poussé, ou en retard). La prod est construite depuis le
# commit poussé, jamais depuis les fichiers du Mac. Le serveur reçoit deploy/maj/serveur.sh — identique au commit,
# puisque le dépôt est propre — et le lance dans une unité systemd transitoire (svav-maj) : une coupure ssh n'arrête
# rien, --suivre permet de reprendre la lecture. Aucune commande git qui modifie les fichiers du Mac (fetch seulement).

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

SERVEUR=svav-prod
MAJ=/home/ubuntu/sansvisavis/maj
MODE=--essai; SUIVRE=0; LOCAL=0; OPTS="" # une chaîne, pas un tableau : /bin/bash 3.2 du Mac + set -u refuse un tableau vide
for a in "$@"; do
  case $a in
    --essai|--appliquer) MODE=$a ;;
    --suivre) SUIVRE=1 ;;
    --verifier-seulement) LOCAL=1 ;;
    --empreinte-amorcage=*) [[ $a =~ ^--empreinte-amorcage=[0-9a-f]{16}$ ]] || { echo "empreinte invalide (16 caractères hexadécimaux)"; exit 2; }; OPTS="$OPTS $a" ;;
    --accepter-irreversible=*) [[ $a =~ ^--accepter-irreversible=[0-9a-z_.,]+$ ]] || { echo "liste de migrations invalide"; exit 2; }; OPTS="$OPTS $a" ;;
    *) echo "option inconnue : $a"; exit 2 ;;
  esac
done

# Commande ssh et reprise après coupure : injectables pour les tests (scripts/prodMettreAJour.test.ts), jamais utile à la main.
SSH=${SVAV_SSH:-ssh}
PAUSE=${SVAV_MAJ_PAUSE:-10}   # secondes entre deux reconnexions
ESSAIS=${SVAV_MAJ_ESSAIS:-6}  # reconnexions au plus après une coupure (l'unité svav-maj continue côté serveur)

# Une lecture du journal, à partir de la ligne $2, jusqu'à la fin de l'unité svav-maj. Rend le code de ssh.
suivre_une_fois() {
  local id=$1 depuis=$2
  $SSH -o ServerAliveInterval=15 -o ServerAliveCountMax=4 $SERVEUR "bash -s" <<EOF
L=$MAJ/$id.log
for i in \$(seq 1 30); do [ -f "\$L" ] && break; sleep 1; done
tail -n +$depuis -F "\$L" 2>/dev/null & T=\$!
sleep 2
while [ "\$(systemctl show -p ActiveState --value svav-maj.service < /dev/null)" = active ] || [ "\$(systemctl show -p ActiveState --value svav-maj.service < /dev/null)" = activating ]; do sleep 2; done
sleep 2; kill \$T 2>/dev/null
EOF
}

# 🔴 LA CONCLUSION NE VIENT QUE DE LA LIGNE FINALE DU SERVEUR (« ═══ ESSAI RÉUSSI … ═══ », « ═══ MISE À JOUR RÉUSSIE … ═══ »,
# « ═══ REFUSÉ … ═══ », « ═══ ÉCHEC … ═══ »), lue dans le journal effectivement reçu. Une coupure ssh (code ≠ 0) avant
# cette ligne : on se reconnecte et on reprend le journal là où il s'était arrêté. Toujours pas de ligne finale :
# « RÉSULTAT INCONNU », code 3 — JAMAIS « réussi » (défaut du 16/10/2026 : coupure à l'étape 7, « Terminé : réussi »).
# 🔴 Arno (18/10/2026) : « RÉSULTAT INCONNU » est RÉSERVÉ aux vraies pertes de connexion (défaut du 18/10, 15:20 : un commit
#    déjà en service affichait « connexion perdue »). Toute ligne finale du serveur est une conclusion : « DÉJÀ EN SERVICE »
#    est un succès (« Terminé : déjà en service — rien à faire ») ; une ligne finale d'un libellé inconnu est dite telle
#    quelle (code 1, jamais « réussi ») ; un ssh terminé NORMALEMENT sans ligne finale = le serveur s'est arrêté sans
#    conclure (code 4), pas une connexion perdue.
DEJA_EN_SERVICE=0
suivre() { # $1 = id ; rend 0 (réussi ou déjà en service), 2 (refusé), 1 (échec), 3 (connexion perdue) ou 4 (sans conclusion)
  local id=$1 cap essai=0 rc vus finale
  cap=$(mktemp "${TMPDIR:-/tmp}/svav-maj.XXXXXX") || { echo "⛔ fichier temporaire impossible"; return 3; }
  while :; do
    vus=$(wc -l < "$cap" | tr -d ' ')
    [[ -s $cap && -n $(tail -c 1 "$cap") ]] && echo # dernière ligne coupée en plein milieu : on repart à la ligne
    suivre_une_fois "$id" $((vus + 1)) | tee -a "$cap"
    rc=${PIPESTATUS[0]}
    finale=$(grep -E '^\[[0-9:]+\] ═══ .+ ═══ \([0-9]+ s\)' "$cap" | tail -n 1) # le format EXACT de `terminer` (serveur.sh)
    [[ -n $finale ]] && break
    (( rc == 0 )) && break # ssh terminé normalement sans ligne finale : l'unité s'est arrêtée sans conclure
    essai=$((essai + 1))
    (( essai > ESSAIS )) && break
    echo
    echo "⚠ connexion perdue (ssh, code $rc) — la mise à jour continue sur le serveur. Reconnexion dans $PAUSE s ($essai/$ESSAIS)…"
    sleep "$PAUSE"
  done
  rm -f "$cap"
  case $finale in
    '') ;;
    *'DÉJÀ EN SERVICE'*) DEJA_EN_SERVICE=1; return 0 ;;
    *'ESSAI RÉUSSI'*|*'MISE À JOUR RÉUSSIE'*) return 0 ;;
    *'REFUSÉ'*) return 2 ;;
    *'ÉCHEC'*) return 1 ;;
    *) echo; echo "⛔ ligne finale du serveur d'un libellé inconnu de ce script : $finale"
       echo "   Elle n'est PAS lue comme un succès : lire le journal ci-dessus."; return 1 ;;
  esac
  if (( rc == 0 )); then
    echo
    echo "⛔ SANS CONCLUSION — la connexion est restée ouverte jusqu'au bout, mais le serveur s'est arrêté sans écrire sa ligne"
    echo "   finale. NE CONCLUEZ RIEN. Lire la fin du journal (lecture seule) :"
    echo "     ssh $SERVEUR \"tail -n 40 $MAJ/$id.log; echo; cat $MAJ/$id.code 2>/dev/null || echo 'pas de code de fin'\""
    return 4
  fi
  echo
  echo "⛔ RÉSULTAT INCONNU — connexion perdue avant la ligne finale du serveur (dernier code ssh : $rc)."
  echo "   La mise à jour a pu continuer, réussir ou échouer sur le serveur : NE CONCLUEZ RIEN, ne lancez pas --appliquer"
  echo "   sur la foi de cet essai. Lire la fin du journal (lecture seule) :"
  echo "     ssh $SERVEUR \"tail -n 40 $MAJ/$id.log; echo; cat $MAJ/$id.code 2>/dev/null || echo 'pas de code de fin (encore en cours ?)'\""
  echo "   ou se raccrocher au journal :  npm run prod:mettre-a-jour -- --suivre"
  return 3
}

conclure() { # $1 code de suivre, $2 mode
  echo
  case $1 in
    0) if (( DEJA_EN_SERVICE )); then echo "Terminé : déjà en service — rien à faire"
       else echo "Terminé : réussi ($2) — ligne finale du serveur reçue."; fi ;;
    2) echo "Terminé : REFUSÉ avant toute modification en service (voir le journal ci-dessus)." ;;
    3) echo "Terminé : RÉSULTAT INCONNU — connexion perdue (voir ci-dessus la commande pour lire la fin du journal)." ;;
    4) echo "Terminé : SANS CONCLUSION — le serveur s'est arrêté sans ligne finale (voir ci-dessus la commande pour lire la fin du journal)." ;;
    *) echo "Terminé : ÉCHEC (code $1) — lire le journal ci-dessus ; la ligne ═══ dit si le retour arrière est fait." ;;
  esac
  return "$1"
}

if (( SUIVRE )); then
  id=$($SSH $SERVEUR "ls -1t $MAJ/*.log 2>/dev/null | grep -v -e npm-ci -e build | head -1 | xargs -r basename -s .log" < /dev/null)
  [[ -n $id ]] || { echo "aucune mise à jour trouvée sur le serveur"; exit 2; }
  echo "== journal $id =="; suivre "$id"; conclure $? "suivi"; exit $?
fi

refus() { echo "⛔ REFUSÉ : $*"; exit 2; }
echo "== Contrôles du dépôt local =="
[[ $(git rev-parse --show-toplevel 2>/dev/null) == "$PWD" ]] || refus "pas à la racine du dépôt"
modifies=$(git status --porcelain --untracked-files=no | awk '{ $1=""; sub(/^ /, ""); print }' | grep -vx 'PASSATION.md')
[[ -z $modifies ]] || refus "fichiers suivis modifiés (seul PASSATION.md est toléré) :"$'\n'"$modifies"
migs=$(git status --porcelain --untracked-files=all -- db/migrations | grep '^??')
[[ -z $migs ]] || refus "migration non committée dans db/migrations :"$'\n'"$migs"
git fetch -q origin < /dev/null || refus "git fetch impossible"
SHA=$(git rev-parse HEAD); DISTANT=$(git rev-parse origin/main)
[[ $SHA == "$DISTANT" ]] || refus "HEAD ($(git rev-parse --short HEAD)) ≠ origin/main ($(git rev-parse --short origin/main)) — pousser d'abord, ou se remettre à jour"
echo "OK   dépôt propre, HEAD poussé : $(git log -1 --format='%h %s')"
(( LOCAL )) && { echo "Contrôles locaux seulement : rien n'a été envoyé."; exit 0; }

ID=$(date +%Y%m%d-%H%M%S)_${SHA:0:8}
echo "== Envoi au serveur ($MODE, ${SHA:0:12}, journal $MAJ/$ID.log) =="
ssh $SERVEUR "install -d -m 0755 $MAJ && cat > $MAJ/serveur-$SHA.sh" < deploy/maj/serveur.sh || refus "envoi du script impossible"
ssh $SERVEUR "sudo -n systemd-run --unit=svav-maj --collect --description='Sans Vis-à-Vis — mise à jour ${SHA:0:12}' \
  /bin/bash $MAJ/serveur-$SHA.sh $MODE $SHA --journal=$MAJ/$ID.log$OPTS" < /dev/null \
  || refus "lancement impossible (une mise à jour tourne déjà ? → --suivre)"
suivre "$ID"; code=$?
conclure $code "$MODE"; exit $?
