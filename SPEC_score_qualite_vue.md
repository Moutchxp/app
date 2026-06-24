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

- **Part A — largeur (10 pts)** : `10 × (nb faisceaux dégagés ≥ 40 m / 41)` — sur les **41 faisceaux du cône central** (±60°).
- **Part B — profondeur (10 pts)** : moyenne des distances d'obstacle sur les 41 faisceaux du cône central (±60°) ; un **faisceau dégagé compte `CLEAR_BEAM_DIST_M` (= 200 m)** dans la moyenne. Mapping **continu et linéaire** de **30 m → 1 pt** à **`CLEAR_BEAM_DIST_M` (200 m) → 10 pts** (pente dérivée des constantes) : `pts = clamp(1 + (moyenne − 30) × 9 / (CLEAR_BEAM_DIST_M − 30), 0, 10)`. Ainsi une vue **parfaitement dégagée** (moyenne = 200 m) atteint le **plafond 10**.
- **Pénalité de flanc** (ancien « angle de L »). On traite séparément le **flanc gauche** (faisceaux à offset < −60°) et le **flanc droit** (offset > +60°) — les faisceaux au-delà du cône de note, qui ne comptent pas dans la note d'amplitude elle-même. Un flanc **déclenche** la pénalité si **au moins 3 faisceaux consécutifs** (espacés du pas de 3°) y rencontrent un obstacle **à 7 m ou moins**. Le **palier** est fixé par l'obstacle **le plus proche de tout le flanc** : **moins de 5 m → amplitude ÷ 3** ; **entre 5 et 7 m → amplitude ÷ 2**. Un **seul** flanc déclenché → on applique sa division ; **les deux** → **amplitude = 0**. La pénalité ne touche que les **20 points d'amplitude**, jamais le score global. (Ce resserrement latéral fait déjà baisser Part A et Part B ; la division vient en plus.)

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

Sources : BD TOPO IGN (eau, végétation, réseau routier, patrimoine via `batiment.nature`) + IA photo. L'IA ne renvoie que des énumérations / drapeaux (jamais une note) → mapping déterministe et auditable. Aucune donnée OSM (licence incompatible). Le score est calculé après le verdict et ne le modifie jamais.

### 2.1 Strate 1 — Couverture valorisante (40 pts)

On scanne les 41 faisceaux du cône central (±60°, même demi-angle que la note d'amplitude). Un faisceau « compte » s'il rencontre au moins un élément valorisant dans la portée de 200 m :
- eau : `bdtopo_eau_surface`, `bdtopo_eau_plan`, cours d'eau ;
- végétation / parcs : `bdtopo_vegetation` ;
- patrimoine bâti ordinaire : `batiment.nature` ∈ {église, chapelle, château, tour/donjon, monument, moulin, arène/théâtre antique, fort} ;
- immeuble classé Mérimée (hors monuments de renommée mondiale → strate 2).

Union sans double comptage (un faisceau touchant plusieurs éléments compte une fois).
Note = (faisceaux valorisants / 41) × 40.
Garde-fou anti-sliver : moins de 3 faisceaux valorisants → 0.
Exclus (non valorisants) : silo, château d'eau, bâti industriel.
Pas de règle « panoramique » : l'ouverture est déjà entièrement récompensée par la Famille 1.

### 2.2 Strate 2 — Monuments de renommée mondiale (10 pts)

Table curée « monuments remarquables » (nom + position L93 + courbe de distance). **Ni altitude ni emprise au sol** (décision explicite : non nécessaires au scoring).

| Monument | X_L93 | Y_L93 | Courbe |
|---|---|---|---|
| Tour Eiffel | 648235.8 | 6862268.4 | EIFFEL |
| Sacré-Cœur | 651829.2 | 6865387.7 | SACRE_COEUR |
| Notre-Dame de Paris | 652294.0 | 6861631.9 | AUTRES |
| Arc de Triomphe | 648292.2 | 6863981.5 | AUTRES |
| Louvre (Pyramide) | 651404.5 | 6862488.9 | AUTRES |
| Panthéon | 652033.9 | 6860882.4 | AUTRES |
| Invalides (Dôme) | 649554.6 | 6861876.4 | AUTRES |
| Opéra Garnier | 650989.6 | 6863756.7 | AUTRES |
| Conciergerie/Sainte-Chapelle | 651959.6 | 6861928.3 | AUTRES |
| Tour Saint-Jacques | 652235.2 | 6862153.9 | AUTRES |
| Centre Pompidou | 652474.2 | 6862493.4 | AUTRES |
| Grand Palais | 649565.4 | 6863120.7 | AUTRES |
| Basilique Saint-Denis (93) | 653084.8 | 6870824.1 | AUTRES |
| Château de Versailles (78) | 635400.6 | 6856445.9 | AUTRES |

Pour chaque monument dont l'azimut depuis la fenêtre tombe dans le cône central (±60°), deux critères de 5 points :
- Critère A — % visible (0–5) : fraction de la hauteur visible, donnée par l'IA photo (elle gère l'occlusion et la vue plongeante). ≥ 3/4 → 5 ; ≥ 1/2 → 4 ; ≥ 1/4 → 2 ; < 1/4 → 0.
- Critère B — distance (0–5), courbe propre :
  - Tour Eiffel : < 6 km → 5, puis −1 pt/km, 0 à ≥ 10 km.
  - Sacré-Cœur : < 2 km → 5, puis −1 pt/km, 0 à ≥ 6 km.
  - Autres : < 1 km → 5, puis −1 pt/500 m, 0 à ≥ 3 km.

