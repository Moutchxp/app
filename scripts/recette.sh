#!/bin/bash
# ══ npm run recette — le site sur le Mac, en MODE RECETTE (lot RECETTE-MAC, 16/10/2026) ═══════════════════════════════
#
#   npm run recette               → base « svav_recette » (copie des données de Gestion du serveur), aucune écriture
#                                   dans la base principale du Mac ;
#   npm run recette -- --base-mac → base principale du Mac (« sansvisavis »), à la demande expresse seulement.
#
# Pose SVAV_RECETTE=1 : aucun mail réel, aucun agenda, aucune écriture Drive (cf. app/lib/recette/). Le serveur refuse ce
# mode en production (vérifié au démarrage). L'adresse de la base n'est jamais affichée.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=svav_recette
[[ "${1:-}" == "--base-mac" ]] && BASE=""

set -a; . ./.env; [[ -f .env.local ]] && . ./.env.local; set +a
if [[ -n "$BASE" ]]; then
  DATABASE_URL=$(BASE="$BASE" node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/" + process.env.BASE; console.log(u.toString())')
fi
if ! psql "$DATABASE_URL" -X -At -c 'select 1' >/dev/null 2>&1; then
  echo "⛔ La base « ${BASE:-de la configuration} » est introuvable : rien n'est lancé."
  [[ -n "$BASE" ]] && echo "   Créez-la d'abord (copie des données de Gestion du serveur), ou lancez « npm run recette -- --base-mac »."
  exit 1
fi
echo "▶ RECETTE — base : $(psql "$DATABASE_URL" -X -At -c 'select current_database()') — aucun envoi réel."
export DATABASE_URL SVAV_RECETTE=1 NEXT_TURBO=0
exec node_modules/.bin/next dev
