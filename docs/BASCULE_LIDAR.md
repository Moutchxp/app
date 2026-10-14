# LiDAR HD sur le serveur — chargement et bascule sans perte

> Lot « IMPORT LiDAR HD — CERCLE DE 35 KM AUTOUR DE NOTRE-DAME », 14/10/2026. Décision d'Arno : MNS (toits) + MNT
> (terrain) 0,5 m sur un cercle de 35 km autour du parvis de Notre-Dame (lat 48.8530, lon 2.3499), marge 1 km (rayon
> effectif 36 km). **Le chargement réel se fait UNIQUEMENT sur le serveur OVH.** Sur le Mac, rien du LiDAR n'est chargé.

## 1. Ce qu'il y a en base aujourd'hui (mesuré)

| | |
|---|---|
| Tables | `mns_lidar_brut` (toits), `mnt_lidar_brut` (terrain) — colonnes `rid`, `rast` |
| Contenu | 64 tuiles chacune = 1 dalle IGN de 1 km² (Asnières, `LHD_FXX_0646_6868`) |
| Format | rasters DANS la base, SRID 2154, pixel 0,5 m, 1 bande Float32, nodata -9999, tuiles 256 × 256 px (208 px en bord : 2 000 = 7 × 256 + 208), grille IGN décalée d'un demi-pixel (coin 645999.75 / 6868000.25) |
| Index | GiST sur `st_convexhull(rast)` |
| Contraintes | celles d'`AddRasterConstraints` — dont **`enforce_max_extent_rast`, qui fige l'emprise sur Asnières** : migration 353 |
| Vides | `mns_bati_propre`, `rge_alti` (jamais lues par le moteur) |

Tout le moteur lit ces tables par `ST_Intersects(rast, …)` + `ST_Value` / `ST_Clip` / `ST_Union`, bande 1, en écartant
-9999 (`app/lib/db/hauteurLidar.ts`, `obstacles.ts`, `origine.ts`). Des dalles chargées au même format sont lues
exactement comme celle d'Asnières. **Preuve** : l'outil a réimporté la dalle d'Asnières (MNS depuis le fichier IGN
d'origine) dans une base jetable ; les 64 + 64 tuiles sont identiques octet pour octet à celles de la base du Mac (md5
de `ST_AsBinary` égal).

## 2. Charger le cercle (sur le serveur)

### Prérequis

1. Outils : `which raster2pgsql psql gdalinfo` (sur Ubuntu, `raster2pgsql` est livré par le paquet `postgis` — à
   vérifier sur la machine).
