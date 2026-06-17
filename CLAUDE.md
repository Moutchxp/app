@AGENTS.md

# CLAUDE.md — Application Sans Vis-à-Vis®

> Fichier de contexte pour Claude Code. Respecter scrupuleusement les règles
> métier ci-dessous : elles ont été arbitrées par le porteur du projet et ne
> doivent pas être réinterprétées ou « optimisées » sans accord explicite.

---

## 1. Contexte du projet

Application mobile qui certifie automatiquement si un logement est
« Sans Vis-à-Vis® » selon une définition précise et objective, puis génère un
certificat PDF et une estimation de plus-value liée à la vue.

Porté par l'agence immobilière **Sans Vis-à-Vis** (sansvisavis.com), spécialisée
dans les biens à vue dégagée. L'objectif est de transformer un terme subjectif
(« sans vis-à-vis ») en une **norme mesurable, certifiable et auditable**.

- **Stack** : Next.js + TypeScript, Supabase, PostgreSQL/PostGIS.
- **Langue de l'interface et du domaine** : français. Conserver les termes métier
  en français (faisceau, obstacle, point d'observation, etc.).
- **Données géographiques** : IGN BD TOPO® (bâtiments + attribut hauteur),
  RGE ALTI® (altitude **du terrain**, MNT — ne contient pas les bâtiments),
  OSM / cadastre en complément. Licence Etalab (open data).

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
   `altitude_sommet = altitude_terrain_obstacle + hauteur_batiment`

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

```
hauteur_vision = (etage * 2.90) + 1.65
altitude_fenetre = altitude_terrain_origine + hauteur_vision
```

- Hauteur d'un étage complet : **2,90 m**
- Hauteur moyenne de l'œil humain : **1,65 m**
- Rez-de-chaussée → `(0 * 2.90) + 1.65 = 1.65 m`
- 3e étage → `(3 * 2.90) + 1.65 = 10.35 m`

> ✅ **VALEUR DÉFINITIVE (décision d'arbitrage).** 2,90 m/étage + 1,65 m de
> hauteur humaine est la valeur arrêtée et ne doit pas être réinterprétée.
> Ne pas coder en dur ces constantes de façon dispersée — les centraliser dans
> une config unique.

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
3. Récupération altitude terrain du point de départ (RGE ALTI®).
4. Prise de photo (caméra grand-angle + niveau numérique + contrôle horizontalité).
5. Récupération orientation (azimut du téléphone au moment de la photo).
6. Contrôle de cohérence GPS de la photo vs point de départ validé.
7. Génération de l'axe / faisceau de vue à partir de l'orientation.
8. **Validation / correction du faisceau par l'utilisateur** (étape de sécurité
   indispensable — la boussole du téléphone est bruitée).
9. Récupération des bâtiments dans la zone (IGN BD TOPO® / OSM).
10. Détection des bâtiments intersectés dans l'axe.
11. Altitude terrain de chaque obstacle potentiel + hauteur des bâtiments.
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
40 mètres ». Décliner la charte graphique des maquettes (à fournir/centraliser
dans un fichier de design tokens). Confirmer la palette définitive avant de figer
les couleurs dans le code.

---

## 13. POINTS OUVERTS (à définir avant d'implémenter)

- [ ] **Formule exacte du score de qualité de vue** : non définie à ce jour.
      Inputs possibles : distance du premier obstacle réel, largeur du dégagement,
      profondeur de vue, qualité paysagère, étage, dernier étage, panorama,
      horizon visible, éléments remarquables. À spécifier avant codage du moteur
      de score.
- [ ] Confirmer la constante de hauteur d'étage (voir §4).
- [ ] **Stratégie de hauteur des bâtiments** : RGE ALTI® = terrain seulement.
      Définir la source de la hauteur des bâtiments (attribut `hauteur` de BD TOPO®
      quand dispo, sinon estimation par nombre d'étages, idéalement MNS où
      disponible). Le verdict en dépend directement — ne pas coder sans cette
      décision.
- [ ] Marges d'erreur tolérées : inclinaison du téléphone, cohérence GPS.

---

## 14. Conventions de code

- TypeScript strict. Pas de valeurs magiques : centraliser les constantes métier.
- Code des calculs géométriques **testé unitairement** (cas des docs : obstacles
  A/B sous la fenêtre = non retenus, C/D = obstacles réels).
- Ne pas introduire d'arrondi (voir §5).
- Demander confirmation avant de toucher aux règles métier des §2 à §7.

