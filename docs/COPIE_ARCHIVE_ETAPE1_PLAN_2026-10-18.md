# Copie de « Documents clients scannés » — ÉTAPE 1/4 : preuve sur fichiers de test et plan de copie

> 18/10/2026 · aucun nom de client dans ce document. Fichiers de travail (gitignorés) : `.captures/copie-archive/` —
> `lire.ts` (relevé GET seul), `test-copie.ts` et `test-copie-contre-epreuve.ts` (point A), `test-copie.json`,
> `test-copie-contre-epreuve.json`, `manifeste.jsonl`, `manifeste-ds_store.jsonl`.
>
> Chaque affirmation porte **ÉTABLI** (preuve : mesure, requête, fichier:ligne) ou **NON ÉTABLI**.

## 0. « Documents clients scannés » n'a pas bougé

| Relevé | Heure (UTC) | Éléments | Empreinte (SHA-256 de la liste triée `id|modifiedTime|md5Checksum`) |
|---|---|---|---|
| avant | 2026-10-18T18:12:14Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` |
| après | 2026-10-18T18:26:50Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` |

- **Attendu :** `83d72376…5adb`. Avant et après sont **identiques** et conformes — ÉTABLI.
- **Seules des requêtes GET ont été émises vers « Documents clients scannés »** — ÉTABLI :
  - `lire.ts:14-18` (`garde()` refuse toute méthode ≠ GET et tout `alt=media`), puis `fetchDriveLectureSeule`
    (`app/lib/gestion/driveLectureSeule.ts:33`) ;
  - le script du point A refuse en plus toute requête dont l'URL **ou le corps** contient l'un des 36 705 identifiants
    relevés (`test-copie.ts`, fonction `fetchVerrou`).
- **Aucun fichier de garde-fou n'a été modifié** (`driveGardeFou.ts`, `driveLectureSeule.ts`, `driveEcriture.ts`) —
  ÉTABLI (`git status`).
- **Aucune écriture en base** — ÉTABLI : `gestion_drive_refus` 6, `gestion_drive_arbre` 3 720 et
  `gestion_drive_dossier_cree` 24 lignes, mêmes valeurs avant et après ; dernière ligne de `gestion_drive_mouvement`
  datée du 08/10.
- **Disque T9** : non touché.

---

## A. Preuve sur fichiers de test (hors « Documents clients scannés »)

### A.1 Ce qui a été créé — ÉTABLI

`Base de données locative/_TEST COPIE` — **`1uDIiRbbjIhXpvpeL3-ZZcFslzFRqsYLT`** — laissé en place. Il contient :
- `Copies/` (`1eFLWTreG06YPw0XoIDc8Xsh0p8YxIJOb`) ;
- trois **sources** :

  | Source | Identifiant | Origine |
  |---|---|---|
  | PDF | `1S-F5QWWbaZvy1qTSxfP_NF2X7vh8d8B5` | pièce 27126 du mail « _TEST transfert pièces — 2 sur 3 » |
  | image PNG | `10IfqUR-Za58JBhtDetv_K9Dg0Lcph35Y` | pièce 27140 du mail « _TEST corbeille » (une signature) |
  | Google Doc | `1NZMJVmYugcoqtOs16YkgZ_nC4Oo65BJ034UuWbVIzQ4` | créé avec une phrase factice ; aucun mail ne peut porter un Google Doc |

- **8 copies** dans `Copies/`, chacune marquée `appProperties.svav_source_id = <source>`.

**Conformité à la règle « un essai sur le Drive n'utilise jamais une vraie pièce »** (CLAUDE.md) : le PDF et l'image sont
des pièces de mails « _TEST ».
- Le stockage local (MinIO) était arrêté, et son lancement n'a pas été autorisé dans cette session.
- Les octets ont donc été lus directement dans les fichiers de MinIO, puis **contrôlés par le md5 enregistré en base**
  avant tout envoi : PDF `26c7eab8…`, image `d3b98b7d…`, tous deux identiques.

**Garde-fou :** chaque écriture a obtenu le verdict de `verifierEcriture` (`driveGardeFou.ts:111`).
- Les dossiers ont été créés par `creerDossier` (`driveEcriture.ts:109`), vérifiés avant l'appel pour qu'un refus ne
  journalise rien.
