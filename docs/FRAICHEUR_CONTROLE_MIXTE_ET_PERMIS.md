# Fraîcheur des données, contrôle mixte LiDAR/BD TOPO & permis de construire

> **Document de RÉFÉRENCE** (session des 25-26 juillet 2026). Grave l'état établi pour qu'une
> session future n'ait rien à redécouvrir. **À lire avant tout chantier touchant aux données, au
> verdict, au certificat ou aux permis.**
>
> ⚠️ Ce document n'est **pas un plan d'action** et ne recommande aucune implémentation. Il décrit
> des faits sourcés et des décisions déjà arbitrées par le porteur (Arno).
>
> Provenance des faits :
> - **§1, §5, §6** : recons lecture seule menées en session (« R1/R2/R3 » + chiffrage Sitadel) —
>   chaque chiffre porte sa source (`chemin:ligne`, requête SQL, ou emprise/bbox mesurée).
> - **§3, §4** : recherches externes fournies par Arno (juridique, jeux de données nationaux) —
>   **recopiées fidèlement**, non revérifiées ligne à ligne dans cette session. À traiter comme
>   des notes de recherche à confirmer avant tout usage produisant un effet de droit.
> - Base : PostgreSQL + PostGIS **3.6.4** en local, driver `pg` sur `DATABASE_URL`.

---

## 1. État réel des données (recons en session)

**Couverture LiDAR = 1 km² de test à Asnières (92), rien d'autre.**
- Tables `mnt_lidar_brut` (terrain) et `mns_lidar_brut` (toits) : **64 tuiles chacune, 16 Mo
  chacune** (`SELECT count(*), pg_size_pretty(pg_total_relation_size(...))`). Colonnes = `rid, rast`
  uniquement (aucune date).
- Emprise réelle (bbox `ST_Union(ST_Envelope(rast))`, SRID **2154**) : `x ∈ [645999.75 ; 646999.75]`,
  `y ∈ [6867000.25 ; 6868000.25]` → **carré de 1 km² au-dessus d'Asnières-sur-Seine (92)**, la zone
  du golden. **Rien sur 75, 93, 78 ni sur le reste du 92.**
- `mns_bati_propre` (MNS « bâti propre » prévu comme source primaire) : **VIDE** (0 tuile).

**Aucun millésime LiDAR enregistré nulle part.**
- Aucune colonne de date sur les rasters ; `mns_bati_propre.nom_fichier` existe mais table vide.
- `import_log` (journal d'import prévu, `db/migrations/001_bloc_b_schema.sql:58-66` :
  `table_cible, source, emprise, nb_objets, importe_le`) = **0 ligne**. Le journal existe mais n'a
  jamais été alimenté.
- `docs/SOURCES_DATA.md:12` : la ligne LiDAR HD ne porte **aucun millésime** (contrairement à BDNB,
  `:15`, « 2026-02.a »).
- Reconstitution possible seulement via la **nomenclature des dalles IGN LiDAR HD** (nom de fichier
  source `LHD_FXX_0646_6868_…_AAAA.copc.laz` qui encode bloc + année de vol) — **absent du dépôt et
  de la base**.

**Édition BD TOPO ≈ mars 2026, déduite, écrite explicitement nulle part.**
- Le moteur lit `bdtopo_batiment`, **VUE** sur la table `batiment` (`pg_get_viewdef` :
  `SELECT fid AS id, cleabs, geom, hauteur, altitude_minimale_sol, altitude_maximale_toit,
  altitude_minimale_toit, nombre_d_etages, nature, usage_1, usage_2 FROM batiment`).
  Migration `db/migrations/002_bdtopo_batiment_vue.sql` : « on RÉUTILISE la BD TOPO **déjà chargée**
  (table `batiment`) ».
- Dates par objet de `batiment` : `MAX(date_modification)` = **2026-03-20**, `MAX(date_creation)` =
  2026-03-19, `MAX(date_de_confirmation)` = 2026-03-15 → extraction **≥ 2026-03-20**, édition
  **≈ mars 2026 (2026-T1)**. Aucun label d'édition stocké.

