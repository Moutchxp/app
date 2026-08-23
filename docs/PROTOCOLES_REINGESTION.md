# Protocoles de réingestion des sources de données

Ce document est le mode d'emploi COMPLET pour remettre à jour, à la main, chaque source de données de
Sans Vis-à-Vis. Il est écrit pour être lu et exécuté SEUL, par une personne qui ne développe pas, même
dans six mois, sans aide extérieure.

À LIRE D'ABORD :

Chaque bloc de commande se colle dans l'application « Terminal » de macOS, dans une FENÊTRE NEUVE
(menu Shell puis Nouvelle fenêtre) — jamais dans un onglet où tourne déjà un serveur, jamais dans le
terminal d'un assistant. Les téléchargements utilisent « curl » (l'outil « wget » n'est pas installé sur
cette machine). Aucun bloc n'utilise « set -euo pipefail » : on lit la sortie et on s'arrête à la main si
une ligne échoue.

Les sources sont classées de la PLUS SÛRE à la PLUS RISQUÉE.

LANCER UNE PASSE DE DÉTECTION À LA MAIN, SANS AUCUN RISQUE D'ENVOI AUX MAIRIES :

La veille fait deux métiers dans le même moteur : les MAIRIES / PERMIS (relances, saisines, courriers)
et les SOURCES DE DONNÉES (détection des nouvelles éditions, ingestion, alerte). La commande ci-dessous
n'exécute QUE la famille « donnees » : détection + ingestion nocturne + alerte des sources. Elle
n'envoie JAMAIS un courrier à une mairie, quoi qu'il arrive. À coller dans l'application « Terminal » de
macOS, dans une FENÊTRE NEUVE :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run veille:run -- --famille=donnees
```

Pour ne relancer QUE le métier mairies/permis : « npm run veille:run -- --famille=mairies ». Sans
« --famille », la commande lance TOUT (comportement habituel de l'ordonnanceur).

Se relancent sans danger : le Cadastre est idempotent (un département déjà chargé pour un millésime est
ignoré, ni téléchargement ni doublon) ; Sitadel et PRADA remplacent proprement par mise à jour (rien
n'est supprimé de travers).

Suppriment avant de réimporter : DILA efface les lignes de SON millésime avant de les recharger (jamais
les autres millésimes), le tout dans une seule transaction, donc un échec en cours laisse l'ancien état
intact.

N'ont AUCUNE procédure reproductible aujourd'hui : BD TOPO paysage, BD TOPO adresse / BAN, LiDAR et BDNB
ont été chargées à la main, hors du dépôt. Leurs sections le disent en clair et ne proposent aucune
commande inventée.

Chaque section porte une ligne ESPACE DISQUE REQUIS avec le pic réel (téléchargement + espace de travail
temporaire + poids final), à vérifier AVANT de lancer : cette machine héberge en local sur un disque
limité.

<!-- SOURCE: cadastre -->
## Cadastre — parcelles

CE QUE ÇA APPORTE : les parcelles cadastrales servent à rattacher les permis de construire au bâti et à
situer les biens. Sans elles, le rapprochement permis / parcelle ne fonctionne pas.

CAS : (a) procédure complète et outillée. Le script télécharge tout seul depuis cadastre.data.gouv.fr.

RELANCE SANS DANGER : OUI. Idempotent — un couple (département, millésime) déjà chargé est ignoré. On peut
relancer la commande sans créer de doublon.

PRÉREQUIS : les outils « curl » et « ogr2ogr » (GDAL) installés ; le fichier « .env » présent à la racine
(il fournit DATABASE_URL). Trouver le dernier millésime disponible en ouvrant
https://cadastre.data.gouv.fr/data/etalab-cadastre/ (dossiers datés AAAA-MM-JJ, le plus récent en bas).

ESPACE DISQUE REQUIS : téléchargement d'environ 35 Mo par département (fichier .zip temporaire, supprimé
après chargement) ; poids final en base d'environ 496 Mo pour les quatre départements déjà présents. Pic
transitoire modeste (moins de 100 Mo).

Commande (Terminal macOS, fenêtre neuve — remplacer la date par le millésime voulu) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run cadastre:ingest -- --dep 75,78,92,93 --millesime 2026-06-01
```

