# Spec — pondération par famille de bâtiment (Couche 1)

## Statut : SPEC, non implémentée. Modifie le score → application ultérieure avec
recon d'impact golden + rescellage en commit séparé. Toutes les variables ci-dessous
sont destinées à une TABLE DE CONFIG modifiable (interface d'édition future), pas en dur.

## 1. Barème par famille
Cône = ±60° (120°). Flancs = 60–90°. Distance max = plafond de valorisation du faisceau.

| Famille | Cône | Flancs | Distance max (m) |
|---|---|---|---|
| Patrimoine mondial (14 monuments MONUMENTS_L93) | faisceau = 800 | faisceau = 800 | 800 |
| Monument Historique classé | ×2.0 | ×1.5 | 400 |
| Monument Historique inscrit | ×2.0 | ×1.5 | 400 |
| Bâti patrimonial (Inventaire IA) | ×2.0 | ×1.5 | 400 |
| Bâti construit ≤ 1900 | ×1.5 | ×1.2 | 300 |
| Bâti construit 1901–1935 | ×1.2 | ×1.1 | 200 |

## 2. Règle de cumul nature + bâti
Déclencheur : le faisceau traverse de la NATURE entre l'origine et le bâti touché.
Si PAS de nature → calcul classique inchangé, ne rien appliquer.

Si nature présente :
- Partie 1 : valeur du faisceau calculée comme aujourd'hui, en ignorant le bâti
  derrière (nature + pondérations normales), CAPÉE À 200.
- Partie 2 : (distance_réelle × coeff_bâti) / diviseur, où le diviseur dépend de la
  longueur de nature traversée :
    < 30 m → 1,0 (pas de division)
    30–34 → 1,1 ; 35–39 → 1,2 ; 40–44 → 1,3 ; 45–49 → 1,4 ; 50–54 → 1,5 ;
    55–59 → 1,6 ; 60–64 → 1,7 ; 65–69 → 1,8 ; 70–74 → 1,9 ; ≥ 75 m → 2,0 (plafond).
  Formule : diviseur = min(2,0 ; 1,0 + 0,1 × floor((nature − 25)/5)) si nature ≥ 30, sinon 1,0.
- Total faisceau = Partie 1 + Partie 2, CAPÉ à la distance max de la catégorie du bâti.

Patrimoine mondial : AUCUN calcul, faisceau = 800 systématiquement.

Exemple (MH, cône, 150 m réels dont 100 m nature) :
- P1 = calcul nature classique capé à 200 → 200.
- P2 = (150 × 2) / 2 (nature ≥ 75 ? non, 100 ≥ 75 → diviseur 2,0) = 150.
- Total = 350, capé à 400 (MH) → 350.

## 3. Cadre
- Couche 1 reste plafonnée à 80 (existant, non modifié).
- À implémenter : lire les coefficients depuis une table de config (pas en dur),
  pour édition via interface future.

## 4. Points à vérifier en recon AVANT implémentation
- Coefficient nature réel (F4) et le calcul nature actuel (Partie 1).
- Localisation du max(nature, bâti) actuel, à remplacer par le cumul.
- Coefficients F2 (pré-1900 ×1.30) / F3 existants → éviter le double comptage
  avec les nouvelles lignes ≤1900 / 1901–1935.
- Dépendance golden Asnières (25.44030853862166).

## Cartographie du moteur existant (recon lecture seule)
- Cœur : distancePercueFaisceau (coucheDegagement.ts:42-82) construit des candidats
  de distance par faisceau et garde le MAX (modeCombinaison='max', coucheDegagement.ts:68-70).
- F1 base : distance réelle plafonnée à distanceMaxM=200.
- F2 pré-1900 : distance × (1 + boostF2), boostF2=0.3 → ×1.30, plafond 200.
  Déclencheur : impactAncien (année < 1900 via bdnb_annee_batiment).
- F3 remarquable : forfait selon position — forfaitConeCentral=300 (cône),
  forfaitExtremites=200 (flancs), cône = coneF3DemiAngleDeg=60. Distance ignorée.
  naturesRemarquables = ['Eglise','Monument','Chapelle','Château','Tour, donjon','Arc de triomphe'].
- F4 nature : base + boostF4 × natureTraverseeM, boostF4=2.5, plafond 200.
- Assemblage : noteDegagement (coucheDegagement.ts:181-199) somme les 61 faisceaux,
  retire malus couloir, / (61 × distanceMaxM), × plafondDegagement=80, + orientation
  (bande 80→90), clamp plafondCouche1=90.
- Golden : pipeline.itest.ts, Asnières 25.44030853862166, dépend de tout ce chemin
  (F4 nature entre dedans → toute modif de pondération le fait bouger).
- CONFIG : tout en dur dans PROFIL_DEGAGEMENT_DEFAUT (profilDegagement.ts:41-57), objet
  TS littéral. MAIS distancePercueFaisceau et noteDegagement reçoivent déjà le profil
  en PARAMÈTRE → point d'injection pour une table de config runtime.
- Note : commentaire golden dit boostF4=2.0 alors que profil réel = 2.5. À vérifier
  à l'implémentation.

## Points de vigilance
- DOUBLE COMPTAGE F2 : les lignes barème "≤1900" et "1901-1935" recoupent le boostF2
  existant (×1.30). Décision à acter : le barème REMPLACE le boostF2 ou coexiste.
- AUCUNE distinction cône/flanc dans le scoring aujourd'hui (sauf forfait F3). Le barème
  cône/flanc est une nouveauté : il faut propager offsetDeg dans le calcul par faisceau.

## Plan d'implémentation (3 étapes, moteur en dernier, commits séparés)
1. Externaliser PROFIL_DEGAGEMENT_DEFAUT en TABLE DE CONFIG, avec les valeurs
   ACTUELLES à l'identique → comportement inchangé → golden identique (à vérifier).
   Fondation de l'interface d'édition future. SAFE.
2. Réécrire distancePercueFaisceau : règle de cumul (P1 capé 200 + P2 = bâti×coeff/diviseur
   nature), distinction cône/flanc, distances max par famille, patrimoine mondial=800,
   remplacement du max. → GOLDEN CHANGE : recalcul + vérif main + rescellage en commit séparé.
3. Brancher les nouvelles familles (inventaire_general, monuments) sur le calcul par faisceau.

## Exigence transverse
TOUTES les variables du moteur de scoring (coefficients, distances max, bornes du
diviseur, forfaits, seuils cône, plafonds) doivent être configurables via une INTERFACE
FUTURE sans toucher au code → stockage en table de config lue au runtime. C'est l'objectif
de l'étape 1 et la contrainte de conception de tout le reste.

## Règle de priorité de famille (UNE SEULE pondération par bâti)
Un polygone appartient à une seule famille pour le scoring, par ordre de priorité
décroissant. La première qui matche gagne, les autres NE s'appliquent PAS (jamais de cumul) :
1. Patrimoine mondial (si présent → faisceau = 800, aucun autre calcul)
2. Monument Historique (classé ou inscrit)
3. Bâti patrimonial (Inventaire IA, inventaire_general)
4. Année de construction (≤1900 ×1.5 / 1901–1935 ×1.2) — UNIQUEMENT si le bâti
   n'appartient à aucune des familles 1 à 3.

Conséquence : dès qu'un bâti porte un statut patrimonial (mondial / MH / Inventaire),
les pondérations d'ANNÉE DE CONSTRUCTION ne s'appliquent pas. L'année ne joue que
pour le bâti "ordinaire" sans statut patrimonial.

Implication code : remplace l'empilement de candidats (max actuel) par une
détermination de la famille prioritaire du bâti, puis application d'UN SEUL coeff.
Dans la règle de cumul nature+bâti (Partie 2 = bâti × coeff / diviseur), le coeff
utilisé est celui de la famille prioritaire — un seul, jamais deux.

## Colonnes de config non consultées au calcul

L'Étape 2 (barème par famille) a rendu inertes plusieurs colonnes de `config_scoring`
héritées du modèle précédent (F2 boost / F3 forfait / mode de combinaison). Elles sont
restées physiquement en table, mais ne sont plus lues nulle part dans le calcul du score.

### Colonnes vestigiales (mortes, prouvé par grep)

| Colonne | Clé profil | Remplacée par / raison de la mort | Grep (où elle apparaît encore) |
|---|---|---|---|
| `boost_f2` | `boostF2` | Barème année (option A : ≤1900 ×1.5 / 1901–1935 ×1.2) remplace le boost pré-1900 | type/défaut (`profilDegagement.ts`) + loader (`profilConfig.ts`) uniquement |
| `forfait_cone_central` | `forfaitConeCentral` | Forfait F3 « monument remarquable » supprimé — MH/Inventaire (par `cleabs`) le remplacent | type/défaut + loader uniquement |
| `forfait_extremites` | `forfaitExtremites` | idem — forfait F3 supprimé | type/défaut + loader uniquement |
| `cone_f3_demi_angle_deg` | `coneF3DemiAngleDeg` | Demi-angle du cône F3 (forfait supprimé) — le cône/flanc du barème utilise `coneFamilleDemiAngleDeg` | type/défaut + loader uniquement |
| `natures_remarquables` | `naturesRemarquables` | Liste de `bdtopo_batiment.nature` du forfait F3 (supprimé) | type/défaut + loader uniquement |

Chacune n'apparaît plus que dans la déclaration du type / la valeur par défaut
(`profilDegagement.ts`) et le mapping du loader (`profilConfig.ts`) ; **jamais lue au
calcul** (`coucheDegagement.ts`, `faisceaux.ts`, `obstacles.ts`, `pipeline.ts`,
`scoreTotal.ts`).

**Ces 5 colonnes restent en table `config_scoring` mais n'ont AUCUN effet sur le score.
L'interface future d'édition de config DOIT les masquer, ou les afficher grisées en
lecture seule, pour ne jamais laisser croire qu'un opérateur peut agir sur le moteur en
les éditant.**

### ⚠️ Cas particulier — `mode_combinaison` (NON morte)

`mode_combinaison` (clé profil `modeCombinaison`) a été **retirée du calcul** (le
`switch (modeCombinaison)` de `distancePercueFaisceau` a été supprimé à l'Étape 2), mais
elle est **toujours lue au chargement** comme garde de validation. Dans
`profilConfig.ts:75` : une valeur hors `MODES_VALIDES` (`'max' | 'addition' | 'sequentiel'`)
déclenche `return PROFIL_DEGAGEMENT_DEFAUT` — c'est-à-dire le **revert de TOUTE la config**
sur le profil par défaut. Son édition n'a pas d'effet sur le calcul du score, mais une
valeur invalide a un **effet indirect destructif** (perte de toute la configuration en base
au profit des valeurs codées en dur).

**Ne PAS traiter `mode_combinaison` comme vestigiale. L'interface future doit la contraindre
à `MODES_VALIDES` (liste fermée / verrou), jamais en champ libre — sous peine de faire
retomber silencieusement tout le moteur sur `PROFIL_DEGAGEMENT_DEFAUT`.**

## Validation Patrimoine mondial (faisceau-preuve 800)

La preuve sur données réelles est impossible : les 14 monuments emblématiques
(`MONUMENTS_L93`) sont tous hors du département 92 (Paris intra-muros / 93 / 78), or la
couverture LiDAR MNT/MNS de la base est limitée au 92. Aucun axe de test réel ne peut
donc traverser un monument mondial rattaché. La validation passe par un test unitaire
synthétique (flags posés à la main sur un `FaisceauResultat`).

Deux tests persistants couvrent la priorité mondiale :

- `app/lib/svv/coucheDegagement.test.ts:75` — `it('Patrimoine mondial → faisceau fixe 800,
  aucun calcul')` : un faisceau `impactEmblematique: true` **+ `impactMH: true`** renvoie
  **800 fixe** → le mondial court-circuite le Monument Historique, sans calcul ni cap de
  distance de famille.
- `app/lib/svv/coucheDegagement.test.ts:71` — `it('priorité : MH gagne sur année (MH + 1880
  → coeff MH 2.0, pas 1.5)')` : un faisceau `impactMH: true` **+ `impactAnnee: 1880`**
  renvoie `200` (100 × 2.0, coeff MH) → le MH gagne sur le barème année.

La chaîne complète **mondial > MH > année** est donc établie par **composition** de ces deux
tests (mondial > MH, puis MH > année). Il n'existe pas de test unique combinant les trois
flags (`impactEmblematique` + `impactMH` + `impactAnnee`) : c'est un fait de couverture, pas
un défaut caché. Le golden Asnières (29.107259068449615) reste inchangé, aucun monument
mondial n'étant présent sur son axe (dép. 92).
