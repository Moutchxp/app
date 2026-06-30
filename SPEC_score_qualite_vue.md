# SPEC — Score de qualité de vue (Sans Vis-à-Vis®)

## Principe

- Le **score de qualité de vue** est une note **/100**, **indépendante du label binaire**
  Sans Vis-à-Vis (qui reste **100 % géométrique**).
- C'est le **seul** endroit où l'analyse **IA de la photo** intervient. **L'IA n'influence
  JAMAIS le label binaire.** Le score est calculé **après** le verdict et ne le modifie jamais.
- **Aucun arrondi** sur les calculs : valeurs continues de bout en bout. Seuls les **libellés
  d'affichage** sont des paliers terminaux (ils ne nourrissent aucun calcul).
- Toutes les constantes sont **centralisées** dans la config (voir fin de document).

> ⚠️ **État du document.** La section « Architecture de scoring (V2) » décrit la cible **en
> conception, non encore implémentée**. Le **moteur réellement en production aujourd'hui** est
> décrit dans « Résultat A — moteur factuel actuel » et ses constantes implémentées. Tout le
> reste (Couches 2/3, familles de pondération, monuments, sanctions) est **du design**, pas du
> code livré.

---

## Architecture de scoring (V2 — en conception, non encore implémentée)

### Deux résultats distincts, toujours calculés et stockés ensemble

**Résultat A — CONSTAT FACTUEL**
- Scan des **61 faisceaux** et **distance factuelle au premier obstacle**, **sans aucune
  pondération**. Mesure **objective** de l'ouverture / densité bâtie sur **180°** face au séjour.
