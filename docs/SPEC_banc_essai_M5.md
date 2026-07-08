# SPEC — Banc d'essai M5 (simulateur d'analyse à variables modifiables, décorrélé du moteur actif)

> **Statut : FIGÉE (v2, après 3 revues : golden-safety/archi, faisabilité seam, ergonomie).** Décisions
> arbitrées par Arno. Réutilise `docs/PLAN_INTERFACE_INTERNE.md` § Module 5 (`:191-208`, `:471-499`).
> **SPEC uniquement — aucun code applicatif.**
>
> **GOLDEN-SAFE absolu** : le banc utilise EXACTEMENT le même moteur que la prod ; la décorrélation se fait
> par la **CONFIG injectée** (`params.profil` en mémoire), jamais par un fork de code. `test:integration`
> **15/15**, golden `29.107259068449615` **bit-identique**. Le banc **n'écrit RIEN** en base sur le chemin
> d'analyse (garantie ENFORCÉE, cf. §8).

---

## 0. Contexte technique vérifié (recon — acquis)

- **Placeholder** : `app/(admin)/admin/(protected)/banc-test/page.tsx:1-11`. Route + Sidebar en place.
- **Injection config** : `analyserAdresse(params)` (`pipeline.ts:87`), `ParametresAnalyse` (`:68-80`),
  **`profil?: ProfilDegagement`** (`:79`) → `const profil = params.profil ?? await chargerProfilDegagement()`
  (`:180`) → `analyser(entree, profil)` (`:181`). **Profil injecté ⇒ `config_scoring` live non lu.**
- **Couverture profil** : `ProfilDegagement` (`profilDegagement.ts:50`) = 38 col. `config_scoring` +
  `famillesAnnee`. `chargerProfilDegagement` mappe `config_scoring` (`profilConfig.ts:69`) + `config_famille_annee`
  (`:84`). `PROFIL_GOLDEN_REF` (`pipeline.itest.ts:26-68`) prouve l'injection totale. **Non injectables**
  (données lues en base, IDENTIQUES entre runs) : patrimoine (`faisceaux.ts:102-113`), bâtiments, LiDAR.
