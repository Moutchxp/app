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
MODE=--essai; SUIVRE=0; LOCAL=0; OPTIONS=()
for a in "$@"; do
  case $a in
    --essai|--appliquer) MODE=$a ;;
    --suivre) SUIVRE=1 ;;
    --verifier-seulement) LOCAL=1 ;;
    --empreinte-amorcage=*|--accepter-irreversible=*) OPTIONS+=("$a") ;;
    *) echo "option inconnue : $a"; exit 2 ;;
  esac
done

suivre() { # $1 = id de la mise à jour ; affiche le journal jusqu'à la fin de l'unité svav-maj, rend son code
  local id=$1
  ssh -o ServerAliveInterval=30 $SERVEUR "bash -s" <<EOF
L=$MAJ/$id.log
for i in \$(seq 1 30); do [ -f "\$L" ] && break; sleep 1; done
tail -n +1 -F "\$L" 2>/dev/null & T=\$!
sleep 2
while [ "\$(systemctl show -p ActiveState --value svav-maj.service < /dev/null)" = active ] || [ "\$(systemctl show -p ActiveState --value svav-maj.service < /dev/null)" = activating ]; do sleep 2; done
sleep 2; kill \$T 2>/dev/null
EOF
  local code; code=$(ssh $SERVEUR "cat $MAJ/$id.code 2>/dev/null" < /dev/null)
  if [[ -z $code ]]; then
    echo "⛔ pas de code de fin : l'unité s'est arrêtée sans conclure. Dernières lignes du système :"
    ssh $SERVEUR "journalctl -u svav-maj -n 20 --no-pager" < /dev/null
    return 1
  fi
  return "$code"
}

if (( SUIVRE )); then
  id=$(ssh $SERVEUR "ls -1t $MAJ/*.log 2>/dev/null | grep -v -e npm-ci -e build | head -1 | xargs -r basename -s .log" < /dev/null)
  [[ -n $id ]] || { echo "aucune mise à jour trouvée sur le serveur"; exit 2; }
  echo "== journal $id =="; suivre "$id"; exit $?
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
  /bin/bash $MAJ/serveur-$SHA.sh $MODE $SHA --journal=$MAJ/$ID.log ${OPTIONS[*]}" < /dev/null \
  || refus "lancement impossible (une mise à jour tourne déjà ? → --suivre)"
suivre "$ID"; code=$?
echo
case $code in
  0) echo "Terminé : réussi ($MODE)." ;;
  2) echo "Terminé : REFUSÉ avant toute modification en service (voir le journal ci-dessus)." ;;
  *) echo "Terminé : ÉCHEC (code $code) — lire le journal ci-dessus ; la ligne ═══ dit si le retour arrière est fait." ;;
esac
exit $code