**Aucune procédure de réingestion, ni LiDAR ni BD TOPO.**
- Aucun script/migration/doc ne crée ni ne réimporte `batiment`, `mnt_lidar_brut`, `mns_lidar_brut`.
  Les seuls imports du dépôt sont **one-shot patrimoine** (`scripts/migration_monuments_emblematiques.sql`,
  `scripts/import_inventaire_ia92.sql`). `AGENTS.md` : rien. Commande d'import de `batiment` :
  **non déterminable depuis le dépôt** (« déjà chargée » hors dépôt).

**Chiffrage d'une extension LiDAR** (base : 32 Mo/km² = MNT 16 Mo + MNS 16 Mo, mesuré sur la dalle
test) :
- **Paris + 92 + 93 (≈ 517 km²) ≈ 16 Go** de rasters.
- **Yvelines seul (≈ 2 284 km²) ≈ 73 Go.**
- **Périmètre complet ≈ 90 Go.**
- Prévoir **+20 à 30 %** avec les index, et un **espace de travail transitoire bien supérieur** :
  l'IGN diffuse des **nuages de points** (`.copc.laz`), pas des rasters — la rastérisation locale
  gonfle temporairement le disque. (À comparer : `batiment` = 382 Mo table + 44 Mo index = 426 Mo
  total, quasi marginal face au LiDAR complet.)

---

## 2. La règle de contrôle mixte et ses deux régimes

**Règle voulue par Arno.** Détecter tout polygone dont l'**emprise au sol et/ou la hauteur maximale**
change entre deux éditions BD TOPO. L'emprise est systématiquement mise à jour.
- **Hauteur inchangée → on CONSERVE le LiDAR** (le vol reste valide pour ce polygone).
- **Hauteur changée → l'altitude maximale de toit BD TOPO devient la valeur de contrôle du verdict**
  pour ce polygone, et le certificat doit indiquer un **CONTRÔLE MIXTE (LiDAR/BD TOPO)**.
- **Raffinement** : si un rajout est **dissociable** du polygone historique et que sa hauteur est
  connue, seul le rajout reçoit cette hauteur ; le bâti d'origine garde son LiDAR.

> Cadre verrouillé (rappel) : l'invariant « **toit = MNS LiDAR lu directement, jamais sol+hauteur
> côté obstacle** » n'est pas modifié par ce document. BD TOPO est envisagé comme **détecteur de
> changement**, jamais comme source de mesure du verdict.

### ⚠️ Le fait le plus important : les taux de remplissage coupent la règle en deux

Taux de remplissage de `batiment` (697 886 lignes), par tranche (requêtes `count()`/`count(colonne)`
groupées par `date_modification` puis `date_creation`) :

**Polygones MODIFIÉS récemment → RÉGIME 1, la règle fonctionne.** `altitude_maximale_toit` :
- toutes lignes : **45,8 %** · modif ≥ 2023 : **86,0 %** · ≥ 2024 : **92,1 %** · ≥ 2025 : **95,2 %**.

**Bâtiments réellement NEUFS (`date_creation` récente) → RÉGIME 2, la règle échoue.**
- `date_creation ≥ 2024` (11 806 objets) : `altitude_maximale_toit` **7,8 %**, `altitude_minimale_toit`
  7,9 %, `nombre_d_etages` **0,1 %**, seule `hauteur` survit à **72,9 %**.
- `date_creation ≥ 2025` (11 082) : `altitude_maximale_toit` **7,3 %**, `hauteur` **76,6 %**,
  `nombre_d_etages` 0,1 %.
- **C'est le cas le PLUS DANGEREUX** : un immeuble sorti de terre après le vol LiDAR est *exactement*
  l'obstacle qui invalide un certificat déjà émis, et c'est précisément là que l'altitude de toit
  BD TOPO manque.

