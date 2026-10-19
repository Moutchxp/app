# Copie de « Documents clients scannés » — diagnostic du 2e arrêt (19/10/2026)

> **Diagnostic sans aucune écriture sur « Documents clients scannés »** : seulement des lectures de métadonnées (GET, par
> `fetchDriveLectureSeule`, avec un garde « GET seul, jamais `alt=media` »). La copie n'a **pas** été relancée.
> La seule écriture du lot est l'expérience du point 3, faite **hors** de « Documents clients scannés », dans
> « Base de données locative / _TEST COPIE », sur les pièces d'essai des mails « _TEST ». La copie créée par l'essai a été
> remise à la corbeille par le geste de l'application (mouvement n° 241), jamais supprimée.
> Les journaux de `.captures/copie-archive/` ont été **lus**. Les scripts et sorties du diagnostic sont dans
> `.captures/diagnostic-arret2-copie/` (non versionné). Aucun nom de client ici : « [propriétaire] ».

Arrêt du 19/10/2026 à 01:32 (heure de Paris) :
`ARRÊT GLOBAL (motif 1) : contrôle d'empreinte : EMPREINTE CHANGÉE au contrôle intermédiaire (108 écart(s), détail dans ecarts-controle.txt)`.

Le contrôle a fonctionné exactement comme prévu : il s'est déclenché à 5 000 copies, il a arrêté tous les ouvriers et
journalisé chaque écart. Le relevé de départ et celui du contrôle contiennent chacun tous les champs de chaque élément ; la
comparaison ci-dessous est faite champ par champ entre les deux.

## 1. Les 108 écarts — ÉTABLI

| | Nombre | Champs changés |
|---|---|---|
| Dossiers | **76** | `version` seulement |
| **Fichiers** | **32** (16 PDF, 10 JPEG, 5 docx, 1 HEIF) | `version` seulement |
| Éléments ajoutés / disparus | 0 / 0 | — |

- **Seul le champ `version` a bougé**, de **+1** chaque fois, pour les 108 éléments.
- Inchangés pour tous : `name`, `parents`, `size`, `md5Checksum`, `modifiedTime`, `createdTime`, `headRevisionId`,
  `lastModifyingUser`.
- **Correction de l'hypothèse** : ce ne sont **pas que des dossiers**, il y a aussi 32 **fichiers**. Leur version a avancé
  sans aucun changement de contenu : même md5, même taille, même révision, même date de modification.
- L'empreinte (a), qui n'inclut pas la version, était **identique** au contrôle. Seule l'empreinte (b), qui inclut la
  version, a changé.

## 2. Corrélation avec la copie — ÉTABLI : la copie n'en est pas la cause

Fenêtre étudiée : du relevé de départ (00:40:47, heure de Paris) au contrôle (01:32:28). Pendant cette fenêtre,
**5 000 copies** ont été faites, issues de **591 dossiers**.

| Constat | Chiffre |
|---|---|
| Fichiers en écart qui ont été copiés pendant la fenêtre | **0 / 32** |
| Dossiers en écart qui contiennent au moins un fichier copié pendant la fenêtre | **5 / 76** |
| Dossiers en écart **sans** aucun fichier copié | **71 / 76** |
| Dossiers dont des fichiers ont été copiés, **sans** écart | **586 / 591** |

- Les écarts touchent 36 dossiers propriétaires (106 dans « 1 actifs », 1 dans « 2 vendus », 1 dans « 3 perdus »), à
  toutes les profondeurs (de 2 à 7).
- 13 des 32 fichiers sont dans un dossier lui-même en écart, et 40 des 76 dossiers aussi.
- **Intervention humaine visible** : aucune trace. Aucun élément de « Documents clients scannés » n'a une `modifiedTime`
  postérieure au départ. Le `lastModifyingUser` des éléments en écart n'a pas changé : ce sont les auteurs historiques des
  fichiers, pas une modification de la nuit. Le compte de la copie (gestion@) n'a ni `viewedByMeTime` ni `modifiedByMeTime`
  dans la fenêtre.
