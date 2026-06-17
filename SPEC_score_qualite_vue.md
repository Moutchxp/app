# SPEC — Score de qualité de vue (Sans Vis-à-Vis®)

## Principe

- Le **score de qualité de vue** est une note **/100**, **indépendante du label binaire** Sans Vis-à-Vis (qui reste 100 % géométrique).
- C'est le **seul** endroit où l'analyse **IA de la photo** intervient. **L'IA n'influence JAMAIS le label binaire.**
- Répartition : **50 % Dégagement objectif (Famille 1)** / **50 % Qualité du paysage (Famille 2)**.
- **Aucun arrondi** sur les calculs : valeurs continues de bout en bout. Seuls les **paliers d'affichage** sont des libellés terminaux (ils ne nourrissent aucun calcul).
- Toutes les constantes sont **centralisées** dans la config (voir fin de document).

---

## Famille 1 — Dégagement objectif (50 pts)

### 1.1 Distance au 1er obstacle, axe principal — 20 pts
- Linéaire et **continu** (pas de marches d'escalier).
- 0 pt à 40 m ; **+1 pt tous les 8 m** ; **20 pts à ≥ 200 m** (= portée `BEAM_RANGE_M`).
- « Aucun obstacle dans la portée » = 20 pts.
- Formule : `score = clamp((d − 40) / 8, 0, 20)`, où `d` = distance du 1er obstacle réel sur l'axe principal.

### 1.2 Amplitude du dégagement — 20 pts
Calculée sur les **61 faisceaux** (pas de 3°, de −90° à +90° autour de l'axe de vue principal).

- **Part A — largeur (10 pts)** : `10 × (nb faisceaux dégagés ≥ 40 m / 61)`.
- **Part B — profondeur (10 pts)** : moyenne des distances d'obstacle sur les 61 faisceaux ; un **faisceau dégagé compte 200 m** dans la moyenne. Mapping **continu** : `pts = clamp(1 + (moyenne − 30) / 20, 0, 10)` (30 m → 1 pt, +1 pt tous les 20 m, plafond 10).
- **Pénalité « angle de L »** : si un **bâtiment réel** se trouve à **< 5 m** dans les **flancs** (extrémités gauche/droite : −90° à −60° **OU** +60° à +90°), alors `amplitude = amplitude / 3`.
  - S'applique **uniquement aux 20 pts d'amplitude**, pas au score global.
  - À noter : ce mur fait déjà baisser Part A (moins de faisceaux ≥ 40 m) et Part B (distances courtes) ; le ÷3 vient en plus.

### 1.3 Orientation — 10 pts
Selon l'azimut de l'axe de vue (fixé par l'internaute) :

| Orientation | Points |
|---|---|
| Sud (S) | 10 |
| Sud-Ouest (SO) | 10 |
| Sud-Est (SE) | 8 |
| Ouest (O) | 7 |
| Nord-Ouest (NO) | 6 |
| Est (E) | 4 |
| Nord-Est (NE) | 2 |
| Nord (N) | 0 |

- **Bonus dernier étage : +1** uniquement si l'orientation est **< 10** (plafond 10). Donnée via `nombre_etages` (BD TOPO) + l'étage de l'internaute.

---

## Famille 2 — Qualité du paysage (50 pts)

Sources : **IA photo** + **données** (BD TOPO / OSM). L'IA renvoie des **catégories structurées** (jamais une note) → mapping en points 100 % déterministe et auditable.

### 2.1 Type de paysage dominant — 25 pts
L'IA choisit **un seul** type dominant :

| Type dominant | Points |
|---|---|
| Mer / océan | 25 |
| Vue panoramique totale (vaste paysage ouvert et lointain) | 25 |
| Fleuve, lac, grand plan d'eau | 22 |
| Grande nature, forêt, parc majeur | 20 |
| Espaces verts de quartier, jardins | 16 |
| Urbain dégagé harmonieux (toits, perspective, place) | 12 |
| Urbain standard mixte | 8 |
| Urbain dense / banal (cour, façades proches) | 4 |

> Note : « Vue panoramique totale » recoupe en partie l'amplitude (Famille 1) qui récompense déjà l'ouverture — c'est voulu, les meilleures vues cumulent sur les deux axes.

### 2.2 Éléments remarquables — 15 pts
**Non cumulatif** : on retient la **valeur la plus haute applicable**.

**Monument iconique** — prérequis : le monument est en **ligne de vue dégagée** et dans le champ 180°.
- Ligne de vue testée par un **rayon dédié vers l'azimut connu du monument** (pas via les 61 faisceaux d'environnement).
- **Sans plafond à 200 m** : la portée du test monument est longue (jusqu'à la distance réelle du monument), découplée des 200 m servant aux obstacles. *(Sinon on perdrait les vues lointaines iconiques type Tour Eiffel à 1,5 km.)*
- Nécessite une **couche de données « monuments iconiques »** (liste curée Paris + 92 : Tour Eiffel, Sacré-Cœur, Invalides, Panthéon, Arc de Triomphe, etc.).

| Position du monument (par azimut géométrique) | ≥ ½ visible | < ½ visible |
|---|---|---|
| **Champ central** (±50° de l'axe, 100°) | 15 | 10 |
| **Extrémités** (de 50° à 90°, gauche ou droite) | 10 | 7 |

- **Zone** (central / extrémité) = **azimut géométrique** du monument (jamais le cadrage de la photo).
- **Ligne de vue** = géométrie (occlusion par bâtiments plus hauts).
- **Fraction visible** (≥ ½ / < ½) = **IA photo en v1** ; calcul d'occlusion géométrique en phase 2.

**Majorité de façades historiques** (haussmannien, patrimoine) : **10**.

### 2.3 Propreté visuelle — 10 pts
Départ à **10**, on retire par nuisance, **plancher 0** (la somme des malus peut dépasser 10, on s'arrête à 0).

**Détecté par l'IA photo :**
- Mur aveugle / pignon proche dominant : **−4**
- Antennes / paraboles / superstructures techniques au 1er plan : **−3**
- Fouillis visuel (enseignes, parking, dépôt) : **−3**

**Détecté par les données (BD TOPO / OSM — déterministe) :**
- Immeuble d'**habitation ≥ 15 étages** plein dans l'axe (±20° de l'axe central), **hors tour de bureaux** : **−3**. Via `usage` + `nombre_etages` (BD TOPO). *Fallback : usage inconnu → pas de malus (on ne pénalise pas dans le doute).*
- **Gros carrefour** ou **cimetière** dans le champ central (±45° de l'axe) : **−3**. Via réseau routier / emprise cimetière (OSM / BD TOPO).

**Hybride :**
- Immeuble **> 10 étages couvert de paraboles** dans l'axe : **−3** (hauteur + axe = données ; paraboles = IA photo).

---

## Affichage et garde-fous

### Note et paliers
- Sortie : **note /100** = somme Famille 1 (max 50) + Famille 2 (max 50). La **note brute** reste la vérité.
- **Paliers d'affichage** (libellés terminaux, ne nourrissent aucun calcul) — bandes :
  - 85 – 100
  - 70 – 84
  - 55 – 69
  - 40 – 54
  - < 40
- **Noms des paliers : à définir** (ne pas réutiliser « Certifié », réservé au label binaire).

### Auditabilité
- Les sorties IA (`type` = enum, `remarquables` = flags, `nuisances` = flags) + un **niveau de confiance** sont **stockées avec le test** → score recalculable.
- Les composantes « données » (BD TOPO / OSM) sont déterministes par construction.

### Photo inexploitable (trop sombre, floue, reflets de vitre)
1. Détection de la qualité insuffisante → **message** : « La photo ne permet pas une analyse fiable de la vue. Le volet ‹ qualité de la vue › sera fortement réduit. Reprenez une photo en meilleure lumière pour un score représentatif. » + bouton **Reprendre la photo**.
2. Si l'internaute **passe outre** : les composantes **dépendantes de la photo** (Type de paysage, monument photo, nuisances photo) = **0** ; la **géométrie** (Famille 1) et les **nuisances issues des données** se calculent **normalement**.
3. Le **label binaire n'est PAS affecté** (100 % géométrique) : la certification reste valable.
4. Résultat marqué **« score partiel — photo insuffisante »** (écran + certificat) pour qu'une note basse ne soit pas confondue avec une vue médiocre.

### Photo — version 1
- **Une seule photo** dans l'**axe principal** (couvre le champ central). Elle sert au **type de paysage** et à la **fraction visible** des monuments **centraux**.
- Les **flancs** (±50–90°) sont traités par la **géométrie** (azimut + ligne de vue) et les **données** (nuisances).
- Pour un monument en extrémité hors cadre : on retient le **résultat géométrique** (présence + LOS).
- **Phase 2** : capture **panoramique guidée** (gauche / centre / droite), chaque photo étiquetée par son azimut, pour juger l'esthétique sur tout le champ.

---

## Constantes (à centraliser dans la config SVV)

```
# Score — pondération
SCORE_FAMILLE_1_WEIGHT = 50      # dégagement objectif
SCORE_FAMILLE_2_WEIGHT = 50      # qualité paysage

# Famille 1 — distance
SCORE_DISTANCE_MAX_PTS = 20
SCORE_DISTANCE_MIN_M   = 40      # seuil sans vis-à-vis
SCORE_DISTANCE_MAX_M   = 200     # = BEAM_RANGE_M (plafond 20 pts)

# Famille 1 — amplitude
AMPLITUDE_BEAM_STEP_DEG = 3
AMPLITUDE_BEAM_COUNT    = 61
AMPLITUDE_PART_A_PTS    = 10
AMPLITUDE_PART_B_PTS    = 10
AMPLITUDE_PART_B_BASE_M = 30     # 30 m -> 1 pt
AMPLITUDE_PART_B_STEP_M = 20     # +1 pt / 20 m
CLEAR_BEAM_DIST_M       = 200    # distance attribuée à un faisceau dégagé

# Pénalité angle de L
L_PENALTY_FLANK_DEG = [60, 90]   # secteurs flancs gauche/droite
L_PENALTY_DIST_M    = 5
L_PENALTY_FACTOR    = 3          # amplitude / 3

# Famille 1 — orientation
ORIENTATION_PTS = { "S":10, "SO":10, "SE":8, "O":7, "NO":6, "E":4, "NE":2, "N":0 }
TOP_FLOOR_BONUS = 1              # si orientation < 10

# Famille 2 — monument
MONUMENT_CENTRAL_HALF_DEG = 50   # champ central = ±50°
MONUMENT_LOS_MAX_M        = null # pas de plafond obstacle (distance réelle du monument)

# Famille 2 — nuisances data
NUISANCE_AXIS_TALL_DEG       = 20   # ±20° pour grand immeuble dans l'axe
TALL_RESIDENTIAL_MIN_FLOORS  = 15
PARABOLES_MIN_FLOORS         = 10
CARREFOUR_CIMETIERE_DEG      = 45   # ±45° champ central
```

---

*Ce document accompagne `CLAUDE.md` et `SPEC_module_hauteurs_v3.md`. Le score est calculé après le verdict géométrique et ne le modifie jamais.*
