# Dimensionnement du serveur OVH — toute l'application, toute l'Île-de-France

> Lot RECON « DIMENSIONNEMENT DU SERVEUR OVH » — 14/10/2026. **Lecture seule** : requêtes `SELECT`, `du`, `ps`,
> verdict golden rejoué avec `PGOPTIONS='-c default_transaction_read_only=on'` (toute écriture aurait été refusée
> par PostgreSQL). Aucune migration, aucune ingestion, aucun téléchargement. Mesures brutes et scripts :
> `.captures/dimensionnement-serveur-ovh/`.
>
> Ce document **complète et remplace** `docs/RECON_DIMENSIONNEMENT_SERVEUR.md` (12/10/2026). Il ajoute ce qui y
> manquait : familles patrimoine / internautes / journaux, MinIO par type de fichier, consommation réelle des
> processus et du verdict, réglages PostgreSQL, base de 10 M ventes, marges, configuration de disques.
>
> **Règle de lecture.** Chaque chiffre porte une étiquette :
> - **MESURÉ** : lu aujourd'hui sur le Mac, commande donnée ;
> - **ESTIMÉ** : calculé, méthode donnée ;
> - **EXTÉRIEUR** : chiffre public non vérifiable ici (surface, nombre d'adresses…), à confirmer.
>
> Unités : Mo / Go / To **décimaux** (1 Go = 10⁹ octets), comme les fiches commerciales des disques.

---

## 0. Synthèse

| | Aujourd'hui (MESURÉ) | Cible Île-de-France (ESTIMÉ bas – haut) |
|---|---:|---:|
| Base PostgreSQL | **11,5 Go** | **≈ 418 – 453 Go** |
| dont LiDAR MNT + MNS 0,5 m | 0,03 Go (1 km²) | **≈ 402 – 427 Go** |
| dont tout le reste (bâti, cadastre, BAN, mails, permis…) | 11,4 Go | ≈ 12 – 18 Go |
| dont future base de 10 M ventes | — | ≈ 4 – 8 Go |
| Stockage objet (MinIO), pièces de la gestion exclues (→ Drive) | 0,9 Go | ≈ 1 – 4 Go + ≈ 1 Mo par certificat |
| **Disque utile au pire moment** (réingestion LiDAR, croissance 3 ans, système) | | **≈ 0,74 – 1,08 To** |

**Recommandation (détail §6)** : **64 Go de mémoire**, **2 × 1,92 To NVMe en miroir (RAID 1)**, **8 à 12 cœurs**,
sauvegardes sur un stockage **séparé** du serveur. Le LiDAR fait à lui seul 95 % du volume ; tout le reste tient
en moins de 30 Go.

---

## 1. Base PostgreSQL — MESURÉ

PostgreSQL **17.10**, PostGIS **3.6.4** (`postgis_raster`, `postgis_topology`), `pg_trgm`, `unaccent`.
**Taille : 11 495 986 867 octets = 11,5 Go** (`SELECT pg_database_size('sansvisavis')`) ; répertoire de données
11 Go (`du -sh /opt/homebrew/var/postgresql@17`), dont 80 Mo de WAL (`pg_ls_waldir()`).
Index : 1,23 Go au total ; TOAST (gros textes hors ligne) : 5,5 Go, presque tout dans les mails.

### 1.1 Par famille

Commande : `pg_relation_size` + TOAST + `pg_indexes_size` par table, regroupées par motif de nom
(`.captures/dimensionnement-serveur-ovh/familles.txt` ; détail table par table : `tailles-tables.txt`).
Lignes = `reltuples` (estimation du planificateur, exacte à quelques % près).

| Famille | Tables | Données | Index | Total | Lignes | Départements couverts |
|---|---:|---:|---:|---:|---:|---|
| LiDAR MNT + MNS (`mnt_lidar_brut`, `mns_lidar_brut`, `rge_alti` vide) | 4 | 33,5 Mo | 0,08 Mo | **33,6 Mo** | 128 tuiles | **1 km²** dans le 92 (Asnières) |
| BD TOPO bâti et milieux | 9 | 2 520 Mo | 576 Mo | **3 096 Mo** | 6,4 M | voir détail |
| — `batiment` | | 1 886 Mo | 420 Mo | 2 306 Mo | 3 602 051 | **les 8** (emprise 165 × 135 km) |
| — 4 copies de millésimes (`batiment_2026_03_15`, `batiment_edition_fige`, `bdtopo_next_batiment`, `stg_etat_juin`) | | | | 771 Mo | 4 × ≈ 0,7 M | Paris + petite couronne |
| — `bdtopo_vegetation`, `bdtopo_eau_*` | | | | 19,7 Mo | 20 340 | ≈ 900 km² autour de Paris et du 92 |
| Cadastre (`parcelle`, `cadastre_millesime`) | 2 | 1 239 Mo | 425 Mo | **1 664 Mo** | 3 717 905 | **les 8** |
| BAN (`adresse_ban`) | 1 | 169 Mo | 36 Mo | **205 Mo** | 557 710 | 7, **partiels** ; 77 absent |
| Référentiels (communes, `spatial_ref_sys`…) | 7 | 8,3 Mo | 0,6 Mo | **9 Mo** | 8 890 | communes : 75, 78, 92, 93, 94 |
| Patrimoine, parcs, BDNB | 11 | 14 Mo | 10 Mo | **25 Mo** | 194 114 | patrimoine : Paris + ouest ; parcs : 92 ; BDNB : 92 |
| Permis, GED, Sitadel, veille | 79 | 113 Mo | 48 Mo | **169 Mo** | 314 277 | Sitadel : **les 8** (72 234 dossiers) |
| Gestion — mails (`gestion_message`) | 1 | 5 556 Mo | 63 Mo | **5 891 Mo** | 57 610 | non géographique |
| Gestion — hors mails | 85 | 240 Mo | 123 Mo | **381 Mo** | 861 452 | non géographique |
| Internautes, certificats, comptes, analytics | 30 | 1,0 Mo | 0,9 Mo | **2 Mo** | 686 (31 certificats, 46 projets) | — |
| **Total** | **230** | | | **≈ 11,5 Go** | | |

**Journaux** (famille transversale, déjà comptée ci-dessus) : 24 tables `*journal*`, `*_log`, `*_run`,
**24 Mo**, 70 271 lignes ; le plus gros, `gestion_journal`, 15 Mo.

### 1.2 Couverture par département (MESURÉ)

| Jeu | 75 | 77 | 78 | 91 | 92 | 93 | 94 | 95 | Commande |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Parcelles | 78 k | 1 270 k | 670 k | 583 k | 162 k | 233 k | 213 k | 508 k | `group by left(commune,2)` |
| Adresses BAN | 120 k | **0** | 73 k | 43 k | 169 k | 36 k | 42 k | 74 k | `group by left(insee_commune,2)` |
| Dossiers Sitadel | 4,7 k | 16,4 k | 11,9 k | 10,6 k | 5,9 k | 7,9 k | 6,9 k | 8,0 k | `group by left(code_insee,2)` |
| Communes | 1 | — | 259 | — | 36 | 39 | 47 | — | `group by departement` |
| LiDAR | — | — | — | — | 1 km² | — | — | — | `ST_Extent` : 646 000–647 000 × 6 867 000–6 868 000 |

Le bâti (`batiment`) n'a pas de colonne département ; son emprise (`ST_Extent`) couvre toute l'Île-de-France et
son volume (3,6 M) est celui de la région. Le relevé du 12/10 l'a ventilé par sondage à 1 %.

### 1.3 Le LiDAR, ce que l'application lit vraiment — MESURÉ

- Deux rasters PostGIS **en base** (contrainte `enforce_out_db_rast = {f}`) : `mnt_lidar_brut` (terrain) et
  `mns_lidar_brut` (toits), **0,5 m**, **float32** (`32BF`), tuiles de 256 × 256 px, Lambert-93 (`\d mnt_lidar_brut`).
- **16 752 640 octets par km² et par couche** en base (`pg_total_relation_size`, 64 tuiles = 1 km²). Le TOAST ne
  les compresse pas : 16,72 Mo stockés pour 16,78 Mo de pixels bruts (2 000 × 2 000 × 4 octets).
- La dalle source conservée `app/data/lidar/LHD_FXX_0646_6868_MNS_O_0M50_LAMB93_IGN69.tif` pèse **16 000 513
  octets**, float32 **non compressé** (`gdalinfo` : pas de `COMPRESSION`). Son nom est celui des **MNS / MNT
  0,5 m livrés tout faits par l'IGN** : pas besoin de traiter des nuages de points.

---

## 2. Fichiers hors base — MESURÉ

| Emplacement | Contenu | Taille (`du -sh`) | Lu par l'application ? | Après import |
|---|---|---:|---|---|
| `app/data/lidar/` | 1 dalle MNS (la MNT n'y est plus) | 16 Mo | **Non** (aucune occurrence de `data/lidar` dans `app/`) | **Supprimable** (retéléchargeable à l'IGN) |
| `data/sitadel/` | 3 CSV du millésime 2026-09 | 1,27 Go | Oui, **pendant l'ingestion seulement** (`app/lib/sitadel/ingestionMillesime.ts:35`), retéléchargés depuis DIDO à chaque millésime | Supprimable ; prévoir ≈ 1,3 Go de travail par millésime |
| `data/bdnb/` | archive BDNB du 92 | 283 Mo | Import seulement | Supprimable |
| `data/commune`, `prada`, `mairie`, `parcs_jardins` | petits référentiels | 6 Mo | Import seulement | À garder (négligeable) |
| `$DILA_DIR` (défaut : dossier temporaire) | travail d'ingestion DILA | éphémère | `app/lib/sitadel/dilaIngest.ts:36` | — |
| `.next/` | cache du **serveur de développement** | 25 Go | Non en production | Ne pas copier ; un build de production est bien plus petit |
| `node_modules/` | dépendances | 0,68 Go | — | Réinstallées sur le serveur |
| `../altitudes`, `../batiments`, `../cadastre`… | dossiers voisins du dépôt | vides | — | — |

**Les données brutes ou intermédiaires ne sont jamais relues une fois en base.** La seule exception est le
LiDAR : `docs/PROTOCOLES_REINGESTION.md:337` rappelle qu'il a été chargé à la main et qu'**aucun script ne le
recharge**. Sans les dalles ou une sauvegarde, il est perdu. C'est une raison de plus pour écrire le pipeline
d'import avant de remplir le serveur.

---

## 3. Stockage objet (MinIO) — MESURÉ

Commande : parcours de `.minio/data` (un objet = un dossier contenant `xl.meta`), somme des tailles par préfixe et
par extension (`.captures/dimensionnement-serveur-ovh/minio-types.txt`). **Total : 28 136 objets, 1,99 Go.**

| Préfixe | Objets | Taille | Moyenne | Types principaux | Sur le serveur cible ? |
|---|---:|---:|---:|---|---|
| `svav-dev/gestion/messages` | 825 | 1 057 Mo | 1,3 Mo | `.mov` 367 Mo, `.pdf` 182 Mo, `.mp4` 125 Mo, `.jpg` 124 Mo, `.bin` 119 Mo, `.heif` 54 Mo, `.png` 40 Mo | **Non → Google Drive** |
| `svav-dev/gestion/brouillons` | 46 | 47 Mo | 1,0 Mo | `.pdf` | **Non → Google Drive** |
| `svav-dev/gestion/miniatures` | 26 695 | 167 Mo | 6 ko | `.jpg` (vignettes des pièces) | Oui, sauf décision de les régénérer |
| `svav-dev/dossiers` | 394 | 607 Mo | 1,5 Mo | `.pdf` 603 Mo : **GED des permis** | Oui |
| `svav-dev/demandes` | 20 | 60 Mo | 3,0 Mo | `.pdf` : demandes CRPA | Oui |
| `svav-dev/internautes` | 82 | 48 Mo | 0,6 Mo | `.pdf` 27 Mo (certificats), `.png` 20 Mo (photos) | Oui |
| `svav-jetable` | 61 | ≈ 0 | — | essais | Non |
| **Reste sur le serveur** | | **≈ 0,88 Go** | | | |

Rapport utile pour la croissance : **≈ 1,05 Mo par projet d'internaute** (48 Mo pour 46 projets, certificat PDF +
photos).

