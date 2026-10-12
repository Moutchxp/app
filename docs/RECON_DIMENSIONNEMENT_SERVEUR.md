# RECON — Dimensionner un serveur OVH pour toute l'application, sur toute l'Île-de-France

> Lot RECON-DIMENSIONNEMENT-SERVEUR-OVH — 12/10/2026. **Lecture seule** : requêtes SQL de taille et de comptage,
> `du` sur les dossiers. Aucune écriture, aucun téléchargement. Mesures brutes : `.captures/recon-serveur/`
> (`tables-top40.txt`, `groupes.txt`, `disque.txt`).
>
> Règle de lecture : **« mesuré »** = lu sur la machine ou dans la base aujourd'hui ; **« estimé »** = calcul
> dont la règle est donnée ; **« ordre de grandeur »** = chiffre extérieur non vérifiable ici, à confirmer.

---

## 0. Synthèse

| Jeu de données | Couverture actuelle (mesurée) | Volume actuel | Règle d'extrapolation | Île-de-France (8 dép.) |
|---|---|---:|---|---:|
| Bâti BD TOPO (`batiment`) | **déjà les 8 départements** (3,6 M bâtiments) | 2,3 Go | inchangé | 2,3 Go |
| Copies de millésimes BD TOPO (4 tables) | Paris + petite couronne (≈ 0,7 M) | 0,75 Go | × 5,2 (bâtiments IDF / bâtiments copiés) si on garde des copies IDF | 2,3 Go **par copie** |
| **LiDAR MNT + MNS 50 cm** | **1 km²** (Asnières) | 32 Mo | **16 Mo par km² et par couche** × 12 012 km² × 2 couches | **≈ 384 Go** |
| LiDAR brut (nuages `.copc.laz`) | aucun sur le poste | 0 | 100 à 300 Mo par km² (ordre de grandeur) × 12 012 km² | **≈ 1,2 à 3,6 To** |
| Cadastre (`parcelle`) | **déjà les 8 départements** (3,7 M parcelles) | 1,6 Go | inchangé | 1,6 Go |
| BAN (`adresse_ban`) | 7 départements, **partiels** (0,56 M adresses ; 77 absent) | 0,2 Go | par adresse : ≈ 2,2 à 2,5 M adresses en IDF (ordre de grandeur) | ≈ 0,8 à 0,9 Go |
| Communes | 5 départements (75, 78, 92, 93, 94) | 1,6 Mo | par commune (1 265 en IDF) | < 10 Mo |
| Sitadel / permis / CRPA (base) | **déjà les 8 départements** (72 234 dossiers Sitadel) | 0,16 Go | inchangé | 0,16 Go |
| Sitadel (fichiers bruts `data/sitadel`) | 8 départements | 1,2 Go | inchangé | 1,2 Go |
| GED des permis (MinIO `dossiers/`) | 365 fichiers | 0,54 Go | ≈ 1,5 Mo par fichier × nombre de dossiers obtenus | 0,5 Go + croissance |
| BDNB (année de construction) | 191 262 bâtiments | 22 Mo | par bâtiment (× 19) | ≈ 0,4 Go |
| Mails de la gestion (`gestion_message`) | — (non géographique) | 5,6 Go | inchangé | 5,6 Go |
| Gestion hors mails (rattachements, journal, Drive…) | — | 0,36 Go | inchangé | 0,36 Go |
| Pièces jointes de la gestion | — | 14 Go (dont 13 Go sur le Drive) | inchangé | 14 Go si le serveur les garde |
| Autres objets (internautes, demandes, brouillons, miniatures) | — | 0,36 Go | inchangé | 0,36 Go |
| **Total scénario (a) — LiDAR calculé seulement** | | **≈ 26 Go** | | **≈ 415 Go** |
| **Total scénario (b) — LiDAR brut conservé en plus** | | | | **≈ 1,6 à 4 To** |

**Ce qui fait la taille du serveur, c'est le LiDAR, et lui seul.** Tout le reste tient en moins de 35 Go.

### Les deux propositions (détail au §3)

| | **Juste suffisant** | **Confortable pour 3 ans** |
|---|---|---|
| Processeur | 6 à 8 cœurs récents | 8 à 12 cœurs |
| Mémoire | 32 Go | 64 Go (128 Go si LiDAR brut traité sur place) |
| Disque rapide (NVMe, RAID 1) | 2 × 1,92 To | 2 × 3,84 To |
| Disque économique | aucun (sauvegardes hors du serveur) | 2 × 8 à 16 To HDD (RAID 1) pour le LiDAR brut et les sauvegardes locales |
| Sauvegardes | hors serveur (stockage objet OVH ou Backup Storage) | idem, plus une copie locale sur HDD |
| Exemple OVH | dédié **Advance** d'entrée de gamme | dédié **Advance** milieu/haut de gamme, ou **Scale** |