- **C'est le moteur actuel — il ne change pas.** Le **golden Asnières** (`score.total ≈
  11.2867`) reste l'**ancre de A** : toute évolution doit préserver cette valeur.

**Résultat B — SCORE PONDÉRÉ /100** (dérivé de A, en **trois couches**)
- **Couche 1 — Dégagement (plafond 80)** : moyenne des distances de faisceaux, **certaines
  distances étant allongées** selon la **famille** de l'élément traversé/touché (voir familles
  ci-dessous).
- **Couche 2 — Exception (+20 max)** : bonus pour les **éléments remarquables vus** (monuments,
  bâti classé, monument mondialement connu). Les **monuments mondiaux** sont traités **ici**
  (impact de faisceau si très proche, ou via l'analyse photo), **pas** en Couche 1.
- **Couche 3 — Sanctions (malus)** : mauvaise exposition, vue cimetière, gros axe routier, etc.
  **À concevoir ; données à vérifier** — aucune couche cimetière / routière n'existe en base
  aujourd'hui (cf. `docs/SOURCES_DATA.md`).
- **Plafond** : le score B **affiché** à l'internaute est **clampé à [0, 100]**. Le score
  **BRUT** (non clampé, peut dépasser 100) est **conservé en interne** avec l'analyse, pour
  l'auditabilité et d'éventuels recalculs.

### Familles de pondération (Couche 1)

Le boost est l'**exception** ; le **neutre est le défaut**. Aucune de ces pondérations ne touche
le **verdict binaire** (100 % géométrique) — elles n'affectent **que le Résultat B**.

| Famille | Définition | Effet sur la distance | Détection |
|---|---|---|---|
| **1 — Classique / récent / sans année** | Construction ordinaire, le **défaut** | **Neutre** : distance factuelle, aucun boost | — |
| **2 — Ancien (< 1900)** | Bâti antérieur à 1900 | **Boost** (coef. à fixer, ex. **+30 %**, plafonné à 200 m) | `bdnb_annee_batiment` |
| **3 — Remarquable / classé** | Patrimoine bâti | **Boost plus fort** (ex. **+50 %**) | `bdtopo_batiment.nature` (Église, Château, Monument, Arc de triomphe, Tour/donjon, Chapelle) **et, à terme, base Mérimée** (monuments historiques classés — à importer) |
| **4 — Nature / eau** | Espace vert, fleuve, lac, mer | **Boost** | Longueur traversée le long du faisceau (`ST_Intersection` + `ST_Length`), **validée techniquement** |

- **Famille 4 = la seule famille qui OUVRE réellement la vue** : le faisceau **passe au-dessus**
  de l'espace vert / l'eau → le boost de distance est **physiquement justifié**.
- **Règle transverse** : un bâtiment **sans année** (ou hors tranche / nature valorisante) =
  **Famille 1 (neutre)**.

### En réserve (raffinements de phase ultérieure, non prioritaires)

- **Façade vs cour** : pondérer selon que le faisceau touche l'**arête porteuse du n° BAN**
  (façade) ou une autre arête (arrière / cour). Concept validé, mais **lourd** (calcul arête par
  arête) — à faire **après** une V1 simple. **Préalable non vérifié** : comment `adresse_ban` se
  relie à un polygone bâtiment.
- **Famille intermédiaire 1900–1945** : **écartée** pour l'instant (simplicité).

---

## Résultat A — moteur factuel actuel (IMPLÉMENTÉ)

> Ceci documente le code **en production** (`scoreDegagement.ts`). Le golden Asnières
> `score.total ≈ 11.286702002595051` est l'**invariant** de cette section.

Le constat factuel agrège trois composantes sur l'axe principal et les **61 faisceaux** (pas de
3°, de −90° à +90° autour de l'axe de vue), sans aucune pondération de famille.

### A.1 Distance au 1er obstacle, axe principal — 20 pts
- Linéaire et **continu**. `score = clamp((d − 40) / 8, 0, 20)`, `d` = distance du 1er obstacle
  réel sur l'axe principal.
- **0 pt à 40 m** ; **+1 pt tous les 8 m** ; **20 pts à ≥ 200 m**. « Aucun obstacle » = 20 pts.

### A.2 Amplitude du dégagement — 20 pts
- **Part A — largeur (10 pts)** : `10 × (faisceaux dégagés ≥ 40 m / nb du cône central)`, sur le
  **cône central ±60°**.
- **Part B — profondeur (10 pts)** : moyenne des distances d'obstacle sur le cône central ; un
  **faisceau dégagé compte `CLEAR_BEAM_DIST_M` (200 m)**. Mapping linéaire **30 m → 1 pt** à
  **200 m → 10 pts** : `pts = clamp(1 + (moyenne − 30) × 9 / (CLEAR_BEAM_DIST_M − 30), 0, 10)`.
- **Pénalité de flanc** : flancs **gauche** (offset < −60°) et **droit** (offset > +60°) traités
  séparément. Un flanc **déclenche** si **≥ 3 faisceaux consécutifs** (pas de 3°) ont un obstacle
  **≤ 7 m**. Palier fixé par l'obstacle **le plus proche du flanc** : **< 5 m → amplitude ÷ 3** ;
  **5–7 m → amplitude ÷ 2**. Un seul flanc → division ; **les deux → amplitude = 0**. N'affecte
  que les 20 pts d'amplitude.

### A.3 Orientation — 10 pts
Selon l'azimut de l'axe (fixé par l'internaute) :

| Orientation | S | SO | SE | O | NO | E | NE | N |
|---|---|---|---|---|---|---|---|---|
| Points | 10 | 10 | 8 | 7 | 6 | 4 | 2 | 0 |

- **Bonus dernier étage : +1** uniquement si l'orientation est **< 10** (plafond 10). Donnée via
  `nombre_etages` (BD TOPO) + l'étage de l'internaute.

---

## Couche 2 — Exception : matériau de conception (monuments de renommée mondiale)

> **Non implémenté.** Table curée conservée comme **matériau de conception** pour la future
> **Couche 2**. Aucune table monuments n'existe en base aujourd'hui (cf. `docs/SOURCES_DATA.md`).
> **Ni altitude ni emprise au sol** (décision : non nécessaires au scoring — position L93 +
> courbe de distance suffisent).

| Id | Monument | X_L93 | Y_L93 | Courbe |
|---|---|---|---|---|
| EIFFEL | Tour Eiffel | 648235.8 | 6862268.4 | EIFFEL |
| SACRE_COEUR | Sacré-Cœur | 651829.2 | 6865387.7 | SACRE_COEUR |
| NOTRE_DAME | Notre-Dame de Paris | 652294.0 | 6861631.9 | AUTRES |
| ARC_TRIOMPHE | Arc de Triomphe | 648292.2 | 6863981.5 | AUTRES |
| LOUVRE | Louvre (Pyramide) | 651404.5 | 6862488.9 | AUTRES |
| PANTHEON | Panthéon | 652033.9 | 6860882.4 | AUTRES |
| INVALIDES | Invalides (Dôme) | 649554.6 | 6861876.4 | AUTRES |
| OPERA_GARNIER | Opéra Garnier | 650989.6 | 6863756.7 | AUTRES |
| CONCIERGERIE_SAINTE_CHAPELLE | Conciergerie/Sainte-Chapelle | 651959.6 | 6861928.3 | AUTRES |
| TOUR_SAINT_JACQUES | Tour Saint-Jacques | 652235.2 | 6862153.9 | AUTRES |
| POMPIDOU | Centre Pompidou | 652474.2 | 6862493.4 | AUTRES |
| GRAND_PALAIS | Grand Palais | 649565.4 | 6863120.7 | AUTRES |
| SAINT_DENIS | Basilique Saint-Denis (93) | 653084.8 | 6870824.1 | AUTRES |
| VERSAILLES | Château de Versailles (78) | 635400.6 | 6856445.9 | AUTRES |

Pistes de conception (héritées de la V1) : pour chaque monument dont l'azimut tombe dans le cône
central (±60°), deux critères de 5 pts — **% visible** (fraction de hauteur, via IA photo) et
**distance** (courbe propre : Eiffel < 6 km → 5 puis −1/km ; Sacré-Cœur < 2 km → 5 puis −1/km ;
autres < 1 km → 5 puis −1/500 m). Garde-fou azimut : un monument que l'IA prétend voir mais
géométriquement hors cône est rejeté.

---

## Affichage et garde-fous

### Note et affichage (V2)
- **Score B affiché = clampé à [0, 100]** ; le **score brut** (non clampé) reste la vérité,
  conservé en interne — l'affichage ne nourrit aucun calcul.
- **Libellés / étiquettes de score : à redéfinir lors de l'implémentation** (l'ancien système à
  paliers fixes est périmé et retiré). Les étiquettes resteront **distinctes** du label binaire
  « Sans Vis-à-Vis® certifié » et coexisteront avec lui.
- **Cartouches descriptifs (badges verts)** — maquette « Firmware », écran certifié : de courtes
  étiquettes décrivant la vue (ex. « Vue dégagée sur 800 m », « Exposition sud », « Tour Eiffel
  visible », « Vue sur parc »). Purement descriptifs : ils n'affectent ni le score ni le label.
  Générés à partir des **mêmes constats vérifiés** qui alimentent le score.

### Auditabilité
- Les sorties IA (`type` = enum, `remarquables` = flags, `nuisances` = flags) + un **niveau de
  confiance** sont **stockées avec le test** → score recalculable.
- Les composantes « données » (BD TOPO, BDNB, parcs/jardins…) sont **déterministes** par
  construction.

### Photo inexploitable (trop sombre, floue, reflets de vitre)
1. Détection → **message** : « La photo ne permet pas une analyse fiable de la vue. Le volet
   ‹ qualité de la vue › sera fortement réduit. Reprenez une photo en meilleure lumière pour un
   score représentatif. » + bouton **Reprendre la photo**.
2. Si l'internaute **passe outre** : les composantes **dépendantes de la photo** (type de
   paysage, monument photo, nuisances photo) = **0** ; la **géométrie** (Résultat A) et les
   nuisances issues des **données** se calculent normalement.
3. Le **label binaire n'est PAS affecté** (100 % géométrique) : la certification reste valable.
4. Résultat marqué **« score partiel — photo insuffisante »** (écran + certificat).

### Photo — version 1
- **Une seule photo** dans l'**axe principal** (champ central) : sert au **type de paysage** et à
  la **fraction visible** des monuments centraux.
- Les **flancs** (±60–90°) sont traités par la **géométrie** + les **données**.
- **Phase 2** : capture **panoramique guidée** (gauche / centre / droite), chaque photo étiquetée
  par son azimut.

---

## Constantes

### Implémentées — Résultat A (`config.ts`, code en production)

```
# Distance — axe principal
SCORE_DISTANCE_MAX_PTS = 20
SCORE_DISTANCE_MIN_M   = 40      # seuil sans vis-à-vis (0 pt)
SCORE_DISTANCE_STEP_M  = 8       # +1 pt / 8 m
SCORE_DISTANCE_MAX_M   = 200     # = BEAM_RANGE_M (plafond 20 pts)

