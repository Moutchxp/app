@AGENTS.md

# CLAUDE.md — Application Sans Vis-à-Vis®

> Fichier de contexte pour Claude Code. Respecter scrupuleusement les règles
> métier ci-dessous : elles ont été arbitrées par le porteur du projet et ne
> doivent pas être réinterprétées ou « optimisées » sans accord explicite.

---

## 0. Invariants verrouillés (vérifiés dans le code — cf. `docs/INVARIANTS_SVAV.md`)

> Garde-fous permanents, chacun prouvé `fichier:ligne` dans `docs/INVARIANTS_SVAV.md`. **Le code fait
> foi** : en cas de divergence entre une formulation ci-dessous, la documentation et le code, se référer
> au code cité. Ne jamais modifier ces invariants sans accord explicite du porteur.

- **Golden de non-régression = `29.107259068449615`** (note Couche 1 /80), scellé
  `app/lib/db/pipeline.itest.ts:42`, rejoue **Asnières** (lat `48.90693182287072`, lon
  `2.269431435588249`, azimut 90, étage 2). Toute modif touchant le score change le golden → recalcul +
  validation manuelle + **rescellage en commit SÉPARÉ**. (Asnières est un oracle *faible* pour le chemin
  patrimoine MH/Inventaire/mondial → cas scellés dédiés si l'on y touche.)
- **Verdict binaire 100 % géométrique** : 1er obstacle réel ≥ **40 m** → `SANS_VIS_A_VIS`, sinon
  `VIS_A_VIS` (`THRESHOLD_M`, `app/lib/svv/config.ts:82` ; `verdict.ts:103`). Jamais couplé au score ni à
  la photo (`scoreTotal.ts:44`). → détail §2 / §3.
- **Hauteur de vision = FORMULE À PARAMÈTRE VARIABLE** : `hauteur_vision = etage × (hauteur_sous_plafond
  + 0,30 dalle) + 1,65 yeux` (`config.ts:56-61`). `hauteur_sous_plafond` est **choisie par l'internaute**
  (stepper « infos logement », `page.tsx:2765`), défaut **2,50 m**, fourchette **[2,40 ; 4,50] m** par pas
  de 0,10 (`page.tsx:1280`). ⚠️ **`2,80` n'est PAS une constante du calcul** : c'est seulement le
  coefficient dérivé du cas par défaut (2,50 + 0,30 = `FLOOR_HEIGHT_M`, `config.ts:42`), non consulté par
  `hauteurVision()` dès que l'internaute choisit une autre valeur. ⚠️ **`2,90` = `FLOOR_HEIGHT_OBSTACLE_M`**
  (constante DISTINCTE : estimation d'un immeuble VOISIN sans hauteur BD TOPO, tier 3 `obstacles.ts` —
  `config.ts:48`), à NE PAS confondre. → détail §4.
- **Aucun arrondi ; distances horizontales autoritatives en Lambert-93 (EPSG:2154)** (§5).
- **`ST_Force2D` jamais retiré** des opérations distance/raster (`app/lib/db/obstacles.ts`,
  `hauteurLidar.ts:65,97`) — la 3D fausserait distances et lecture raster.
- **Tolérances** : rattachement patrimoine (monument → `cleabs`) = **15 m**
  (`scripts/migration_monuments_emblematiques.sql:67`) ; point d'origine hors emprise = **0,30 m**
  (`ORIGIN_OUTSIDE_TOLERANCE_M`, `config.ts:123`).
- **`config_scoring`** : toutes les variables de pondération du moteur externalisées (**39 colonnes**,
  singleton `id=1`), lues au runtime (`app/lib/db/profilConfig.ts:57`) avec **repli sûr**
  `PROFIL_DEGAGEMENT_DEFAUT` (`profilConfig.ts:74-78`). Aucune constante de score « en dur » dispersée.
- **Fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et `app/api/analyse-photo/route.ts`.
- **Fichiers sensibles (recon lecture seule avant tout write)** → liste au §14.
- **Stack réelle** : Next.js 16.2.9, React 19.2.4, TypeScript 5, Tailwind 4 ; PostgreSQL + PostGIS en
  **LOCAL**, driver `pg` sur `DATABASE_URL` (§1).

---

## 1. Contexte du projet

Application mobile qui certifie automatiquement si un logement est
« Sans Vis-à-Vis® » selon une définition précise et objective, puis génère un
certificat PDF et une estimation de plus-value liée à la vue.

Porté par l'agence immobilière **Sans Vis-à-Vis** (sansvisavis.com), spécialisée
dans les biens à vue dégagée. L'objectif est de transformer un terme subjectif
(« sans vis-à-vis ») en une **norme mesurable, certifiable et auditable**.

- **Stack** : Next.js 16.2.9, React 19.2.4, TypeScript 5, Tailwind CSS 4. Base **PostgreSQL + PostGIS
  en LOCAL** (aucun service de base de données souscrit — plus de Supabase), accès via le driver **`pg`**
  (node-postgres) sur `DATABASE_URL`.
- **Langue de l'interface et du domaine** : français. Conserver les termes métier
  en français (faisceau, obstacle, point d'observation, etc.).
- **Données géographiques** : MNT LiDAR HD (terrain, table `mnt_lidar_brut`) + MNS LiDAR HD
  (surfaces/toits, table `mns_lidar_brut`), grille 50 cm — source altimétrique unique.
  IGN BD TOPO® = emprises de bâtiments + identité (`cleabs`) ; son attribut hauteur ne sert
  que de fallback NON certifiant. RGE ALTI / table `rge_alti` : non utilisé, vide.
  OSM / cadastre en complément. Licence Etalab (open data).

---

## Principe de calcul du verdict (œil vs toit) — INVARIANT

Le verdict « Sans Vis-à-Vis » est 100 % géométrique : on compare deux altitudes
ABSOLUES (NGF) le long de l'axe de visée.

- Œil (origine) : A_œil = altitude_terrain_origine (MNT LiDAR, au point exact) + hauteur_vision
  (hauteur_vision = etage*2.80 + 1.65 — voir §4).
- Toit (obstacle) : A_toit = altitude du toit lue DIRECTEMENT sur le MNS LiDAR (absolue, nettoyée
  des artefacts). On ne reconstitue JAMAIS sol + hauteur côté obstacle, et on n'utilise PAS de MNT
  sous l'obstacle : le MNS donne déjà l'altitude absolue du toit.
- Un bâtiment est un obstacle réel si A_toit ≥ A_œil.
- Verdict = distance au premier obstacle réel sur l'axe principal :
  ≥ 40 m → SANS_VIS_A_VIS  |  < 40 m → VIS_A_VIS.
- Pas de bâtiment à l'origine, ou hors couverture LiDAR (MNT/MNS) → INDÉTERMINÉ, pas de certificat.

Une seule source par grandeur : terrain = MNT, toits = MNS (même grille LiDAR 50 cm).
BD TOPO = géométrie d'emprise + identité (cleabs) UNIQUEMENT, jamais l'altimétrie d'un certificat.

> ⚠️ CECI EST LE PRINCIPE, PAS UN CAS TYPE.
> Les configurations réelles sont innombrables : obstacle très proche (vis-à-vis), aucun obstacle
> sur 200 m (dégagé → certifié), terrain en pente, plusieurs bâtiments successifs, origine hors
> bâtiment ou hors LiDAR (indéterminé), 61 faisceaux pour le score d'amplitude, etc.
> Tout exemple chiffré n'est qu'UNE illustration parmi des millions — n'en déduis aucune règle
> ni seuil implicite. La règle = la formule + le seuil 40 m, pas l'exemple.

---

## 2. Définition du label « Sans Vis-à-Vis® » (RÈGLE BINAIRE)

Un logement est **Sans Vis-à-Vis®** lorsque le **premier obstacle réel** rencontré
dans l'axe principal de la vue du séjour est situé à **40 mètres ou plus** du
point d'observation.

- `distance_premier_obstacle_reel >= 40 m` → ✅ **Sans Vis-à-Vis**
- `distance_premier_obstacle_reel < 40 m` → ❌ **Vis-à-vis détecté**

Le point d'observation est la **fenêtre principale du séjour**, placée/validée par
l'utilisateur sur la carte (écran 3).

### Définition d'un obstacle réel

Est un obstacle **uniquement** une construction d'origine humaine (immeuble,
maison, bureau, bâtiment industriel, hangar, équipement public, mur, ouvrage bâti
permanent) qui remplit **simultanément** les deux conditions :

1. **Être intersectée par le faisceau d'analyse** (dans l'axe de vue).
2. **Avoir une altitude de sommet ≥ altitude de la fenêtre d'observation.**
   altitude_sommet (toit) = MNS LiDAR à la cellule du toit (absolue, nettoyée des artefacts), lue directement.
   (Reconstitution altitude_terrain_obstacle + hauteur_batiment = fallback BD TOPO, NON certifiant.)