---

## 4. Ce qui tourne en permanence — MESURÉ

Machine de mesure : Mac **Apple M4 Pro, 12 cœurs, 24 Go** (`sysctl hw.ncpu hw.memsize machdep.cpu.brand_string`).
Échantillonnage `ps -axo rss,pcpu,command` toutes les 5 s (repos) ou toutes les 1 s (verdict), par famille de
processus (`.captures/dimensionnement-serveur-ovh/echantillonner.sh`). %CPU : 100 % = un cœur entier.

### 4.1 Au repos (application ouverte, relève du courrier active, une passe de veille)

Fenêtre 17:00:04 → 17:10:03, 120 échantillons, après la fin des essais de verdict
(`processus-repos-15min.txt`) ; la veille, absente de cette fenêtre, est lue sur la fenêtre complète (16 min).

| Processus | CPU moyen | CPU en pointe | Mémoire moyenne | Mémoire en pointe |
|---|---:|---:|---:|---:|
| PostgreSQL (tous processus) | 0,6 % | 24 % | 83 Mo | 877 Mo |
| Next.js (**dev**, 4 processus) | 0,3 % | 11 % | 917 Mo | 1 970 Mo (compilation à la volée pendant une navigation) ; 202 – 237 Mo sans navigation |
| MinIO | 5,7 % | 21 % | 308 Mo | 424 Mo |
| Relève du courrier (`relever-gestion-continu`, permanente) | 1,2 % | 29 % | 214 Mo | 226 Mo |
| Empreintes Drive (passe toutes les 15 min) | 21,9 % pendant la passe | 43 % | 155 Mo | 166 Mo |
| Veille (passe toutes les 15 min) | 0,2 % | 3 % | 112 Mo | 155 Mo |
| **Total au repos** | **≈ 0,1 cœur** | **< 1,5 cœur** | **≈ 1,6 Go** | **≈ 3,8 Go** |

