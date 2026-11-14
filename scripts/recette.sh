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

# 🔴 Arno (15/11/2026) — RÉGLAGES DE RECETTE FOURNIS À L'APPEL (jamais écrits dans un fichier) : gardés tels quels même si .env en dit autre chose.
#   RECETTE_URL_PUBLIQUE=https://<nom>.trycloudflare.com → adresse des liens des mails (GESTION_URL_APPLICATION, la même variable qu'en
#                                                          production) et nom d'hôte admis par le serveur de développement (RECETTE_ORIGINES_DEV) ;
#   RECETTE_ENVOI_REEL_VERS=<adresse>                    → l'exception d'envoi réel (cf. app/lib/recette/garde.ts), base svav_recette seulement.
APPEL_URL_PUBLIQUE="${RECETTE_URL_PUBLIQUE:-}"; APPEL_ENVOI_REEL="${RECETTE_ENVOI_REEL_VERS:-}"
set -a; . ./.env; [[ -f .env.local ]] && . ./.env.local; set +a
RECETTE_ENVOI_REEL_VERS="$APPEL_ENVOI_REEL"
if [[ -n "$APPEL_URL_PUBLIQUE" ]]; then
  if [[ ! "$APPEL_URL_PUBLIQUE" =~ ^https://[a-z0-9-]+\.trycloudflare\.com/?$ ]]; then
    echo "⛔ RECETTE_URL_PUBLIQUE doit être une adresse https://<nom>.trycloudflare.com : rien n'est lancé."; exit 1
  fi
  GESTION_URL_APPLICATION="${APPEL_URL_PUBLIQUE%/}"
  RECETTE_ORIGINES_DEV="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$APPEL_URL_PUBLIQUE")"
  echo "▶ RECETTE publiée : ${GESTION_URL_APPLICATION} (liens des mails de recette)"
fi
if [[ -n "$BASE" ]]; then
  DATABASE_URL=$(BASE="$BASE" node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/" + process.env.BASE; console.log(u.toString())')
fi
if ! psql "$DATABASE_URL" -X -At -c 'select 1' >/dev/null 2>&1; then
  echo "⛔ La base « ${BASE:-de la configuration} » est introuvable : rien n'est lancé."
  [[ -n "$BASE" ]] && echo "   Créez-la d'abord (copie des données de Gestion du serveur), ou lancez « npm run recette -- --base-mac »."
  exit 1
fi
if [[ -n "$RECETTE_ENVOI_REEL_VERS" ]]; then
  echo "▶ RECETTE — base : $(psql "$DATABASE_URL" -X -At -c 'select current_database()') — envois réels demandés vers ${RECETTE_ENVOI_REEL_VERS} SEULEMENT (contrôlé au démarrage du serveur)."
else
  echo "▶ RECETTE — base : $(psql "$DATABASE_URL" -X -At -c 'select current_database()') — aucun envoi réel."
fi
export DATABASE_URL SVAV_RECETTE=1 NEXT_TURBO=0 RECETTE_ENVOI_REEL_VERS
[[ -n "$APPEL_URL_PUBLIQUE" ]] && export GESTION_URL_APPLICATION RECETTE_ORIGINES_DEV
exec node_modules/.bin/next dev