**Piège — le remplissage n'est PAS monotone.** Les **5 000 lignes de `date_modification` la plus
récente** retombent à **52,9 %** d'`altitude_maximale_toit` (lot de collecte récent, moins complet).
→ **brancher la règle sur la PRÉSENCE DU CHAMP** (`altitude_maximale_toit IS NOT NULL`), **jamais sur
un seuil de date**.

**Hypothèse explicative forte, à vérifier, non prouvée.** `altitude_maximale_toit` est renseignée à
**100 %** quand `methode_d_acquisition_planimetrique` = « Lidar HD » (et `origine_du_batiment` =
« Lidar HD », 706 objets), **17-20 %** sur photogrammétrie / imagerie aérienne, **0 %** sur
« Processus IA métrique ». → l'altitude de toit BD TOPO **dériverait de la même acquisition
altimétrique que le MNS**. Si c'est exact, **BD TOPO ne peut STRUCTURELLEMENT pas connaître la
hauteur d'un bâtiment construit après le vol** : aucune édition trimestrielle ne comblera ce trou
tant qu'un nouveau vol altimétrique n'a pas eu lieu.

### Décision de Régime 2 (arbitrée)

En Régime 2, **ne PAS substituer une valeur plus faible** au LiDAR. **MARQUER le certificat
« à revérifier ».** Un **polygone neuf apparu dans l'axe, plus proche que la distance certifiée**,
est en soi un signal suffisant. Cela **ne touche pas à l'invariant** et **fonde une re-certification**.

---

## 3. Sources externes de hauteur pour le bâti neuf (recherches Arno — hors session)

> Notes de recherche fournies par Arno, recopiées fidèlement. À confirmer avant tout usage.

**Hiérarchie d'usage à respecter dans le produit :**
- **CERTIFIER** → **LiDAR uniquement**, rien d'autre n'entre dans le verdict.
- **BORNER / décider prudemment** → le **PLU**.
- **TRIER les alertes** → hauteur **BD TOPO** (73 % sur le neuf), **DPE neuf**.
- **RELIER les jeux** → le **RNB**.
- **À ÉVITER** → hauteurs **BDNB** et **OpenStreetMap**.

### Le PLU — borne réglementaire, pas mesure
- Un bâtiment neuf ne peut pas légalement dépasser la **hauteur maximale constructible** de sa zone.
- ⚠️ **Usage ASYMÉTRIQUE, à énoncer explicitement** : si **même au plafond** le neuf ne coupe pas la
  ligne de vue → conclusion **CERTAINE**, le certificat tient. Si au plafond il la couperait → on
  **ne conclut RIEN**, on bascule en « à revérifier ». **La borne sert à INNOCENTER, jamais à
  condamner.** On ne suppose **jamais** que le neuf exploite le maximum.
- **Paris** a publié en open data « **PLU bioclimatique — Hauteur maximale constructible** »
  (data.gouv.fr, version votée le **16 juin 2026**, documentation PDF jointe). Mention du producteur :
  « **sans valeur réglementaire** » → borne de triage, jamais source certifiante.
- **Géoportail de l'Urbanisme** (geoportail-urbanisme.gouv.fr) : PLU/PLUi au **standard CNIG**,
  zonages en données géographiques + règlements PDF. Depuis le **01/01/2023**, le caractère
  exécutoire d'un PLU est conditionné à sa publication sur le GPU (**ordonnance 2021-1310, décret
  2021-1311**) → couverture et fraîcheur quasi garanties.
- ⚠️ **Limite** : le CNIG structure le **zonage**, pas la **règle de hauteur**, qui reste **textuelle
  dans le règlement PDF** — sauf couche dédiée comme Paris. Petite couronne ≈ **130 communes**, à
  traiter commune par commune.
- ⚠️ **Difficulté technique** : la définition de la hauteur varie (**à l'égout vs au faîtage**, point
  de référence au sol variable). Convertir un plafond PLU en **altitude NGF** exige de connaître la
  convention de la commune → prévoir une **marge de sécurité** qui penche toujours du côté « on
  innocente **moins** souvent », jamais « on innocente à tort ».