Next.js tourne ici en **mode développement** (`next dev`) : en production (`next start`), compter **0,3 à 0,5 Go**
(ESTIMÉ, pas de compilation à la volée). La pointe de mémoire de PostgreSQL au repos (877 Mo) vient des requêtes de la relève et des écrans ouverts.

### 4.2 Pendant le verdict golden d'Asnières (lecture seule)

Script `.captures/dimensionnement-serveur-ovh/verdict-golden.mts` : appelle `analyserAdresse` (même entrée que
`app/lib/db/pipeline.itest.ts`), sous `PGOPTIONS='-c default_transaction_read_only=on'` (affiché :
`lecture seule = on`). Verdict obtenu : `SANS_VIS_A_VIS` à chaque passage.

| Charge | Durée d'une analyse | PostgreSQL : CPU max | PostgreSQL : mémoire max | Processus Node de l'analyse |
|---|---|---:|---:|---:|
| 1 analyse à la fois, 100 de suite | 1re 436 ms, **médiane 167 ms**, min 158 ms | 93 % | 357 Mo | 102 Mo |
| 4 en parallèle × 40 | médiane 176 ms | 434 % | 1,4 Go | ≈ 100 Mo chacun |
| 8 en parallèle × 40 | médiane 209 ms | **837 %** | **2,8 Go** | ≈ 100 Mo chacun |

