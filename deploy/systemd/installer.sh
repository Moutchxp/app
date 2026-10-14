#!/usr/bin/env bash
# Installe les units systemd Sans Vis-à-Vis à partir des gabarits *.service.in et des *.timer de ce dossier.
#
# POURQUOI UN SCRIPT : systemd ne remplace PAS les variables d'environnement dans WorkingDirectory=, User=, Group=,
# ni dans le PROGRAMME de ExecStart= (premier mot). On écrit donc les vrais chemins dans les fichiers, une fois pour
# toutes, à partir de svav.conf.
#
# CE QUE FAIT LE SCRIPT : lit svav.conf (sans l'exécuter), vérifie les valeurs, remplace les @MOTS@, copie les
# fichiers dans /etc/systemd/system, puis `systemctl daemon-reload`.
# CE QU'IL NE FAIT JAMAIS : activer ou démarrer un service ou un timer. Cela reste un geste manuel (voir README.md).
#
# Usage :
#   sudo ./installer.sh                      # installe, avec ./svav.conf
#   sudo ./installer.sh /chemin/svav.conf    # installe, avec un autre fichier de réglages
#   ./installer.sh --essai /tmp/units-essai  # génère seulement dans ce dossier (rien n'est installé, root inutile)

set -euo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/etc/systemd/system
ESSAI=""
CONF="$ICI/svav.conf"

if [[ "${1:-}" == "--essai" ]]; then
  ESSAI="${2:?--essai demande un dossier de sortie}"
  CONF="${3:-$CONF}"
elif [[ -n "${1:-}" ]]; then
  CONF="$1"
fi

echec() { echo "ERREUR : $*" >&2; exit 1; }

[[ -f "$CONF" ]] || echec "fichier de réglages introuvable : $CONF (copier svav.conf.exemple en svav.conf et l'adapter)"