### BDNB — disqualifiée comme mesure, utile comme pivot
- 32 M de bâtiments, 400+ infos dont 170+ en open data, millésime **2026-02.a** (celui déjà en base,
  dont **seule l'année de construction** a été importée dans `bdnb_annee_batiment`).
- 🚨 La documentation officielle indique que les manques de BD TOPO ont été complétés « soit via le
  nombre d'étages post-appariement avec les **Fichiers Fonciers** (si `nb_etage = 1`, alors
  `hauteur = 5`, sinon `hauteur = nb_etage × 3`), soit **fixés arbitrairement à 5 m** », et que les
  données manquantes font l'objet d'une **prédiction probabiliste par machine-learning**. → une
  hauteur BDNB ne dit pas si elle est **mesurée ou fabriquée**. **Inutilisable pour certifier**, et
  **dangereuse importée naïvement** parce qu'elle **ressemble** à de la donnée.
- 🚨 **Géométries fictives** possibles (hexagone régulier, attribut `is_fictive_geom_cstr`).
- 🚨 Le « **bâtiment groupe** » agrège toutes les constructions d'une parcelle quand l'identification
  individuelle échoue, avec **reventilation algorithmique** des attributs → l'agrégation va dans le
  **mauvais sens**.
- ❌ « **Volumes 2.5D** » ≠ volume réel : une seule hauteur par emprise, extrudée. Incapable de
  représenter un **décrochage de niveau** dans un même polygone. La « topologie des faces » décrit la
  **mitoyenneté** pour le calcul thermique, **pas la forme du toit**.