Une construction dans l'axe mais dont le sommet est **sous** la hauteur de la
fenêtre n'est **PAS** un obstacle (elle ne crée pas de vis-à-vis), même si elle
est proche.

> **La végétation n'est JAMAIS un obstacle** : arbres, haies, jardins, parcs,
> végétation en général sont exclus du calcul du label.

### Algorithme du verdict

1. Détecter toutes les constructions dans le faisceau.
2. Ne retenir que celles dont le sommet ≥ hauteur de la fenêtre → obstacles réels.
3. Trouver le **premier** obstacle réel (le plus proche).
4. Comparer sa distance au seuil de 40 m → verdict.

---

## 3. Le label NE DÉPEND QUE DE LA GÉOMÉTRIE

**RÈGLE CRITIQUE :** l'analyse IA de la photo **n'intervient JAMAIS dans le verdict**
du label. Le verdict est déterminé exclusivement par le calcul géométrique
(distance / altitudes / hauteurs).

L'analyse photo et la qualité de vue alimentent **uniquement** le *score de
qualité de vue*, qui est une analyse **complémentaire et indépendante** du label.
Le score ne modifie jamais l'éligibilité.

- **Label** = règle binaire géométrique (≥ 40 m).
- **Score de qualité de vue** = analyse séparée (parc, monument, fleuve, horizon
  dégagé, panorama, etc.).

