# COPIE ARCHIVE — ÉTAPE 1 BIS : plan de rapprochement et de suppression des doublons (lecture seule)

> 18/10/2026 · **rien n'est exécuté** : aucune écriture Drive, aucune corbeille, aucune écriture en base (`SELECT`
> seulement). Aucun nom de client ici ; les tables nominatives sont dans `.captures/copie-archive/` (gitignoré) :
> `rapprochement.csv` (propriétaires), `rapprochement_biens.csv` (biens), `plan_suppression.csv`, `bilan.json`.
> Scripts : `lire.ts` (lecture Drive, GET seul), `rapprocher.py`.
>
> Décision d'Arno du 18/10 : l'ancienne arborescence (construite le 26/09 depuis WIPPIMMO) sert de **référence de
> rapprochement**, puis chaque dossier propriétaire rapproché part à la **corbeille** pour ne pas doublonner la copie de
> l'archive. Chaque affirmation porte **ÉTABLI** ou **NON ÉTABLI**.

## 0. Garanties

| Garantie | Preuve | Statut |
|---|---|---|
| GET seulement | `.captures/copie-archive/lire.ts:14-18` : `garde()` refuse toute méthode ≠ GET (l.16) et `alt=media` (l.17), puis `fetchDriveLectureSeule` (`app/lib/gestion/driveLectureSeule.ts:33`) ; tous les appels passent par `garde` (l.31) | ÉTABLI |
| « 00 Arrivée des mails » non parcouru | le mode `ancien` liste la racine mais saute ce dossier (`lire.ts`, branche `ancien`) | ÉTABLI |
| Archive identique avant / après | SHA-256 de la liste triée `id|modifiedTime|md5Checksum` | ÉTABLI |

| Relevé | Heure (UTC) | Éléments | Empreinte |
|---|---|---|---|
| avant | 2026-10-18T16:18:44Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` |
| après | 2026-10-18T16:25:57Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` |

L'empreinte est aussi identique à celle de l'étape 1 (15:52Z) : l'archive n'a pas bougé de l'après-midi.

---

## 1. Les deux côtés — ÉTABLI

