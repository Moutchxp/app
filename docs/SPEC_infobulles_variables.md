# SPEC — Info-bulles « i » sur les cartes d'édition de config_scoring

> Spec EARS. **Livrable = cette spec, PAS du code.** RFC 2119. Produite via `/svav-specs`. À valider par
> Arno (fond métier) ; l'exactitude technique est fondée sur une **recon LECTURE SEULE du moteur** (chaque
> texte cite le comportement réel `fichier:ligne`). UI purement **additive**.

## Besoin
Sur l'écran d'édition M1 (Étape 4), ajouter à chaque carte de variable un petit **picto « i »** ouvrant une
explication (nature de la variable, raison d'être, effet sur le score, exemple si utile), pour qu'un
**non-développeur** comprenne ce qu'il pilote.

## Recon d'exactitude (chemin réel confirmé)
Score affiché = `noteDegagement(faisceaux, profil, azimut)` (`scoreTotal.ts:44`) ; Familles f1/f2 calculées
mais **non ajoutées** au total (`scoreTotal.ts:39-43`). Profil lu au runtime depuis `config_scoring id=1`
(`profilConfig.ts:57-72`). Formule maîtresse (`coucheDegagement.ts:197-215`) :
```
cumulPercu = Σ distancePercueFaisceau(f, profil)       [61 faisceaux]
cumulNet   = max(0, cumulPercu − malusCouloir)
note       = (cumulNet / nbFaisceaux / distance_max_m) × plafond_degagement
noteFinale = clamp(note + orientation[secteur], 0, plafond_couche1)
```
> ℹ️ L'en-tête `coucheDegagement.ts:7` « NON BRANCHÉ » est un **commentaire périmé** (le chemin EST branché
> via `pipeline.ts:181 → analyse.ts:100 → scoreTotal.ts:44`). Signalé pour un futur correctif de commentaire
> (hors périmètre de cette spec).

## Périmètre
**DANS** : (1) picto « i » + affichage du texte sur chaque carte **éditable** (VIVE + `mode_combinaison` +
`analysis_range_m`) ; (2) le **contenu** des textes, stocké en **métadonnées** (`mappingConfig.ts`).
**HORS** : toute modif du moteur `app/lib/svv`, du verdict, du golden, de `config_scoring`, de la route
d'écriture (`PATCH`), de la validation. Aucune logique de score.

## Invariants SVAV (garde-fous durs)
- **AFFICHAGE PUR** : NE touche NI `app/lib/svv/**`, NI le verdict, NI `config_scoring`, NI la route
  `PATCH`/`validation.ts`. Golden **inchangé** (aucun chemin de score modifié — à confirmer par
  `test:integration` vert en conformité).
- **SOURCE UNIQUE** : le texte de chaque variable vit dans `mappingConfig.ts` (métadonnée), **jamais** en
  dur dispersé dans le JSX.
- **EXACTITUDE** : chaque texte décrit le comportement **réel** du moteur (recon ci-dessous). Aucune
  variable au comportement inventé. Une variable au rôle non déterminable → signalée telle quelle.
- **Responsive / mobile-first** (CLAUDE.md §15) : picto et bulle utilisables **au doigt** (pas de survol
  seul). `prefers-reduced-motion` respecté si animation d'ouverture.

---

## User story
- **US1** — En tant qu'**opérateur (Arno)**, je veux **comprendre ce que fait chaque variable** avant de la
  modifier, afin de piloter le moteur en connaissance de cause.

## Exigences EARS

### UI de l'info-bulle
- **EX-1** [Ubiquitaire] Chaque carte de variable **éditable** DOIT afficher un picto « i ».
- **EX-1b** [Ubiquitaire] Chaque carte **non éditable** (VESTIGIALE, `id` technique) DOIT aussi afficher un
  picto « i » avec un texte court indiquant que la colonne est **conservée sans effet sur le score actuel**
  (OQ3).
- **EX-2** [Événementiel] QUAND l'opérateur active le picto (clic ou tap), le système DOIT afficher le
  texte d'aide de cette variable.