Les prix et les configurations exactes changent souvent : voir
<https://www.ovhcloud.com/fr/bare-metal/advance/> et <https://www.ovhcloud.com/fr/bare-metal/scale/>.

---

## 1. Mesure de l'existant

### 1.1 Base PostgreSQL

PostgreSQL **17.10** (Homebrew), extensions `postgis 3.6.4`, `postgis_raster 3.6.4`, `postgis_topology`, `pg_trgm`,
`unaccent`. **Taille de la base : 11 Go** ; répertoire de données sur disque 11 Go, dont 80 Mo de journaux (WAL).

**Par usage** (tables + index) :

| Usage | Tables | Données | Index | Total |
|---|---:|---:|---:|---:|
| Bâti BD TOPO (dont 4 copies de millésimes) | 9 | 2 403 Mo | 549 Mo | **2 952 Mo** |
| LiDAR (MNT + MNS, `rge_alti` vide) | 3 | 32 Mo | 64 ko | **32 Mo** |
| Cadastre | 2 | 1 181 Mo | 406 Mo | **1 587 Mo** |
| BAN | 1 | 161 Mo | 35 Mo | **196 Mo** |
| Sitadel / permis / CRPA / veille | 53 | 112 Mo | 47 Mo | **159 Mo** |
| Mails de la gestion | 1 | 5 531 Mo | 62 Mo | **5 593 Mo** |
| Gestion hors mails | 75 | 240 Mo | 123 Mo | **362 Mo** |
| BDNB | 1 | 13 Mo | 9 Mo | **22 Mo** |
| Autres | 75 | 12 Mo | 3 Mo | **15 Mo** |

**Les 30 plus grosses tables** :

| Table | Usage | Lignes (≈) | Données | Index |
|---|---|---:|---:|---:|
| gestion_message | mails | 57 610 | 5 531 Mo | 62 Mo |
| batiment | BD TOPO | 3 602 051 | 1 799 Mo | 401 Mo |
| parcelle | cadastre | 3 717 905 | 1 181 Mo | 405 Mo |
| batiment_2026_03_15 | BD TOPO (copie) | 697 886 | 382 Mo | 77 Mo |
| adresse_ban | BAN | 557 710 | 161 Mo | 35 Mo |
| batiment_edition_fige | BD TOPO (copie) | 697 886 | 97 Mo | 39 Mo |
| gestion_rattachement | gestion | 172 413 | 71 Mo | 23 Mo |
| gestion_drive_empreinte | gestion | 202 356 | 57 Mo | 33 Mo |
| bdtopo_next_batiment | BD TOPO (copie) | 697 363 | 62 Mo | 15 Mo |
| permis_bati_snapshot | permis | 136 050 | 55 Mo | 19 Mo |
| stg_etat_juin | BD TOPO (copie) | 697 363 | 46 Mo | 15 Mo |
| gestion_message_adresse | gestion | 139 683 | 28 Mo | 20 Mo |
| permis_parcelle | permis | 36 453 | 20 Mo | 8,5 Mo |
| sitadel_dossier | Sitadel | 72 234 | 14 Mo | 14 Mo |
| gestion_piece | gestion | 27 130 | 19 Mo | 4 Mo |
| bdnb_annee_batiment | BDNB | 191 262 | 13 Mo | 9 Mo |
| bdtopo_vegetation | BD TOPO | 19 171 | 16 Mo | 1,3 Mo |
| permis_empreinte | permis | 28 098 | 14 Mo | 2 Mo |
| mnt_lidar_brut | LiDAR | 64 tuiles | 16 Mo | 24 ko |
| mns_lidar_brut | LiDAR | 64 tuiles | 16 Mo | 24 ko |
| gestion_rattachement_examen | gestion | 57 185 | 9 Mo | 6,6 Mo |
| gestion_journal | gestion | 43 141 | 9 Mo | 6 Mo |
| gestion_piece_drive | gestion | 26 555 | 9 Mo | 5,6 Mo |
| gestion_drive_production | gestion | 30 662 | 7,5 Mo | 5,4 Mo |
| gestion_fil | gestion | 36 221 | 6,6 Mo | 5,3 Mo |
| gestion_piece_vidage | gestion | 25 183 | 7,3 Mo | 2,3 Mo |
| spatial_ref_sys | PostGIS | 8 500 | 6,9 Mo | 0,2 Mo |
| gestion_piece_proposition | gestion | 24 323 | 4,2 Mo | 2,5 Mo |
| gestion_releve_run | gestion | 16 469 | 3,8 Mo | 2 Mo |
| gestion_fil_periode_bien | gestion | 23 815 | 2,9 Mo | 0,8 Mo |