**Ancienne arborescence**, relue chez Google le 18/10 (3 744 éléments hors contenu de l'arrivée), et concordant
**exactement** avec sa mémoire `gestion_drive_arbre` (0 écart sur les sous-arbres propriétaires) :
- `1 Propriétaires` : 307 dossiers propriétaires, 307 `En attente` (**vides**), 365 raccourcis. **Aucun fichier.**
- `2 Biens immobiliers` : 365 biens, 2 711 dossiers dessous, **4 fichiers**, tous déposés le 09/10 :
  - 3 posés à même un dossier de bien ;
  - 1 dans le `En attente` d'un autre bien.
  ⚠️ **Aucun des 4 n'est dans un dossier propriétaire.**
- Chaque fiche propriétaire pointe sur son dossier : `gestion_annuaire_proprietaire.drive_dossier_id` = l'identifiant
  mémorisé dans `gestion_drive_arbre`.

**Archive** : 363 dossiers propriétaires (266 actifs, 20 vendus, 77 perdus), lus à l'étape 1.

---

## 2. Règles de rapprochement

Les critères sont ceux de l'étape 1 (`docs/RECON_DOCUMENTS_CLIENTS_SCANNES_2026-10-18.md` §2.3) :
- **(a) nom** ;
- **(b) adresse ou n° de lot** d'un lot de la fiche ;
- **(c) locataire connu** d'un lot de la fiche, sous `Locataire(s)`.

Ce qui change, conformément à la consigne : **SÛR = (a) + (b), ou (a) + (c)**, avec **un seul** candidat qui les réunit.
- Deux fiches réunissant chacune un second critère → **AMBIGU** (règle plus stricte qu'à l'étape 1).
- **PROBABLE** = le nom seul (un seul candidat, ou des homonymes départagés par le prénom).
- **AUCUN** = aucune fiche de ce nom.

**Niveau BIEN** : un sous-dossier de bien de l'archive (adresse, `Appart NN`, étage, `lot NN`, parking), ou un N1 qui
porte une précision de bien entre parenthèses, est comparé aux lots **de la fiche retenue** :
- SÛR = n° de lot WIPPIMMO, ou adresse **avec** numéro, désignant un seul lot ;
- PROBABLE = voie sans numéro désignant un seul lot ;
- AMBIGU = plusieurs lots ;
- AUCUN = rien ne concorde. C'est le cas typique d'un `Appart NN` : la base ne porte ni numéro d'appartement ni étage.

---

## 3. Bilan chiffré — ÉTABLI (`bilan.json`)

### 3.1 Dossiers propriétaires de l'archive → ancienne arborescence

| Branche | SÛR | dont nom + locataire seul | dont nom + adresse/lot | PROBABLE | AMBIGU | AUCUN | Total |
|---|---|---|---|---|---|---|---|
| `1 actifs` | **231** (23 943 fichiers) | 214 | 17 | 24 (1 371) | 6 (2 234) | 5 (381) | 266 |
| `2 vendus` | 4 (289) | 2 | 2 | 6 (373) | 3 (145) | 7 (414) | 20 |
| `3 perdus` | 4 (306) | 4 | 0 | 37 (2 071) | 2 (28) | 34 (816) | 77 |
| **Total** | **239** | 220 | 19 | 67 | 11 | 46 | 363 |

Tous les SÛR et PROBABLE visent une fiche qui **a** un dossier dans l'ancienne arborescence, et ce dossier est présent
dans le Drive.

### 3.2 Dossiers de bien de l'archive → biens de l'ancienne arborescence

| Branche | SÛR | PROBABLE | AMBIGU | AUCUN |
|---|---|---|---|---|
| `1 actifs` | 20 | 0 | 5 | 66 |
| `3 perdus` | 0 | 0 | 0 | 24 |

(Seuls les dossiers de bien dont le propriétaire est rapproché sont comparés. Le seul dossier de bien de `2 vendus`
appartient à un propriétaire non rapproché.)

### 3.3 Du côté de l'ancienne arborescence

| Dossiers propriétaires (307) | Nombre |
|---|---|
| avec au moins un correspondant **SÛR** | **233** |
| — dont un seul dossier d'archive, en `1 actifs` | 221 |
| — dont **plusieurs** dossiers d'archive SÛR (découpage par bien ou par commune) | 5 |
| — dont l'archive les range en `3 perdus` (4) ou `2 vendus` (3) alors que WIPPIMMO les a en gestion | 7 |
| seulement PROBABLE / AMBIGU | 54 |
| **sans aucun dossier dans l'archive** | **20** |

Pour les **biens** : sur 365 dossiers de bien, 20 ont un correspondant SÛR au niveau bien. Les autres n'ont pas de
dossier de bien distinct dans l'archive, qui range presque toujours par propriétaire puis par rubrique.

**Dossiers de l'archive sans correspondant** : 46 AUCUN (5 actifs, 7 vendus, 34 perdus) et 11 AMBIGU.

---

## 4. Plan de suppression (rien n'est exécuté)

**Périmètre :** les **233** dossiers propriétaires SÛR, répartis en trois listes (`plan_suppression.csv`, colonne
`statut`) :

| Liste | Dossiers | Pourquoi |
|---|---|---|
| **EXÉCUTABLE** | **221** | un seul dossier d'archive SÛR, en `1 actifs` |
| EN ATTENTE | 5 | plusieurs dossiers d'archive SÛR : l'identifiant de remplacement (étape b) n'est pas unique — question 2 |
| À CONFIRMER | 7 | l'archive dit « perdu » ou « vendu » ; la base dit « en gestion » — question 1 |

PROBABLE, AMBIGU et AUCUN : **aucun plan**.

⚠️ **Préalable** : le « dossier copié » n'existe pas encore. Partout où le plan dit « identifiant du dossier copié »,
c'est l'identifiant que la copie (étape suivante) donnera au N1 d'archive indiqué dans `archive_ids`. Le plan ne peut
donc s'exécuter **qu'après** la copie et la mémorisation de cette correspondance (archive → copie).

### a. Fichiers présents dans l'ancien dossier propriétaire

- **0 fichier** dans les 221 sous-arbres. Ils ne contiennent que le dossier, son `En attente` (vide) et ses raccourcis.
  Relevé Drive du 18/10, ÉTABLI.
- **Les 4 fichiers connus sont dans des dossiers de BIEN** (`2 Biens immobiliers`), que la corbeille d'un dossier
  propriétaire n'emporte pas. Leurs propriétaires sont tous SÛR, mais leurs biens n'ont pas de correspondant SÛR dans
  l'archive. Destination proposée, **si** les biens partaient un jour à leur tour (question 3) : la racine du dossier
  propriétaire copié, ou sa rubrique `Propriétaire` (question 5).
- **Contrôle à refaire à l'exécution** : tout fichier arrivé depuis dans le sous-arbre bloque la corbeille de ce dossier
  (verrou §6, règle ⑥).

### b. Références en base vers l'ancien dossier ou ses sous-dossiers

Mesuré sur les 732 identifiants des 221 sous-arbres (221 dossiers + 221 `En attente` + 290 raccourcis) :

| Table.colonne | Lignes | Remplacement prévu | Équivalent dans le dossier copié ? |
|---|---|---|---|
| `gestion_annuaire_proprietaire.drive_dossier_id` | 221 | → identifiant du dossier copié (N1 d'archive) | **oui** |
| `gestion_drive_arbre.drive_id` (sortes proprietaire, en_attente, raccourci) | 732 | **aucun remplacement** : `absent_le = now()` par la fonction existante (`driveArbreRepo.ts:76`) ; jamais de DELETE (FK `ON DELETE RESTRICT`) | **non** — l'archive n'a ni `En attente` ni raccourcis |
| `gestion_drive_arbre.parent_drive_id` | 511 (les `En attente` et raccourcis) | inchangé : marqués absents avec leur parent | non |
| `gestion_drive_empreinte.drive_file_id / parent_id` | 732 | rien à faire : l'indexation (toutes les 15 min) marque `disparu_le` d'elle-même | — |
| `gestion_drive_refus.parent_drive_id / cible_drive_id` | 1 | rien : c'est un journal historique | — |
| `gestion_piece_proposition` (`destination_sorte='proprietaire'`, `destination_cle` = n° WIPPIMMO) — référence **indirecte** au `En attente` du propriétaire, via `gestion_drive_arbre` | 5 645 | à repointer vers un dossier du dossier copié | **non** : l'archive n'a pas de `En attente` (question 4) |
| `gestion_piece_drive`, `gestion_drive_dossier_cree`, `gestion_drive_mouvement`, `gestion_drive_production`, `gestion_piece_vidage`, `gestion_tache_piece`, `gestion_brouillon_piece`, `gestion_piece_renommage` | **0** | — | — |

**Code qui lit l'ancien dossier**, à repointer dans le même lot que (b) — ÉTABLI :
- `ficheRattachementRepo.ts:91,290` → `dossierDriveId` → le bouton de dossier de la carte de bien
  (`RattachementsDuFil.tsx:1760`) ;
- `dossierDuBienRepo.ts:13-16` (route `drive/dossier-du-bien`) ;
- le classement vers « `En attente` du propriétaire » (`classement.ts:286-287`, `triPieces.ts:520`).

Ces boutons ouvriront le **dossier copié**, rangé comme l'archive (`Propriétaire`, `Locataires`, `Photos`…), au lieu de
l'ancien dossier (`En attente` + raccourcis). C'est un changement visible, à valider (question 6).

### c. Raccourcis

- **290** raccourcis vivent dans les 221 dossiers (`→ <bien>`). Ils **partent avec leur dossier** à la corbeille.
- Leurs cibles, les 290 dossiers de bien de `2 Biens immobiliers`, **restent intactes** : un raccourci ne modifie pas
  sa cible (étape 1, §5C).
- Aucun raccourci de l'arborescence ne pointe **vers** un dossier propriétaire (0 sur 365).
- **Conséquence** : ces 290 biens ne sont plus accessibles qu'en passant par `2 Biens immobiliers`. Aucun lien
  « propriétaire → biens » ne subsiste, sauf si l'on recrée des raccourcis dans le dossier copié (question 3).

### d. Corbeille

`PATCH files/<ancien_dossier_id> {trashed: true}` sur chacun des 221 dossiers. **Jamais de suppression définitive**,
jamais de vidage de corbeille. Chaque geste est journalisé dans `gestion_drive_mouvement` (action `corbeille`, existante,
migration 295) pour pouvoir le **restaurer** (action `restaurer`). Un dossier reste restaurable pendant **30 jours**
dans la corbeille d'un Drive partagé (règle Google, NON ÉTABLI ici).

---

## 5. Dossiers `_TEST` — hors de tout plan

Les 8 dossiers `_TEST CLAUDE … à supprimer par Arno`, à la racine de `Base de données locative`, tous créés entre le
28/09 et le 30/09 :
- `_TEST CLAUDE à supprimer par Arno`
- `_TEST CLAUDE déplacement …`
- `_TEST CLAUDE rangement …`
- `_TEST CLAUDE vitesse …`
- `_TEST CLAUDE retouches …`
- `_TEST CLAUDE rangement2 …`
- `_TEST CLAUDE arbre …`
- `_TEST CLAUDE renommage …`

Ensemble : 12 sous-dossiers et 24 fichiers.

**Aucun dossier `_TEST COPIE`** n'existe à ce jour (relevé du 18/10) — ÉTABLI.

---

## 6. Le verrou d'exécution (conception seulement)

Une porte unique, `corbeillerDossierValide(id)`, distincte de la corbeille de l'écran. Celle-ci **garde** son refus de
tout dossier (`driveCorbeille.ts:22-24, 92`) : rien de ce qui existe n'est assoupli. Elle refuse, **avant tout envoi** :

1. **Hors liste validée.** L'identifiant doit figurer dans une liste **validée par Arno**, stockée en base : table en
   ajout seul, avec `drive_id`, l'empreinte du plan, `valide_par` et `valide_le`. Une liste non validée, ou modifiée
   après validation, ne vaut rien.
2. **Hors de « Base de données locative ».** La chaîne des parents, **relue chez Google au moment du geste** (jamais
   seulement la mémoire), doit atteindre l'identifiant de la racine.
3. **« 00 Arrivée des mails ».** Refus si l'identifiant **ou l'un de ses ancêtres** est `00 Arrivée des mails`.
   L'identifiant est mémorisé, sorte `arrivee` ; le nom est aussi comparé, en double garde.
4. **L'archive.** Refus si un ancêtre est « Documents clients scannés » ou l'une de ses branches (identifiants protégés
   déjà calculés par `driveVerdict`).
5. **Pas un dossier propriétaire de l'ancien arbre.** L'identifiant doit être, en mémoire, de sorte `proprietaire`,
   non absent. Ni bien, ni rubrique, ni racine, ni tête.
6. **Pas vide de fichiers.** Le sous-arbre, relu chez Google, ne doit contenir **aucun fichier** : seulement des
   dossiers vides et des raccourcis. Un fichier arrivé depuis la validation bloque le geste. L'étape (a) n'est pas
   faite.
7. **Référence non repointée.** `drive_dossier_id` de la fiche doit déjà désigner le dossier copié. L'étape (b) n'est
   pas faite.
8. **Toute autre méthode.** Le `fetch` de cette porte n'accepte que `GET` et un `PATCH` dont le corps est exactement
   `{"trashed": true}`. Il refuse `DELETE`, `/emptyTrash` et tout autre champ.

Après le geste : `absent_le` sur le dossier et ses descendants en mémoire, une ligne `corbeille` dans
`gestion_drive_mouvement`, et le motif journalisé. Le geste inverse (`trashed: false`) passe par la même liste.

---

## 7. Questions de choix métier

1. **L'archive dit « perdu » ou « vendu », WIPPIMMO dit « en gestion ».** Exemple : le dossier `3 perdus/NOM` contient
   un locataire qui occupe encore un lot de la fiche NOM. On met quand même son ancien dossier à la corbeille, et la
   fiche pointe vers une copie rangée parmi les perdus ? (7 cas.)
2. **Un propriétaire, plusieurs dossiers d'archive SÛR.** Exemple : `NOM (Commune A)` et `NOM (Commune B)`. Lequel
   devient « le » dossier de la fiche, ou crée-t-on un dossier propriétaire qui les contient tous les deux ? (5 cas.)
3. **Les dossiers de BIEN de l'ancienne arborescence** (290 pour les 221 propriétaires) **restent-ils** ? Exemple :
   après la corbeille, le bien « 4 rue Fictive — lot 100 » existe encore dans `2 Biens immobiliers`, avec ses dossiers
   de bail vides, mais plus aucun raccourci ne le relie à son propriétaire. On les garde, on les met aussi à la
   corbeille, ou on recrée les raccourcis dans le dossier copié ?
4. **Où va désormais le « En attente du propriétaire »** des 5 645 propositions de classement ? Exemple : une
   quittance reconnue « propriétaire NOM, logement inconnu » allait dans `NOM/En attente`. Dans le dossier copié, on
   crée un `0 En attente`, ou elle va dans la rubrique `Propriétaire` de l'archive ?
5. **Les 4 fichiers déposés le 09/10 dans des dossiers de bien.** Si ces biens partent un jour, les range-t-on à la
   racine du dossier copié du propriétaire, ou dans sa rubrique `Propriétaire` ?
6. **Le bouton « dossier » de la carte de bien** ouvrira le dossier copié, rangé à la façon de l'archive. Est-ce bien ce
   que tu veux voir à la place de l'ancien dossier (`En attente` + raccourcis) ?
7. **Les 20 propriétaires sans aucun dossier d'archive, et les 54 seulement PROBABLE.** Leur ancien dossier reste
   tel quel. Veux-tu une liste de validation à la main pour les 24 PROBABLE des actifs ?
8. **Un locataire concordant suffit-il vraiment ?** C'est ta définition du SÛR, et elle porte 214 des 231 actifs.
   Exemple : un dossier `NOM` sans adresse, dont `Locataires/NOMLOC` occupe un lot de la fiche NOM. Une relecture par
   échantillon (par exemple 20 dossiers) avant validation de la liste te convient-elle ?