2. Appliquer la migration 353 (retire la seule contrainte qui bloquerait toute dalle hors d'Asnières) :
   `psql "$DATABASE_URL" -f db/migrations/353_lidar_emprise_libre.sql`
3. Une SOURCE de téléchargement explicite — l'outil ne devine aucune URL :
   - `--source-urls=<fichier.csv>` : une ligne `dalle;couche;url` par dalle et par couche (ex.
     `0646_6868;MNS;https://…`), tirée du catalogue de la Géoplateforme IGN ;
   - ou `--modele-url='https://…{X}…{Y}…{COUCHE}…'` si l'IGN expose un modèle d'adresse régulier (`{X}`, `{Y}` = km sur
     4 chiffres, `{COUCHE}` = `MNS` ou `MNT`).
   ⚠️ **La source officielle n'a pas pu être vérifiée pendant ce lot** (accès web refusé par le mode de permissions) :
   la fixer avant le premier `--charger`.

### Commandes

```bash
cd <dépôt>
npm run lidar:import                                   # --liste : aucune écriture, aucun téléchargement
npm run lidar:import -- --charger --source-urls=/srv/lidar/sources.csv --paralleles=4 --dossier=/srv/lidar/tmp
npm run lidar:import -- --verifier                     # dalles et tuiles par couche, trous et doublons
```

Mesuré sur la base du Mac (`--liste`) : **4 221 dalles** dans le cercle (le disque fait 4 072 km² ; les dalles de bord,
à peine effleurées, sont incluses), 1 présente (Asnières), **4 220 à charger, ≈ 141,4 Go en base** (16 752 640 octets
mesurés par dalle et par couche).

### Ce que garantit l'outil (`scripts/lidar-import.ts`, règles dans `app/lib/lidar/`)

- **Une dalle = une transaction** pour ses deux couches, avec verrou par dalle et contrôle « exactement 64 tuiles par
  couche » avant validation : une coupure ne laisse jamais une dalle à moitié (prouvé : outil tué pendant l'import →
  0 tuile).
- **Reprenable et idempotent** : une dalle présente (64 + 64 tuiles) est sautée ; relancer reprend où on en était.
- **Ne supprime jamais une dalle** ; une dalle incohérente (trou, doublon) est signalée, jamais touchée.
- **Intégrité** de chaque fichier (gdalinfo) : 2 000 × 2 000 px, géoréférencement exact de la dalle, Float32, nodata
  -9999, Lambert-93.
- Fichiers bruts effacés après import réussi ; fichiers `.part` d'une coupure effacés au lancement suivant.
- Journal : `<dossier>/lidar-import.journal.jsonl` (une ligne JSON par étape) + sortie standard.
- **Sur macOS, `--charger` refuse toute base autre que `lidar_jetable`.**

### Durée et volume estimés

| Poste | Estimation | Base |
|---|---|---|
| Téléchargement | ≈ 4 220 × 2 × 16 Mo ≈ 135 Go | MNS IGN mesuré à 16,0 Mo (MNT supposé identique, non vérifié) |
| Import | ≈ 1,5 s par dalle (deux couches) | mesuré sur le Mac, fichiers locaux |
| Disque | ≈ 141 Go en base + WAL pendant l'import ; dossier temporaire ≈ paralleles × 32 Mo | mesuré / estimé |
| Durée totale | **≈ 1 à 4 h** avec `--paralleles=4`, selon le débit IGN (non mesurable ici) | import ≈ 4 220 × 1,5 s / 4 ≈ 27 min ; le téléchargement domine |

Après le chargement : `VACUUM ANALYZE mns_lidar_brut, mnt_lidar_brut;` puis `npm run lidar:import -- --verifier` et le
golden (`npm run test:integration -- app/lib/db/pipeline.itest.ts`, 11/11 : la dalle d'Asnières n'est jamais touchée).

## 3. Bascule Mac → serveur sans écraser le LiDAR du serveur

Une fois le LiDAR chargé sur le serveur, une « copie fraîche » de la base du Mac NE DOIT PAS le remplacer.
`scripts/bascule-sans-lidar.sh` :

```bash
# Mac
scripts/bascule-sans-lidar.sh exporter  sansvisavis  /tmp/svav.dump     # données LiDAR exclues de l'export
# copie du fichier vers le serveur (à la main)
# Serveur
scripts/bascule-sans-lidar.sh essai     /srv/svav.dump  "$DATABASE_URL"  # liste ce qui sera écarté / restauré
scripts/bascule-sans-lidar.sh restaurer /srv/svav.dump  "$DATABASE_URL"
```

- Écartés de la restauration : les 4 tables LiDAR (`mns_lidar_brut`, `mnt_lidar_brut`, `mns_bati_propre`, `rge_alti`)
  avec leurs séquences, contraintes et index, les extensions et le schéma public (un `DROP EXTENSION postgis`
  emporterait les rasters). Le motif a été vérifié sur les 2 013 objets de la base du Mac : il retient tous les objets
  LiDAR et aucun autre.
- Restauration en UNE transaction (`--single-transaction --exit-on-error`) ; comptes LiDAR relevés avant / après, sortie
  en erreur s'ils diffèrent.
- ⚠️ Copie fraîche : hors LiDAR, chaque objet du fichier remplace celui du serveur.
- Éprouvé entre deux bases jetables : table métier remplacée par la version « Mac », LiDAR de la cible identique octet
  pour octet (192 tuiles, md5 égal).