---

## Score de qualité de vue

Note **/100**, **indépendante du label binaire** (qui reste 100 % géométrique).
C'est le **seul** endroit où l'analyse **IA de la photo** intervient — elle
**n'influence JAMAIS le label**. Répartition **50/50** : **dégagement objectif**
(distance, amplitude, orientation) et **qualité du paysage** (type de paysage,
éléments remarquables, propreté visuelle). Calculé **après** le verdict
géométrique, il ne le modifie jamais.

> Barème détaillé, pondérations et constantes : voir `SPEC_score_qualite_vue.md`.

---

## 4. Calcul de la hauteur de vision (point d'origine)

On calcule la **hauteur de vision** (et non la simple hauteur de plancher) : ce
qui compte est le point de vue réel d'un humain à la fenêtre.

**La hauteur de vision est une FORMULE À PARAMÈTRE VARIABLE, pas une constante :**

```
hauteur_etage    = hauteur_sous_plafond + dalle (0,30 m)        // paramètre variable, pas un chiffre figé
hauteur_vision   = (etage * hauteur_etage) + 1.65              // 1,65 = yeux (définitif)
altitude_fenetre = altitude_terrain_origine + hauteur_vision
```

- **Hauteur sous plafond = CHOISIE par l'internaute** (stepper de l'écran « infos logement »,
  `app/page.tsx:2765`), **défaut 2,50 m** (« standard »), **fourchette [2,40 ; 4,50] m** par **pas de
  0,10 m** (clamp `app/page.tsx:1280`). C'est un exemple de variable **pilotée au runtime**.
- Dalle / plancher : **0,30 m** (`DALLE_M`, `config.ts:32`).
- Hauteur moyenne de l'œil humain : **1,65 m** (`EYE_HEIGHT_M`, `config.ts:38` — VALEUR DÉFINITIVE).
- ⚠️ **`2,80 m` n'est PAS une constante du calcul** : c'est uniquement le coefficient plancher-à-plancher
  **du cas par défaut** (2,50 + 0,30 = `FLOOR_HEIGHT_M`, `config.ts:42`). `hauteurVision()` recalcule
  `hauteur_etage` à partir de la valeur RÉELLEMENT choisie — 2,80 n'intervient plus dès que l'internaute
  saisit une autre valeur.
- Exemples **avec le défaut 2,50 m (→ étage = 2,80 m)** : rez-de-chaussée → `(0 × 2,80) + 1,65 = 1,65 m` ;
  3e étage → `(3 × 2,80) + 1,65 = 10,05 m`. Avec un sous-plafond choisi à 3,00 m (→ étage 3,30 m) :
  3e étage → `(3 × 3,30) + 1,65 = 11,55 m`.