Dans les mails, **5,2 Go sont le HTML des messages** (52 Mo de texte brut) : c'est ce qui pèse, pas le nombre.

### 1.2 Données hors base

| Emplacement | Contenu | Taille |
|---|---|---:|
| `app/.minio/data/svav-dev/gestion/messages` | pièces jointes récentes de la gestion (les anciennes sont sur le Drive) | 972 Mo |
| `…/gestion/miniatures` | vignettes des pièces | 213 Mo |
| `…/gestion/brouillons` | pièces des brouillons | 45 Mo |
| `…/dossiers` | **GED des permis** (365 fichiers) | 538 Mo |
| `…/demandes` | demandes CRPA | 57 Mo |
| `…/internautes` | photos et fichiers des internautes | 44 Mo |
| `app/data/sitadel` | fichiers Sitadel bruts | 1,2 Go |
| `app/data/bdnb` | export BDNB | 270 Mo |
| `app/data/parcs_jardins`, `commune`, `prada`, `mairie` | petits référentiels | 6 Mo |
| Drive (« 00 Arrivée des mails ») | pièces jointes anciennes de la gestion (voir `RECON_PJ_DRIVE.md`) | 13 Go |
| `$DILA_DIR` (défaut : dossier temporaire) | travail d'ingestion DILA, éphémère | — |
| `.next` | cache de développement, **non nécessaire en production** | 5,2 Go |
| `node_modules` | dépendances | 678 Mo |

Variables d'environnement lues par le code qui désignent un lieu de données : `DATABASE_URL`, `S3_*` (stockage
objet), `DILA_DIR`, les clés Google (Drive, Gmail). Aucune autre racine de fichiers n'est lue par l'application.
Les dossiers `../altitudes`, `../batiments`, `../cadastre` à côté du dépôt sont **vides**.

### 1.3 Le LiDAR : ce que l'application lit vraiment

- **Elle ne lit jamais les nuages de points bruts.** Elle lit deux rasters **calculés à l'avance**, en base :
  `mnt_lidar_brut` (terrain) et `mns_lidar_brut` (toits), type PostGIS `raster`, **résolution 0,5 m**, stockés
  **dans la base** (pas de fichier externe), tuiles de 256 × 256 px (64 tuiles pour 1 km²) —
  `app/lib/db/hauteurLidar.ts`, `obstacles.ts`, `origine.ts`.
- **Couverture : 1 km²** (emprise L93 646 000–647 000 × 6 867 000–6 868 000, Asnières, la dalle du golden).
  Partout ailleurs, le verdict est **INDÉTERMINÉ** : aujourd'hui, l'application ne certifie **que là**.
- **Poids mesuré : 16 Mo par km² et par couche** (2 000 × 2 000 pixels × 4 octets).
- `docs/PROTOCOLES_REINGESTION.md` le dit déjà : ces rasters ont été chargés **à la main** (raster2pgsql) et
  **aucun script ne les recharge**. Couvrir l'Île-de-France demande d'abord d'écrire ce pipeline.

### 1.4 Couverture par département (mesurée)

| Jeu | 75 | 77 | 78 | 91 | 92 | 93 | 94 | 95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Bâtiments (sondage 1 %, ×100) | 104 k | 788 k | 522 k | 550 k | 215 k | 382 k | 310 k | 420 k |
| Parcelles | 78 k | 1 270 k | 670 k | 583 k | 162 k | 233 k | 213 k | 508 k |
| Adresses BAN | 120 k | **0** | 73 k | 43 k | 169 k | 36 k | 42 k | 74 k |
| Dossiers Sitadel | 4,7 k | 16,4 k | 11,9 k | 10,6 k | 5,9 k | 7,9 k | 6,9 k | 8,0 k |
| Communes | 1 | — | 259 | — | 36 | 39 | 47 | — |
| LiDAR | — | — | — | — | 1 km² | — | — | — |