- **⚠️ 4 variables VESTIGIALES** (mappées mais NON consultées par le score) : `boostF2`,
  `forfaitConeCentral`, `forfaitExtremites`, `coneF3DemiAngleDeg` (`coucheDegagement.ts:98-99` : « boostF2 /
  forfait F3 ne sont plus consultés ; l'année remplace boostF2, MH/Inventaire remplacent le forfait »).
  L'année de construction et les familles MH/Inventaire les remplacent.
- **Contributions par faisceau (récupérables purement)** : `distancePercueFaisceau(f, profil)`
  (`coucheDegagement.ts:101-130`), PURE : coeff cône/flanc (`:116`), boost F4 nature (`:107`), diviseur cumul
  nature (`:122`), mode P1/P2 `combinerP1P2` (`:124`), cap `distMaxM` famille (`:126/129`), mondial fixe (`:110`).
- **Contributions AGRÉGÉES (non-par-faisceau)** : orientation (`noteDegagement:241-245`, bonus flat par secteur),
  malus couloir (`:233-237`, chaîne de faisceaux, indices connus), **normalisation** (`÷ nb ÷ distanceMaxM ×
  plafondDegagement`, `:239`) et **clamp** `[0, plafondCouche1]` (`:246`).
- **« Seuils » 200/400/800 = bornes du PROFIL, PAS des seuils moteur** : 200 = `distanceMaxM`
  (`profilDegagement.ts:105`) ; 400 = `mh/inv.distMaxM` (`:119-120`) ; 800 = `mondialFaisceauM` (`:118`). Le
  code ne teste jamais « franchit 200/400/800 ». **Pilotés par le profil** (un profil de test peut les changer).
- **Distance brute** : `FaisceauResultat.distanceObstacleM` (`faisceaux.ts:51`), géométrique, **profil-indépendante**,
  **NULLABLE** (`null` = faisceau dégagé).
- **Score client** : `score.total` /100 (`scoreTotal.ts:44` = `noteDegagement`) + `SCORE_LABEL`
  (`config.ts:310-311` : ≥75 EXCEPTIONNELLE, ≥60 EXCELLENTE). `famille1`/`famille2` **vestigiaux, non sommés**
  (`scoreTotal.ts:40-42`).
- **Photo** : `analyserPhotoIa` (`adaptateurIaPhoto.ts:168`) → fusion → `params.paysage` ; sans photo
  `paysageVideNouveau()` (`pipeline.ts:142-162`).
- **Composants publics** : `AdresseAutocomplete.tsx` réutilisable ; steppers étage/hauteur inline `page.tsx` ;
  `FaisceauMap.tsx` clamp `MARGE_ROT_DEG:14` ; validation GPS serveur (`origine.ts`, tolérance active 1,0 m).

---

## 1. Principe fondateur (BE-1..BE-9)

**BE-1** — Le banc DOIT utiliser les MÊMES fonctions de scoring que la prod, sans dupliquer ni forker le moteur.
**BE-2** — Le banc DOIT réaliser la décorrélation UNIQUEMENT par la config injectée (`params.profil` en mémoire).
**BE-3** — Le banc DOIT partir du profil ACTIF (`chargerProfilDegagement`) comme base du profil de test (synchro descendante).
**BE-4** — Le banc NE DOIT propager AUCUNE modification vers `config_scoring`, `config_famille_annee`, M1 ou Cartes d'année.
**BE-5** — Le banc NE DOIT émettre AUCUNE écriture DB sur le chemin d'analyse (garantie ENFORCÉE, cf. BE-80).
**BE-6** — Le banc NE DOIT émettre aucun certificat ni persister de résultat d'analyse.
**BE-7** — QUAND le profil actif change (M1 / Cartes d'année publiés), le banc DOIT le refléter au prochain chargement (aucun cache figé).
**BE-8** — Le seam moteur (Lot 1) DOIT être ADDITIF et PUR : il NE DOIT PAS modifier le chemin de calcul du score.
**BE-9** — Le golden `29.107259068449615` DOIT rester bit-identique et `test:integration` **15/15** après tout le chantier M5.

---

## 2. Lot 1 — Seam verbeux moteur (préalable dur ; extraction-délégation, source unique de vérité)

> **Principe imposé par la revue (F1 bloquant, #5) : EXTRACTION-DÉLÉGATION, PAS de recalcul parallèle.** La
> ventilation DOIT être émise PAR le passage de calcul unique de `noteDegagement`/`distancePercueFaisceau`
> (opt-in), ces fonctions devenant des wrappers de la version verbeuse. Interdit : une fonction jumelle qui
> ré-implémente l'agrégat (→ deux vérités qui divergeraient à la prochaine modif du barème).

**BE-10** — Le moteur DOIT exposer la ventilation par faisceau via le **même passage de calcul** que
`noteDegagement` : la version verbeuse émet la ventilation, et `noteDegagement`/`distancePercueFaisceau`
DÉLÈGUENT à elle (ordre arithmétique strictement préservé → bit-identique).

**BE-10bis** — La ventilation DOIT être calculée à partir des `faisceaux` **déjà produits par l'unique
exécution** d'`analyserAdresse` (aucun round-trip DB/LiDAR supplémentaire) et exposée comme **champ ADDITIF**
de `ResultatComplet` (rétro-compatible).

**BE-11** — Chaque ligne de ventilation (61) DOIT contenir : `offsetDeg`, `distanceBruteM`
(= `distanceObstacleM`, géométrique, `null` si dégagé), et `distancePercueM` (pondérée).

**BE-11a** — Le `seuilFranchi` (200/400/800) N'EST PAS une sortie du moteur mais une **dérivation d'AFFICHAGE**
du banc, calculée en comparant `distancePercueM` aux **bornes du PROFIL injecté** (`distanceMaxM`,
`famille.distMaxM`, `mondialFaisceauM`) — jamais des littéraux codés en dur.

**BE-12** — Chaque ligne DOIT exposer les contributions **réellement appliquées par le moteur actuel** :
coefficient cône/flanc appliqué, boost F4 (nature) appliqué, diviseur de cumul nature, mode de combinaison
P1/P2 retenu, cap `famille.distMaxM` appliqué (oui/non). Le seam N'EXPOSE PAS les ingrédients dépréciés
(`boostF2`, forfait F3) — cf. §0 (vestigiaux).

**BE-13** — Chaque ligne DOIT indiquer la famille détectée (mh / inventaire / mondial / carte d'année / aucune)
telle qu'utilisée par le calcul ; le libellé de carte d'année est re-résolu via `famillesAnnee.find(carteMatche)`
sur le profil injecté.

**BE-14** — La ventilation DOIT être composée de NOMBRES uniquement (pas de WKT ni géométrie).

**BE-15** — Les ajustements AGRÉGÉS (non-par-faisceau) DOIVENT être exposés SÉPARÉMENT des 61 lignes : (i) le
**malus couloir** (valeur + indices des faisceaux de la chaîne), (ii) le **bonus orientation** (secteur + points,
flat), (iii) le **facteur de normalisation** (`÷ nb faisceaux ÷ distanceMaxM × plafondDegagement`), (iv) l'**écrêtage
clamp** `[0, plafondCouche1]` (borne + appliqué oui/non).

**BE-16** — La reconstitution DOIT ré-appliquer la MÊME formule d'agrégation (PAS une somme naïve) :
`clamp( normalisation( Σ distancePercueM − Σ malus couloir ) + orientation , 0, plafondCouche1 )`, et obtenir
`score.total` **bit-identique**. La SPEC RECONNAÎT que `Σ(distancePercueM) ≠ score.total` en général (à cause de
la normalisation, de l'orientation, du malus et du clamp).

**BE-17** — SI le seam est appelé, ALORS il NE DOIT modifier aucun état partagé ni déclencher d'écriture DB.
**BE-18** — Le seam DOIT rester léger (≈ 61 lignes, aucun round-trip DB au-delà de l'exécution d'`analyserAdresse`).
**BE-19** — Un test d'intégration DOIT rejouer Asnières via le seam et vérifier `score.total = 29.107259068449615`.
**BE-19bis** — L'émission verbeuse DOIT être OPT-IN (flag/variante dédiée) : le chemin de prod
`analyserAdresse`/`analyser`/`noteDegagement` NE DOIT PAS voir sa valeur ni ses perfs altérées quand la
ventilation n'est pas demandée.

> **Fichier sensible** : `coucheDegagement.ts` (CLAUDE.md §14) → recon lecture seule avant write, commit SÉPARÉ,
> et si le moindre bit du golden bouge → STOP + rescellage hand-verified.

**CA (Lot 1)** :
- **CA-1.1** : la ventilation retourne 61 lignes avec `offsetDeg`/`distanceBruteM`/`distancePercueM` + les
  4 ajustements agrégés (malus, orientation, normalisation, clamp).
- **CA-1.2** : la reconstitution PAR LA FORMULE D'AGRÉGATION (BE-16) = `score.total` bit-identique sur Asnières
  (et NON une somme des 61 lignes, qui diffère quand clamp/orientation/malus jouent).
- **CA-1.3** : `test:integration` 15/15, golden `29.107259068449615` inchangé APRÈS l'ajout du seam.
- **CA-1.4** : `distancePercueFaisceau`/`noteDegagement` sont des WRAPPERS de la version verbeuse (une seule
  source de vérité) — vérifiable par lecture (pas de formule d'agrégat dupliquée).

**Fichiers pressentis** : `app/lib/svv/coucheDegagement.ts` (extraction `ventilerFaisceau`/`ventilerNote` +
wrappers), champ additif sur `ResultatComplet`/`analyse.ts`, test `pipeline.itest.ts` (ou dédié).

---

## 3. Lot 2 — Profil de test synchronisé + récap des écarts (dépend de Lot 1)

**BE-20** — QUAND le banc s'ouvre, il DOIT charger le profil ACTIF et le cloner en « profil de test » éditable EN MÉMOIRE.
**BE-21** — Le banc DOIT rendre éditables inline les 38 variables de `config_scoring` du profil de test.
**BE-21a** — Le banc DOIT distinguer visuellement les variables ACTIVES (consultées par `score.total`) des
variables VESTIGIALES (`boostF2`, `forfaitConeCentral`, `forfaitExtremites`, `coneF3DemiAngleDeg`) et signaler
qu'éditer une vestigiale **ne modifie pas le score** (cohérent avec le statut VESTIGIALE de M1).
**BE-21b** — Le banc DOIT indiquer que les **constantes géométriques hors profil** (ex. `ORIENTATION_SECTEURS`,
`config.ts:211`) ne sont PAS tunables : la couverture profil concerne les PONDÉRATIONS, pas la géométrie de secteur.
**BE-22** — Le banc DOIT permettre le CRUD des cartes d'année (`famillesAnnee`) du profil de test, EN MÉMOIRE.
**BE-23** — Le banc DOIT réutiliser libellés, bornes et validations de M1 et du module Cartes d'année (pas de barème dupliqué).
**BE-24** — SI une valeur éditée sort de sa plage (min/max, enum, `mode_combinaison`), ALORS le banc DOIT la
refuser/clamper AVANT exécution ; ET il DOIT refuser un jeu de cartes d'année aux **intervalles chevauchants**
(le first-match de `carteMatche`, `coucheDegagement.ts:55`, rendrait le résultat dépendant de l'ordre).
**BE-25** — Le banc DOIT afficher un RÉCAP des écarts : pour chaque variable modifiée, `valeur active → valeur test`.
**BE-25a** — Le récap DOIT REGROUPER les écarts par FAMILLE de variables (dégagement/cône, F4-nature, diviseur
cumul, cap distance, couloir, orientation, familles patrimoine, cartes d'année), avec un COMPTEUR par famille +
un total, trié famille puis nom.
**BE-25b** — Le récap DOIT représenter les écarts de cartes d'année en **AJOUT / SUPPRESSION / MODIFICATION**
(intervalle ou coeff), distinctement des écarts scalaires.
**BE-26** — Le banc DOIT permettre un RESET ramenant le profil de test au profil actif (récap vidé).
**BE-27** — Le profil de test NE DOIT jamais être persisté en base.

**CA (Lot 2)** : CA-2.1 édition → récap `actif→test` ; CA-2.2 valeur invalide refusée/clampée ; CA-2.3 Reset
ramène tout + récap vide ; CA-2.4 aucune écriture `config_scoring`/`config_famille_annee` ; **CA-2.5** 0 écart →
état vide explicite (« profil de test identique au profil actif ») ; **CA-2.6** éditer une variable VESTIGIALE
ne change pas `score.total` (et le banc l'a signalé).

**Fichiers pressentis** : `banc-test/` (formulaires réutilisant M1/Cartes d'année) ; route GET admin (profil actif).

---

## 4. Lot 3 — Saisie internaute (dépend de Lot 1 ; parallèle à Lot 2)

**BE-30** — Le banc DOIT saisir l'adresse via `AdresseAutocomplete` (réutilisé tel quel).
**BE-31** — Le banc DOIT permettre de placer le point d'origine sur carte (`MapContent`), ergonomie RELÂCHÉE (pas de drag obligatoire).
**BE-32** — Le point DOIT rester VALIDE au sens de `validerOrigine` (bâtiment couvert LiDAR) — OQ-a tranché : **pas de bypass** (`pipeline.ts:89`).
**BE-33** — SI le point est invalide (`resultat: null`), ALORS le banc DOIT afficher un message clair et ne pas lancer l'analyse.
**BE-34** — Le banc DOIT régler l'azimut sur carte en **360° LIBRE** via une prop passée à `FaisceauMap`, SANS modifier le clamp public (`MARGE_ROT_DEG`).
**BE-35** — Le banc DOIT saisir étage (entier ≥ 0), hauteur sous plafond (stepper `[2,40 ; 4,50]` pas 0,10, défaut 2,50) et dernier-étage.
**BE-36** — Le banc DOIT calculer/transmettre `hauteurVision` via la logique existante (`config.ts:56-61`), sans dupliquer la formule.

**CA (Lot 3)** : CA-3.1 adresse recentre + point valide active ; CA-3.2 point hors bâtiment bloque avec message ;
CA-3.3 azimut 360° dans le banc, clamp ±30° préservé dans le public ; CA-3.4 hauteur bornée `[2,40 ; 4,50]` pas 0,10.

**Fichiers pressentis** : `banc-test/` ; `AdresseAutocomplete.tsx` ; `MapContent.tsx`/`FaisceauMap.tsx` (props
ajoutées, non-cassantes) ; extraction steppers ; `config.ts` (réimport).

---

## 5. Lot 4 — Photo / Gemini (dépend de Lot 3 ; optionnel au run)

**BE-40** — Le banc DOIT permettre d'uploader une photo convertie en base64.
**BE-41** — QUAND une photo est fournie, le banc DOIT appeler `analyserPhotoIa` (Gemini réel) et assembler une `EntreePaysage` (`params.paysage`).
**BE-41a** — Le banc DOIT éviter le rejeu involontaire des appels Gemini (payants) : un même upload NE DOIT PAS relancer l'IA sans action explicite de l'opérateur.
**BE-42** — Le banc DOIT permettre une analyse SANS photo (Famille 2 neutre via `paysageVideNouveau`).
**BE-43** — TANT QUE l'analyse photo est en cours, le banc DOIT afficher un état de chargement.
**BE-44** — SI l'IA renvoie `echec_technique` ou une photo `inexploitable`, ALORS le banc DOIT le signaler et retomber sur le chemin neutre (Famille 2 = 0).
**BE-45** — Le banc NE DOIT PAS modifier `adaptateurIaPhoto.ts` ni `analyse-photo/route.ts`.

**CA (Lot 4)** : CA-4.1 photo → `EntreePaysage` peuplée (audit `score.famille2`) ; CA-4.2 sans photo → analyse OK,
`famille2` neutre ; CA-4.3 échec IA → message + repli neutre, pas de crash.

---

## 6. Lot 5 — Exécution + comparaison des scores (dépend de Lots 1-4)

> **Principe imposé par la revue (F2 majeur) : la GÉOMÉTRIE est calculée UNE SEULE FOIS.** Le profil n'influence
> QUE l'étape pure `analyser(entree, profil)` (`pipeline.ts:181`) ; toute la partie DB/LiDAR
> (`validerOrigine`/`obstaclesSurAxe`/`faisceauxAmplitude`/`resoudre*`/`preparerPaysageGeometrique`) est
> profil-indépendante. L'exécuter 2× doublerait ~122 requêtes PostGIS pour rien ET ne garantirait pas une série
> BRUTE identique entre les deux runs.

**BE-50** — QUAND l'opérateur lance le test, le banc DOIT produire les deux scores (actif + test) sur le MÊME
point/azimut/étage/hauteur/photo.
**BE-50bis** — Le banc DOIT construire l'`EntreeComplete` (géométrie + faisceaux enrichis) **UNE SEULE FOIS**,
puis appeler la fonction PURE `analyser(entree, profilActif)` ET `analyser(entree, profilTest)` — la partie
DB/LiDAR n'est JAMAIS exécutée deux fois. (Impose d'exposer un point de découpe additif dans `pipeline.ts` :
« build entree » vs `analyser`.)
**BE-51** — Le banc DOIT afficher CÔTE À CÔTE les deux scores : `score.total` /100 + `SCORE_LABEL`, libellés
« moteur actif (tel que publié) » et « profil de test ».
**BE-51a** — Le score OFFICIEL affiché DOIT être `score.total` /100 + `SCORE_LABEL`. SI `famille1`/`famille2`
sont montrés, ils DOIVENT être étiquetés « détail interne — non sommé, non officiel » et NE JAMAIS apparaître
comme additionnables au total (prévention de la confusion signalée PLAN `:198-200`).
**BE-52** — Le banc DOIT afficher la DIFFÉRENCE de score (`test − actif`), signe + valeur.
**BE-53** — Le banc DOIT présenter côte à côte l'écart de score GLOBAL et le récap des écarts de variables.
**BE-53a** — Le banc NE DOIT PAS attribuer un nombre de points à chaque variable modifiée (l'attribution par
variable N'EST PAS mathématiquement décomposable — diviseurs, caps, boosts, orientation agrégée) ; l'explication
fine passe par le détail par faisceau (BE-66).
**BE-54** — Le banc DOIT récupérer, pour chaque run, la ventilation par faisceau (Lot 1) alimentant le graphique et le détail.
**BE-55** — SI un run échoue (point invalide, erreur moteur), ALORS le banc DOIT afficher l'échec sans comparatif partiel trompeur.
**BE-56** — Le banc DOIT vérifier (assertion) que le `verdict` (100 % géométrique) est IDENTIQUE entre run actif
et run test ; toute divergence révèle un couplage accidentel score↔verdict et DOIT être signalée comme erreur.

**CA (Lot 5)** : CA-5.1 deux scores + delta ; CA-5.2 profil de test = actif → scores identiques ; CA-5.3 modifier
une variable de test change le test, pas l'actif ; **CA-5.4** modifier une variable/saisie APRÈS un run marque le
comparatif « à relancer » (pas de chiffres périmés silencieux) ; **CA-5.5** le delta n'a PAS de code couleur
évaluatif (pas de vert=bien/rouge=mal) — la couleur distingue seulement test vs actif.

**Fichiers pressentis** : `banc-test/` ; route admin POST (build entree ×1 + `analyser` ×2 + ventilations),
session **read-only** (BE-80).

---

## 7. Lot 6 — Graphique en éventail interactif (dépend de Lots 1 + 5)

**BE-60** — Le banc DOIT reconstituer le point d'origine et tracer les 61 faisceaux en éventail (schématique, PAS à l'échelle).
**BE-61** — Le graphique DOIT matérialiser les arcs de seuils 200 / 400 / 800 m ; un faisceau pondéré franchissant
un seuil DOIT traverser PHYSIQUEMENT l'arc correspondant. **Les rayons des arcs 400/800 DOIVENT être dérivés des
bornes du PROFIL affiché** (`famille.distMaxM`, `mondialFaisceauM`), jamais de littéraux (les bornes sont tunables).
**BE-62** — La base visuelle DOIT être 200 m, l'extension jusqu'à 800 m pour les faisceaux pondérés.
**BE-63** — Le graphique DOIT superposer 3 SÉRIES : (A) moteur ACTIF, (B) profil TEST, (C) données BRUTES
(`distanceObstacleM`, profil-indépendante ; `null` → traité comme « dégagé »/portée 200, à afficher distinctement).
**BE-64** — Chaque série DOIT être activable/désactivable indépendamment (filtres).
**BE-64a** — Par défaut, seules les séries ACTIF et TEST DOIVENT être visibles (BRUTE désactivée) ; chaque série a
une couleur de token SVAV distincte, et survol/sélection atténue les autres.
**BE-65** — Le graphique DOIT permettre de lire la valeur par faisceau pour chacune des 3 séries.
**BE-65a** — À l'état de repos, le graphe NE DOIT afficher que les TRACÉS ; les valeurs chiffrées par faisceau
DOIVENT apparaître au SURVOL et pour le faisceau SÉLECTIONNÉ uniquement (éviter 61×3 = 183 étiquettes permanentes).
**BE-66** — QUAND l'opérateur clique l'extrémité d'un faisceau, le banc DOIT afficher SOUS le graphe le détail du
calcul de ce faisceau (ventilation du seam : brute, perçue, seuil, contributions) pour ACTIF ET TEST.
**BE-66a** — Le détail par faisceau DOIT présenter actif et test en deux colonnes alignées et SURLIGNER chaque
ligne de contribution où test diffère d'actif (série BRUTE en repère neutre).
**BE-67** — Le graphique DOIT respecter `prefers-reduced-motion` sur toute animation.
**BE-68** — Le graphique DOIT être lisible et utilisable sur mobile (exigence transverse §15 CLAUDE.md).
**BE-69** — Le graphique DOIT mettre en évidence les principales différences par faisceau qui expliquent l'écart de score actif↔test.
**BE-70** — Le graphe DOIT proposer une mise en évidence des faisceaux où TEST diffère d'ACTIF (faisceaux sans écart estompés), au service direct de BE-69.

**CA (Lot 6)** : CA-6.1 61 faisceaux + arcs 200/400/800 (rayons 400/800 lus du profil) ; un faisceau franchissant
400 traverse l'arc 400 ; CA-6.2 3 séries filtrables, valeur par faisceau au survol ; CA-6.3 la série BRUTE ne
change pas quand on modifie le profil de test ; CA-6.4 clic faisceau → détail seam actif+test ; **CA-6.5** aucune
étiquette permanente au repos, survol → 3 valeurs ; **CA-6.6** la fonction `rayon(distancePercue)` est spécifiée
par PALIERS avec 3 rayons de contrôle explicites (r200 < r400 < r800), un faisceau capé à la borne se termine
exactement sur l'arc correspondant.

---

## 8. Garde-fous transverses (BE-80..BE-87)

**BE-80** — La route d'exécution du banc DOIT ouvrir sa session PostgreSQL en **LECTURE SEULE** (`SET TRANSACTION
READ ONLY` ou rôle pg read-only), de sorte que TOUTE écriture sur le chemin d'analyse échoue à l'exécution ; un
test d'intégration DOIT exécuter un run complet du banc sous cette session et vérifier l'absence d'erreur
d'écriture. (Le `grep INSERT/UPDATE/DELETE` reste un contrôle COMPLÉMENTAIRE, pas la preuve.)
**BE-81** — Le banc NE DOIT PAS toucher `config_scoring`, `config_famille_annee`, `PROFIL_GOLDEN_REF`, `geom_point`.
**BE-82** — Le banc NE DOIT PAS modifier les 2 fichiers Gemini (`adaptateurIaPhoto.ts`, `analyse-photo/route.ts`).
**BE-83** — Le banc NE DOIT PAS casser les features livrées (curation, historique, M1, Cartes d'année).
**BE-84** — Les props ajoutées à `MapContent`/`FaisceauMap` DOIVENT être rétro-compatibles (défaut = comportement public).
**BE-85** — Le banc DOIT être sous la garde admin (`proxy.ts`, 401 sans session).
**BE-86** — Le seam (Lot 1) DOIT préserver `ST_Force2D` et l'absence d'arrondi (il consomme des résultats déjà calculés).
**BE-87** — Le refactor du Lot 1 (extraction-délégation) DOIT être livré en **commit SÉPARÉ**, précédé d'une recon
lecture seule de `coucheDegagement.ts` (fichier sensible), avec le test Asnières en garde.

---

## 9. Découpage en lots (dépendances)

| Lot | Contenu | Dépend de | Nature |
|---|---|---|---|
| **1** | Seam verbeux (extraction-délégation `ventilerFaisceau`/`ventilerNote`, champ additif `ResultatComplet`) + test Asnières | — | **moteur, golden-safe, commit séparé** |
| **2** | Profil de test synchronisé + récap groupé + vestigiales marquées + reset | 1 | UI, pas d'écriture |
| **3** | Saisie internaute (adresse, point valide, azimut 360°, étage/hauteur) | 1 | UI + props non-cassantes |
| **4** | Photo / Gemini (upload → `analyserPhotoIa`) | 3 | réutilise Gemini |
| **5** | Build entree ×1 + `analyser` ×2 (actif/test) + comparaison + états | 1,2,3,(4) | lecture seule enforcée |
| **6** | Graphique éventail 3 séries + détail par faisceau (diff) | 1,5 | UI |

**Lot 1 = préalable dur.** Lots 2 et 3 parallélisables après 1. Lot 4 optionnel. Lot 5 assemble. Lot 6 = livrable visuel.

---

## 10. Questions ouvertes (défaut proposé ; aucune ne bloque le Lot 1)

- **OQ-a (bypass validerOrigine)** — TRANCHÉ : pas de bypass (BE-32).
- **OQ-b (quels scores)** — TRANCHÉ : score CLIENT côte à côte (BE-51) ; `famille1`/`famille2` seulement en
  « détail interne — non officiel » (BE-51a).
- **OQ-c (3 séries)** — TRANCHÉ : 3 séries filtrables, défaut ACTIF+TEST (BE-63/BE-64a).
- **OQ-d (édition profil de test)** — défaut : formulaire 38 variables + éditeur cartes d'année (réutilise M1) ;
  import d'un brouillon M1 = amélioration ultérieure (non v1).
- **OQ-e (tolérance 0,30 m obsolète)** — **nettoyage OPTIONNEL, non bloquant** : `ORIGIN_OUTSIDE_TOLERANCE_M =
  0.3` (`config.ts:123`) n'est plus branchée (tolérance active 1,0 m, `origine.ts:17`). À documenter/retirer hors M5.
- **OQ-f (orientation/couloir par faisceau)** — défaut : exposés au niveau agrégé + faisceaux rattachés (BE-15).
- **OQ-g (mapping longueur↔seuil)** — défaut : échelle par PALIERS (r200 < r400 < r800), franchissement d'arc
  lisible (BE-61, CA-6.6) ; à valider visuellement avec le modèle papier d'Arno.

---

## 11. Rattachement aux invariants SVAV
- **Golden** : BE-8/BE-9/BE-16/BE-19/BE-87 (extraction-délégation, source unique, test Asnières, commit séparé).
- **Verdict découplé du score** : BE-56 (assertion verdict identique actif/test).
- **Pilotage sans code** : le banc édite des variables déjà externalisées ; aucune nouvelle constante en dur ;
  distinction VIVE/VESTIGIALE conservée (BE-21a).
- **Hauteur de vision paramétrable** : BE-35/BE-36 réutilisent la formule.
- **Aucune écriture / read-only enforcé** : BE-5/BE-80.

---

## 12. Rapport des critiques de revue et réponses de la SPEC

**Revue A — Architecture & golden-safety** (5 points) :
- **F1 (bloquant) recalcul parallèle / CA-1.2 fausse** → **INTÉGRÉ** : BE-10 impose l'extraction-délégation
  (source unique) ; BE-16/CA-1.2 corrigés (reconstruction par la formule d'agrégation avec normalisation +
  malus + orientation + clamp, `Σ ≠ total` reconnu) ; BE-19bis (opt-in, prod inaltéré).
- **F2 (majeur) 2× analyserAdresse** → **INTÉGRÉ** : BE-50bis (build entree ×1, `analyser` pur ×2).
- **F3 (majeur) 4 vestigiales** → **INTÉGRÉ** : §0 + BE-21a/BE-21b + CA-2.6.
- **F4 (majeur) no-write non testable** → **INTÉGRÉ** : BE-80 (session read-only enforcée + test, grep complémentaire).
- **F5 (mineur) verdict + non-chevauchement + Gemini** → **INTÉGRÉ** : BE-56, BE-24, BE-41a.

**Revue B — Faisabilité du seam** (5 points, faisabilité HAUTE par extraction-délégation) :
- **#1 (grave) ingrédients morts F3/F2** → **INTÉGRÉ** : BE-12 réécrit sur les ingrédients réels.
- **#2 (moyen) seuils = bornes profil** → **INTÉGRÉ** : BE-11a + BE-61 (arcs dérivés du profil).
- **#3 (grave) normalisation+clamp oubliés** → **INTÉGRÉ** : BE-15/BE-16 (ajustements agrégés explicites).
- **#4 (moyen) faisceaux enrichis / champ additif** → **INTÉGRÉ** : BE-10bis (champ additif `ResultatComplet`, run unique).
- **#5 (mineur) label carte d'année** → **INTÉGRÉ** : BE-13 (re-résolution via `carteMatche`).

**Revue C — Ergonomie du comparatif** (10 points) :
- **M1/M2 récap groupé + cartes ADD/DEL/MOD** → BE-25a/BE-25b, CA-2.5.
- **M3 attribution intenable** → BE-53a (mise en regard, pas d'attribution par variable).
- **M4 183 valeurs illisibles** → BE-65a, CA-6.5 (valeurs au survol).
- **M5 séries par défaut + focus + diff** → BE-64a, BE-70.
- **M6 confusion total vs famille1/2** → BE-51a (ferme).
- **M7 mapping longueur↔seuil** → CA-6.6 (3 rayons de contrôle).
- **M8 détail = diff actif↔test** → BE-66a.
- **M9 états / péremption** → CA-5.4 (comparatif « à relancer »).
- **M10 delta neutre** → CA-5.5 (pas de couleur évaluative).

> Toutes les critiques bloquantes/majeures ont été intégrées ; aucune ne touchait un invariant verrouillé (elles
> concernaient la façon de construire le seam, le coût d'exécution, l'honnêteté des variables et la restitution).