# Amplitude
AMPLITUDE_BEAM_STEP_DEG = 3
AMPLITUDE_BEAM_COUNT    = 61
AMPLITUDE_PART_A_PTS    = 10
AMPLITUDE_PART_B_PTS    = 10
AMPLITUDE_PART_B_BASE_M   = 30   # ancrage bas : 30 m -> 1 pt
AMPLITUDE_PART_B_BASE_PTS = 1
CLEAR_BEAM_DIST_M         = 200  # distance d'un faisceau dégagé ; ancrage haut -> 10 pts
AMPLITUDE_NOTE_HALF_ANGLE_DEG = 60  # cône de note ; au-delà = flancs (pénalité seulement)

# Pénalité de flanc (deux flancs séparés)
FLANC_DIST_SEVERE_M        = 5    # < 5 m -> ÷3
FLANC_DIST_MODERE_M        = 7    # 5–7 m -> ÷2
FLANC_DIV_SEVERE           = 3
FLANC_DIV_MODERE           = 2
FLANC_FAISCEAUX_CONSEC_MIN = 3

# Orientation
ORIENTATION_PTS = { "S":10, "SO":10, "SE":8, "O":7, "NO":6, "E":4, "NE":2, "N":0 }
TOP_FLOOR_BONUS = 1              # si orientation < 10
```

### En conception — Résultat B (V2, NON implémenté, valeurs à fixer)

```
# Couches du score pondéré /100
COUCHE_1_DEGAGEMENT_CAP = 80     # plafond couche dégagement
COUCHE_2_EXCEPTION_CAP  = 20     # bonus max éléments remarquables
COUCHE_3_SANCTIONS      = ...    # malus, à concevoir (données à vérifier)
SCORE_B_CLAMP           = [0, 100]   # score AFFICHÉ ; brut conservé non clampé

# Familles de pondération (Couche 1) — coefficients à fixer
FAMILLE_2_ANCIEN_BOOST     = +0.30   # ex. +30 %, plafonné à 200 m   (bdnb_annee_batiment, < 1900)
FAMILLE_3_REMARQUABLE_BOOST = +0.50  # ex. +50 %                     (bdtopo_batiment.nature + Mérimée)
FAMILLE_4_NATURE_BOOST     = ...     # boost nature/eau (ST_Intersection + ST_Length)
# Famille 1 = neutre (défaut, aucun boost)
```

---

*Ce document accompagne `CLAUDE.md`, `SPEC_module_hauteurs_v3.md` et `docs/SOURCES_DATA.md`. Le
score est calculé après le verdict géométrique et ne le modifie jamais.*
