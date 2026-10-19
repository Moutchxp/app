# Rangement des dossiers copiés, repointage des fiches, corbeille de l'ancienne arborescence (19/10/2026)

> **Rien n'a été exécuté dans ce lot.** Il n'y a eu aucune écriture dans le Drive, sur le serveur, ni dans les bases de
> développement et de recette. Seuls des essais à blanc ont tourné, en lecture : des GET sur le Drive, des transactions READ
> ONLY en recette.
>
> **Base jetable** : le chemin réel du repointage a été éprouvé sur `svav_test_rangement`, une base créée puis supprimée sur le
> Mac, copie de la seule table des fiches (§5.2).
>
> **Les scripts** : dans `.captures/rangement/`, non versionnés. C'est Arno qui lance les étapes réelles.
>
> **Aucun nom de client ici.**

Sources : décisions d'Arno du 18/10 (`docs/COPIE_ARCHIVE_ETAPE1BIS_RAPPROCHEMENT_2026-10-18.md`), du 19/10
(`docs/COPIE_ARCHIVE_VERIFICATION_FINALE_2026-10-19.md`), et les décisions 1 à 7 de ce lot.

## 0. 🔴 « Documents clients scannés » a changé aujourd'hui — les étapes réelles refuseront de partir

L'empreinte (a) a été recalculée au début des essais, le 19/10/2026 à 09:43Z. Elle **ne vaut plus**
`83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` : elle vaut
`b04d648e2fa542597e7811b9859e8e7ff476e863d3b2de7c8ea9343c881fd875`, sur **36 706** éléments au lieu de 36 705.