VÉRIFICATION APRÈS : la commande suivante liste ce qui est chargé, par département et millésime.

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -c "SELECT departement, millesime, lignes_chargees, charge_le FROM cadastre_millesime ORDER BY departement, millesime;"
```

EN CAS D'ÉCHEC EN COURS DE ROUTE : relancer exactement la même commande. Les départements déjà chargés
sont sautés, l'ingestion reprend au premier département manquant.

<!-- SOURCE: prada -->
## PRADA — responsables d'accès aux documents administratifs

CE QUE ÇA APPORTE : l'annuaire des personnes responsables de l'accès aux documents (PRADA) sert aux
recours CADA quand une mairie ne répond pas à une demande de permis.

CAS : (a) procédure complète et outillée. Le script lit la page de l'annuaire CADA et télécharge le CSV.

RELANCE SANS DANGER : OUI. Mise à jour ligne par ligne ; la colonne de rattachement à une commune
(code_insee) n'est jamais écrasée.

PRÉREQUIS : le fichier « .env » présent ; un accès internet à www.cada.fr.

ESPACE DISQUE REQUIS : téléchargement négligeable (petit CSV) ; poids final en base d'environ 2 Mo.

Commande (Terminal macOS, fenêtre neuve) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run prada:ingest
```

Étape complémentaire (rapprocher l'annuaire avec les communes du périmètre) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run prada:rapprocher
```

VÉRIFICATION APRÈS :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -c "SELECT code, lignes_retenues, importe_le FROM prada_millesime ORDER BY importe_le DESC LIMIT 1;"
```

EN CAS D'ÉCHEC EN COURS DE ROUTE : relancer la commande. Si le millésime est déjà connu et qu'on veut
forcer une nouvelle ingestion, ajouter « -- --forcer » à la fin de « npm run prada:ingest ».

<!-- SOURCE: sitadel -->
## Sitadel — permis de construire

CE QUE ÇA APPORTE : la base ouverte des autorisations d'urbanisme alimente la veille des permis (nouveaux
projets qui pourraient créer un vis-à-vis). C'est la seule source déjà surveillée et réingérée
automatiquement toutes les 15 minutes ; la commande ci-dessous ne sert qu'à forcer une mise à jour tout de
suite.

CAS : (a) procédure complète et outillée. Le script détecte le dernier millésime publié et le télécharge.

RELANCE SANS DANGER : OUI. Mise à jour des dossiers (aucune suppression de travers).

PRÉREQUIS : le fichier « .env » présent ; un accès internet à data.statistiques.developpement-durable.gouv.fr.

ESPACE DISQUE REQUIS : téléchargement d'environ 880 Mo de fichiers CSV (conservés un temps puis purgés
automatiquement) ; poids final en base d'environ 12 Mo. Prévoir au moins 1 Go libre le temps du
téléchargement.

Commande (Terminal macOS, fenêtre neuve) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run sitadel:ingest
```

VÉRIFICATION APRÈS :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -c "SELECT code, telecharge_a, lignes_retenues FROM sitadel_millesime ORDER BY telecharge_a DESC LIMIT 1;"
```

EN CAS D'ÉCHEC EN COURS DE ROUTE : relancer la commande. Un garde-fou de complétude re-télécharge un CSV
tronqué ; les fichiers ne sont purgés qu'en cas de succès, donc une reprise ne repart pas de zéro
inutilement.

<!-- SOURCE: dila -->
## DILA — coordonnées des mairies

CE QUE ÇA APPORTE : l'annuaire de l'administration (DILA) fournit les coordonnées des mairies pour leur
envoyer les demandes de communication de permis.

CAS : (a) procédure complète et outillée, mais DESTRUCTIVE PAR REMPLACEMENT (voir ci-dessous).

RELANCE SANS DANGER : PARTIELLEMENT. L'ingestion EFFACE les lignes du millésime en cours de chargement puis
les recharge (elle ne touche jamais les autres millésimes), le tout dans une seule transaction : si le
chargement échoue, la base revient à l'état d'avant. Les corrections manuelles de contacts vivent dans une
autre table (mairie_contact) et ne sont pas touchées.

PRÉREQUIS : le fichier « .env » présent ; un accès internet. L'adresse de téléchargement est lue dans la
configuration (config_veille.dila_url), sinon la variable d'environnement DILA_URL, sinon une valeur par
défaut interne.

ESPACE DISQUE REQUIS : téléchargement d'environ 360 Mo (fichier all_latest.tar.bz2, temporaire) ; poids
final en base d'environ 2 Mo. Prévoir au moins 500 Mo libres le temps du téléchargement.

Commande (Terminal macOS, fenêtre neuve) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run dila:ingest
```

VÉRIFICATION APRÈS :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -c "SELECT code, date_fichier, nb_enregistrements, importe_le FROM dila_millesime ORDER BY importe_le DESC LIMIT 1;"
```