- Les deux dossiers d'essai sont tenus **en mémoire du script seulement**, jamais enregistrés en base : l'application ne
  peut donc pas y écrire.

### A.2 Déroulé
1. **Passe 1** : création des 3 sources (18:14:11 → 18:14:16Z), relevé T0, attente de 20 s, relevé T1, **copie**,
   attente de 20 s, relevé T2.
2. **Passe interrompue** : une erreur réseau sur la 3e copie, après 2 copies réussies (PDF et image). Ces 2 copies
   « orphelines » sont restées. C'est le risque de doublon à la reprise, traité au §B.4.
3. **Contre-épreuve** : les 3 mêmes sources, stabilisées depuis environ 3 min. Relevé T1, **copie**, attente de 60 s,
   relevé T2.

### A.3 Champ par champ, sur les SOURCES (T1 juste avant la copie, T2 après) — ÉTABLI

| Champ | PDF passe 1 | PDF contre-épreuve | Image passe 1 | Image contre-épreuve | Doc passe 1 | Doc contre-épreuve |
|---|---|---|---|---|---|---|
| `modifiedTime` | = | = | = | = | = | = |
| `modifiedByMeTime` | = | = | = | = | = | = |
| `viewedByMeTime` | = (vide) | = (vide) | = (vide) | = (vide) | = | = |
| `md5Checksum` | = | = | = | = | sans objet (Google Doc) | sans objet |
| `headRevisionId` | = | = | = | = | sans objet | sans objet |
| `size` | = | = | = | = | = | = |
| `lastModifyingUser` | = | = | = | = | = | = |
| `version` | **2 → 3** | **3 → 3 (=)** | = (2) | = (2) | = (6) | = (7) |
| `name`, `parents`, `trashed`, `starred`, `properties`, `appProperties` | = | = | = | = | = | = |

**Sur le `version` du PDF (2 → 3) en passe 1 :**
- la **copie** de ce PDF, créée à 18:14:41, est elle-même passée en version 3 dans la minute (relu à 18:15:30) ;
- la contre-épreuve, sur la même source stabilisée, **ne change rien** (3 → 3).

Lecture la plus probable : un traitement de Google propre aux PDF venant d'être envoyés (miniature, indexation)
s'achevait pendant la passe 1. C'est une **hypothèse, NON ÉTABLIE**. Ce qui est ÉTABLI : sur une source stabilisée,
la copie n'a modifié **aucun** champ.

**Un écart inexpliqué :** le Google Doc source est passé de la version 6 (relu à 18:15:30Z) à la version 7 (relu à
18:17:05Z, avant la contre-épreuve). Cela s'est produit sans copie réussie de ce Doc, mais pendant la passe
interrompue, dont l'erreur réseau portait justement sur sa copie. Que cette tentative ait atteint Google ou non est
NON ÉTABLI. Sa date de modification, elle, n'a pas bougé.

### A.4 Les copies — ÉTABLI
- **md5 de chaque copie = md5 de sa source** : PDF 3/3, image 3/3. Les Google Docs n'ont pas de md5 ; leur taille est
  égale (1 024 octets).
- Chaque copie porte `appProperties.svav_source_id`, posé **sur la copie à sa création**. La source ne reçoit rien.

**En 5 lignes :**
1. Sur des sources stabilisées, une copie par l'API ne change **aucune** métadonnée de la source (14 champs relus, dont
   `modifiedTime`, `md5Checksum`, `version`, `headRevisionId`, `lastModifyingUser`, `viewedByMeTime`).
2. Les md5 des copies sont identiques à ceux des sources (6/6). Les Google Docs sont sans md5, à taille égale.
3. Seul écart : `version` du PDF fraîchement envoyé, 2 → 3, aussi constaté sur sa copie. La contre-épreuve ne le
   reproduit pas. Traitement Google en arrière-plan probable, NON ÉTABLI.