**Transit de la valeur choisie jusqu'au calcul** : front `app/page.tsx` (payload `:1932` / `:1961`) →
API `app/api/analyse/route.ts:39-47` (idem `analyse-photo`) → `app/lib/db/pipeline.ts:96`
`hauteurVision(params.etage, params.hauteurSousPlafondM)`. Si la valeur est absente/≤ 0, `hauteurVision`
applique le défaut 2,50 m (`config.ts:58`).

> ⚠️ **Deux notions d'étage DISTINCTES — ne pas confondre :**
> - **OBSERVATEUR** = `hauteur_sous_plafond (choisie) + 0,30` — **VARIABLE**. `FLOOR_HEIGHT_M = 2,80 m`
>   (`config.ts:42`) n'est que sa valeur **dans le cas par défaut** (2,50 + 0,30), pas une constante du
>   calcul de la fenêtre du demandeur.
> - **`FLOOR_HEIGHT_OBSTACLE_M` = 2,90 m** (`config.ts:48`) → **ESTIMATION D'UN IMMEUBLE VOISIN** sans
>   hauteur BD TOPO (toit/hauteur absents), tier 3 de `obstacles.ts` : `sol + nombre_etages × 2,90`.
>   Constante FIXE, conservée à 2,90 pour ne pas modifier le score d'amplitude existant ; n'affecte
>   jamais le verdict (qui passe par le LiDAR/MNS).

> 🔄 **§4 RÉVISÉ — décision porteur du 28/06/2026 :** la hauteur d'étage n'est
> PLUS fixée à 2,90 m. Elle **dérive** d'une **hauteur sous plafond configurable**
> (défaut **2,50 m** « standard ») **+ dalle 0,30 m** = **2,80 m par défaut**.
> La hauteur de l'œil **1,65 m reste VALEUR DÉFINITIVE**. Ne pas coder en dur ces
> constantes de façon dispersée — les centraliser dans une config unique.

---

## Point d'origine officiel (responsabilité de l'internaute)

Le point d'origine du test (point d'observation) est défini **manuellement** par 
l'internaute sur la carte — jamais par un algorithme, jamais par le GPS de la photo.

- Le GPS capturé avec la photo sert **uniquement** à centrer la carte de l'écran 
  suivant. Il n'est jamais le point de référence du calcul.
- **Obligation de déplacement** : le repère initial (position par défaut = GPS photo) 
  doit être déplacé **au moins une fois** avant validation. Tant qu'il n'a pas bougé, 
  le bouton « Valider » reste inactif. But : transférer explicitement la responsabilité 
  du point d'origine à l'internaute, et non au système.
- **Contrainte géométrique** : le point validé doit se trouver **à l'intérieur d'un 
  polygone de bâtiment** (emprise BD TOPO), avec une tolérance maximale de **0,30 m** 
  vers l'extérieur du polygone (façades/balcons en limite d'emprise). Au-delà de 0,30 m, 
  la validation est impossible.
- **Hors emprise ou aucun polygone à l'emplacement** : la validation est bloquée et un 
  message invite l'internaute à replacer le point à l'intérieur de son habitation. Sans 
  point valide, aucun certificat ne peut être émis.
- Le point validé fournit l'**altitude terrain d'origine** (MNT au point exact) et 
  l'**origine du faisceau**.

---

## 5. Règles de calcul transverses

- **AUCUN ARRONDI, nulle part.** Toujours utiliser les valeurs brutes pour tous
  les calculs et leurs impacts (distances, altitudes, hauteurs, score). Ne pas
  arrondir pour l'affichage si cela sert ensuite à un autre calcul.
- **Distances horizontales (référence autoritative)** : calculées en
  **Lambert-93 (EPSG:2154)**, comme dans `SPEC_module_hauteurs_v3.md`. Les
  coordonnées GPS (WGS84 / EPSG:4326) sont **transformées en Lambert-93 à
  l'entrée**, et tous les calculs et le verdict s'appuient sur ces distances
  métriques. La formule de **Haversine** n'est qu'une **approximation d'appoint**
  (estimation rapide / affichage) et n'est **jamais** la source autoritative.