- **EX-3** [Événementiel] QUAND une info-bulle est ouverte, le système DOIT permettre de la **fermer**
  (re-tap, bouton, ou tap hors zone).
- **EX-4** [Ubiquitaire] Le texte affiché DOIT provenir des **métadonnées** (`mappingConfig.ts`), pas d'une
  chaîne codée en dur dans le composant.
- **EX-5** [Ubiquitaire] Le picto DOIT offrir une **cible tactile** suffisante (≥ 44 px) et NE DOIT PAS
  dépendre d'un survol (hover) seul.
- **EX-6** [Ubiquitaire] La bulle DOIT rester lisible en **portrait 375 px** sans débordement horizontal.
- **EX-7** [Ubiquitaire] SI une animation d'ouverture est utilisée, ALORS elle DOIT être neutralisée sous
  `prefers-reduced-motion: reduce`.

### Exactitude du contenu
- **EX-8** [Ubiquitaire] Chaque texte DOIT décrire le comportement **réel** de la variable dans le moteur
  (conforme à la recon §Textes).
- **EX-9** [Indésirable] SI le comportement d'une variable n'est pas déterminable avec certitude, ALORS le
  texte DOIT le **signaler** au lieu d'inventer.
- **EX-10** [Ubiquitaire] Le texte de `mode_combinaison` DOIT indiquer qu'il **n'a aucun effet sur le score
  dans le moteur actuel** (voir §Cas spécial), sans décrire un comportement fictif.

### Non-régression
- **EX-11** [MUST NOT] Le chantier NE DOIT modifier ni `app/lib/svv/**`, ni la route `PATCH`, ni
  `validation.ts`, ni `config_scoring`, ni le golden.

---

## Métadonnée porteuse — TRANCHÉ (OQ1 : nouveau champ `infobulle?`)
Ajout d'un champ dédié **`infobulle?: string`** à `ColonneMeta` (texte riche de la bulle), **distinct** du
champ existant `aide?` (indice court inline, ex. `analysis_range_m` → « Garde-fou : n'agit pas sur la
géométrie »). Source unique dans `mappingConfig.ts` ; les deux usages restent séparés.

---

## TEXTES PROPOSÉS (fondés sur la recon — Arno valide le fond)

> Convention : ↑ = « augmenter la valeur » ; « n'agit que si… » = condition réelle de déclenchement.

### Distance perçue
- **`boost_f4`** (Boost nature traversée, déf. 2,5) : « Convertit les mètres de **nature traversée** (eau,
  végétation) d'un faisceau en mètres de vue *perçus* ajoutés : chaque mètre de nature compte pour
  *boost_f4* mètres, dans la limite du plafond par faisceau. **↑ = les vues sur de la nature pèsent plus.**
  N'agit que si le faisceau traverse de la nature. Ex. : obstacle à 50 m + 20 m de nature, boost 2,5 →
  100 m perçus. » *(coucheDegagement.ts:79 — CERTAIN)*