EN CAS D'ÉCHEC EN COURS DE ROUTE : sans danger. Le remplacement se fait dans une transaction ; un échec
annule tout et laisse l'ancien millésime intact. Relancer la commande. Pour forcer la ré-ingestion d'un
millésime déjà connu, ajouter « -- --forcer ».

<!-- SOURCE: bdtopo_bati -->
## BD TOPO bâtiment

AVERTISSEMENT — CE N'EST PAS UNE ROUTINE, C'EST UN CHANTIER ACCOMPAGNÉ. La bascule qui remplace la table
« batiment » par une nouvelle édition est une migration écrite pour l'édition 2026-06-15 précise
(121_batiment_bascule_juin_2026.sql). Pour toute édition suivante, cette migration doit être RÉÉCRITE (elle
renomme des index, une séquence et gère un piège de vue propres à cette bascule). De plus, « batiment » est
la table LUE PAR LE MOTEUR DE VERDICT : la remplacer change les altitudes, donc impose de RECALCULER le
golden d'Asnières (valeur scellée 29.107259068449615) puis de le RESCELLER dans un commit SÉPARÉ. Ne pas
lancer cette bascule seul sans accompagnement.

CE QUE ÇA APPORTE : les emprises et hauteurs des bâtiments (via le MNS pour le verdict, et comme détecteur
de changement). C'est la plus grosse source de la base.

CAS : (b) procédure partielle. Le CHARGEMENT dans une table neuve est outillé (script) ; la BASCULE vers la
table de production et le rescellage du golden ne le sont pas de façon générique.