Lecture : **une analyse occupe un cœur entier de PostgreSQL pendant ≈ 0,17 s**, et environ **350 Mo** de mémoire
de processus PostgreSQL (2,8 Go / 8). Huit analyses simultanées tiennent en ≈ 0,21 s chacune, soit ≈ 38 analyses
par seconde. ⚠️ Ces mesures sont faites **à chaud, sur 1 km² déjà en mémoire** : sur l'Île-de-France entière, la
première analyse d'un quartier lira ses tuiles sur le disque (d'où l'importance du NVMe et de la mémoire).

### 4.3 Réglages PostgreSQL actuels — MESURÉ

`SELECT name, setting FROM pg_settings …` :

| Réglage | Valeur | Commentaire |
|---|---|---|
| `shared_buffers` | **128 Mo** (16 384 × 8 ko) | défaut ; à porter à 25 % de la mémoire |
| `work_mem` | **4 Mo** | défaut |
| `maintenance_work_mem` | 64 Mo | défaut ; trop peu pour reconstruire l'index de 3,6 M bâtiments |
| `effective_cache_size` | 4 Go | défaut |
| `max_connections` | 100 | |
| `max_wal_size` / `min_wal_size` | 1 Go / 80 Mo | |
| `random_page_cost` | 4 | valeur pour disque tournant ; 1,1 sur NVMe |
| `effective_io_concurrency` | 0 | à monter sur NVMe |
| `max_worker_processes` / `max_parallel_workers` / par requête | 8 / 8 / 2 | |
| `jit` | on | |
| `wal_level` / `archive_mode` | replica / off | pas d'archivage de WAL |
| `default_toast_compression` | pglz | |