Note d'un monument = A + B (max 10).
Garde-fou azimut : un monument que l'IA prétend voir mais géométriquement hors cône est rejeté.
Combinaison : on additionne les notes des monuments visibles, plafond 10.

### 2.3 Propreté — malus sur la note Famille 2 (plafond −6)

L'IA renvoie des drapeaux de nuisance (oui/non) ; chaque drapeau présent applique un malus fixe ; somme plafonnée à −6.

Nuisances majeures (−3 chacune) :
- ligne / pylône haute tension dans le champ (IA) ;
- zone industrielle ou friche occupant une part visible (IA) ;
- silo ou château d'eau dominant le premier plan (IA) ;
- carrefour fonctionnel d'au moins 4 voies au total (toute répartition) dans la vue dégagée, sans élément valorisant en son centre (GÉO — réseau routier BD TOPO ; l'exemption « valorisant au centre » évite de pénaliser l'Étoile, la Concorde, etc.).
- cimetière dans la vue dégagée (GÉO — emprises de cimetière BD TOPO) : −3.

Nuisances mineures (−1 chacune) :
- antenne / relais télécom (IA) ;
- panneau publicitaire grand format (IA) ;
- mur aveugle / pignon massif au premier plan (IA) ;
- grand parking de surface (IA).

### Sortie

Famille 2 = clamp(Strate 1 + Strate 2 − malus Propreté, 0, 50).
Flag `scorePartiel` si la photo est inexploitable : les critères dépendant de la photo sont neutralisés ; le label commercial n'est pas affecté.

---

## Affichage et garde-fous

### Note et affichage

- Sortie : **note /100** = somme Famille 1 (max 50) + Famille 2 (max 50). La **note 
  brute** reste la vérité ; l'affichage ne nourrit aucun calcul.