Surfaces (référence) : Île-de-France **12 012 km²** — Paris 105, Hauts-de-Seine 176, Seine-Saint-Denis 237,
Val-de-Marne 245 (mesurées sur la table `commune`), Yvelines 2 306 (mesuré) ; Seine-et-Marne ≈ 5 900, Essonne
≈ 1 800, Val-d'Oise ≈ 1 250 (ordre de grandeur, absents de la table `commune`).

---

## 2. Extrapolation à toute l'Île-de-France

### 2.1 LiDAR — deux scénarios

| Scénario | Règle | Résultat |
|---|---|---:|
| **(a) rasters calculés seulement**, comme aujourd'hui (MNT + MNS 0,5 m, float32, en base) | 16 Mo × 2 couches × 12 012 km² | **≈ 384 Go** |
| (a') même chose, zone urbanisée seulement (unité urbaine de Paris ≈ 2 850 km², ordre de grandeur) | 16 Mo × 2 × 2 850 | ≈ 91 Go |
| (a'') rasters IDF stockés hors base en GeoTIFF compressé (COG, deflate) | ≈ 40 à 60 % du brut (ordre de grandeur) | ≈ 150 à 230 Go |
| **(b) LiDAR brut conservé en plus** (nuages `.copc.laz` IGN, ≈ 10 points/m²) | 100 à 300 Mo par dalle d'1 km² (ordre de grandeur) × 12 012 | **≈ 1,2 à 3,6 To** |

Le scénario (b) ne sert qu'à **refaire** les rasters (nouveau nettoyage, nouveau calcul) : l'application, elle,
ne s'en sert jamais. Il peut vivre sur un disque lent, ou ne pas vivre sur le serveur du tout (l'IGN le garde
en téléchargement libre).

### 2.2 Tout le reste

Bâti, cadastre et Sitadel sont **déjà complets** sur les 8 départements : leur volume ne bouge pas. Seuls la BAN
(77 manquant, autres partiels), les communes, la BDNB et le LiDAR doivent être complétés. Les mails, pièces et
GED ne dépendent pas du territoire.

### 2.3 Croissance annuelle estimée

| Poste | Règle | Par an |
|---|---|---:|
| Mails de la gestion | mesuré oct. 2025 → sept. 2026 : 3,7 Go | ≈ 3 à 4 Go |
| Pièces jointes de la gestion | mesuré oct. 2025 → sept. 2026 : 9,0 Go (rythme récent plus bas, 0,4–0,6 Go/mois) | ≈ 5 à 9 Go |
| GED des permis | ≈ 1,5 Mo par fichier ; rythme d'obtention à préciser | ≈ 0,5 à 2 Go |
| Sitadel | ≈ 6 000 dossiers IDF par an (mesuré : 6 063 en 2025) ; fichiers bruts par millésime | < 1,5 Go |
| BD TOPO | chaque copie de millésime IDF garde ≈ 2,3 Go ; 4 éditions par an | 0 à 9 Go selon le nombre de copies gardées |
| LiDAR | nouveau vol IGN tous les quelques ans ; remplacement = **doublement temporaire** pendant l'import | 0, avec un pic de + 384 Go |
| **Total courant (hors pic LiDAR)** | | **≈ 10 à 25 Go par an** |

---

## 3. Besoins serveur

### 3.1 Disque