- ⏱️ Mise à jour **3×/an** → mauvais détecteur de changement.
- ✅ **Ce qui reste utile** : **pivot bâtiment ↔ adresse ↔ parcelle cadastrale sur TOUTE la France**,
  alors que la table `parcelle` locale ne couvre que le 92 (161 859 parcelles, bbox ≈ dépt 92). Piste
  sérieuse pour la ligne « **Impact** ». Accessible **par API** (évite d'importer des dizaines de Go).

### DPE logements neufs (ADEME)
- Jeu dédié et distinct (**`dpe02neuf`**) sur data.ademe.fr, **dump + API REST**, dictionnaire de
  données et note technique fournis. **Licence Etalab 2.0** → usage commercial libre et gratuit.
- Obligatoire pour les logements neufs ; décrit les caractéristiques du bâtiment. La méthode **3CL**
  exige **hauteur sous plafond et volume** → les cotes existent dans les intrants ; **vérifier au
  dictionnaire** lesquelles sont exposées dans l'export ouvert.
- ⚠️ **Déclaratif** : l'ADEME décline toute responsabilité sur la qualité, sous la seule
  responsabilité du diagnostiqueur ; **~5-8 % d'enregistrements à filtrer**. **Résidentiel
  uniquement** (un parking couvert, un entrepôt n'y figurent pas). Granularité = **le logement, pas
  le polygone**.

### RNB (Référentiel National des Bâtiments)
- Identifiant **12 caractères** (ex. `2ZCDW1XZBNTM`), déjà présent à **96,7 %** dans `batiment`
  (`identifiants_rnb`, 23 034 vides sur 697 886), **doublons existants** (un RNB peut porter plusieurs
  `fid`). **Pivot viable** sous réserve de gérer la non-unicité.

### OpenStreetMap
- `building:levels`/`height` souvent plus **rapides** que BD TOPO en zone dense, **MAIS licence ODbL
  à partage à l'identique** → **piège pour un produit commercial dérivé**. **Ne pas intégrer sans
  avis juridique.**

---

## 4. Le permis de construire — recours d'arbitrage, pas source de données (recherches Arno)

> Notes de recherche juridiques fournies par Arno, recopiées fidèlement. **À confirmer par un
> juriste avant tout usage produisant un effet de droit.**

- **Sitadel (open data) NE DONNE PAS LA HAUTEUR** : type de projet, surface de plancher, parcelles,
  dates, nombre de logements. La hauteur est dans les **plans déposés en mairie**, non diffusés.
  Sitadel **exclut** les demandes ne créant pas de surface de plancher (un **parking couvert** peut
  être absent) et **localise mal à Paris** (pas de préfixe de parcelle).
- ✅ **Le dossier est COMMUNICABLE par e-mail, gratuitement** : **article L311-9 du CRPA, 3°** — « par
  courrier électronique et **sans frais** lorsque le document est disponible sous forme
  électronique », et le **mode de communication est AU CHOIX DU DEMANDEUR** (**CADA avis 20190379**).
  Les autorisations d'urbanisme sont communicables à **toute personne** (**L311-1 CRPA + L2121-26
  CGCT**).
- ⚠️ **Condition : le permis doit être DÉLIVRÉ.** Tant que la décision n'est pas intervenue, le
  dossier est **préparatoire** et non communicable (**L311-2** : « le droit à communication ne
  s'applique qu'à des documents **achevés** »). Peu gênant : un bâtiment visible dans BD TOPO a son
  permis délivré depuis longtemps.
- ⏱️ **Délai 1 mois** (**R311-13**) ; **silence = refus tacite** (**R311-12**) → recours **CADA**,
  gratuit.
- 📄 Dossiers récents nativement électroniques : à **Paris**, dépôt uniquement dématérialisé ; dans
  toute **commune > 3 500 habitants**, une **personne morale** doit transmettre **uniquement par voie
  électronique**.
- 🚫 **Interdit** : la demande de communication **SYSTÉMATIQUE** (ex. « liste mensuelle des permis »)
  s'analyse comme un **abonnement**, **irrecevable** (**CADA 20165532, 20195622, 20202383**).
- ⚖️ **Abus** (**L311-2 dernier alinéa**) : « l'administration n'est pas tenue de donner suite aux
  demandes abusives, en particulier par leur nombre ou leur caractère répétitif ou systématique ».
  **CE 14 novembre 2018 n° 420055** : est abusive la demande qui a pour objet de **perturber le bon
  fonctionnement** de l'administration OU aurait pour effet de faire peser sur elle une **charge
  disproportionnée** au regard de ses moyens.
  - ⚠️ **Nuance décisive** : le critère s'apprécie **PAR ADMINISTRATION SOLLICITÉE**, et le **volume
    seul ne suffit pas** (**CADA 20202712** : « toute demande portant sur une quantité importante de
    documents ou le fait de présenter plusieurs demandes ne sont pas nécessairement abusives »).
    Quelques dizaines de demandes/an réparties sur ~130 communes = **1 à 2 par commune et par an** →
    pas d'abus. **Automatiser la rédaction et l'envoi n'est PAS illégal en soi.**
- ❌ **Idée explicitement écartée** : multiplier les boîtes mail pour « passer sous les radars ».
  C'est se présenter comme **plusieurs personnes** devant une administration, ça transforme
  l'exercice d'un droit en **tromperie**, et ça rend la pièce justificative **pire qu'inutile** si le
  certificat est contesté. **Demander au nom de Sans Vis-à-Vis, à visage découvert.**
- 🛠️ **Automatiser le WORKFLOW, jamais la DONNÉE** : générer la demande pré-remplie (parcelle,
  n° de permis via Sitadel, fondement **L311-1 + L311-9-3°**) · suivre échéance, silence, escalade
  CADA · archiver le PDF reçu comme **pièce justificative** rattachée au certificat · notifier un
  humain. **Reste humain** : lire le plan et saisir la hauteur **avec son marqueur de source**
  (« hauteur issue du permis n° X, lue sur la coupe, convention faîtage »). Le **Cerfa** et la
  **notice descriptive** sont extractibles ; une **coupe dessinée** ne l'est **pas de façon fiable**,
  et la convention de mesure vit souvent dans la **notice**, pas sur le dessin.
  → concevoir une **EXTRACTION ASSISTÉE** (valeur proposée + page source, validation humaine en dix
  secondes), **jamais une extraction automatique aveugle**. Pour un document qui fait foi, une
  **hauteur non vérifiée est un passif**.

---

## 5. Chiffrage Sitadel (recon en session)

**Source** : SDES, base ouverte Sit@del, « Liste des permis de construire et autres autorisations
d'urbanisme » (data.gouv.fr, dataset `689c42fa521ccf80ce954f83`), **millésime `2026-06`** (le plus
récent). Fichiers CSV : `logements` (`datafiles/8b35affb-…/csv`) + `locaux non résidentiels`
(`datafiles/f8f0700f-…/csv`), séparateur `;`.

