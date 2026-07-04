# Registre des sources de données externes

> Inventaire des sources géo/data utilisées (ou candidates) par le moteur Sans Vis-à-Vis®.
> Statut, licence, projection, jointure et **limites connues** de chacune. Accompagne
> `CLAUDE.md` (principe du verdict) et `SPEC_score_qualite_vue.md` (usage dans le score).

## Tableau de synthèse

| Source | Donnée | Statut | Licence | SRID | Jointure | Limites connues |
|---|---|---|---|---|---|---|
| **BD TOPO® IGN** — `bdtopo_batiment` (vue), `bdtopo_eau_surface`, `bdtopo_eau_plan`, `bdtopo_vegetation` | Emprises bâti (+ `nature`/`usage`/`hauteur`/altitudes), surfaces d'eau, végétation | **En base** | Licence Ouverte Etalab | 2154 | Géométrique ; `cleabs` (bâti) | **Végétation = Haie / Bois / Forêt seulement → NE CONTIENT PAS les parcs/squares urbains.** Couverture dépt 92 (+ Paris/93/95/78 selon couche). |
| **LiDAR HD IGN** — `mns_lidar_brut` (toits), `mnt_lidar_brut` (terrain) | Altitudes absolues NGF, grille 50 cm | **En base** | Licence Ouverte Etalab | 2154 | Spatial (raster ∩ point/couloir) | Sert au **verdict**. Capte le bâti réel mais, dans le moteur d'obstacle, **filtré par l'emprise BD TOPO** → un ouvrage absent de BD TOPO est ignoré (cf. **limite « mur des tennis »** ci-dessous). |
| **BAN** — `adresse_ban` | Adresses (numéro, voie, `cle_d_interoperabilite`, `parcelles_cadastrales`) | **En base** | Licence Ouverte Etalab | 2154 | `cle_d_interoperabilite` ; géométrie | Points ~0,7 m hors emprise parcellaire (tolérance gérée). |
| **Cadastre** — `parcelle` | Parcelles (`id` 14 c, `commune`, `section`, `numero`) | **En base** | Licence Ouverte Etalab | 2154 | `parcelle.id` ; géométrie | — |
| **BDNB** — `bdnb_annee_batiment` | **Année de construction** par `cleabs` | **IMPORTÉE** (table dédiée, **191 262 lignes**, **~76 % année non-null**, jointure `cleabs` **99,65 %**, dédup **`MIN(annee)`**) | Licence Ouverte Etalab | 2154 | `cleabs` → `bdtopo_batiment.cleabs` | Millésime **2026-02.a**. **Année ≠ style ≠ beauté** ; année issue des **Fichiers Fonciers** (approximation, parfois prédite). Alimente la **Famille 2** (ancien < 1900). |
| **Parcs & jardins publics ouverts au public** (OCS GE, ministère de la Transition écologique / IGN) | Polygones de parcs, squares, jardins (`nature`, `date_ouv`…) | **IMPORT BLOQUÉ — source 92 à trouver** | Licence Ouverte Etalab v2.0 | **2154 confirmé** (Lambert-93) | Géométrique (`ST_Force2D` puis `ST_Intersection` / `ST_Length` faisceau ↔ polygone) | **Comble le trou parcs/squares urbains** de BD TOPO végétation (Square Gilbert-Thomain près du parc Denfert, **absent** de `bdtopo_vegetation`). ⚠️ **Téléchargement OCS GE par département ne couvre PAS la petite couronne** (D091–D095 = 0 fichier ; seuls D075/D077/D078 en IdF) → **pas d'extrait 92**. Donnée 92 présente dans le WMS IGN, mais harvest sur grille fragile/non déterministe → non retenu. Schéma confirmé via proxy **D075** (même produit). Alimente la **Famille 4** (nature). |
| **Mérimée / POP** (immeubles protégés MH) — `monuments_historiques` | Monuments **classés / inscrits** (`ref` PAxxxx, `tico`, `deno`, `statut`, point) | **IMPORTÉE (dép. 92)** — **176 MH** (59 classés / 117 inscrits), **accroche `cleabs` 86,4 %** | Licence Ouverte Etalab | **2154** (reproj. WGS84→2154 à l'ingestion) | `cleabs` → `bdtopo_batiment.cleabs` (point→polygone : contenu, sinon KNN ≤ 15 m) | Point WGS84 (géocodage BAN approximatif) rattaché au bâti par proximité ; **24 perdus** (sans `cleabs`). Destiné à la **Famille 3** (remarquable/classé). **Dép. 92 seul — ne pas généraliser avant validation.** |
| **Mérimée / POP** (**Inventaire général**, `ref` IAxxxx) — `inventaire_general` | Bâti **patrimonial étudié** (`deno`, `nom`, datation, `adresse`, `cada_ref`, point optionnel) | **SPEC FIGÉE — NON importée** (recon one-shot lecture seule ; **aucune table créée**) | **Licence Ouverte / Etalab 2.0** (mention de **paternité obligatoire** ; photos & textes rédactionnels **exclus** — droit d'auteur) | **2154** (reproj. 4326→2154) | `cleabs` → `bdtopo_batiment.cleabs` (chaîne **adresse → CADA → emprise max**, KNN ≤ 15 m) | Périmètre **92 (REF IA92)**. **Descriptif uniquement — jamais le verdict ni le score.** Rattachement mesuré **248/306 = 81,0 %**. Distinct des MH (`monuments_historiques` **scellée, non modifiée**). |
| **OSM** | — | **Écartée** | Licence **incompatible** | — | — | Non utilisée (incompatibilité de licence avec un usage commercial propriétaire). |

## Détails par source en chantier

### BDNB — année de construction (importée)
- Table `public.bdnb_annee_batiment` : `cleabs` (PK), `annee_construction` (int, NULL autorisé),
  `source` (`'ffo'` si année présente).
- Chemin de construction : `batiment_groupe_compile.ffo_bat_annee_construction` →
  `batiment_groupe_id` → `rel_batiment_groupe_bdtopo_bat.bdtopo_bat_cleabs`.
- Dé-duplication : **`MIN(annee)`** par `cleabs` (déterministe ; plus ancienne année non-nulle).
- **Autonome** : aucune table existante modifiée ; jointure à la requête via `cleabs`.

### Parcs & jardins publics (OCS GE) — IMPORT BLOQUÉ (source 92 à trouver)
- Source : data.gouv.fr / cartes.gouv.fr / `data.geopf.fr` (flux WMS/WMTS + GeoPackage en
  téléchargement **par département** ; **pas de WFS**).
- ⚠️ **Blocage couverture** : l'archive de téléchargement par département **ne contient PAS la
  petite couronne** — **D091, D092, D093, D094, D095 = 0 fichier** (seuls **D075, D077, D078** en
  Île-de-France). **Le 92 n'est donc PAS disponible en extrait départemental.** La donnée 92
  existe dans le **WMS IGN national** (le Square Gilbert-Thomain y est interrogeable), mais un
  **harvest sur grille via GetFeatureInfo est fragile / non déterministe** → **non retenu** pour
  un import propre et auditable.
- **Schéma RÉEL confirmé** via le **proxy D075 (Paris)** — même produit, schéma identique pour
  tous les départements (fichier `.7z` 715 Ko → `PJ_75_2021.gpkg`, lu via `/vsi7z/`) :
  - **SRID = 2154 (Lambert-93)** ✅ confirmé sur fichier (base RGF93/4171 projetée).
  - **Géométrie = Polygon ZM (« 3D Measured »)** → **`ST_Force2D` requis** avant
    `ST_Intersection` / `ST_Length`.
  - **Colonnes** : `nom`, `nature`, `ouverture`, `date_ouv` (**TEXTE**, ~88 % non-null, min 1564 /
    max 2018), `source`, `id` (clé stable type **PJIDF…**). **PAS de colonne surface** → calcul
    `ST_Area` (seuil de représentation **500 m²**).
  - **`nature` observée** : `Square`, `Jardin`, `Parc` (la doc annonce aussi parc d'étang / parc
    de château / jardin botanique, absents à Paris).
- **Test Denfert** : **Square Gilbert-Thomain** présent (id `PJIDF2736`, `nature=Square`,
  `date_ouv=1902`) — **absent de `bdtopo_vegetation`** → confirme l'intérêt du jeu pour combler le
  trou parcs/squares urbains.
- **Source amont = Institut Paris Région (IPR).** **PISTE** : explorer un **jeu régional IdF
  (IPR)** couvrant le 92 (ex. « Espaces verts »). ⚠️ **LICENCE À VÉRIFIER avant tout import** —
  une **ODbL (share-alike)** serait **bloquante** pour un usage commercial propriétaire (contrairement
  à la Licence Ouverte Etalab de l'OCS GE).

### Monuments historiques — Mérimée / POP (importé, dép. 92)
- Table `public.monuments_historiques` : `id` (PK), `ref` (PAxxxx), `tico` (appellation courante,
  nullable), `deno` (dénomination/type, nullable), `statut` (`'classe'` | `'inscrit'`, NOT NULL),
  `geom` (**Point, 2154**), `cleabs` (bâtiment BD TOPO rattaché, nullable).
- **Source** : data.culture.gouv.fr (Opendatasoft) — dataset
  `liste-des-immeubles-proteges-au-titre-des-monuments-historiques` (« Immeubles protégés au titre
  des Monuments Historiques », **46 714 lignes** national). Export **GeoJSON WGS84**, filtré
  `departement_format_numerique="92"` à la source (**178 features**).
- **Mapping RÉEL des champs** (vérifié via l'API schéma ODS, non deviné) :
  - `ref` ← `reference` ; `tico` ← `titre_editorial_de_la_notice` ; `deno` ← `denomination_de_l_edifice`.
  - `statut` ← **`typologie_de_la_protection`** (⚠️ **PAS** `nature_de_la_protection`, qui vaut
    Arrêté/décret/liste = type d'acte). Valeurs : `classé MH`, `inscrit MH`, variantes
    *partiellement*/combos. Normalisation : contient « class » → `classe` ; sinon « inscrit » →
    `inscrit` (classé prioritaire sur inscrit).
  - `geom` ← `coordonnees_au_format_wgs84` (geo_point_2d), reprojeté **4326→2154** par `ogr2ogr`.
- **Filtre** : conservées seulement les lignes dont `typologie_de_la_protection` contient
  « classé » OU « inscrit » → **176 gardées / 178** (2 exclues = typologie nulle). **59 classés,
  117 inscrits.**
- **Ingestion** (manuelle one-shot, comme les parcs) : `ogr2ogr -f PostgreSQL` (staging, `-s_srs
  EPSG:4326 -t_srs EPSG:2154`) → `INSERT … SELECT` filtré/normalisé → table de staging supprimée.
  Index : `(cleabs)` + `USING gist (geom)`.
- **Rattachement point → bâti BD TOPO (option 1)** : (a) bâtiment **contenant** le point
  (`ST_Intersects`) → **119** ; (b) sinon **plus proche** ≤ **15 m** (KNN `<->` sur
  `batiment_geom_geom_idx`) → **+33**. **Total rattachés 152/176 = 86,4 %** ; **24 perdus** (point
  hors tout bâti à 15 m — géocodage BAN approximatif). *Tolérance relevable si besoin ; non
  généralisé hors 92 avant validation.*
- Destiné à la **Famille 3** (badge « monument historique » descriptif / boost remarquable).

### Bâti patrimonial — Inventaire général (Mérimée / POP) — SPEC FIGÉE (non importée)

> Décisions arbitrées et **figées** en session de reconnaissance (lecture seule, aucun import).
> Cette section **documente** la brique d'import à venir. **Aucune table n'a été créée**, aucun
> import lancé. Périmètre **strictement descriptif** : n'alimente **jamais** le verdict binaire ni
> le score de qualité de vue. **Distinct des monuments historiques** — la table
> `monuments_historiques` (MH, `ref` PAxxxx) est **scellée et non modifiée**, le golden reste intact.

**Source & canal.** Base **Mérimée**, **domaine Inventaire général** (`ref` commençant par `IA`). Canal
= **export POP** (`api.pop.culture.gouv.fr` : `search/advanced` pour la requête, puis
`notice-export/sync/public` pour l'export), format **XLSX**. ⚠️ Le portail `data.culture.gouv.fr`
n'expose **que le sous-ensemble MH** (`PA`) — il **ne contient pas** l'Inventaire ; le fonds `IA`
provient uniquement de POP.

**Licence.** **Licence Ouverte / Etalab 2.0** — **mention de paternité obligatoire**. Les **photographies
et textes rédactionnels** des notices sont **exclus** (droit d'auteur) : on n'ingère que les **données
factuelles** (référence, dénomination, localisation, datation, cadastre).

**Périmètre.** Courant : **dép. 92** (filtre `REF` commence par `IA92`). Replay prévu **Paris + petite
couronne** : `IA75` / `IA92` / `IA93` / `IA94` (même pipeline, changer le préfixe).

**Filtre « bâti » (DENO + DOSS).** On ne garde que le seau **BÂTI** (**306** notices sur le 92). Sont
**exclus** :
- **ESPACE_VERT** (parc, jardin, square, promenade, verger…) — **doublon de la famille nature**,
  **jamais réinjecté** ici.
- **COLLECTIF / ÉTUDE** — aires d'étude, présentations de commune/opération, `DOSS` = *dossier
  collectif* / *présentation…*, `DENO` = *ville* / *lotissement* / *ensemble*.
- **MONUMENT / FUNÉRAIRE** — tombeau, chapelle funéraire, monument aux morts, cimetière, croix.

**Mapping des champs POP → schéma cible.**

| Champ POP (code) | Colonne cible | Note |
|---|---|---|
| `REF` | `ref` | identifiant notice `IAxxxxxxxxx` |
| `DENO` | `deno` | dénomination (peut être multivaluée ` ; `) |
| `TICO` / `EDIF` | `nom` | titre courant / nom de l'édifice |
| `WEB` (INSEE) sinon `LOCA` | `commune_insee` | INSEE si présent, sinon parsé de `LOCA` après le `(92)` |
| `DATE` / `SCLE` | `datation` | année(s) / siècle(s) de construction |
| `ADRS` | `adresse` | adresse d'origine (parsée pour le géocodage) |
| `CADA` | `cada_ref` | références cadastrales (année d'édition ignorée) |
| `POP_COORDONNEES` (LAT/LON) | `geom_point` | **point optionnel — JAMAIS source primaire** (renseigné ~5,6 %) |

Reprojection des coordonnées **4326 → 2154** (Lambert-93) à l'ingestion.

**Schéma cible `inventaire_general`** (relation **1 notice → N bâtis** ; une notice sur une parcelle
multi-bâtis peut porter plusieurs `cleabs`) :

| Colonne | Type | Note |
|---|---|---|
| `ref` | text | référence notice `IAxxxx` |
| `cleabs` | text **nullable** | bâti BD TOPO rattaché (`NULL` = non rattaché) |
| `statut` | text | constante `'bati_patrimonial'` |
| `deno`, `nom`, `commune_insee`, `datation`, `adresse`, `cada_ref` | text | cf. mapping |
| `mode_rattachement` | text | `num_exact` \| `voisin_2` \| `cada_1bati` \| `cada_max_emprise` \| `point_parcelle` |
| `dist_m` | double | distance point→bâti retenu (m) |
| `desamb_serree` | bool | `true` si écart emprise max/2e **< 15 %** (cas limite) |
| `badge_actif` | bool | **DEFAULT `true`** (filtrage d'affichage, cf. plus bas) |
| `geom_point` | `geometry(Point, 2154)` | point de géocodage (optionnel) |

- **Clé primaire `(ref, cleabs)`** — supporte le multi-badge (un `ref` → plusieurs `cleabs`).
  *(Note d'implémentation : les notices non rattachées ont `cleabs` NULL et `badge_actif=false` ; à
  cadrer au moment de l'import — hors périmètre de cette doc.)*

**Chaîne de rattachement — ordre FIGÉ.**
1. **Adresse** — normalisation de voie (`unaccent` + `pg_trgm` : minuscule, expansion d'abréviations
   av→avenue, bd→boulevard, st→saint…), **numéro exact** sinon **voisin ±2** sur la même voie,
   **multi-adresses éclatées** (chaque `(n°, voie)` tenté dans l'ordre). Point BAN → **`ST_Contains`**
   d'un bâti, sinon **KNN `<->` ≤ 15 m**. → `mode_rattachement` = `num_exact` / `voisin_2`.
2. **CADA → parcelle → 1 bâti** — réf cadastrale → `parcelle` (`commune` INSEE + `section` + `numero`)
   → si **exactement 1 bâti** contenu (point-sur-surface dans la parcelle). → `cada_1bati`.
3. **CADA multi-bâtis → plus grande emprise** — badge le bâti de **`ST_Area(geom)` max** ; **égalité
   stricte du max → tous les ex æquo** (multi-badge). Écart **max vs 2e < 15 % → `desamb_serree=true`**.
   → `cada_max_emprise`.
4. **Bonus point-dans-parcelle** — notice sans CADA exploitable mais avec `POP_COORDONNEES` non nul :
   point → parcelle → même règle « 1 bâti unique ». → `point_parcelle`.
5. **Sinon exclusion.** **JAMAIS de centroïde de voie.** **Tolérance 15 m verrouillée** (miroir du
   rattachement MH ; non négociable sans revalidation).

**Résultats mesurés (recon dép. 92, sur 306 bâti).**

| Étape | + rattachés | Cumul | % |
|---|---|---|---|
| Adresse (`num_exact` / `voisin_2`) | 221 | 221 | **72,2 %** |
| CADA → 1 bâti (+ bonus point) | +11 | 232 | **75,8 %** |
| CADA multi-bâtis → emprise max | +16 | **248** | **81,0 %** |

- **Résidu 58** = **3** CADA parcelle **0 bâti** + **21** CADA **sans parcelle** trouvable + **34**
  **sans CADA** (édifices sur **place sans numéro** : églises, gares, fontaines, mairies).
- **`desamb_serree` = 2 cas** : `IA92000144` (complexe sportif, 649 vs 645 m², écart 1 %) et
  `IA92000247` (ermitage/couvent, 1509 vs 1341 m², écart 11 %) — « emprise max » peut se tromper de
  corps → à passer en revue manuelle si besoin. **0 multi-badge** (aucune égalité stricte d'aire en
  pratique).

**Filtrage d'affichage — prévu mais INACTIF.** Colonne `badge_actif` (**`true` partout aujourd'hui**)
+ table `deno_affichage(deno, affichable)` **vide** → **liste blanche totale** : **toutes les
catégories sont affichées**. Mécanisme purement **descriptif**, prêt à restreindre l'affichage
ultérieurement sans migration.

**Garde-fous (rappel).**
- **Descriptif uniquement** — n'entre **jamais** dans le **verdict binaire** ni dans le **score de
  qualité de vue**.
- **Golden intact**, **MH hors périmètre** : `monuments_historiques` **non modifiée**.
- Recon **100 % lecture seule** ; extensions `unaccent`/`pg_trgm` activées en **schéma scratch dédié
  puis supprimé** — **base prod inchangée**.

## Limite générale du moteur de verdict (décidée)

Le **verdict binaire Sans Vis-à-Vis® est calculé à 100 % sur des données officielles IGN**
(MNT/MNS LiDAR pour les altitudes, BD TOPO pour les emprises bâties). **Le logiciel ne reconstitue
pas les données manquantes** : si un obstacle réel n'est pas présent dans les couches officielles,
il n'entre pas dans le verdict.

**Illustration — « mur des tennis »** : sur un faisceau, le MNS LiDAR capte un mur réel (~6-10 m,
toit nettement au-dessus de l'œil) à ~32-48 m, mais **aucune emprise `bdtopo_batiment`** n'existe
à cet endroit. Le moteur d'obstacle ne lisant le MNS **que sous les emprises BD TOPO**, ce mur est
**filtré** et le faisceau ne s'arrête qu'au premier bâtiment BD TOPO suivant (~77-90 m). C'est un
choix assumé d'**auditabilité** (verdict reproductible sur données officielles) plutôt que de
reconstruction heuristique. Les sources complémentaires (parcs/jardins, Mérimée, BDNB) n'alimentent
que le **score de qualité de vue** (Résultat B), **jamais le verdict**.