RELANCE SANS DANGER : le chargement OUI (idempotent, il n'écrit que dans une table neuve). La bascule NON
(opération unique, édition-spécifique, avec recalcul du golden).

PRÉREQUIS : les outils « curl », « 7z » (p7zip) et « ogr2ogr » (GDAL) installés ; la migration 120
appliquée ; le fichier « .env » présent. Vérifier le dernier millésime en ouvrant l'index de diffusion IGN
(chercher BD TOPO GPKG Lambert-93, département D092).

ESPACE DISQUE REQUIS : environ 5 Go d'espace de travail temporaire (un fichier .7z d'environ 230 Mo par
département + un GPKG extrait d'environ 2 à 3 Go, nettoyés après chaque département). Pendant la bascule, la
table neuve (environ 1,9 Go) coexiste un moment avec l'ancienne : prévoir plusieurs Go libres en plus du
poids final (environ 2,55 Go).

Étape 1 — charger la nouvelle édition dans une table neuve (Terminal macOS, fenêtre neuve — remplacer la
date par l'édition voulue) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
npm run bdtopo:import -- --dep 92,75,78,93,94,77 --edition 2026-06-15
```

Étape 2 — la bascule vers « batiment » + le rescellage du golden : NE PAS improviser. Réécrire une migration
sur le modèle de db/migrations/121_batiment_bascule_juin_2026.sql pour la nouvelle édition, l'appliquer avec
psql, puis recalculer et resceller le golden dans un commit séparé. Cette étape est un chantier accompagné.

VÉRIFICATION APRÈS le chargement (étape 1) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -c "SELECT millesime, departement, nb_objets, chargee_le, courante FROM bdtopo_edition ORDER BY chargee_le DESC LIMIT 8;"
```

EN CAS D'ÉCHEC EN COURS DE ROUTE : le chargement (étape 1) est reprenable — relancer la même commande, les
bâtiments déjà présents (par identifiant cleabs) sont sautés. La bascule (étape 2) est atomique
(transaction) : un échec annule tout et laisse « batiment » inchangé ; ne pas relancer la bascule sans
vérifier l'état de la base.

<!-- SOURCE: patrimoine -->
## Patrimoine / monuments

CE QUE ÇA APPORTE : les monuments (historiques, emblématiques, patrimoine mondial) et l'inventaire général
servent à un badge « bâti patrimonial » d'affichage. Ces tables n'entrent JAMAIS dans le verdict ni dans le
score.

CAS : (b) procédure partielle. Des scripts SQL auto-contenus existent, mais se lancent à la main avec psql
(pas de commande npm).

RELANCE SANS DANGER : OUI. Les scripts suivent un modèle « manuel prioritaire, jamais écrasé au ré-import ».

PRÉREQUIS : « psql » installé ; le fichier « .env » présent.

ESPACE DISQUE REQUIS : négligeable (données déjà dans les scripts) ; poids final en base d'environ 2 Mo.

Commande (Terminal macOS, fenêtre neuve) :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -f scripts/migration_monuments_emblematiques.sql
psql "$DATABASE_URL" -f scripts/import_inventaire_ia92.sql
```

VÉRIFICATION APRÈS :

```bash
cd /Users/macbookprom4arnaud/sansvisavis/app
set -a && source .env && set +a
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM monuments_emblematiques) AS emblematiques, (SELECT count(*) FROM inventaire_general) AS inventaire;"
```

EN CAS D'ÉCHEC EN COURS DE ROUTE : relancer le script concerné. Le modèle « manuel prioritaire » ne détruit
pas les corrections faites à la main.

<!-- SOURCE: bdtopo_paysage -->
## BD TOPO paysage (végétation et hydrographie)

DONNÉES IRREPRODUCTIBLES AUJOURD'HUI. Ces couches (végétation, cours et plans d'eau) ont été chargées à la
main, hors du dépôt, sans script conservé. Personne ne sait les recharger en l'état à ce jour.

CONSÉQUENCE : en cas de perte de la base ou de migration du serveur, ces données ne sont pas rechargeables
telles quelles. Elles seraient à reconstituer depuis zéro.

CAS : (c) aucune procédure connue.

ESPACE DISQUE REQUIS : sans objet (aucune procédure) ; poids actuel en base d'environ 18 Mo.

CE QU'IL FAUDRAIT POUR LA RENDRE REPRODUCTIBLE : un script d'import dédié, sur le modèle de bdtopo:import,
qui charge les couches de végétation et d'hydrographie du même paquet GPKG « TOUSTHEMES » de la BD TOPO,
avec le millésime tracé.

<!-- SOURCE: bdtopo_adresse -->
## BD TOPO adresse / BAN

DONNÉES IRREPRODUCTIBLES AUJOURD'HUI. La table des adresses (adresse_ban) a été chargée à la main, hors du
dépôt : le script d'import BD TOPO ne charge que la couche des bâtiments, pas celle des adresses. Personne
ne sait la rafraîchir en l'état à ce jour.

CONSÉQUENCE : en cas de perte de la base ou de migration du serveur, les adresses ne sont pas rechargeables
telles quelles ; le géocodage des adresses saisies en dépendrait.

CAS : (c) aucune procédure connue.

ESPACE DISQUE REQUIS : sans objet (aucune procédure) ; poids actuel en base d'environ 196 Mo.

CE QU'IL FAUDRAIT POUR LA RENDRE REPRODUCTIBLE : étendre le script bdtopo:import à la couche « adresse » du
paquet GPKG « TOUSTHEMES », ou écrire un script d'import dédié à la Base Adresse Nationale, avec le
millésime tracé.

<!-- SOURCE: lidar -->
## LiDAR HD

DONNÉES IRREPRODUCTIBLES AUJOURD'HUI. Les dalles altimétriques (terrain et toits) ont été rasterisées et
chargées à la main, hors du dépôt (via raster2pgsql). Aucun script ne les importe ; l'outil du dépôt ne
fait que LIRE les rasters existants.

CONSÉQUENCE — LA PLUS GRAVE : le LiDAR est la SEULE source qui entre dans le verdict. En cas de perte de la
base ou de migration du serveur, ces données ne sont pas rechargeables en l'état, et AUCUN certificat ne
pourrait plus être produit tant qu'elles ne sont pas reconstituées.

CAS : (c) aucune procédure connue.

ESPACE DISQUE REQUIS : sans objet (aucune procédure) ; poids actuel en base d'environ 32 Mo (couverture
limitée à 1 km² au-dessus d'Asnières).

CE QU'IL FAUDRAIT POUR LA RENDRE REPRODUCTIBLE : un pipeline documenté qui télécharge les dalles LiDAR HD de
l'IGN (nuages de points .copc.laz), les rasterise (raster2pgsql) et les charge, en conservant la
nomenclature des dalles (bloc et année de vol) pour graver un millésime.

<!-- SOURCE: bdnb -->
## BDNB — année de construction

DONNÉES IRREPRODUCTIBLES AUJOURD'HUI. La table de l'année de construction (bdnb_annee_batiment) a été
chargée à la main, hors du dépôt, depuis un export de la Base de Données Nationale des Bâtiments. Aucun
script ne la recharge.

CONSÉQUENCE : en cas de perte de la base ou de migration du serveur, ces données ne sont pas rechargeables
telles quelles ; le barème par époque de construction en dépendrait.

CAS : (c) aucune procédure connue.

ESPACE DISQUE REQUIS : sans objet (aucune procédure) ; poids actuel en base d'environ 22 Mo.

CE QU'IL FAUDRAIT POUR LA RENDRE REPRODUCTIBLE : un script d'import depuis l'export ouvert de la BDNB
(data.gouv.fr), limité à l'année de construction, avec le millésime tracé (celui déjà en base était
2026-02.a).