- **Aucun programme de l'application** n'écrivait dans le Drive : les journaux des agents locaux (empreintes Drive, relève
  continue, copie des pièces) n'ont plus été écrits depuis le 15/10/2026.
- Les métadonnées complètes (permissions, propriétés, étiquettes, étoile, restrictions) des 108 éléments sont
  **indistinguables** d'un échantillon témoin de 108 éléments sans écart.
- **Depuis l'arrêt** (relu le 19/10 à 02:05) : **0** nouvel écart. Plus rien n'a bougé quand la copie s'est arrêtée.
  C'est une coïncidence dans le temps, mais **pas** dans l'espace, puisque les éléments touchés ne sont pas ceux qui ont
  été copiés.
- **Précédent** : le 18/10, le PDF d'essai est passé de la version 2 à la version 3 quelques minutes **après** sa
  création et sa copie, sans aucun changement de contenu.

**Cause exacte : NON ÉTABLIE.** L'hypothèse la plus probable est un traitement de Google en arrière-plan : indexation,
vignettes, reconnaissance de texte des PDF et images, ou propagation interne au Drive partagé. Ces traitements avancent la
`version` sans toucher au contenu. Cela reste une hypothèse.

**Pour l'établir**, il faudrait l'une de ces deux lectures, qui demandent ton accord :
- le **journal d'activité du Drive** (API Drive Activity, une requête de lecture envoyée en POST) sur ces 108 éléments
  pendant la fenêtre ;
- le **flux des changements** du Drive partagé (`changes.list`, une lecture GET). Il existe en base un point de départ du
  15/10 pour « GESTION LOCATIVE » (`gestion_drive_index_etat`).

Le garde de lecture actuel n'autorise que `files` et `drives`, et le modifier est interdit dans ce lot.

## 3. Expérience hors « Documents clients scannés » — ÉTABLI

Dans « Base de données locative / _TEST COPIE » : 3 fichiers d'essai (le PDF d'essai, l'image d'essai et un Google Doc
factice), plus un sous-dossier « Copies ». Les versions ont été relevées après chaque étape, puis 65 s et 4 min après la
copie.

| Étape | Version du dossier SOURCE | `modifiedTime` du dossier source | Version du fichier source | Version de « Copies » |
|---|---|---|---|---|
| Départ | 1 | 18/10 18:12:27 | 3 | 1 |
| (a) lister le dossier | 1 | inchangée | 3 | 1 |
| (b) lire les métadonnées des fichiers | 1 | inchangée | 3 | 1 |
| (c) copier le PDF vers « Copies » (+5 s, +65 s, +4 min) | **1** | **inchangée** | **3** | **1** |

**Aucune des trois opérations ne fait avancer la version du dossier source**, et sa `modifiedTime` ne bouge pas. Même le
dossier qui **reçoit** la copie garde sa version. C'est cohérent avec le point 2.

## 4. État de la copie — ÉTABLI

| | |
|---|---|
| Fichiers du manifeste | 31 667 |
| **Copiés et vérifiés** (`etat.json`) | **10 253** — dont 5 000 depuis la relance de 00:36, chacun vérifié (0 écart de contenu, 0 erreur, 0 refus) |
| Restants | **21 414** |
| Progression continue | jusqu'à l'index 10 197 (dernière copie à 01:28:31, heure de Paris) ; prochain à copier : 10 198 |
| Hors de la plage continue | 55 fichiers d'index plus loin dans la liste (index 13 610 à 13 621, 21 196 à 21 237 et 29 253), déjà copiés et vérifiés (l'essai du 18/10 et le 3e document Google de l'essai de reprise) |
| **Doublons** | **0** : aucune copie en double dans `etat.json`, aucune source copiée deux fois, aucune source avec deux versions |
| Dossiers miroirs | 4 334, tous dans `etat.json` |

La reprise repartira sans doublon, à l'index 10 198.