**Méthode** : `TYPE_DAU = PC` (exclut DP ; PA/PD en fichiers séparés non chargés) ; année de
`DATE_REELLE_AUTORISATION` ∈ [2021 ; 2025] ; **dédoublonnage par `NUM_DAU`** (170 permis mixtes
figurent dans les deux fichiers). Nature via `NATURE_PROJET_COMPLETEE` (renseignée sur les 354
permis) + `I_EXTENSION`/`I_SURELEVATION`. Logements = `NB_LGT_TOT_CREES` ; surface créée =
`SURF_HAB_CREEE` + `SURF_LOC_CREEE`.

### A. PC accordés (permis distincts), par commune × année

| Commune | 2021 | 2022 | 2023 | 2024 | 2025 | Total | Moy/an |
|---|--:|--:|--:|--:|--:|--:|--:|
| Courbevoie (92026) | 14 | 13 | 15 | 12 | 13 | 67 | 13,4 |
| Puteaux (92062) | 19 | 23 | 15 | 12 | 14 | 83 | 16,6 |
| Suresnes (92073) | 35 | 21 | 20 | 16 | 14 | 106 | 21,2 |
| Levallois-Perret (92044) | 15 | 7 | 17 | 11 | 11 | 61 | 12,2 |
| Neuilly-sur-Seine (92051) | 9 | 7 | 7 | 7 | 7 | 37 | 7,4 |
| **Total 5 communes** | **92** | **71** | **74** | **58** | **59** | **354** | **70,8** |

### B. Par nature de projet

**B1 — Construction neuve** (`NATURE_PROJET_COMPLETEE = 1`)

| Commune | 2021 | 2022 | 2023 | 2024 | 2025 | Total | Moy/an |
|---|--:|--:|--:|--:|--:|--:|--:|
| Courbevoie | 2 | 5 | 5 | 5 | 6 | 23 | 4,6 |
| Puteaux | 7 | 11 | 5 | 6 | 4 | 33 | 6,6 |
| Suresnes | 22 | 13 | 8 | 12 | 6 | 61 | 12,2 |
| Levallois-Perret | 4 | 0 | 5 | 2 | 6 | 17 | 3,4 |
| Neuilly-sur-Seine | 3 | 2 | 3 | 1 | 0 | 9 | 1,8 |
| **Total** | **38** | **31** | **26** | **26** | **22** | **143** | **28,6** |

**B2 — Extension ou surélévation** (`NATURE_PROJET_COMPLETEE ∈ {3,5}` ou `I_EXTENSION`/`I_SURELEVATION`)

| Commune | 2021 | 2022 | 2023 | 2024 | 2025 | Total | Moy/an |
|---|--:|--:|--:|--:|--:|--:|--:|
| Courbevoie | 11 | 7 | 9 | 5 | 6 | 38 | 7,6 |
| Puteaux | 9 | 12 | 9 | 3 | 8 | 41 | 8,2 |
| Suresnes | 11 | 8 | 9 | 4 | 7 | 39 | 7,8 |
| Levallois-Perret | 8 | 4 | 11 | 5 | 5 | 33 | 6,6 |
| Neuilly-sur-Seine | 6 | 4 | 4 | 4 | 6 | 24 | 4,8 |
| **Total** | **45** | **35** | **42** | **21** | **32** | **175** | **35,0** |

