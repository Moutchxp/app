# Racine propriétaire, bouton Drive des biens, rattrapage des ajouts tardifs (19/10/2026)

> **Suite du rangement (commit ffb8affc).** Les étapes A, B et C ont été faites en réel par Arno (266 dossiers copiés dans
> « Actifs », 90 dans « Inactifs », 7 laissés en place, 237 fiches repointées sur le serveur et en recette, C = 0 écart). L'étape
> D (corbeille) est suspendue jusqu'à la fin de ce lot.
>
> **Rien n'a été exécuté par Claude dans ce lot.** Aucune écriture dans le Drive, sur le serveur, ni dans les bases de
> développement et de recette : des GET sur le Drive, des lectures (transactions READ ONLY) en recette. La migration 388 a été
> jouée deux fois dans une transaction **annulée** (développement, recette), et le chemin réel du repointage éprouvé sur une
> base jetable `svav_test_racines`, créée puis supprimée (§5.3).
>
> **Les scripts** : dans `.captures/rangement/`, non versionnés. C'est Arno qui lance les étapes réelles.
>
> **Aucun nom de client ici** : les propriétaires sont désignés A à F.

Empreinte (a) de référence de « Documents clients scannés » : `b04d648e2fa542597e7811b9859e8e7ff476e863d3b2de7c8ea9343c881fd875`
(36 706 éléments), passée par Arno à chaque étape réelle avec `--empreinte-attendue=…`.

## 0. Le constat et la règle

- **Constat d'Arno en production** : la fiche d'un propriétaire à UN dossier copié ouvre ce dossier (correct) ; la fiche d'un
  propriétaire à PLUSIEURS biens ouvre UN de ses dossiers copiés (« … (Ville) »), c'est-à-dire un seul de ses biens (faux).
- **Règle** :
  - bouton Drive d'une fiche **propriétaire** → toujours la **racine du propriétaire**, sous laquelle on voit tous ses biens ;
  - bouton Drive d'un **bien** → la racine de **ce** bien.
- **Propriétaire à un seul dossier copié** : ce dossier sert de racine propriétaire ET de racine de son ou ses biens ; on ne le
  découpe pas (l'arborescence automatique s'en chargera plus tard).

## 1. Relevé (lecture seule)

### 1.1 Les propriétaires à plusieurs dossiers copiés

Ceux dont la fiche retient plusieurs dossiers (Valider / Corriger, lus en recette) : la section « Plusieurs dossiers pour un
propriétaire » du rapprochement, plus les corrections d'Arno qui désignent une fiche déjà retenue.

| Propriétaire | Dossiers copiés | Branche d'origine → rangement | Racines à créer | Biens |
|---|---|---|---|---|
| A | 4 (« Nom (ville 1) » … « Nom (ville 4) ») | 1 actifs → Actifs (×4) | Actifs | 5 |
| B | 2 (dont 1 corrigé) | 1 actifs → Actifs ; 3 perdus → Inactifs | Actifs + Inactifs | 1 |
| C | 2 | 1 actifs → Actifs (×2) | Actifs | 1 |
| D | 2 (« Nom (11e étage) », « Nom (7e étage …) ») | 1 actifs → Actifs (×2) | Actifs | 2 |
| E | 2 (« Nom (ville) », « Nom (Paris 16) ») | 1 actifs → Actifs (×2) | Actifs | 2 |
| F | 2 | 1 actifs → Actifs ; 2 vendus → Inactifs | Actifs + Inactifs | 1 |
| **Total** | **14** | 12 dans Actifs, 2 dans Inactifs, **0 laissé en place** | **8** (6 Actifs, 2 Inactifs) | **12** |

Les autres fiches repointées (231) n'ont qu'un dossier copié : rien ne change pour elles.

### 1.2 Où pointait le bouton Drive de chaque bien

- **Colonne utilisée** : aucune colonne du bien. Le bouton lisait `gestion_drive_arbre` (sorte `bien`, par la clé WIPPIMMO),
  c'est-à-dire **l'ancienne arborescence**, « Base de données locative / 2 Biens immobiliers / <adresse> — lot N ».
- **En recette** : 365 biens sur 365 pointaient ainsi vers l'ancienne arborescence. Le serveur porte la même table (la recette
  en est une copie) ; il sera relu par l'étape G, que la session de Claude ne peut pas lancer (pas de ssh).
- Trois écrans montraient ce bouton : la carte du bien sur la fiche propriétaire (« Dossier Drive du lot ↗ »), l'en-tête de la
  fiche du bien (« Dossier Drive ↗ »), la carte du logement sur la fiche locataire. Deux lecteurs partaient du même dossier :
  la fenêtre Drive des tâches du bien et le bouton Drive de la rédaction depuis le bien.