## 5. Empreinte (a) actuelle de « Documents clients scannés » — ÉTABLI

Relevé complet du 19/10/2026 à 02:05 (heure de Paris), même méthode qu'à l'origine (sans la version) :
- **a = `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` — IDENTIQUE.**
- 36 705 éléments.
- b = `e38ed7a94c1662953c3f4a277ff6c4869f6071214ea327f2f2a4a27647e17129`, identique à celle du contrôle à 5 000 copies.

Différences avec le départ : exactement les 108 avances de version du point 1. Aucun autre changement.

## 6. Proposition de critère d'arrêt (rien n'est implémenté)

**Constat préalable** : le critère que tu proposes (arrêt conservé sur la version des **fichiers**, version des
**dossiers** seulement journalisée) **aurait quand même arrêté la copie cette nuit**. 32 fichiers ont avancé de version
sans aucun changement de contenu.

### Option A — ton critère, tel quel
- **Arrêt** si, pour un élément quelconque : ajouté ou disparu, ou bien `name`, `parents`, `modifiedTime`, `md5Checksum`
  ou `size` changés, ou bien, pour un **fichier**, `version` ou `headRevisionId` changé.
- **Journal seulement** : la `version` d'un **dossier**.
- **Effet sur cette nuit** : arrêt (32 fichiers).

### Option B — recommandée
- **Arrêt** sur tout ce qui touche le contenu ou la place d'un élément : ajout, disparition, `name`, `parents`,
  `modifiedTime`, `md5Checksum`, `size`, **`headRevisionId`** (une nouvelle révision du contenu).
- **Journal** : la `version` seule (fichier ou dossier), quand **aucun** des champs précédents n'a bougé, avec la liste
  des éléments concernés.
- **Effet sur cette nuit** : pas d'arrêt, et les 108 avances seraient journalisées. Une vraie modification du contenu
  change toujours le md5, la taille, la révision ou la date : elle arrêterait toujours la copie.
- **Garde-fou supplémentaire possible** : un arrêt si plus de N versions avancent entre deux contrôles (par exemple 1 000).

### Lignes concernées (`.captures/copie-archive/copie.ts`)
- **l. 417** (`if (x.a !== reference.a || x.b !== reference.b)`) : remplacée par un appel à une fonction PURE
  `ecartsBloquants(reference.els, x.els)`, qui rend `{ bloquants, journalises }`. On arrête si `bloquants` n'est pas vide ;
  on journalise `journalises`.
- **l. 139** (`ecarts`) : rendrait aussi, pour chaque élément, les champs changés et sa nature (fichier ou dossier).
- **l. 123-128** (empreintes a et b) : inchangées ; elles restent dans le journal pour la traçabilité.
- La fonction pure irait dans `app/lib/gestion/copieScannesMoteur.ts`, à côté de `jugerCopie`.

### Test qui le prouve (`copieScannesMoteur.test.ts`)
- **Option A** :
  - une version de **dossier** +1 seule donne un élément journalisé et aucun bloquant ;
  - une version de **fichier** +1 seule donne un bloquant ;
  - un md5, une taille, une `modifiedTime`, un nom, un parent, un ajout ou une disparition donnent chacun un bloquant.
- **Option B** :
  - une version +1 seule, de fichier **ou** de dossier, est journalisée ;
  - un `headRevisionId` changé est bloquant, et chacun des autres champs de contenu aussi.
- **Les deux options** : rejouer les deux vrais relevés de cette nuit (départ et contrôle), réduits à un extrait anonymisé.
  L'option A doit arrêter (32 fichiers), l'option B ne doit pas arrêter (108 éléments journalisés).

---

*Sources : `.captures/copie-archive/{journal-copie.log, ecarts-controle.txt, progression.jsonl, etat.json,
releve-complet-depart.json, releve-controle-5000.json, test-copie.json}` (lus) ; relevé et métadonnées complètes du 19/10
(`.captures/diagnostic-arret2-copie/diagnostic2.json`) ; expérience (`exp3.json`).*