**Résidu non classé B1/B2** (transformation sans extension : changement de destination, réhabilitation,
diminution — `NATURE_PROJET_COMPLETEE ∈ {2,4,6}` sans indicateur d'extension) : **36 permis**
(9·5·6·11·5). → **B1 + B2 + résidu = 143 + 175 + 36 = 354** = tableau A. Les deux catégories demandées
**ne recouvrent pas la totalité** des PC.

### C. Constructions neuves uniquement

**C1 — Nombre de logements créés (`NB_LGT_TOT_CREES`)**

| Commune | 2021 | 2022 | 2023 | 2024 | 2025 | Total | Moy/an |
|---|--:|--:|--:|--:|--:|--:|--:|
| Courbevoie | 69 | 62 | 113 | 208 | 336 | 788 | 157,6 |
| Puteaux | 697 | 309 | 425 | 182 | 47 | 1 660 | 332,0 |
| Suresnes | 490 | 49 | 214 | 42 | 43 | 838 | 167,6 |
| Levallois-Perret | 81 | 0 | 87 | 44 | 227 | 439 | 87,8 |
| Neuilly-sur-Seine | 10 | 179 | 42 | 0 | 0 | 231 | 46,2 |
| **Total** | **1 347** | **599** | **881** | **476** | **653** | **3 956** | **791,2** |

**C2 — Surface de plancher créée, m² (`SURF_HAB_CREEE` + `SURF_LOC_CREEE`)**

| Commune | 2021 | 2022 | 2023 | 2024 | 2025 | Total | Moy/an |
|---|--:|--:|--:|--:|--:|--:|--:|
| Courbevoie | 4 884 | 5 721 | 9 448 | 71 688 | 18 065 | 109 806 | 21 961 |
| Puteaux | 43 182 | 26 728 | 29 687 | 12 511 | 3 683 | 115 791 | 23 158 |
| Suresnes | 44 060 | 5 459 | 14 542 | 5 014 | 3 599 | 72 674 | 14 535 |
| Levallois-Perret | 20 935 | 0 | 5 845 | 3 481 | 17 228 | 47 489 | 9 498 |
| Neuilly-sur-Seine | 1 716 | 7 250 | 6 380 | 75 | 0 | 15 421 | 3 084 |
| **Total** | **114 777** | **45 158** | **65 902** | **92 769** | **42 575** | **361 181** | **72 236** |

### Réserves du chiffrage Sitadel
- **Aucun dossier refusé dans la base ouverte** : le champ `ETAT_DAU` n'a pas de modalité « refusé »
  (2 = Autorisé, 4 = Annulé, 5 = Commencé, 6 = Terminé — tous autorisés). Les 354 PC sont **tous
  accordés** ; **18** ont `ETAT_DAU = 4` (autorisés puis **annulés**), comptés comme accordés.
- **Retard de collecte** (note de présentation SDES) : « **93 % après 6 mois, 97 % au bout d'un an** » ;
  « un tiers des achèvements et près de la moitié des annulations ne remontent jamais ». Millésime
  extrait en juin 2026 → **2025 est l'année la plus incomplète** ; 2024 encore susceptible d'augmenter ;
  2021-2023 quasi stabilisées. Les baisses apparentes 2024-2025 reflètent **en partie** ce
  sous-remplissage, pas nécessairement une baisse réelle.
- **0 PC** sans date de décision (aucune exclusion à ce titre) ; **0** état non exploitable.

### Conclusion de dimensionnement (ordre de grandeur)
**≈ 28,6 constructions neuves/an** sur les 5 communes. À Suresnes, un cône d'analyse ≈ **2 500 m²** sur
**4 km²** → **~0,8 %/an** de chance qu'une neuve tombe dans l'axe d'un certificat → **ordre de grandeur
de 10 alertes/an pour 1 000 certificats actifs**, dont une partie **innocentée par la borne PLU**.

---

## 6. Conformité et licences (recons en session)

- **Fond de carte du certificat : CONFORME.** Régénéré serveur (`app/lib/carte/orientationCarte.ts`)
  depuis les tuiles **IGN Géoplateforme WMTS, couche `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` (« Plan IGN
  v2 »)** (`orientationCarte.ts:25,138-140`), **licence ouverte Etalab**, **attribution gravée**
  « © IGN / Géoplateforme — Plan IGN » (`:45,206`). **Pas de SCAN 25/Express** (produits restreints).
- **Trou à l'écran** : cartes interactives (`MapContent.tsx:165-166`, `FaisceauMap.tsx:20-25`,
  `FaisceauMini.tsx:80`) sur **OpenStreetMap + Esri ArcGIS World Imagery** avec **attribution
  désactivée/absente** (`MapContent` sans option `attribution` ; `FaisceauMap:155`/`FaisceauMini:69`
  `attributionControl: false`).