## 2. Ce que le code fait désormais (commité)

### 2.1 Le bouton Drive d'un bien : dossier du bien → dossier du propriétaire → racine

- **Migration 388** (`db/migrations/388_gestion_dossier_attitre_bien.sql`, ajout seul) :
  - colonne NULLABLE `gestion_annuaire_lot.drive_dossier_id` : le **dossier attitré du bien** ;
  - deux tables neuves en ajout seul (verrou en base : ni UPDATE, ni DELETE, ni TRUNCATE) pour la section « Biens » :
    `gestion_rapprochement_bien_proposition`, `gestion_rapprochement_bien_decision`.
- **Lecture** (`annuaireRepo.ts`, `sqlDossiersDuBien`) : le dossier attitré du bien ; à défaut, celui de son propriétaire. Un
  dossier mémorisé dans `gestion_drive_arbre` (la table ne contient QUE la construction de l'ancienne arborescence) **ne compte
  pas** : aucun bouton de bien ne pointe plus vers l'ancienne arborescence.
- **Affichage** (`boutonDossierBien`, pur) : sans l'un ni l'autre, la racine « Base de données locative (aucun dossier
  attitré) ». Le libellé dit d'où vient le dossier : « Dossier Drive du lot ↗ » (ou « Dossier Drive ↗ » en tête de fiche),
  « Dossier du propriétaire ↗ », ou le libellé de la racine. C'est un repli d'**affichage** : rien n'est enregistré.
- **Les trois boutons** passent par ce repli ; la fenêtre Drive des tâches et le bouton Drive de la rédaction partent du même
  dossier (sans dossier, ils s'ouvrent à la racine du Drive, comme avant). Aucun bouton n'est retiré.
- ⚠️ **Conséquence voulue** : les biens d'un propriétaire **non repointé** (76 fiches gardent leur dossier de l'ancienne
  arborescence, décision 5) n'ouvrent plus ce dossier : leur bouton se replie sur la racine. La fiche propriétaire, elle, ouvre
  toujours son dossier actuel.

### 2.2 Jamais la racine, « Actifs » ni « Inactifs » comme dossier d'une fiche ou d'un bien

- À l'écriture : `sqlRepointageFichesEtBiens` refuse de s'écrire si un dossier visé est la racine, un conteneur, le dossier
  d'import, une branche copiée, « Documents clients scannés » ou l'un de ses ancêtres (`motifRefusDossierAttitre`).
- À l'affichage : un tel identifiant compte comme absent (`dossierDuBien`, `boutonDossierProprietaire`).

### 2.3 La section « Biens » de l'écran « Rapprochement des dossiers clients »

- Les biens **PROBABLES** et **AMBIGUS** y sont montrés, avec les mêmes gestes : Valider, Corriger (parmi les dossiers du
  propriétaire et leurs sous-dossiers d'adresse), Aucun rattachement. Les **SÛRS** valent validés et ne sont pas montrés
  (l'aide en dit le nombre).
- Sans réponse ou « Aucun rattachement » : pas de dossier attitré, le bouton du bien se replie sur le dossier du propriétaire
  (décision 2 du lot précédent, appliquée aux biens).
- Sans la migration 388, la section le dit et rien ne tombe.

### 2.4 Le rapprochement d'un bien (pur, `rapprocherBien`)

- **Indices forts** : la commune du bien dans la parenthèse du dossier (« (Paris 16) » exige l'arrondissement) ; un
  sous-dossier au nom de l'adresse du bien (numéro + voie) ; un locataire du bien (actuel ou ancien) dans le dossier
  « Locataire(s) ».
- **Indice faible** : un mot de la voie dans la parenthèse.
- **SÛR** : un seul dossier porte un indice, et il est fort. **PROBABLE** : un dossier a strictement plus d'indices forts que
  les autres, ou seul un indice faible existe. **AMBIGU** : égalité ou aucun indice — rien n'est proposé.
- Quand un dossier réunit plusieurs biens rangés par adresse, c'est le **sous-dossier de l'adresse** qui est proposé : la
  racine de CE bien.

## 3. Les scripts (`.captures/rangement/`, non versionnés)

| Script | Rôle | Écrit (en réel seulement) |
|---|---|---|
| `plan-racines.ts` | fige le plan (recette + Drive, lecture seule) : `plan-racines.json` et `propositions-biens-2026-10-19.json` | rien |
| `P-recette.ts` | prépare la recette : migration 388, chargement du calcul des biens | recette |
| `E-racines.ts` | crée les racines (étiquette `svav_racine_proprietaire`) et y déplace les dossiers copiés | Drive |
| `F-repointer.ts` | repointe les fiches vers leur racine et les biens vers leur dossier, serveur puis recette | serveur, recette |
| `G-verifier.ts` | vérifie tout (remplace C, qui ne connaît pas les racines) ; écrit `G-rapport.json` | rien |
| `R-rattrapage.ts` | copie les ajouts tardifs de « Documents clients scannés » | Drive |
| `D-corbeille.ts` | révisé : exclusions, exige G sans écart | Drive (corbeille) |

Communs à tous : essai à blanc par défaut, réel seulement avec `--reel` ; `--empreinte-attendue=` ; journal
`journal-<étape>.log` ; reprise sans doublon ; arrêt global à la première anomalie ; **coupures réseau** : les lectures sont
retentées (8 fois), les écritures aussi (6 fois) — mais une **création** n'est jamais renvoyée à l'aveugle : le script relit
d'abord le Drive (par l'étiquette) et adopte ce qui aurait été créé ; ssh vers le serveur est retenté 3 fois (les scripts psql
sont des transactions idempotentes : une reprise compte « déjà faites »).

**Verrou des requêtes Drive** (`refusRequeteRacines`, pur, testé) :
- E : créer un DOSSIER dans « Actifs » / « Inactifs », étiqueté `svav_racine_proprietaire` et rien d'autre ; déplacer d'« Actifs »
  / « Inactifs » vers une racine du plan. Ni corbeille, ni renommage, ni partage.
- R : `files.copy` d'un ajout relevé vers la copie de son dossier parent, nom EXACT, étiquette `svav_source_id` = l'original et
  elle seule ; création d'un dossier miroir (même étiquette) si son dossier est lui-même nouveau. La copie passe en outre par le
  transport gardé `fetchCopieScannes` (driveEcriture.ts), qui refuse tout parent protégé.
- Chaque script vérifie aussi la racine, « 00 Arrivée des mails », le dossier d'import et localise « Documents clients
  scannés » par `driveVerdict.idsProteges` (garde-fou) ; tout chemin qui passe par lui ou par son nom est refusé
  (`cheminInterdit`, `porteLeNomProtege`).

## 4. Le plan

- **Racines** : 6 propriétaires, **8 racines** (6 dans « Actifs », 2 dans « Inactifs »). Noms : la partie commune des noms des
  dossiers, sans la parenthèse (règle `nomRacineProprietaire`). Les 6 fiches citeront leur racine « Actifs ».
- **Déplacements** : 14 dossiers copiés passent sous leur racine (même identifiant). 0 laissé en place parmi eux.
- **Biens** : 12 biens. **SÛR 10, PROBABLE 2, AMBIGU 0.** Deux SÛRS reçoivent un sous-dossier d'adresse (un dossier qui réunit
  deux biens d'une même ville).
- Les 2 PROBABLES, à décider par Arno dans la section « Biens » :
  - propriétaire D, bien du 11e étage : locataires actuel et ancien dans « Nom (11e étage) » ; le nom de la voie figure aussi
    dans la parenthèse de l'autre dossier (indice faible) ;
  - propriétaire F, bien unique : locataires actuel et ancien dans le dossier « Actifs » ; le nom de la voie figure dans la
    parenthèse du dossier « Inactifs » (indice faible).

## 5. Les essais à blanc

### 5.1 P — préparation de la recette

Concordance : 6 fiches et 12 biens, mêmes n° WIPPIMMO en recette. Migration 388 à appliquer en recette. Rien n'est écrit.

### 5.2 E — 0 refus

8 racines à créer, 0 déjà là ; 14 dossiers à déplacer, 0 déjà faits ; 0 refus. Les 22 requêtes exactes du réel (8 créations,
14 déplacements) passent le verrou. Un contrôle refuse une racine dont le nom serait déjà pris dans le conteneur par un AUTRE
dossier (ses propres dossiers, qui vont passer dessous, ne comptent pas).

### 5.3 F — garde de la migration, puis chemin réel prouvé sur base jetable

- **En recette** (racines simulées, serveur non joué) : 6 fiches vers leur racine, 10 biens reçoivent leur dossier, 2 sans
  dossier (les PROBABLES, sans réponse). Le script psql s'arrête net : « la colonne gestion_annuaire_lot.drive_dossier_id
  n'existe pas — publier d'abord (migration 388) ». C'est le garde voulu.
- **Base jetable `svav_test_racines`** (copie des tables des fiches et des biens de la recette + migration 388), supprimée ensuite :
  - essai : 6 + 10 à repointer, 0 discordance, rien d'écrit ;
  - discordance provoquée (n° WIPPIMMO faux sur une fiche) : « REPOINTAGE ANNULÉ », 0 bien écrit ;
  - réel : « fiches 6 modifiée(s), relues 6/6 — biens 10 modifié(s), relus 10/10 » ;
  - reprise : « 0 modifiée(s), 6 déjà faite(s) — 0 modifié(s), 10 déjà fait(s) » ;
  - toutes les autres colonnes des deux tables : identiques avant et après (empreinte md5 de chaque ligne sans `drive_dossier_id`).

### 5.4 G — écarts attendus avant E et F

16 écarts, tous attendus : 8 racines absentes, 6 fiches qui ne citent pas encore leur racine, étape F pas faite, migration 388
absente en recette. Le reste est conforme : 231 fiches à un seul dossier conformes, 266 + 90 dossiers rangés, 7 en place.

### 5.5 R — 1 ajout tardif, 0 refus

- Relevé complet de « Documents clients scannés » (métadonnées) : 36 706 éléments.
- **1 ajout tardif** : l'image créée le 19/10/2026 à 09:01Z (11:01 à Paris) par un membre de l'équipe, dans
  `1 actifs/<propriétaire>/Locataires/<locataire>`. Sa destination : la copie de ce dossier « <locataire> ». La requête de copie
  passe le verrou. 0 dossier miroir à créer.
- **0 élément modifié** après la copie.
- 704 éléments absents de la copie mais connus au relevé de fin de copie : ce sont les exclusions prévues (`.DS_Store`, `._…`,
  `~$…`, rapport de vérification finale), ignorées.
- En réel, la copie est enregistrée dans `R-copies.json` ; D la compte alors parmi les copies officielles (jamais à la corbeille).

### 5.6 D révisé — 0 exclu, 0 refus (en simulant B, E et F faits)

- Dossiers cités par une fiche ou un bien (recette ; serveur non relu depuis la session de Claude) : 312 ; leurs parents : 9
  (« 1 Propriétaires », la racine, les conteneurs…, aucun n'est dans la liste).
- **246 dossiers listés** (237 anciens dossiers propriétaires, 9 dossiers d'essai) : **0 exclu, 246 acceptés, 0 refus**.
  - anciens dossiers : 0 fichier, 237 sous-dossiers, 311 raccourcis ;
  - dossiers d'essai : 35 fichiers, 13 sous-dossiers.
- Liste nominative : `.captures/rangement/D-liste-corbeille.csv` (inchangée depuis le lot précédent, même empreinte
  `0d9e15d437a308e4`) ; exclus : `.captures/rangement/D-exclus.csv` (vide).
- Arno relancera l'essai sans option avant le réel : il relira le serveur (fiches ET biens), et le réel exige la même liste.

### 5.7 Empreinte (a)

Recalculée à la fin du lot (19/10/2026, 13:27Z) : `b04d648e2fa542597e7811b9859e8e7ff476e863d3b2de7c8ea9343c881fd875`, 36 706
éléments — **identique** à la référence.

## 6. L'ordre, et quand publier

1. **P** (recette) puis **décision d'Arno** sur les 2 PROBABLES (section « Biens », `npm run recette`).
2. **Publication** (`git push`, `npm run prod:mettre-a-jour -- --essai`, puis `-- --appliquer`) : elle applique la migration
   388 sur le serveur (F l'exige) et met en service le repli du bouton des biens (D l'exige). Elle peut se faire **avant E** :
   d'ici F, les biens des 6 propriétaires ouvrent le dossier principal de leur propriétaire (« Dossier du propriétaire ↗ »),
   et tous les autres biens quittent l'ancienne arborescence dès la publication.
3. **E** (Drive), **F** (serveur puis recette), **G** (vérification, 0 écart), **R** (Drive), **D** (essai seulement ; le réel
   quand Arno le décidera).

## 7. Points signalés

- **Biens des 76 fiches non repointées** : leur bouton se replie sur la racine (§2.1), puisque le dossier de leur propriétaire
  est dans l'ancienne arborescence.
- **`dossierDuBienRepo` (la ligne prioritaire du sélecteur Drive à l'écriture d'un mail)** lit toujours le dossier du
  propriétaire, pas celui du bien : pour les 6 propriétaires, ce sera leur racine. Non modifié ici.
- **`gestion_drive_arbre` n'est pas mis à jour** : les racines, « Actifs » et « Inactifs » ne sont pas dans la liste blanche de
  l'application, qui ne peut donc rien y déposer (inchangé depuis le lot précédent).
- **L'étape C ne doit plus être relancée** après E : elle ignore les racines et compterait 6 fiches et 14 dossiers en écart.
  G la remplace, et D réel exige désormais G (0 écart, serveur relu, moins de 6 heures).
- **« Documents clients scannés » est encore alimenté par l'équipe** : si l'empreinte change de nouveau, chaque étape réelle
  s'arrête ; R relèvera les nouveaux ajouts.