# --- Lecture de svav.conf : lignes CLE=valeur uniquement, jamais exécutées -------------------------------------------
declare -A R=()
while IFS= read -r ligne || [[ -n "$ligne" ]]; do
  ligne="${ligne%$'\r'}"
  [[ -z "$ligne" || "$ligne" =~ ^[[:space:]]*# ]] && continue
  [[ "$ligne" =~ ^([A-Z_]+)=(.*)$ ]] || echec "ligne illisible dans $CONF : $ligne"
  R["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
done < "$CONF"

for cle in APP_DIR SVAV_USER SVAV_GROUP NODE NEXT_HOST NEXT_PORT; do
  [[ -n "${R[$cle]:-}" ]] || echec "réglage manquant ou vide dans $CONF : $cle"
  # Caractères permis : lettres, chiffres, . _ / - : (pas d'espace, pas de guillemet, pas de caractère spécial).
  [[ "${R[$cle]}" =~ ^[A-Za-z0-9._/:-]+$ ]] || echec "$cle contient un caractère non permis : « ${R[$cle]} »"
done

APP_DIR="${R[APP_DIR]%/}"
SVAV_USER="${R[SVAV_USER]}"
SVAV_GROUP="${R[SVAV_GROUP]}"
NODE="${R[NODE]}"
NEXT_HOST="${R[NEXT_HOST]}"
NEXT_PORT="${R[NEXT_PORT]}"

# --- Vérifications -----------------------------------------------------------------------------------------------
[[ "$APP_DIR" == /* ]] || echec "APP_DIR doit être un chemin absolu : $APP_DIR"
[[ "$NODE" == /* ]] || echec "NODE doit être un chemin absolu : $NODE"
[[ "$NEXT_PORT" =~ ^[0-9]+$ ]] || echec "NEXT_PORT doit être un nombre : $NEXT_PORT"
[[ -f "$APP_DIR/package.json" ]] || echec "pas de package.json dans APP_DIR ($APP_DIR) — est-ce bien la racine du dépôt ?"
[[ -f "$APP_DIR/node_modules/tsx/dist/cli.mjs" ]] || echec "tsx absent : lancer « npm ci » (COMPLET, sans --omit=dev) dans $APP_DIR"
[[ -f "$APP_DIR/node_modules/next/dist/bin/next" ]] || echec "next absent : lancer « npm ci » dans $APP_DIR"
[[ -x "$NODE" ]] || echec "NODE n'est pas un programme exécutable : $NODE"
NODE_DIR="$(dirname "$NODE")"
[[ -x "$NODE_DIR/npm" ]] || echec "npm introuvable à côté de node ($NODE_DIR/npm) — la veille en a besoin"
majeure="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[[ "$majeure" == "24" ]] || echo "ATTENTION : node $("$NODE" -v) — le Mac tourne en Node 24 ; continuer en connaissance de cause." >&2
if [[ -z "$ESSAI" ]]; then
  id "$SVAV_USER" >/dev/null 2>&1 || echec "le compte $SVAV_USER n'existe pas (le créer d'abord)"
  getent group "$SVAV_GROUP" >/dev/null 2>&1 || echec "le groupe $SVAV_GROUP n'existe pas"
  [[ -f "$APP_DIR/.env" ]] || echo "ATTENTION : pas de .env dans $APP_DIR — les services ne trouveront pas leurs secrets." >&2
  [[ -d "$APP_DIR/.next" ]] || echo "ATTENTION : pas de dossier .next — lancer « npm run build » (comme $SVAV_USER) avant de démarrer svav-next." >&2
fi

# PATH des services : le dossier de node/npm en tête, puis les dossiers système (curl, ogr2ogr, tar, bzip2, poppler).
PATH_SVC="$NODE_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
for prog in curl ogr2ogr tar bzip2 pdftoppm flock; do
  PATH="$PATH_SVC" command -v "$prog" >/dev/null 2>&1 || echo "ATTENTION : « $prog » introuvable dans $PATH_SVC (voir les prérequis du README)." >&2
done

# --- Génération ---------------------------------------------------------------------------------------------------
SORTIE="${ESSAI:-$(mktemp -d)}"
mkdir -p "$SORTIE"

shopt -s nullglob
gabarits=("$ICI"/*.service.in)
timers=("$ICI"/*.timer)
(( ${#gabarits[@]} > 0 )) || echec "aucun gabarit *.service.in dans $ICI"

for g in "${gabarits[@]}"; do
  nom="$(basename "$g" .in)"
  sed -e "s|@APP_DIR@|$APP_DIR|g" \
      -e "s|@SVAV_USER@|$SVAV_USER|g" \
      -e "s|@SVAV_GROUP@|$SVAV_GROUP|g" \
      -e "s|@NODE@|$NODE|g" \
      -e "s|@PATH@|$PATH_SVC|g" \
      -e "s|@NEXT_HOST@|$NEXT_HOST|g" \
      -e "s|@NEXT_PORT@|$NEXT_PORT|g" \
      "$g" > "$SORTIE/$nom"
  if grep -q '@[A-Z_]*@' "$SORTIE/$nom"; then echec "un @MOT@ n'a pas été remplacé dans $nom"; fi
done
for t in "${timers[@]}"; do cp "$t" "$SORTIE/"; done

echo "Fichiers générés dans $SORTIE :"
ls -1 "$SORTIE"

if command -v systemd-analyze >/dev/null 2>&1; then
  echo "Contrôle de syntaxe (systemd-analyze verify) :"
  systemd-analyze verify "$SORTIE"/*.service "$SORTIE"/*.timer || echo "ATTENTION : systemd-analyze signale des problèmes (ci-dessus)." >&2
fi

if [[ -n "$ESSAI" ]]; then
  echo "Mode essai : rien n'a été installé."
  exit 0
fi

# --- Installation (sans activation) -----------------------------------------------------------------------------
[[ "$(id -u)" == "0" ]] || echec "l'installation demande les droits administrateur : relancer avec sudo"
for f in "$SORTIE"/*; do
  install -m 0644 -o root -g root "$f" "$DEST/$(basename "$f")"
  echo "installé : $DEST/$(basename "$f")"
done
rm -rf "$SORTIE"
systemctl daemon-reload
echo
echo "Installation terminée. AUCUN service n'a été activé ni démarré."
echo "Suite : voir deploy/systemd/README.md, étape « Activer » — et d'abord ARRÊTER les tâches du Mac."