| Relevé | Heure (UTC) | Éléments | a | Verdict |
|---|---|---|---|---|
| référence (fin de l'étape 2 du lot précédent) | 2026-10-19T07:50:38Z | 36 705 | `83d72376…c4ffc45adb` | — |
| début des essais de ce lot | 2026-10-19T09:43:04Z | 36 706 | `b04d648e…3c881fd875` | DIFFÉRENTE |
| fin du lot | 2026-10-19T10:13:44Z | 36 706 | `b04d648e…3c881fd875` | DIFFÉRENTE (stable depuis 09:43) |

**La cause, relue en lecture seule** (relevé comparé à celui de la fin de l'étape 2, 07:50Z) : **un seul élément nouveau**,
rien de disparu, rien de modifié.
- C'est une image (PNG, 242 Ko), créée le 19/10/2026 à 09:01Z (11:01 à Paris) par **un membre de l'équipe**, depuis son compte.
- Elle est rangée dans `1 actifs/<propriétaire>/Locataires/<locataire>`.
- Ce n'est pas l'application : elle n'écrit pas dans « Documents clients scannés », et ce lot n'y a fait que des GET.

**Conséquences** :
1. **Les étapes réelles s'arrêtent net.** Chaque script exige 83d7… avant et après son geste ; l'essai A s'est arrêté sur ce
   refus, comme prévu.
2. **Cette image n'est pas dans la copie.** La copie est terminée depuis 06:00, et le dossier copié de ce propriétaire, qui va
   rejoindre « Actifs », ne la contient pas.
3. **L'équipe alimente encore « Documents clients scannés ».** L'empreinte risque donc de changer encore entre deux étapes.

**À décider par Arno.** Les scripts savent prendre une autre référence, mais seulement si elle est tapée en entier :
`--empreinte-attendue=<64 caractères>`. Rien ne la change tout seul.

## 1. Les décisions lues en recette (`svav_recette`, jamais la base de développement)

Le plan a été figé le 19/10/2026 à 09:37Z par `plan.ts`. Il compte 250 décisions, la dernière portant le n° 250, pour le calcul
« 2026-10-19-serveur ».

| Décision (dossiers proposés) | Nombre |
|---|---|
| Validés | **239** (20 du contrôle, 212 en masse, 7 de la section b un par un) |
| Corrigés | **6** (des ambigus) |
| Aucun rattachement | **5** |
| Sans réponse | **113** (67 probables, 46 sans correspondant) |
| **Total des dossiers** | **363** |
| Clients WIPPIMMO sans dossier (rien à décider : ils gardent le leur, point 5) | 20 |

Chaque script relit la recette avant d'agir. **Une décision posée après le plan arrête tout** : il faut alors relancer `plan.ts`.

## 2. Le plan

| Quoi | Nombre |
|---|---|
| Déplacements vers « Actifs » (depuis `1 actifs`) | **266** |
| Déplacements vers « Inactifs » (depuis `2 vendus` et `3 perdus`) | **90** |
| Laissés où ils sont (section b, décision 6) | **7** |
| Fiches repointées | **237** |
| Anciens dossiers à la corbeille | **237** |
| Dossiers d'essai à la corbeille (8 « _TEST CLAUDE … », « _TEST COPIE ») | **9** |

**Pourquoi 237 fiches pour 245 dossiers validés ou corrigés.** Une fiche à plusieurs dossiers ne reçoit que **le principal**
(point 1). Les autres sont seulement rangés.
- **Les 5 propriétaires de la section c** : 11 dossiers, donc 5 fiches.
- **Deux corrections** visent une fiche déjà retenue par un dossier SÛR :
  - l'une ajoute un 4e dossier à un propriétaire de la section c, dont le principal reste celui proposé ;
  - l'autre désigne une fiche qui a déjà un dossier SÛR en actifs, et c'est lui le principal (règle : le dossier marqué
    principal, à défaut celui des actifs, à défaut le plus récent).

**Les 7 de la section b** :
- Arno les a validés un par un. Leur fiche les reçoit donc comme dossier attitré (point 1), et leur ancien dossier part à la
  corbeille (point 6).
- Mais ils ne bougent pas du dossier d'import (point 3, décision 6).
- `planDuLotSuivant` les excluait jusqu'ici du repointage. Il les y inclut désormais : le point 1 de ce lot porte sur toute
  proposition validée.

**Ce qui ne change pas** :
- les fiches des propositions « aucun rattachement » et sans réponse ;
- les 20 clients sans dossier ;
- les dossiers copiés non rattachés, qui sont rangés quand même (point 2) ;
- les anciens dossiers des fiches non repointées, qui ne vont pas à la corbeille.

## 3. Le code (commité)

### 3.1 Le bouton « dossier » de la fiche propriétaire (point 4)

**Constat** : le bouton « Dossier Drive ↗ » de l'en-tête de la fiche propriétaire ne lisait **pas** `drive_dossier_id`. Il
lisait l'ancienne arborescence mémorisée (`gestion_drive_arbre`, sorte `proprietaire`).
- **Jusqu'ici, c'était le même identifiant** pour les 307 fiches.
- **Mais après le repointage, il aurait encore ouvert l'ancien dossier**, et après la corbeille un dossier à la corbeille.
- ⚠️ **Le rapport précédent (§3.5, point 3) était donc inexact** : il disait que les boutons lisaient tous `drive_dossier_id`.
  C'était vrai de la carte de bien (`ficheRattachementRepo`) et de la route du sélecteur (`dossierDuBienRepo`), pas de la
  fiche.

**Ce qui change** :
- `ficheProprietaire` rend désormais le **dossier attitré** (`drive_dossier_id`) et la racine mémorisée (sorte `racine`).
- L'en-tête passe par `boutonDossierProprietaire` :
  - si la fiche a un dossier attitré, le bouton l'ouvre, avec le libellé inchangé « Dossier Drive ↗ » ;
  - sinon, il ouvre la **racine**, avec le libellé « **Base de données locative (aucun dossier attitré)** ».
- **Rien n'est retiré** : le bouton existait, il reste. Une fiche sans dossier, qui n'en avait aucun, en a désormais un, et
  c'est aujourd'hui le cas de **1 fiche**.

**La racine n'est jamais enregistrée** sur une fiche : le repli est un affichage.
- Une fiche qui citerait la racine ou un conteneur est traitée comme **sans dossier attitré**.
- `motifRefusDossierAttitre` refuse comme dossier d'une fiche : la racine, « Actifs », « Inactifs », le dossier d'import et ses
  branches, « 00 Arrivée des mails », « Documents clients scannés » et leurs ancêtres.
- Le script de repointage refuse même de **s'écrire** s'il viserait l'un d'eux.

### 3.2 La raison « ancien locataire X » / « locataire actuel X » (point 7)

À l'affichage de l'écran de rapprochement, « locataire X connu » devient :
- **« locataire actuel X »** si un locataire de ce nom, sur un lot de la fiche proposée, est en place. C'est la règle unique de
  l'application : aucune date de sortie.
- **« ancien locataire X »** sinon.

Les lots retenus sont ceux du calcul : ceux dont la fiche est propriétaire, et ceux dont elle est copropriétaire. Si aucun
locataire de ce nom n'est retrouvé, la raison reste telle quelle. La table des propositions, en ajout seul, n'est pas modifiée.

### 3.3 Les verrous des scripts (`app/lib/gestion/rangementDossiersCopies.ts`, pur, testé)

| Verrou | Ce qu'il exige |
|---|---|
| `refusRequeteRangement` | Toute requête Drive passe par lui avant l'envoi. **Toujours permis** : GET de métadonnées (jamais `alt=media`). **Étape A** : PATCH avec UN `addParents` vers Actifs ou Inactifs, UN `removeParents`, et un corps vide ; ou POST qui crée le dossier « Actifs » ou « Inactifs », avec la racine pour seul parent. **Étape D** : PATCH au corps exactement `{"trashed": true}`. **Tout le reste est refusé** : DELETE, emptyTrash, copy, permissions, renommage, étiquette, restauration. |
| `verifierDeplacementCopie` | Le dossier est une **copie**, et son étiquette `svav_source_id` désigne l'original attendu par le plan. Il n'est pas à la corbeille. Sa chaîne de parents, relue chez Google, est sous la racine, hors de « Documents clients scannés » (identifiant **ou** nom) et hors de « 00 Arrivée des mails ». Son parent est sa branche copiée (il est alors à déplacer) ou déjà son conteneur (reprise). |
| `verifierCorbeilleDossier` | L'élément figure dans la liste nominative et c'est un dossier. Ce n'est **jamais une copie**, et il ne contient **jamais une copie officielle** (`etat.json`). Un ancien dossier ne contient aucune copie, ni **aucun fichier**, et doit être mémorisé comme dossier propriétaire. Aucune fiche ne le cite, ni sur le serveur ni en recette, sous-dossiers compris. Il n'est ni sous « Documents clients scannés », ni sous « 00 Arrivée des mails », ni dans le dossier d'import, ni dans Actifs ou Inactifs. Un dossier d'essai est posé à même la racine. |
| `sqlRepointage` | Une **seule** transaction. Elle s'arrête si la table des fiches porte un déclencheur. Elle vérifie chaque fiche : même identifiant, même n° WIPPIMMO, dossier actuel égal à celui vu au calcul (ou déjà le nouveau, en cas de reprise), nouveau dossier pris par aucune autre fiche. Une seule discordance annule tout. Elle écrit `drive_dossier_id` et **rien d'autre**, relit, puis fait COMMIT. En essai, la transaction est READ ONLY et ne contient aucun UPDATE. |

**Tests** :
- `rangementDossiersCopies.test.ts` : 22 tests ;
- `rapprochementDossiers.test.ts` : la section b validée est repointée ;
- `rapprochementDossiersRepo.test.ts` : la raison ancien / actuel.

## 4. Les scripts (`.captures/rangement/`, non versionnés)

**Communs à tous** : un essai à blanc par défaut, l'exécution seulement avec `--reel`, et un journal `journal-<étape>.log`. La
reprise se fait sans doublon, et tout s'arrête à la première anomalie.

**Garde-fous présents dans chaque script** :
- **`driveGardeFou`** : nom protégé de « Documents clients scannés », nom de la racine.
- **`driveVerdict.idsProteges`** : « Documents clients scannés » et ses ancêtres, relus chez Google. S'ils ne sont pas
  localisés, le script refuse.
- **Contexte relu chez Google** :
  - la racine « Base de données locative » ;
  - « 00 Arrivée des mails », sous elle ;
  - le dossier d'import, sous elle ;
  - les trois branches copiées ;
  - « Actifs » / « Inactifs » (plus d'un dossier de ce nom : arrêt).
- **Empreinte (a)** avant et après chaque étape réelle.

| Script | Rôle |
|---|---|
| `plan.ts` | Fige le plan à partir de la **recette** (`plan.json`, avec son empreinte). Il vérifie que le dossier « vu au calcul » est le même dans l'extraction du serveur, en recette et dans la proposition. |
| `A-deplacer.ts` | **Tout** ce que contiennent les branches copiées doit être prévu au plan. Chacun des 356 dossiers est jugé **avant** le premier geste. Le script crée « Actifs » et « Inactifs » sous la racine s'ils manquent, puis déplace un par un. Chaque déplacement garde l'identifiant Drive ; le dossier est rejugé juste avant et relu juste après. Le script vérifie aussi que les 7 laissés en place sont toujours là. |
| `B-repointer.ts` | Il relit chaque nouveau dossier chez Google : copie conforme, rangée (sinon : « l'étape A d'abord »). Il écrit le script psql, puis le joue sur le **serveur** (`ssh svav-prod`, une transaction), puis sur la **recette** (une transaction). |
| `C-verifier.ts` | En lecture seule, sur le serveur (ssh, READ ONLY), en recette et dans le Drive : chaque fiche repointée ouvre un dossier existant, copié, dans Actifs ou Inactifs (les 7 : dans leur branche). Aucune fiche ne cite un dossier interdit. Les fiches non repointées sont identiques sur le serveur et en recette. Chaque dossier du plan est rangé. Le script écrit `C-rapport.json`. |
| `D-corbeille.ts` | L'essai écrit la **liste nominative** (`D-liste-corbeille.csv` / `.json`). Le réel exige : C sans écart et daté de moins de 6 h ; la liste de l'essai, inchangée ; le **code en service sur le serveur** qui lit le dossier attitré (sinon une fiche y ouvrirait un dossier à la corbeille). Il met ensuite chaque dossier à la corbeille, un par un, rejugé puis relu. |

## 5. Les essais à blanc

### 5.1 Étape A — 0 refus

- **Jugés** : 356 dossiers, **0 refus**.
- **À déplacer** : 356, dont **266 vers Actifs** et **90 vers Inactifs**. Déjà faits : 0.
- **Laissés en place** : **7**, vérifiés.
- **Contenu des branches copiées** : aucun élément hors du plan.
- **Conteneurs** : « Actifs » et « Inactifs » n'existent pas encore ; le réel les crée.

### 5.2 Étape B — 0 discordance

- **Nouveaux dossiers** : 237, relus chez Google. Tous sont des copies conformes, dont 230 pas encore rangées (l'essai a été joué
  avant A, avec l'option d'essai `--avant-A`).
- **Recette** (transaction READ ONLY) : 237 fiches attendues, **237 à repointer**, 0 déjà faite. 0 absente, 0 n° WIPPIMMO
  différent, 0 dossier actuel changé, 0 nouveau dossier déjà pris.
- **Serveur** : **non joué** depuis la session de Claude, qui n'a pas accès à ssh. L'essai lancé par Arno le joue en READ ONLY.
- **Chemin réel**, sur la base jetable `svav_test_rangement` (copie de la seule table des fiches, supprimée ensuite) :

  | Passage | Résultat |
  |---|---|
  | Discordance provoquée (une fiche au dossier changé) | **tout est annulé**, la table est identique octet pour octet |
  | Passage réel | **237 modifiées**, relues 237 / 237 |
  | Reprise | **0 modifiée, 237 déjà faites** |
  | Autres colonnes (identifiant, n° WIPPIMMO, nom, adresse, absent / archivé / supprimé) | inchangées |

### 5.3 Étape C — écarts attendus avant A et B

**1 060 écarts**, qui sont exactement ceux d'avant l'exécution :
- 237 × 2 fiches pas encore repointées (serveur et recette) ;
- 230 dossiers attitrés pas encore dans Actifs ou Inactifs ;
- 356 dossiers pas encore rangés.

**Ce qui est déjà conforme** :
- **0** fiche ne cite un dossier interdit ;
- les **76** fiches non repointées sont identiques sur le serveur et en recette ;
- les 7 de la section b sont bien dans leur branche.

Les fiches du serveur ont été lues dans l'extraction de 09:39 (pas de ssh) ; le réel les relit.

### 5.4 Étape D — 0 refus (en simulant B faite)

Essai joué « comme si le repointage était fait », avec l'option d'essai `--simuler-repointage`.

- **Listés** : 246 dossiers, **246 acceptés, 0 refus**.

| Liste | Dossiers | Fichiers | Sous-dossiers | Raccourcis |
|---|---|---|---|---|
| Anciens dossiers | 237 | **0** | 237 (les « En attente », vides) | 311 |
| Dossiers d'essai | 9 | 35 | 13 | — |

- **« _TEST COPIE »** contient 8 copies faites par l'essai de copie du 18/10. **Aucune n'est une copie officielle**, ce qui a été
  vérifié contre `etat.json` ; le verrou les laisse donc partir avec leur dossier d'essai, et seulement avec lui.
- **Sans simulation**, les 237 anciens dossiers sont refusés, parce qu'ils sont encore cités par leur fiche : c'est le verrou
  qui attend l'étape B.

## 6. Comment le code arrive sur le serveur (rien n'est fait par Claude)

Le repli « racine » et la lecture du dossier attitré n'agissent sur le serveur qu'une fois la version mise à jour.
- **Ce que fait la mise à jour ordinaire** (`deploy/maj/README.md`) : elle prépare la nouvelle version, applique les migrations
  nouvelles, bascule, puis redémarre `svav-next` et `svav-gestion-continu`.
- **Rien d'autre à redémarrer à la main.**

À lancer dans l'application Terminal, dans `/Users/macbookprom4arnaud/sansvisavis/app` :
1. `git push` (le serveur se construit depuis le commit poussé) ;
2. `npm run prod:mettre-a-jour -- --essai`, qui doit finir par « ESSAI RÉUSSI » ;
3. `npm run prod:mettre-a-jour -- --appliquer`, qui doit finir par « MISE À JOUR RÉUSSIE ».

⚠️ **Migrations appliquées au passage** : l'essai liste toutes les migrations nouvelles, dont la **387** (tables du
rapprochement). Ce sont celles qui ne sont pas encore inscrites au registre du serveur, qui en comptait 381 le 19/10 au matin.

**Quand ?** Avant l'étape D : c'est un verrou de D.
- Avant B, le changement est **sans effet visible** : le dossier attitré est encore l'ancien, le même que celui que lisait la
  fiche.
- Après B, la fiche ouvre le dossier copié.

## 7. Points signalés (rien n'est décidé ici)

1. **Le dossier d'import ne sera pas vide après les déplacements.** Ses trois branches copiées (`1 actifs`, `2 vendus`,
   `3 perdus`) resteront, avec les **7 dossiers de la section b**, laissés en place (décision 6). Il reste où il est, comme
   demandé.
2. **La mémoire de l'ancienne arborescence n'est pas modifiée** : l'étape B n'écrit que `drive_dossier_id`.
   - **Ce qui reste marqué présent** : les 237 anciens dossiers, leurs « En attente » et leurs raccourcis, même une fois à la
     corbeille.
   - **Rien dans l'application ne dépose automatiquement dans un « En attente » de propriétaire.** Deux scripts manuels le
     font : `copier-pieces-drive` et `deplacer-vers-arrivee`. Ils ne doivent pas être relancés avant la question 4 de
     l'étape 1 bis.
   - Après la corbeille, `npm run gestion:drive:construire` ne recréera pas ces dossiers, puisqu'ils sont encore mémorisés.
   - En revanche, s'ils étaient un jour marqués absents, il les **recréerait**, et `noterDossierProprietaire` ré-écraserait le
     dossier attitré.
3. **« Actifs » et « Inactifs » ne seront pas dans la liste blanche de l'application** (`gestion_drive_arbre`) : l'étape A
   n'écrit pas en base. L'application ne pourra pas y créer ni y déposer quoi que ce soit tant qu'on ne les y inscrit pas,
   ce qui reste à décider.
4. **L'image ajoutée aujourd'hui à « Documents clients scannés »** (§0) n'est pas dans la copie.

---

*Sources : `.captures/rangement/{plan.ts, plan.json, commun.ts, A-deplacer.ts, B-repointer.ts, C-verifier.ts, D-corbeille.ts,
journal-*.log, B-repointage-essai.sql, C-rapport.json, D-liste-corbeille.csv, diff-scannes.ts, empreinte-*.json}`.*