4. Le marqueur `svav_source_id` se pose sur la COPIE sans toucher la source. C'est lui qui rend la reprise sûre.
5. `_TEST COPIE` = `1uDIiRbbjIhXpvpeL3-ZZcFslzFRqsYLT`, laissé en place (3 sources + 8 copies, dont 2 orphelines
   d'une passe coupée).

---

## B. Plan de copie (rien n'est écrit)

### B.1 Manifeste — ÉTABLI (`manifeste.jsonl`)

- Une ligne par élément, avec : `id`, `chemin`, `type`, `taille`, `md5Checksum`, `destination`, `canCopy`,
  `copyRequiresWriterPermission`.
- **36 411 éléments** : 4 334 dossiers (racine et branches comprises) et **32 077 fichiers**, pour **74,46 Go**.
- **Exclus : 294 `.DS_Store`** (1,8 Mo), listés à part dans `manifeste-ds_store.jsonl`.
- Destination prévue : `Base de données locative/Documents clients scannés (copie)/<chemin identique>`. Le nom est à
  trancher (question 1).

### B.2 Appels, quotas, durée

| Mesure | Valeur | Statut |
|---|---|---|
| Écritures | **36 411** : 4 334 créations de dossier + 32 077 `files.copy` | ÉTABLI (compte) |
| Lectures | une par copie, ou zéro si l'on demande `id,md5Checksum,size` dans la réponse de la copie (le test le fait) ; plus 1 liste par dossier à la reprise | ÉTABLI (conception) |
| Débit mesuré | une copie toutes les **~1,5 s** en séquentiel (18:14:41.3 → 42.8 → 44.4) | ÉTABLI (3 mesures) |
| Durée | **~15 h en séquentiel** ; ~5 h avec 3 copies en parallèle (≈ 2 écritures/s) | estimation |
| Volume journalier | 74,5 Go, sous la limite de 750 Go par utilisateur et par jour (envois et copies) | limite Google NON ÉTABLIE ici |
| Éléments dans un Drive partagé | +36 411, sous la limite de 400 000 | limite Google NON ÉTABLIE ici |
| Requêtes | ~12 000 par minute (projet et utilisateur) ; les écritures soutenues sont freinées au-delà de quelques par seconde (le code bride déjà : `driveEcriture.ts:34`, 80 ms ; réessais `:91-98`) | NON ÉTABLI ici |
| Stockage | +74,5 Go sur le quota mutualisé de l'organisation | quota restant NON ÉTABLI |
| Plus gros fichier | 2,15 Go ; 39 fichiers de plus de 100 Mo (copies côté serveur, sans transfert local) | ÉTABLI |

### B.3 Cas à risque — ÉTABLI (relevé du 18/10)

| Cas | Nombre | Conduite proposée |
|---|---|---|
| Google Docs / Sheets (sans md5) | **3** Google Docs | vérifier par la taille et le type ; aucun Sheets |
| Raccourcis Drive | **0** | — |
| Raccourcis Windows `.lnk` (fichiers ordinaires) | 6 | copiés comme des fichiers ; ils ne mènent nulle part dans Drive |
| Fichiers sans droit de copie (`canCopy = false`, `copyRequiresWriterPermission`) | **0** / **0** | — |
| Fichiers sans md5 (hors Google natifs) | 0 | — |
| **Noms en double dans un même dossier** | 22 noms, 44 fichiers, aucun dossier | correspondance **par identifiant**, jamais par nom ; Drive accepte des homonymes |
| Chemins de destination de plus de 255 caractères | 36 (max 335) ; profondeur max 13 | Drive n'impose pas de limite de chemin ; une future sauvegarde sur disque pourrait en souffrir |
| Noms avec des caractères de la zone privée Unicode (artefacts Mac, ``…) | 127 | copiés tels quels, jamais renommés |
| Fichiers vides (0 octet) | 261 | copiés |
| Fichiers système `._*` (AppleDouble), dont 274 `._.DS_Store` | 323 | **gardés**, conformément à la consigne (seuls les `.DS_Store` sont exclus) — question 2 |
| Fichiers temporaires Office `~$…` | 87 | gardés — question 2 |
| **🔴 Nom de la racine de destination** | — | voir ci-dessous |

**🔴 Le code protège « Documents clients scannés » par son NOM exact** — ÉTABLI :
- `driveVerdict.ts:257-260` cherche tous les dossiers de ce nom et les protège, eux et leurs ancêtres ;
- `driveLectureFichier.ts:32,94` interdit la lecture de tout ce qui est sous un dossier de ce nom.

Une copie nommée exactement « Documents clients scannés » serait donc **traitée comme l'original** : contenu illisible
dans l'application, aucun dépôt, aucun déplacement. Elle ajouterait aussi `Base de données locative` à la liste des
ancêtres protégés : plus aucun déplacement de cette racine. D'où le nom proposé, avec « (copie) » (question 1).

### B.4 Reprise après coupure, sans rien recopier en double
La passe interrompue du point A l'a montré : une coupure **après** la réponse de Google mais **avant** la
mémorisation laisse une copie que le programme ignore. Le plan :

1. **Le marqueur sur la copie.** Chaque copie et chaque dossier créé portent
   `appProperties.svav_source_id = <identifiant de l'élément de « Documents clients scannés »>`. Il est posé **dans
   la requête même** de copie ou de création, donc de façon atomique. La source n'est jamais touchée (§A.3).
2. **Un registre en base.** Une table en ajout seul (migration d'un lot ultérieur), avec `source_id`, `copie_id`,
   `md5_source`, `md5_copie`, `etat` (`a_faire` → `copie` → `verifie`) et les dates. Elle est remplie depuis le
   manifeste avant la première écriture.
3. **Avant chaque copie**, si le registre ne connaît pas encore de `copie_id`, on lit le dossier de destination :
   `'<dest>' in parents and appProperties has { key='svav_source_id' and value='<source>' }`.
   - Une copie trouvée est **adoptée** (identifiant mémorisé, md5 vérifié), pas refaite.
   - S'il en existe plusieurs (cas du point A), on garde la plus ancienne et on **signale** les autres, sans les
     effacer.
4. **L'ordre** : les dossiers d'abord, en largeur, puis les fichiers dossier par dossier. Une reprise repart du premier
   `a_faire`.
5. **La vérification** : le md5 de la copie doit être égal au md5 du manifeste. Sinon : état `ecart`, et pas de
   nouvelle copie automatique.
6. **Les empreintes** : celle de « Documents clients scannés » est relevée avant et après **chaque** session de copie ;
   un écart arrête tout.

---

## C. Verrou de la copie (conception seulement)

**Principe :** une **seule** opération devient possible sur « Documents clients scannés » : `files.copy` d'un
**fichier** listé au manifeste validé, vers un dossier **que nous avons créé** sous `Base de données locative`.

Tout le reste reste interdit, sans exception :
- `driveCorbeille.ts:22-24, 92`, `driveDeplacement.ts`, `driveVerdict.ts` et `driveLectureFichier.ts` ne changent pas ;
- `driveLectureSeule.ts` ne change pas.

### C.1 Ce qui change dans `driveGardeFou.ts`

| Lignes | Changement |
|---|---|
| 7-9 (en-tête) | ajouter la décision d'Arno du 18/10 : la **copie** depuis « Documents clients scannés » est la seule exception à « ne copie RIEN » ; tout le reste de l'en-tête tient |
| 44-45 (`OperationDrive`) | ajouter `'copier_depuis_scannes'`. `'copier'` existant **ne change pas de sens** et reste soumis à `verifierEcriture` |
| 111-186 (`verifierEcriture`) | **inchangé**. Sa garde sur la cible (l.168-182) continue de refuser toute cible hors liste blanche, donc toute source de « Documents clients scannés » pour les autres opérations |
| après 186 (nouveau) | une fonction **pure** `verifierCopieDepuisScannes(demande, index, scannes)`, qui rend `ok` seulement si **toutes** les conditions ci-dessous sont réunies |

**Conditions de `verifierCopieDepuisScannes`** :
1. la source figure au **manifeste validé**, et c'est un fichier, pas un dossier ni un raccourci ;
2. la chaîne de parents de la source, **relue chez Google**, atteint l'identifiant de « Documents clients scannés »,
   lui-même retrouvé par `idsProteges` (`driveVerdict.ts:251`) et égal à la racine du manifeste ;
3. le dossier de destination est dans la **liste blanche** (nouvelle sorte `copie_scannes` dans `gestion_drive_arbre`)
   **et** remonte jusqu'à `Base de données locative` (`ascensionVersRacine`, l.87) ;
4. la destination n'est **ni** sous « Documents clients scannés » (aucun ancêtre protégé), **ni** sous
   `00 Arrivée des mails` ;
5. un seul parent de destination.

### C.2 Ce qui change dans `driveEcriture.ts`

Une 4e fonction, `copierDepuisScannes`, la seule qui émette `POST …/files/<id>/copy` :
- elle appelle `verifierCopieDepuisScannes` avant tout envoi, et journalise un refus (`journaliserRefus`, l.56) ;
- le corps envoyé est construit **dans la fonction**, jamais reçu de l'appelant : exactement
  `{ parents: [dest], appProperties: { svav_source_id } }` ;
- son `fetch` est enveloppé par un `fetchCopieScannes`. Celui-ci refuse, si l'URL ou le corps contient un identifiant
  de « Documents clients scannés », toute requête autre que ce `POST /copy` ou un `GET` : `PATCH`, `PUT`, `DELETE`,
  `/permissions`, `/watch`, `/emptyTrash`, `addParents`, `removeParents`, `trashed`, `properties`.

L'en-tête (l.10-13) passe de « trois choses » à quatre.

### C.3 Le test qui prouve qu'aucune autre opération n'est possible

`driveGardeFou.test.ts`, nouveau bloc **exhaustif** : le produit cartésien de
- **toutes** les `OperationDrive` ;
- une source **dans** « Documents clients scannés » (fichier, dossier, la racine elle-même, une branche), ou **hors**
  de lui ;
- une destination dans la liste blanche sous la racine, sous la racine mais hors liste blanche, **dans** « Documents
  clients scannés », dans `00 Arrivée des mails`, ou hors de `Base de données locative`.

**Un seul triplet doit passer** : `(copier_depuis_scannes, fichier du manifeste, destination en liste blanche)`.

Plus :
- **`fetchCopieScannes`** : `PATCH`, `PUT` et `DELETE` sur un identifiant protégé **lèvent une exception** avant tout
  envoi, avec un `fetch` simulé qui échoue s'il est appelé. Idem pour un `POST /copy` dont le corps contient autre
  chose que `parents` et `appProperties`, ou dont `parents` désigne un dossier protégé ;
- **le garde statique existant** (`driveGardeFou.test.ts:270-277`) est étendu : `copierDepuisScannes` doit appeler
  `verifierCopieDepuisScannes`, et la chaîne `/copy` ne doit apparaître **que** dans cette fonction ;
- **le test d'absence d'identifiant en dur** (`:279-283`) reste tel quel. L'identifiant de « Documents clients scannés »
  se lit au runtime, jamais dans le code.

---

## D. Questions de choix métier

1. **Le nom du dossier copié.** Exemple : `Documents clients scannés (copie)` ou `Documents clients scannés — copie du
   18/10/2026`. Il ne doit **pas** porter le nom exact, sinon l'application le traiterait comme l'original protégé
   (§B.3). Lequel préfères-tu ?
2. **Les fichiers système et temporaires**, à savoir 323 `._…` (dont 274 `._.DS_Store`) et 87 `~$…` (verrous Word) :
   les copie-t-on (ta consigne n'exclut que les `.DS_Store`) ou les écarte-t-on aussi ? Exemple : `._Bail.pdf` ne
   contient pas le bail, seulement des métadonnées du Mac.
3. **Que faire de « Documents clients scannés » pendant la copie (≈ 5 à 15 h) ?** On y travaille encore (246 fichiers
   modifiés en octobre). Gèle-t-on les dépôts pendant la copie, ou rattrape-t-on à la fin les fichiers dont la date de
   modification est postérieure au début ?
4. **Les 2 copies orphelines du test** (et le dossier `_TEST COPIE` en entier) : tu as demandé de le laisser en place.
   Veux-tu qu'il soit mis à la corbeille par le geste normal après ta vérification ?