Effet visible des réglages par défaut (`pg_stat_database`, cumul depuis l'installation) : seules **51 %** des
lectures sont servies par la mémoire de PostgreSQL, et **141 Go** de fichiers temporaires ont été écrits par des
tris ou hachages trop gros pour 4 Mo.

---

## 5. Cible Île-de-France — ESTIMÉ

Références de surface (EXTÉRIEUR, INSEE) : **Île-de-France 12 012 km²** — 75 : 105, 77 : 5 915, 78 : 2 284,
91 : 1 804, 92 : 176, 93 : 236, 94 : 245, 95 : 1 246. (La table `commune` donne 2 306 km² pour le 78, 105 / 176 /
237 / 245 pour 75 / 92 / 93 / 94 : MESURÉ, `sum(ST_Area(geom))`.)

### 5.1 LiDAR HD

Méthode : poids MESURÉ par km² et par couche **× 2 couches × surface**.

| Variante | Calcul | Résultat |
|---|---|---:|
| **Bas** — exactement 12 012 km², en base comme aujourd'hui | 16,75 Mo × 2 × 12 012 | **402 Go** |
| **Haut** — dalles entières de 1 km² qui débordent de la frontière (≈ +6 % : périmètre régional ≈ 700 km, EXTÉRIEUR, × 1 km de dalle coupée en moyenne) | 16,75 Mo × 2 × 12 700 | **427 Go** |
| Option : zone urbanisée seulement (≈ 2 850 km², EXTÉRIEUR — unité urbaine de Paris) | 16,75 Mo × 2 × 2 850 | 95 Go |
| Option : hors base, GeoTIFF compressé **sans perte** (DEFLATE + prédicteur flottant) | MNS : **9 869 000 / 16 000 513 = 61,7 %** (MESURÉ sur une copie dans `.captures/`) × 402 Go | ≈ 248 Go (plafond : la MNT, plus lisse, se compresse mieux — non mesurée) |
| Dalles sources IGN si on les téléchargeait toutes à la fois | 16,0 Mo × 2 × 12 012 | 384 Go — **inutile** : importer par lots et les effacer |

Deux mises en garde :
- **Quantifier les altitudes** (stocker des centimètres en entier 16 bits pour diviser par deux) violerait la règle
  « aucun arrondi » (CLAUDE.md §5). Exclu.
- Le passage « hors base » change le code de lecture du verdict (fichiers sensibles `hauteurLidar.ts`,
  `obstacles.ts`) : chantier à part, golden à rejouer. Le dimensionnement retient donc **la base, comme
  aujourd'hui**.

### 5.2 Les autres familles

| Famille | Aujourd'hui (MESURÉ) | Méthode | IDF bas | IDF haut |
|---|---:|---|---:|---:|
| LiDAR MNT + MNS | 0,03 Go | §5.1 | **402 Go** | **427 Go** |
| BD TOPO `batiment` | 2,31 Go | déjà les 8 départements ; haut = +10 % pour les nouvelles constructions et un millésime plus riche | 2,3 Go | 2,6 Go |
| Copies de millésimes BD TOPO | 0,77 Go | bas : aucune copie gardée ; haut : les 4 mêmes copies à l'échelle IDF, × 5,16 (3 602 051 / 697 886 bâtiments) | 0 | 4,0 Go |
| Végétation, eau (BD TOPO) | 0,02 Go | au prorata de la surface : ≈ 900 km² (emprise MESURÉE) → 12 012 km², × 13,3 ; haut × 2 (plus de bois hors agglomération) | 0,26 Go | 0,5 Go |
| Cadastre | 1,66 Go | déjà les 8 départements ; haut : + une copie de millésime partielle | 1,7 Go | 2,0 Go |
| BAN | 0,21 Go | **368 octets par adresse** (MESURÉ : 205 Mo / 557 710) × 2,0 à 3,0 M adresses en IDF (EXTÉRIEUR) | 0,74 Go | 1,1 Go |
| Communes et référentiels | 0,01 Go | 1 265 communes IDF (EXTÉRIEUR) au lieu de 382 | 0,01 Go | 0,02 Go |
| BDNB (année de construction) | 0,023 Go | 119 octets par bâtiment (MESURÉ : 22,7 Mo / 191 262, 92 seul) × 3,6 M ; haut × 2 si plus d'attributs | 0,43 Go | 0,85 Go |
| Patrimoine, parcs | 0,002 Go | × 10 à × 20 (Paris + ouest → toute la région) | 0,02 Go | 0,05 Go |
| Permis, GED, Sitadel, veille | 0,17 Go | Sitadel déjà les 8 départements ; haut : suivi des permis × 5 | 0,2 Go | 0,8 Go |
| Mails de la gestion | 5,89 Go | indépendant du territoire | 5,9 Go | 5,9 Go |
| Gestion hors mails | 0,38 Go | idem | 0,4 Go | 0,4 Go |
| Internautes, certificats | 0,002 Go | quelques ko par projet | < 0,01 Go | 0,1 Go |
| **10 M ventes** | — | §5.3 | **3,9 Go** | **8,0 Go** |
| **Total base** | **11,5 Go** | | **≈ 418 Go** | **≈ 453 Go** |

Stockage objet (pièces de la gestion sur le Drive) : 0,88 Go aujourd'hui → bas 1 Go, haut 4 Go (GED des permis
× 5), plus **≈ 1,05 Mo par projet d'internaute** (MESURÉ) : 10 000 certificats = 10,5 Go.