- Centraliser les constantes (2.90, 1.65, seuil 40 m) dans un module de config,
  jamais en valeurs magiques dispersées.

---

## 6. Numérotation des certificats

Format : `SAVV-AAAA-NNNNNN`

- `AAAA` = année (4 chiffres)
- `NNNNNN` = compteur séquentiel sur 6 chiffres, à partir de `000001`
- Exemples : `SAVV-2026-000001`, `SAVV-2026-000002`

> ⚠️ **Cible, NON encore implémentée dans le code** : à ce jour aucun `SAVV-` n'existe hors specs
> (`docs/INVARIANTS_SVAV.md §4`), et il n'y a pas de génération de certificat PDF. À l'implémentation,
> garantir l'unicité du compteur par un mécanisme atomique (compteur verrouillé dans la transaction
> d'insertion).

---

## 7. Stockage des photos et des fichiers

**NE JAMAIS stocker les images/PDF dans la base de données.** Le stockage se fait
sur un object storage compatible S3 (ex. OVH Object Storage). La base ne conserve
que les **URL** et les métadonnées.

La base conserve, par photo : URL photo, URL miniature, ID test, ID utilisateur,
date de prise de vue, orientation mesurée, inclinaison mesurée, statut de
validation.

Organisation des fichiers :

```
/photos-tests/AAAA/MM/ID_TEST/photo-originale.jpg
/photos-tests/AAAA/MM/ID_TEST/photo-miniature.jpg
/certificats/AAAA/MM/ID_TEST/certificat.pdf
```

---

## 8. Base de données (PostgreSQL/PostGIS)

Entité centrale : **TEST SANS VIS-À-VIS®**. Toutes les autres tables s'y rattachent.

Exigence d'**auditabilité** : chaque test doit pouvoir être à tout moment
retrouvé, recalculé et audité (données saisies, calculs, obstacles détectés,
résultat, certificat).

Tables principales :

- **Utilisateurs** : id, nom, prénom, email, téléphone, date création, source
  d'acquisition, consentement RGPD.
- **Tests** : id, id_utilisateur, date, adresse saisie + normalisée, lat/lon
  origine, altitude terrain origine, étage, dernier étage (bool), photo,
  orientation, inclinaison, statut validation photo, date analyse.
- **Point d'observation** : position exacte de la fenêtre validée (géométrie
  PostGIS).
- Tables associées : obstacles détectés, résultats/score, certificats, demandes
  d'estimation.

RGPD : recueillir et stocker le consentement ; permettre la suppression des
données utilisateur.

---

## 9. Pipeline technique (ordre des étapes)

1. Géocodage / GPS (adresse → coordonnées).
2. Validation adresse + point de départ (lat/lon de la fenêtre).
3. Récupération altitude terrain du point d'origine sur le MNT LiDAR HD (point exact).
4. Prise de photo (caméra grand-angle + niveau numérique + contrôle horizontalité).
5. Récupération orientation (azimut du téléphone au moment de la photo).
6. Contrôle de cohérence GPS de la photo vs point de départ validé.
7. Génération de l'axe / faisceau de vue à partir de l'orientation.
8. **Validation / correction du faisceau par l'utilisateur** (étape de sécurité
   indispensable — la boussole du téléphone est bruitée).
9. Récupération des bâtiments dans la zone (IGN BD TOPO® / OSM).
10. Détection des bâtiments intersectés dans l'axe.
11. Altitude du toit de chaque obstacle, lue directement sur le MNS LiDAR HD (absolue, nettoyée).
    Pas de terrain obstacle, pas de reconstitution sol + hauteur.