| Poste | Scénario (a) |
|---|---:|
| Base IDF (dont LiDAR 384 Go) | ≈ 400 Go |
| Fichiers (pièces, GED, Sitadel, BDNB, objets) | ≈ 20 Go |
| Application, système, journaux | ≈ 30 Go |
| **Doublement temporaire** à l'import d'un nouveau LiDAR (ou d'un millésime BD TOPO) | + ≈ 400 Go |
| Index, gonflement des tables, `VACUUM`, WAL | + 10 à 20 % |
| Croissance 3 ans | + 30 à 75 Go |
| **Besoin NVMe** | **≈ 0,9 à 1,0 To utiles** — d'où 2 × 1,92 To en RAID 1 pour avoir de la marge |
| Sauvegardes (`pg_dump` compressé ≈ 50 % des rasters + le reste) | ≈ 200 à 250 Go par sauvegarde complète, **hors du serveur** |
| Scénario (b) en plus : LiDAR brut | 1,2 à 3,6 To sur **HDD** (ou laissé chez l'IGN) |

La base va sur **NVMe** : le verdict lit, pour chaque point, quelques dizaines de tuiles raster et les bâtiments
d'un couloir de 200 m — des lectures dispersées que seul un disque rapide sert bien. Le LiDAR brut et les
sauvegardes locales peuvent aller sur **HDD**.

### 3.2 Mémoire

- Ce qu'on lit souvent : bâtiments + parcelles + BAN + leurs index ≈ **6 Go** ; le LiDAR est lu **par petites
  zones** autour de chaque logement testé, jamais en entier.
- **32 Go** : `shared_buffers` 8 Go, cache système ≈ 20 Go — assez pour garder bâti, cadastre et index en mémoire,
  plus l'application Next.js (1 à 2 Go) et la relève mail.
- **64 Go** : garde en mémoire, en plus, les tuiles LiDAR des zones les plus testées et laisse de la place aux
  imports (`maintenance_work_mem` 2 Go pour reconstruire un index spatial de 3,6 M bâtiments).
- 128 Go seulement si l'on **rasterise le LiDAR brut sur le serveur** (outils type PDAL, gourmands).
- ⚠️ Constat à corriger au déploiement : la base locale tourne avec les réglages par défaut
  (`shared_buffers` 128 Mo, `work_mem` 4 Mo, `maintenance_work_mem` 64 Mo).

### 3.3 Processeur

- **Verdict** : une analyse = quelques requêtes PostGIS (61 faisceaux, profil LiDAR) ; elle tient sur un cœur.
  Le nombre de cœurs fixe donc le nombre d'analyses **simultanées**, pas la vitesse d'une analyse. Temps unitaire
  non mesuré dans ce lot (lecture seule, aucun calcul lancé).
- **Relève mail et gestion** : en continu, légère (réseau Gmail/Drive surtout).
- **Imports** : le plus gourmand — chargement de 12 000 dalles LiDAR, reconstruction des index spatiaux d'un
  millésime BD TOPO. Parallélisable : 8 cœurs divisent le temps d'import d'autant.
- **Recommandation** : 6 à 8 cœurs suffisent ; 8 à 12 donnent de l'aise pour importer sans ralentir le site.
  (Référence : le Mac de l'agence a 12 cœurs Apple M4 Pro et 24 Go de mémoire.)

### 3.4 Les deux propositions

**① Juste suffisant — scénario (a), LiDAR calculé seulement**

- 6 à 8 cœurs, 32 Go de mémoire, **2 × 1,92 To NVMe en RAID 1**.
- Sauvegardes **hors du serveur** (stockage objet OVH ou « Backup Storage » du dédié).
- Exemple OVH : un serveur dédié de la gamme **Advance** d'entrée (processeur AMD EPYC ou Intel Xeon récent,
  6 à 8 cœurs), avec l'option de disques NVMe 1,92 To.
- Limite : un nouveau vol LiDAR IDF remplit le disque pendant l'import ; il faudra importer par département.

**② Confortable pour 3 ans — scénario (a), (b) possible**

- 8 à 12 cœurs, 64 Go de mémoire (128 Go si l'on rasterise le LiDAR brut sur place),
  **2 × 3,84 To NVMe en RAID 1** pour la base, **+ 2 × 8 à 16 To HDD en RAID 1** pour le LiDAR brut et une
  sauvegarde locale.
- Sauvegardes hors serveur en plus de la copie locale.
- Exemple OVH : gamme **Advance** milieu ou haut de gamme, ou **Scale** si l'on veut 128 Go et plus de cœurs.

Configurations et prix : <https://www.ovhcloud.com/fr/bare-metal/advance/>,
<https://www.ovhcloud.com/fr/bare-metal/scale/>, stockage objet : <https://www.ovhcloud.com/fr/public-cloud/object-storage/>.
Un **VPS** n'est pas adapté : le LiDAR IDF dépasse les disques proposés.

---

## 4. Points à trancher

1. **LiDAR : toute l'IDF (≈ 384 Go) ou la zone urbanisée d'abord (≈ 91 Go) ?** Le second permet la machine ① sans
   souci de place.
2. **Garder le LiDAR brut sur le serveur ?** Recommandé : non — il reste téléchargeable chez l'IGN ; on ne garde
   que les rasters calculés.
3. **Rasters en base (comme aujourd'hui) ou en fichiers compressés hors base ?** Hors base divise le volume par
   ≈ 2 mais change le code de lecture (chantier à part, invariants LiDAR à préserver).
4. **Pièces jointes de la gestion : sur le serveur (+ 14 Go, + 5 à 9 Go/an) ou sur le Drive** (voir
   `RECON_PJ_DRIVE.md`) ? Sans effet sur le choix de la machine.
5. **Préalable obligatoire** : écrire le pipeline de chargement LiDAR (aujourd'hui inexistant, chargé à la main) et
   l'import BAN/BDNB, sans quoi le serveur ne peut pas être rempli.