- **Aucun fichier de crédits à la racine** (pas de `LICENSE`/`NOTICE`/`CREDITS`). Licences de polices
  présentes sous `app/lib/pdf/actifs/` (`IBMPlexMono-OFL.txt`, `PublicSans-LICENSE.md`,
  `SpaceGrotesk-OFL.txt`) → **polices conformes (OFL)**.
- **API photo (Gemini)** : `gemini-2.5-flash` via `generativelanguage.googleapis.com`
  (`adaptateurIaPhoto.ts:15,128`), clé `GEMINI_API_KEY` — **CGU non documentées** dans le dépôt.
- **Parcs & jardins** : **licence IPR à vérifier** avant tout import (`docs/SOURCES_DATA.md:53-56` —
  une ODbL serait bloquante pour un usage commercial propriétaire).
- **Rappel obligation Etalab** : mentionner la **source ET la date de dernière mise à jour**. → la
  décision d'**imprimer les millésimes** (LiDAR/BD TOPO) sur le certificat sert **aussi la conformité**.

---

## 7. Prochain gros chantier (énoncé du porteur)

> « Mettre à jour en continu la base de données des maps pour tenir compte des nouveaux permis de
> construire, et en déduire si sur les polygones concernés on garde les données LiDAR ou si on les
> remplace par les données des permis de construire, le temps d'un nouveau passage LiDAR. »

**Prérequis techniques déjà identifiés (recons en session) :**
- **Index sur `batiment.cleabs`** — **absent** aujourd'hui (`batiment_pkey` sur `fid`,
  `batiment_geom_geom_idx` gist sur `geom` ; `cleabs` unique en données 697 886/697 886 mais **non
  indexé**). Prérequis d'un diff inter-édition par identifiant.
- **Historisation d'une 2ᵉ édition BD TOPO** — table d'historique séparée **≈ +426 Mo**, **lecteurs et
  vue `bdtopo_batiment` inchangés** (option la moins invasive ; `batiment` reste l'édition courante).
- **Capture du `cleabs` de l'obstacle du verdict dans le snapshot** — **absent** : l'axe verdict passe
  par `obstaclesParBalayage` (`app/lib/db/obstacles.ts:370,566`) qui renvoie
  `{distanceM, altitudeSommetM, source:"LIDAR_HD"}` **sans `cleabs`** (vérifié en base :
  `resultat->'resultat'->'verdict'->'obstacle'` = `{source, distanceM, altitudeSommetM}`). Nécessaire à
  toute ligne « Impact » désignant le bâtiment déclencheur.
- **Aucun seuil « vrai changement vs re-numérisation » calibrable** avant d'avoir une **2ᵉ édition
  réelle** (colonnes d'arbitrage disponibles : `date_modification`, `precision_planimetrique`,
  `methode_d_acquisition_planimetrique`, écart de surface `ST_Area`, `ST_HausdorffDistance` — PostGIS
  3.6.4). Coût des opérations géométriques négligeable (`ST_Area` sur 697 886 polygones ≈ 130 ms).

---

*Documents liés : `docs/SOURCES_DATA.md` (registre des sources externes + licences),
`docs/INVARIANTS_SVAV.md` (invariants prouvés `fichier:ligne`), `CLAUDE.md`/`AGENTS.md`.*