- **`distance_max_m`** (Plafond de distance perçue, déf. 200) : « Triple rôle : plafond de la distance
  perçue par faisceau, distance créditée à un faisceau **totalement dégagé**, et dénominateur de
  normalisation de la note. Effet **non trivial** : l'↑ relève le crédit des faisceaux dégagés *et*
  l'échelle de normalisation. **Doit rester ≤ la portée d'analyse**, sinon toute la config est rejetée. »
  *(coucheDegagement.ts:77,176,207 — mécanisme CERTAIN, sens de l'effet PARTIEL)*

### Barème par famille de bâtiment *(n'agit que si un bâtiment de la famille est heurté dans l'axe)*
- **`cone_famille_demi_angle_deg`** (déf. 60) : « Sépare, pour un bâtiment patrimonial heurté, le
  coefficient *cône* (proche de l'axe, plus fort) du coefficient *flanc* (sur les côtés) : un faisceau dont
  l'écart à l'axe est ≤ ce demi-angle prend le coefficient cône. **↑ = plus de faisceaux profitent du
  coefficient fort.** Neutre si aucun bâtiment patrimonial dans l'axe. » *(coucheDegagement.ts:88 — CERTAIN)*
- **`mondial_faisceau_m`** (déf. 800) : « Longueur de vue *perçue* attribuée d'office à un faisceau visant
  l'un des **monuments emblématiques répertoriés** (patrimoine mondial), en valeur fixe, sans autre calcul
  ni plafond. **↑ = ces faisceaux pèsent davantage.** » *(coucheDegagement.ts:82 — CERTAIN ; table
  `monuments_emblematiques` **peuplée** — 14 monuments à ce jour, vérifié en recon ; le mécanisme est donc
  actif pour les faisceaux qui les visent)*
- **`mh_cone` / `mh_flanc` / `mh_distmax_m`** (déf. 2,0 / 1,5 / 400) : « **Monument Historique.**
  *mh_cone/mh_flanc* multiplient la distance d'un faisceau qui heurte un MH (cône dans l'axe, flanc sur les
  côtés) ; *mh_distmax_m* plafonne le total du faisceau. N'agit que si un MH est dans l'axe. Ex. : MH dans
  le cône à 150 m, coeff 2,0 → 300 m perçus (capé à 400). » *(coucheDegagement.ts:47,88,94,97 — CERTAIN)*
- **`inv_cone` / `inv_flanc` / `inv_distmax_m`** (déf. 2,0 / 1,5 / 400) : « **Inventaire général** (patrimoine
  répertorié). Même mécanisme que le Monument Historique (multiplicateurs cône/flanc + cap), appliqué en
  priorité juste après les MH. N'agit que si un bâtiment de l'Inventaire est dans l'axe. »
  *(coucheDegagement.ts:48 — CERTAIN)*
- **`a1900_cone` / `a1900_flanc` / `a1900_distmax_m`** (déf. 1,5 / 1,2 / 300) : « **Bâti ancien (≤ borne
  1900).** Multiplicateurs cône/flanc + cap, comme le patrimoine mais plus modérés. Appliqués seulement si
  le bâtiment n'est ni MH ni Inventaire et a une année de construction ≤ la borne « ≤ 1900 ». »
  *(coucheDegagement.ts:51 — CERTAIN, conditionné à une année connue en base)*
- **`a1935_cone` / `a1935_flanc` / `a1935_distmax_m`** (déf. 1,2 / 1,1 / 200) : « **Bâti 1901–1935.** Même
  mécanisme, coefficients encore plus modérés, pour les bâtiments datés entre la borne 1900 (exclue) et la
  borne 1935 (incluse). » *(coucheDegagement.ts:52 — CERTAIN, conditionné)*
- **`borne_annee_1900`** (déf. 1900) : « Année **incluse** jusqu'à laquelle un bâtiment entre dans la
  famille « ≤ 1900 » (coefficients plus forts). **↑ = plus de bâtiments profitent de cette famille.** »
  *(coucheDegagement.ts:51 — CERTAIN)*
- **`borne_annee_1935`** (déf. 1935) : « Année haute **incluse** de la famille « 1901–1935 » ; au-delà, le
  bâtiment est *ordinaire* (aucune pondération). **↑ = plus de bâtiments basculent d'ordinaire vers cette
  famille.** » *(coucheDegagement.ts:52,54 — CERTAIN)*

### Cumul nature + bâti *(n'agit que sur un faisceau portant À LA FOIS de la nature et un bâtiment pondéré)*
- **`cumul_seuil_min_m`** (déf. 30) : « Longueur de nature minimale pour déclencher la *pénalité de cumul*
  (le diviseur). En dessous, aucune pénalité. **↑ = pénalité déclenchée plus rarement → note plus haute.** »
  *(coucheDegagement.ts:36 — CERTAIN, conditionné)*
- **`cumul_base_m`** (déf. 25) : « Base soustraite avant de compter les paliers de pénalité. **↑ = moins de
  paliers → pénalité plus faible → note plus haute.** » *(coucheDegagement.ts:37 — CERTAIN, conditionné)*
- **`cumul_pas_m`** (déf. 5) : « Largeur (m de nature) d'un palier de pénalité. **↑ = paliers plus larges →
  pénalité plus faible → note plus haute.** (Jamais 0.) » *(coucheDegagement.ts:37 — CERTAIN, conditionné)*
- **`cumul_increment`** (déf. 0,1) : « Montant ajouté au diviseur **par palier** franchi : c'est le *taux de
  pénalité* du cumul. **↑ = pénalité plus forte → note plus basse.** » *(coucheDegagement.ts:37 — CERTAIN,
  conditionné)*
- **`cumul_plafond`** (déf. 2,0) : « Diviseur **maximal** de la pénalité de cumul. **↑ = autorise une
  pénalité plus forte (note plus basse) ; ↓ = protège la note.** » *(coucheDegagement.ts:37 — CERTAIN,
  conditionné)*
- **`cumul_cap_p1_m`** (déf. 200) : « Plafond de la **part « nature classique »** dans le total d'un
  faisceau en cumul. **↑ = cette part peut peser plus (note plus haute), jusqu'au cap de la famille.** »
  *(coucheDegagement.ts:92 — CERTAIN, conditionné)*

### Malus couloir *(pénalité quand des obstacles longent l'axe en enfilade)*
- **`couloir_seuil_lateral_m`** (déf. 3) : « Distance latérale (⊥ à l'axe) sous laquelle un obstacle est
  considéré comme *longeant l'axe*. **↑ = plus d'obstacles forment un « couloir » → malus plus fréquent →
  note plus basse.** » *(coucheDegagement.ts:127 — CERTAIN, conditionné à une géométrie de couloir)*
- **`couloir_fenetre_condition_n`** (déf. 16) : « Nombre de faisceaux consécutifs (du bord vers l'axe)
  requis pour *enclencher* un couloir. Effet **non monotone** : ↑ rend l'enclenchement plus rare (note plus
  haute en moyenne) mais rallonge la chaîne quand il se produit. » *(coucheDegagement.ts:150-161 —
  mécanisme CERTAIN, sens net PARTIEL)*
- **`couloir_tolerance_bord_n`** (déf. 2) : « Nombre de faisceaux de bord *exemptés* de la condition de
  collage (mais comptés dans la chaîne). **↑ = couloir enclenché plus facilement → malus plus fréquent →
  note plus basse.** » *(coucheDegagement.ts:150-161 — CERTAIN, conditionné)*
- **`couloir_malus_pct`** (déf. 0,01) : « Fraction du cumul retranchée **par faisceau** de la chaîne
  couloir (linéaire, sans plafond). **↑ = malus plus fort → note plus basse.** Ex. : chaîne de 20 faisceaux,
  cumul 6000 m, 0,01 → −1200 m. » *(coucheDegagement.ts:170 — CERTAIN, conditionné)*

### Normalisation, orientation & plafonds
- **`plafond_degagement`** (déf. 80) : « **Coefficient d'échelle** qui transforme le taux de dégagement
  (0 à 1) en points — c'est le « ×80 » du score. **Levier le plus direct : ↑ augmente proportionnellement
  toute la composante dégagement.** » *(coucheDegagement.ts:207 — CERTAIN, le plus sensible)*
- **`orientation_n … orientation_no`** (8 secteurs, déf. N0 NE1 E5 SE8 S10 SO9 O7 NO3) : « Points **ajoutés**
  selon l'orientation de la vue (secteur de boussole de l'azimut testé). **Seul le secteur de la vue
  analysée compte** ; les 7 autres sont sans effet pour un test donné. Ex. : vue plein **Est** → +5 pts
  (défaut). » *(coucheDegagement.ts:209-212 — CERTAIN)*
- **`plafond_couche1`** (déf. 90) : « **Plafond final** de la note (écrêtage). N'agit **que si** la note
  dépasse ce plafond ; sinon neutre. À **ne pas confondre** avec le coefficient d'échelle
  (*plafond_degagement*). » *(coucheDegagement.ts:214 — CERTAIN, effectif seulement au plafond)*

### Garde-fou (MIROIR)
- **`analysis_range_m`** (déf. 200) : « **Garde-fou de cohérence : n'entre dans AUCUN calcul de score ni
  dans la géométrie.** Seul rôle : si le plafond de distance perçue (*distance_max_m*) le dépasse, toute la
  configuration est rejetée et le moteur repasse aux valeurs par défaut. La portée géométrique réelle est
  fixée dans le code. » *(profilConfig.ts:78 ; aucun usage dans coucheDegagement — CERTAIN)*

### Cas spécial — Mode de combinaison (DE GARDE)
- **`mode_combinaison`** (déf. `max`, valeurs {max, addition, sequentiel}) — **TEXTE HONNÊTE (EX-10)** :
  « ⚠️ **Dans le moteur actuel, cette option ne change pas le score** : les trois valeurs (max, addition,
  séquentiel) donnent exactement la même note. La combinaison d'une nature valorisante et d'un bâtiment
  pondéré sur un même faisceau est gérée par une **règle fixe**, sans consulter ce mode. Son **seul effet
  réel** : une valeur hors de la liste {max, addition, séquentiel} ferait **rejeter toute la configuration**
  (retour aux valeurs par défaut). C'est donc aujourd'hui un **verrou de sécurité**, pas un réglage de
  calcul. » *(grep exhaustif : 0 usage dans les formules ; combinaison codée en dur `p1+p2`
  coucheDegagement.ts:90-95 ; garde de validité profilConfig.ts:75 — CERTAIN)*

### Colonnes conservées sans effet sur le score — texte court (EX-1b, OQ3)
- **`boost_f2`, `forfait_cone_central`, `forfait_extremites`, `cone_f3_demi_angle_deg`,
  `natures_remarquables`** (VESTIGIALES) : « Colonne **conservée en base mais sans effet sur le score
  actuel** : son mécanisme a été remplacé (l'année de construction et les familles MH/Inventaire ont pris
  le relais). Non éditable. » *(0 usage dans les formules — CERTAIN)*
- **`id`** (technique) : « Identifiant technique du profil (toujours 1). Non éditable, sans effet sur le
  score. »

---

## Note transverse pour l'avertissement golden (rappel utile, issu de la recon)
Le golden **Asnières** (résidentiel, azimut Est, sans patrimoine dans l'axe) n'exerce réellement que
`plafond_degagement`, `distance_max_m`, `boost_f4`, `orientation_e` (et conditionnellement `couloir_*` /
bornes années). Les VIVE **patrimoine** (`mh_*`, `inv_*`, `mondial_faisceau_m`), les 7 `orientation_≠E` et
la plupart des `cumul_*` **ne bougent pas** le golden Asnières → un golden vert **ne prouve pas** leur
innocuité. (Sans effet sur cette spec d'affichage ; utile pour l'Étape 3 « aperçu d'impact ».)

---

## Arbitrages (OQ1–OQ4 — TRANCHÉS)
- **OQ1 — TRANCHÉ** : nouveau champ **`infobulle?`** dans `ColonneMeta`, distinct de `aide?` (indice court).
  → EX-4, §Métadonnée porteuse.
- **OQ2 — TRANCHÉ** : `mode_combinaison` = **texte honnête intérimaire** — « n'a aucun effet sur le score
  dans le moteur actuel ; verrou de sécurité (une valeur hors {max, addition, sequentiel} rejette la
  config) ». **Ne PAS décrire de comportement des 3 modes** (ils sont inertes). Une refonte moteur
  ultérieure activera les modes et mettra à jour **ce seul texte**. → EX-10.
- **OQ3 — TRANCHÉ** : « i » court **aussi** sur les VESTIGIALES et la colonne technique (`id`) — texte
  « colonne conservée, sans effet sur le score actuel ». → EX-1b + §Colonnes conservées.
- **OQ4 — TRANCHÉ** : `mondial_faisceau_m` fondé sur l'état **RÉEL** de la table — `monuments_emblematiques`
  **peuplée (14 monuments)** → texte **affirmatif** (mécanisme actif), pas de formulation « à venir ».

*Spec **FIGÉE**. Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra sur cette base
validée.*