### 5.3 Base de 10 millions de ventes

Ligne type (colonnes probables d'une base de mutations du type DVF) : identifiant `bigint`, date, nature de la
mutation, valeur foncière `numeric(12,2)`, numéro, suffixe, voie, code postal, code INSEE, commune, identifiant de
parcelle, type de local, surface bâtie, nombre de pièces, surface de terrain, nombre de lots, surface Carrez,
**point Lambert-93** (`geometry(Point,2154)`), identifiant de mutation source, date d'import.

- **Ligne : 209 octets en moyenne, 240 au plus — MESURÉ** sur 5 000 lignes fabriquées dans un `SELECT` à partir
  d'adresses BAN réelles (`pg_column_size(row(...))`, aucune table créée).
- **Table : ≈ 220 octets par ligne sur disque** (pointeur de ligne et remplissage des pages, ESTIMÉ) × 10 M =
  **2,2 Go** ; haut × 2 (adresse plus longue, plusieurs lots, données d'origine conservées) = 4,5 Go.
- **Index**, au poids MESURÉ par ligne des index existants :

| Index | Mesure de référence | Octets / ligne |
|---|---|---:|
| clé primaire `bigint` | `adresse_ban_pkey`, `parcelle_pkey`, `batiment_pkey` | 22,5 |
| spatial GiST sur le point | `adresse_ban_geom_geom_idx` | 42,6 |
| identifiant de parcelle (texte) | `parcelle_id_idx` | 47,0 |
| date | `sitadel_dossier_date_autorisation_idx` | 12,6 |
| commune + date | ≈ `sitadel_dossier_code_insee_idx` + date | ≈ 30 |
| **Bas : ces 5 index** | | **≈ 155 → 1,6 Go** |
| Haut : + recherche plein texte sur l'adresse, 2 index de plus | | ≈ 350 → 3,5 Go |

**Total : ≈ 3,9 Go (bas) à 8,0 Go (haut).** Croissance : ≈ 150 000 à 200 000 ventes par an en IDF (EXTÉRIEUR)
→ + 0,1 à 0,2 Go par an.

### 5.4 Marges

**Croissance sur 3 ans** (ESTIMÉ à partir des rythmes MESURÉS) :

| Poste | Rythme | 3 ans |
|---|---|---:|
| Mails de la gestion | `pg_column_size` par trimestre : 0,4 Go / trimestre depuis avril 2026, pointe à 1,7 Go fin 2025 → 1,6 à 5 Go / an | 5 – 15 Go |
| GED des permis | 1,5 Mo par fichier (MESURÉ) ; 0,5 à 3 Go / an | 2 – 9 Go |
| Certificats internautes | 1,05 Mo par projet ; 0 à 10 000 projets / an | 0 – 32 Go |
| Sitadel (base + fichier du millésime) | < 1,5 Go / an | 1 – 4 Go |
| Copies de millésimes BD TOPO, si on en garde | 2,3 Go par copie IDF | 0 – 9 Go |
| Ventes | 0,1 – 0,2 Go / an | 0,3 – 0,6 Go |
| **Total** | | **≈ 10 – 70 Go** |

**Réingestion** (anciennes et nouvelles données côte à côte jusqu'à la bascule) :

| Jeu | Place supplémentaire temporaire |
|---|---:|
| LiDAR **département par département** (le plus gros, le 77 : 16,75 Mo × 2 × 5 915) | **≈ 198 Go** |
| LiDAR **toute l'IDF d'un coup** | ≈ 402 – 427 Go |
| Dalles sources en cours d'import (lots de ≈ 300 dalles, effacées après chargement) | ≈ 10 Go |
| BD TOPO bâti IDF (table + index) | ≈ 2,5 Go |
| Cadastre IDF | ≈ 1,7 Go |
| Sitadel (CSV du millésime) | ≈ 1,3 Go |

**Sauvegardes** : `pg_dump -Fc` envoyé dans `wc -c` (rien n'est écrit sur le disque, MESURÉ,
`sauvegarde-taille.txt`) : **base complète 5 270 554 510 octets = 5,27 Go (46 % de la base), en 269 s** ; LiDAR
seul 27,5 Mo pour 33,5 Mo en base (**82 %** : les altitudes flottantes se compressent mal). ESTIMÉ pour l'IDF :
LiDAR ≈ 330 – 350 Go par sauvegarde complète ; **tout le reste ≈ 7 – 12 Go** (46 % de 16 à 26 Go). Si le LiDAR
est reconstructible par un pipeline d'import, la sauvegarde quotidienne l'exclut et ne pèse que 7 à 12 Go ; sinon
il faut sauvegarder ≈ 350 Go au moins une fois, hors du serveur. Une copie locale (deux dernières sauvegardes,
LiDAR exclu) : 15 – 25 Go.

**Autres réserves** : gonflement des tables, `VACUUM`, WAL, fichiers temporaires de tri : + 15 % de la base.
Système Ubuntu, application, build Next.js, journaux : ≈ 30 Go. Garder **20 à 30 % du disque libre** (PostgreSQL et
le système de fichiers se dégradent quand le disque est plein).

---

## 6. Recommandation

### 6.1 Disque

| Poste | Bas | Haut |
|---|---:|---:|
| Base IDF (§5.2) | 418 Go | 453 Go |
| Gonflement, WAL, temporaires (+15 %) | 63 Go | 68 Go |
| Réingestion LiDAR côte à côte | 198 Go (par département) | 427 Go (toute l'IDF) |
| Stockage objet (MinIO sur le même serveur) | 1 Go | 4 Go |
| Croissance 3 ans | 10 Go | 70 Go |
| Système, application, journaux | 30 Go | 30 Go |
| Sauvegarde locale (dernière copie, LiDAR exclu) | 15 Go | 25 Go |
| **Total au pire moment** | **≈ 735 Go** | **≈ 1 080 Go** |

**À commander : 2 disques NVMe identiques de 1,92 To en miroir (RAID 1)** → 1,92 To utiles. Au pire moment, le
disque est rempli à **≈ 38 à 56 %**, ce qui laisse la marge de 20 à 30 % libres. Un seul disque qui lâche ne coupe
rien.
- NVMe, et non SATA ni disque tournant : le verdict lit des tuiles dispersées et les bâtiments d'un couloir de
  200 m ; seul un disque rapide sert bien ces lectures quand elles ne sont pas en mémoire.
- **2 × 3,84 To** seulement si l'on veut garder les dalles sources du LiDAR sur le serveur, importer toute l'IDF
  d'un seul coup en gardant plusieurs millésimes, ou sortir de l'Île-de-France.

### 6.2 Mémoire : **64 Go**

ESTIMÉ à partir des mesures du §4 et du §5 :

| Besoin | Mémoire |
|---|---:|
| PostgreSQL `shared_buffers` (25 %) | 16 Go |
| Données vectorielles et index lus à chaque analyse (bâti 2,3 + cadastre 1,7 + BAN ≈ 1 + ventes 4 à 8 Go) | ≈ 9 – 13 Go, gardés en cache |
| Tuiles LiDAR des quartiers les plus testés (cache système) | le reste, ≈ 20 – 25 Go ≈ 600 à 750 km² de MNT + MNS |
| 8 analyses simultanées (≈ 350 Mo de processus PostgreSQL chacune, MESURÉ) | ≈ 3 Go |
| Next.js production, relève du courrier, veille, MinIO (§4.1) | ≈ 1,5 Go |
| Imports (`maintenance_work_mem` 2 Go pour l'index spatial de 3,6 M bâtiments) | 2 Go |
| Système | 2 Go |

- **32 Go** suffit pour démarrer : tout le vectoriel tient en mémoire, mais le cache LiDAR se réduit à ≈ 150 km² et
  plus d'analyses liront le disque.
- **128 Go n'est pas nécessaire** : l'IGN livre les MNT/MNS déjà calculés (§1.3), il n'y a pas de nuage de points à
  traiter sur le serveur.

### 6.3 Processeur : **8 à 12 cœurs**

- Une analyse = **un cœur pendant ≈ 0,17 s** sur M4 Pro (MESURÉ). Un cœur de serveur AMD EPYC / Intel Xeon est un
  peu moins rapide en mono-tâche : compter **≈ 0,2 à 0,3 s** (ESTIMÉ), plus la lecture disque d'un quartier froid.
- Le nombre de cœurs fixe le nombre d'analyses **simultanées**, pas la vitesse d'une analyse. 8 cœurs donnent
  ≈ 25 à 40 analyses par seconde, très au-delà du trafic attendu.
- Le vrai besoin de cœurs, ce sont les **imports** (12 000 dalles LiDAR, index spatiaux), parallélisables, à faire
  tourner sans ralentir le site : 8 cœurs minimum, 12 confortables.
- Au repos, toute l'application consomme ≈ 0,1 cœur en moyenne et moins de 1,5 cœur en pointe (§4.1).

### 6.4 Ce qui peut aller sur un stockage séparé

| Quoi | Où | Pourquoi |
|---|---|---|
| **Sauvegardes** de la base | Backup Storage du serveur dédié ou Object Storage OVH, **dans un autre datacenter** | une sauvegarde sur le même serveur ne protège pas d'une panne du serveur |
| Dalles sources LiDAR | **nulle part** (retéléchargeables chez l'IGN), ou Object Storage froid | jamais lues par l'application |
| Fichiers bruts Sitadel / BDNB | nulle part, ou Object Storage | relus seulement à l'import, retéléchargeables |
| Pièces jointes de la gestion | Google Drive (déjà décidé) | — |
| GED des permis, certificats, photos | **sur le serveur** (MinIO) ou Object Storage OVH compatible S3 | petits volumes ; l'application les lit via `S3_ENDPOINT`, les deux marchent |

### 6.5 Points à trancher (pas de décision prise ici)

1. **Pipeline d'import LiDAR** : aujourd'hui inexistant (chargé à la main). Sans lui, le serveur ne se remplit pas
   et le LiDAR n'est pas reconstructible : il faut alors le **sauvegarder**, ce qui fait passer la sauvegarde de
   quelques Go à ≈ 400 Go.
2. **LiDAR en base (retenu) ou hors base compressé** (−38 % mesuré sur le MNS, code du verdict à reprendre).
3. **Copies de millésimes BD TOPO** : combien en garder (0 à 9 Go par an).
4. **Miniatures des pièces** (167 Mo) : restent sur le serveur, ou suivent les pièces sur le Drive.

---

## 7. Limites de ce relevé

- Les durées du verdict sont **à chaud sur 1 km²** et sur un processeur Apple ; le comportement à froid sur 12 000
  km² n'est pas mesurable avant import.
- La compression sans perte n'a été mesurée que sur la **MNS** : l'export de la MNT depuis la base vers un fichier
  de test n'a pas abouti. Les fichiers `essai-compression/mnt-brut.tif` et `mnt-deflate.tif` du dossier de
  mesures sont **vides de données** et ne doivent pas être lus comme une mesure.
- Nombre d'adresses BAN, surface urbanisée, périmètre régional, volume annuel de ventes : chiffres EXTÉRIEURS.
- Aucun prix ni référence de machine OVH n'est donné : la gamme change souvent
  (<https://www.ovhcloud.com/fr/bare-metal/advance/>).

---

> **À demander à la conseillère OVH**
>
> 1. Un serveur Advance avec **64 Go de mémoire** et un processeur de **8 à 12 cœurs**, sous Ubuntu 24.04, en France.
> 2. **Deux disques NVMe identiques de 1,92 To montés en miroir (RAID 1)** : est-ce le RAID logiciel d'OVH, et
>    puis-je passer plus tard à 2 × 3,84 To ?
> 3. Un espace de **sauvegarde séparé du serveur** (Backup Storage ou Object Storage), dans un autre datacenter :
>    quelle taille est incluse et quel prix au-delà de 100 Go ?
> 4. La bande passante est-elle illimitée ? Il faudra télécharger environ 400 Go de cartes IGN au départ.
> 5. En cas de panne d'un disque, sous quel délai est-il remplacé, et le serveur reste-t-il en marche pendant ce temps ?