12. Saisie infos logement (étage + dernier étage).
13. Calcul altitude réelle de la fenêtre.
14. Calcul altitude réelle des obstacles.
15. Calcul distance horizontale au premier obstacle réel.
16. Verdict géométrique (label).
17. Analyse IA de la photo → score de qualité (n'affecte pas le label).
18. Fusion → score global.
19. Certificat PDF / estimation.

---

## 10. Parcours utilisateur (écrans)

Accueil → (Évaluer ma vue | Estimer la valeur).
Évaluer ma vue : 1 Intro → 2 Localisation + point de départ → 3 Photo →
4 Validation de l'axe → 5 Infos logement (étage, dernier étage) →
6 Analyse en cours → 7 Résultat (certifié | vis-à-vis détecté) →
8 Certificat PDF → plus-value / estimation.

---

## 11. Contenu du certificat PDF

Adresse, coordonnées GPS, photo, orientation, altitude, carte du faisceau,
obstacles détectés, premier obstacle réel, distance retenue, score, verdict
final, numéro de certificat.

---

## 12. Identité visuelle

Logo : crest « L'IMMOBILIER SANS VIS-À-VIS® ». Marque déposée (®) — toujours
afficher le symbole. Tagline de référence : « le premier obstacle réel à + de
40 mètres ». Décliner la charte graphique des maquettes (design tokens SVAV déjà
présents dans `app/globals.css` : `--color-svv-red #a30402`, `-ink`, `-green`,
classes `.svv-btn/.svv-card/.svv-pill/.svv-label`). Confirmer la palette
définitive avant de figer les couleurs dans le code.

---

## 13. POINTS OUVERTS (à définir avant d'implémenter)

- [ ] Marges d'erreur tolérées : inclinaison du téléphone, cohérence GPS.

> Points désormais tranchés (déplacés hors de cette liste) :
> - **Formule du score de qualité de vue** → voir `SPEC_score_qualite_vue.md`.
> - **Constante de hauteur d'étage (2,80 m dérivée) + œil (1,65 m)** → §4 (valeur définitive).
> - **Stratégie de hauteur des bâtiments (MNS primaire, BD TOPO® fallback)** →
>   voir `SPEC_module_hauteurs_v3.md`.

---

## 14. Conventions de code

- TypeScript strict. Pas de valeurs magiques : centraliser les constantes métier.
- Code des calculs géométriques **testé unitairement** (cas des docs : obstacles
  A/B sous la fenêtre = non retenus, C/D = obstacles réels).
- Ne pas introduire d'arrondi (voir §5).
- Demander confirmation avant de toucher aux règles métier des §2 à §7.

### Conventions de collaboration & livrables

- **Recon LECTURE SEULE avant tout write** sur un fichier sensible (moteur / config / DB) :
  - Moteur pur : `app/lib/svv/{verdict,coucheDegagement,scoreDegagement,scoreTotal,analyse,profilDegagement,config}.ts`
  - Accès données : `app/lib/db/{pipeline,profilConfig,faisceaux,obstacles,origine,hauteurLidar}.ts`
  - Front sensible : `app/page.tsx`, `app/MapContent.tsx` (+ `MapSelector.tsx`, `FaisceauMap.tsx`, `origine/Carte.tsx`)
  - Test golden : `app/lib/db/pipeline.itest.ts`
- **Un chantier = une modif logique = un commit.** Après chaque diff : vérifier, puis committer.
- **Tout ce qui touche `config_scoring`, le golden, le moteur de scoring ou des données nominatives**
  → modèle le plus capable + relecture humaine ; jamais délégué à un modèle léger.
- **2 fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et `app/api/analyse-photo/route.ts`.
- **Format des livrables (relais web → agent Claude Code de VS Code)** — toujours des blocs copiables
  clairement labellisés ; ne JAMAIS mélanger un prompt et un commit dans le même bloc :
  - 🔵 **PROMPT** — prompt à coller à l'agent Claude Code (toujours préciser DANS QUEL TERMINAL).
  - 🟢 **COMMIT** — message de commit à coller dans la boîte de commit de VS Code (Source Control).

---

## 15. Exigences transverses d'interface

### EXIGENCE TRANSVERSE — INTERFACE UTILISABLE SUR MOBILE (responsive)
Toute interface d'administration interne (les 5 modules du PLAN_INTERFACE_INTERNE.md et tout écran futur) DOIT être conçue responsive / mobile-first : lisible et pleinement utilisable sur un écran de smartphone (iPhone, portrait), pas seulement sur grand écran.
- Chaque module est pensé mobile dès sa conception, jamais "adapté après coup".
- Les contenus denses (tableaux de config à nombreuses colonnes, carte de curation, tableaux analytics) doivent avoir un comportement mobile explicite : défilement maîtrisé, repli en cartes/accordéons, ou vue condensée — jamais un simple débordement horizontal illisible.
- Cibles tactiles suffisantes, pas d'interaction dépendant du survol (hover) seul.
- Cette exigence coexiste avec les autres exigences transverses (pilotage sans code, prefers-reduced-motion) et ne les remplace pas.