- **Deux étiquettes de score** (libellés d'affichage uniquement) :
  - score **≥ 75** → « **Vue exceptionnelle** »
  - score **60 – 74** → « **Excellente vue** »
  - score **< 60** → pas d'étiquette (on affiche la note et/ou les cartouches)
  - Ces étiquettes sont distinctes du label binaire « Sans Vis-à-Vis® certifié » ; elles coexistent.
- **Cartouches descriptifs (badges verts)** — comme dans la maquette « Firmware », 
  écran « sans vis-à-vis certifié » : de courtes étiquettes vertes décrivant la vue 
  (ex. « Vue dégagée sur 800 m », « Exposition sud », « Tour Eiffel visible », 
  « Vue sur parc »). Purement descriptifs : ils n'affectent ni le score ni le label. 
  Pour rester fiables sur un certificat, ils sont générés à partir des mêmes constats 
  vérifiés qui alimentent le score (type de paysage, éléments remarquables, orientation, 
  dégagement).

### Auditabilité
- Les sorties IA (`type` = enum, `remarquables` = flags, `nuisances` = flags) + un **niveau de confiance** sont **stockées avec le test** → score recalculable.
- Les composantes « données » (BD TOPO) sont déterministes par construction.

### Photo inexploitable (trop sombre, floue, reflets de vitre)
1. Détection de la qualité insuffisante → **message** : « La photo ne permet pas une analyse fiable de la vue. Le volet ‹ qualité de la vue › sera fortement réduit. Reprenez une photo en meilleure lumière pour un score représentatif. » + bouton **Reprendre la photo**.
2. Si l'internaute **passe outre** : les composantes **dépendantes de la photo** (Type de paysage, monument photo, nuisances photo) = **0** ; la **géométrie** (Famille 1) et les **nuisances issues des données** se calculent **normalement**.
3. Le **label binaire n'est PAS affecté** (100 % géométrique) : la certification reste valable.
4. Résultat marqué **« score partiel — photo insuffisante »** (écran + certificat) pour qu'une note basse ne soit pas confondue avec une vue médiocre.

### Photo — version 1
- **Une seule photo** dans l'**axe principal** (couvre le champ central). Elle sert au **type de paysage** et à la **fraction visible** des monuments **centraux**.
- Les **flancs** (±60–90°) sont traités par la **géométrie** (azimut + ligne de vue) et les **données** (nuisances).
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
AMPLITUDE_PART_B_BASE_M   = 30   # ancrage bas : 30 m -> AMPLITUDE_PART_B_BASE_PTS
AMPLITUDE_PART_B_BASE_PTS = 1    # 1 pt à 30 m
CLEAR_BEAM_DIST_M         = 200  # distance d'un faisceau dégagé ; ancrage haut : -> 10 pts
# Part B linéaire : pts = clamp(1 + (moyenne - 30) * 9 / (CLEAR_BEAM_DIST_M - 30), 0, 10)

# Pénalité de flanc (ex-« angle de L ») — deux flancs traités séparément
FLANC_DIST_SEVERE_M        = 5    # obstacle < 5 m → division sévère
FLANC_DIST_MODERE_M        = 7    # obstacle 5–7 m → division modérée
FLANC_DIV_SEVERE           = 3    # amplitude ÷ 3
FLANC_DIV_MODERE           = 2    # amplitude ÷ 2
FLANC_FAISCEAUX_CONSEC_MIN = 3    # faisceaux consécutifs requis (pas = AMPLITUDE_BEAM_STEP_DEG)
AMPLITUDE_NOTE_HALF_ANGLE_DEG = 60  # cône de la note d'amplitude ; au-delà = flancs (pénalité seulement)

# Famille 1 — orientation
ORIENTATION_PTS = { "S":10, "SO":10, "SE":8, "O":7, "NO":6, "E":4, "NE":2, "N":0 }
TOP_FLOOR_BONUS = 1              # si orientation < 10

# Famille 2 — couverture valorisante (strate 1)
STRATE1_MAX_PTS         = 40
STRATE1_CONE_HALF_DEG   = 60    # demi-angle du cône central (= note d'amplitude), 41 faisceaux
STRATE1_RANGE_M         = 200
STRATE1_MIN_FAISCEAUX   = 3     # garde-fou anti-sliver

# Famille 2 — monuments remarquables (strate 2)
STRATE2_MAX_PTS         = 10
MONUMENT_CONE_HALF_DEG  = 60
MONUMENT_CRITERE_A_PTS  = { sup_3_4: 5, sup_1_2: 4, sup_1_4: 2, inf_1_4: 0 }
# Critère B — distance par monument : seuil pleine note, pas de décroissance, distance du zéro
MONUMENT_DIST_EIFFEL      = { seuil_km: 6, pas_km: 1,   zero_km: 10 }
MONUMENT_DIST_SACRE_COEUR = { seuil_km: 2, pas_km: 1,   zero_km: 6 }
MONUMENT_DIST_AUTRES      = { seuil_km: 1, pas_km: 0.5, zero_km: 3 }

# Famille 2 — propreté (malus)
PROPRETE_MALUS_CAP      = 6
PROPRETE_MAJEURE_PTS    = 3
PROPRETE_MINEURE_PTS    = 1
CARREFOUR_MIN_VOIES     = 4     # total, toute répartition
CARREFOUR_CONE_HALF_DEG = 60
CIMETIERE_CONE_HALF_DEG = 60
```

---

*Ce document accompagne `CLAUDE.md` et `SPEC_module_hauteurs_v3.md`. Le score est calculé après le verdict géométrique et ne le modifie jamais.*
