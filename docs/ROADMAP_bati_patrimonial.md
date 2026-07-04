# Roadmap — bâti patrimonial, MH, monuments emblématiques

## Fait & committé
- Import bâti patrimonial Inventaire IA92 → table inventaire_general, 250/306
  rattachés, DESCRIPTIF (jamais le score ni le golden). MH (monuments_historiques)
  et golden intacts (md5 vérifié).
- docs/SOURCES_DATA.md (spec) + scripts/import_inventaire_ia92.sql (import rejouable,
  replay Paris+PC = changer le filtre IA75/92/93/94).

## À faire, dans l'ordre

### 1. Badge cartoucheBatiPatrimonial (prochain)
Lit inventaire_general.cleabs + badge_actif sur le cône ±60°, miroir de
cartoucheMonuments, descriptif / verdict-safe. Recon lecture seule d'abord
sur les fichiers sensibles.

### 2. Carte de curation admin (pivot multi-chantiers)
- Admin-only, descriptif, ne touche NI le score NI le golden.
- 3 usages : déplacer un point mal placé (rattachement 1 bâti) ; composer une
  emprise en sélectionnant de 1 à N polygones (clic pour ajouter, re-clic pour
  retirer, aucun plafond) ; auditer les rattachements automatiques.
- PRINCIPE GÉNÉRAL : la sélection multi-polygones (1 statut → N cleabs) vaut pour
  TOUTES les familles — monuments emblématiques, monuments historiques ET bâti
  patrimonial. Un château, une église, un monument peut s'étaler sur plusieurs
  polygones ; on doit tous les rattacher.
- Code couleur : rouge = à placer / orange = rattaché auto à vérifier / vert =
  sûr ou placé main.
- Modèle : une ligne par cleabs ; source = manuel|auto tracée ; le manuel est
  PRIORITAIRE et n'est JAMAIS écrasé par un ré-import.

### 3. Monuments emblématiques (14 de MONUMENTS_L93)
Table dédiée à créer, rattachement multi-polygone via la carte, statut à part.
Tous mesurables (BD TOPO couvre 75/92/93/78) ; 12/14 dans un footprint, 2 à <15 m
(Conciergerie 11 m, Tour Saint-Jacques 15 m). DÉCISION EN ATTENTE : badge
descriptif seul, OU boost Couche 2 du score (→ touche le moteur, protocole golden
strict obligatoire).

### 4. Rattachement MH amélioré (chantier à froid)
- SAFE : curation manuelle des MH non rattachés (cleabs NULL) via la carte —
  n'affecte pas le golden.
- SENSIBLE : re-rattachement auto des MH déjà rattachés → recon d'impact golden
  obligatoire + rescellage en commit séparé. NE PAS enchaîner à chaud.

## Garde-fous permanents
Tout ce qui précède est DESCRIPTIF : n'alimente jamais le score de vue ni le label
binaire. Golden hand-verified avant tout rescellage. Tolérance 15 m verrouillée.
