# RECON — « Documents clients scannés » : structure, rapprochement avec l'annuaire, stratégies de rapatriement

> 18/10/2026 · lecture seule · **aucun nom de client dans ce document**. Les exemples sont des gabarits (`NOM`,
> `NOM1 - NOM2`, `SCI XXX`…) ; la table nominative est dans `.captures/recon-dossiers-scannes/correspondance.csv`
> (gitignoré, jamais committé).
>
> Chaque affirmation porte **ÉTABLI** (preuve : fichier:ligne, requête, lecture Drive) ou **NON ÉTABLI**.

## 0. Garanties de ce lot

| Garantie | Preuve | Statut |
|---|---|---|
| Seules des requêtes **GET de métadonnées** ont été émises | `.captures/recon-dossiers-scannes/lire.ts:14-18` : `garde()` lève une exception pour toute méthode ≠ GET (l.16) et pour tout `alt=media` (l.17), puis passe par `fetchDriveLectureSeule`, qui refuse lui aussi toute méthode ≠ GET (`app/lib/gestion/driveLectureSeule.ts:33`), toute adresse hors de l'API de lecture et `/permissions`, `/copy`, `/watch`… (l.28, l.34-37). Tous les appels passent par `garde` (`lire.ts:31`) ; `raccourcis.ts` passe par `fetchDriveLectureSeule` | ÉTABLI |
| Aucun contenu téléchargé | champs demandés : `id,name,mimeType,parents,size,md5Checksum,modifiedTime,createdTime` (`lire.ts`, constante `CH`) ; aucun `alt=media` | ÉTABLI |
| Archive **identique avant / après** | empreinte = SHA-256 de la liste triée `id|modifiedTime|md5Checksum` des **36 705** éléments | ÉTABLI |
| Aucune écriture en base | uniquement `SELECT` / `\copy (SELECT …) TO` vers `.captures/` | ÉTABLI |
| Base du serveur, disque T9 | non touchés | ÉTABLI |

**Empreintes de l'arbre « Documents clients scannés »** (`1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI`) :

| Relevé | Heure (UTC) | Éléments | SHA-256 |
|---|---|---|---|
| avant | 2026-10-18T15:52:34Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` |
| après | 2026-10-18T16:01:08Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` |

---

## 1. Structure — ÉTABLI (lecture complète, `elements.json`)

### 1.1 Volumes

| Branche | Dossiers | Fichiers | Volume | Profondeur max |
|---|---|---|---|---|
| `1 actifs` | 3 604 | 27 929 | 64,49 Go | 12 niveaux sous la branche |
| `2 vendus` | 165 | 1 221 | 2,00 Go | 6 |
| `3 perdus` | 561 | 3 221 | 7,97 Go | 7 |
| **Total** | **4 330** (+ racine + 3 branches) | **32 371** | **74,46 Go** | — |

Fichiers par niveau, sous la branche (`1 actifs`) : N2 608 · N3 7 910 · N4 7 346 · N5 6 699 · N6 3 579 · N7 1 344 · N8 332 · N9
66 · N10 28 · N11 8 · N12 9. Les autres branches suivent la même pente, en plus petit.

**Types de fichiers :** PDF 20 597 · JPEG 8 612 · DOCX 1 634 · `octet-stream` 600 (dont **568 `.DS_Store`**,
fichiers système du Mac) · PNG 364 · TXT 237 · HEIF/HEIC 143 · DOC 45 · ZIP 45 · XLSX 16 · `.lnk` Windows 6 ·
vidéos 6. Trois fichiers n'ont pas de `md5Checksum`.

**🔴 L'archive est VIVANTE.** Fichiers modifiés depuis le 01/01/2026 : 3 988 ; depuis le 01/09 : 754 ; depuis le 01/10 :
**246** (tous dans `1 actifs`). Fichiers créés depuis le 26/09 : 365. Dernière modification : 17/10/2026. (Le
`modifiedTime` du dossier racine, lui, date de 2025 : un dossier ne change pas quand on modifie son contenu.)

### 1.2 Conventions de nommage observées

| Niveau | Ce qu'il représente | Respect | Formes observées (gabarits anonymisés) |
|---|---|---|---|
| **Branche** | statut du mandat : `1 actifs` / `2 vendus` / `3 perdus` | 3/3 | — |
| **N1** | **un propriétaire** (ou une société, un couple). Parfois découpé **par bien** : deux N1 pour un même propriétaire, avec une précision | 363/363 sont des noms de personne ou de société | `NOM` (majorité) · `NOM Prénom` · `NOM1 - NOM2` / `NOM1-NOM2` (couple ou indivision : 28 actifs, 3 perdus, 1 vendu) · `SCI XXX` / `Société …` (14 actifs, 4 perdus) · `NOM (précision)` (16 actifs, 8 vendus, 15 perdus) où la précision est une rue, une commune, un étage, `lot NN` ou `Parking` · `NOM MANDAT N°NN` (4 actifs, 3 perdus) |
| **N2** | **une rubrique** (cas général) ou **un bien** quand le propriétaire en a plusieurs | rubriques reconnues : 957/1 072 actifs (89 %), 65/66 vendus, 208/226 perdus ; nom **exactement** canonique : 884/1 072 (82 %), 63/66, 179/226 | rubriques : `Propriétaire` 243 · `Locataire(s)` 228 · `Photos` 199 · `Diagnostics` 151 · `Syndic` 78 · `Travaux` 33 · `Parking` 24 ; variantes : `Locataire` ≠ `Locataires`, `Diags`, `Diag`, `Diagnostics Techniques`, `PROPRIETAIRE`, `Prorpriétaire`, `Proprio`, `Photos 2`, `Photos 2023`, `Syndic ` (espace final) ; biens : `NN rue XXX Commune`, `Appart NN`, `Appart 3 - 1er étage face`, `Studio …` (69 actifs, 15 perdus, 1 vendu) ; autres : `Litige …`, `Mairie`, `Permis de louer`, `Internet`… (46 actifs) |
| **N3 sous `Locataire(s)`** | **un locataire ou un bail** (nom du ou des locataires), plus des `Archives` (anciens locataires) | 407 noms + 30 `Archives` sur 451 (actifs) | `NOM` · `NOM1 - NOM2` · `NOM (lot NN)` · `Société XXX` · `Archives` |
| **N3 sous un bien** | **une rubrique** (même liste qu'en N2) | 177/185 (actifs) | `Locataires`, `Photos`, `Propriétaire`, `Diagnostics`… |
| **N4 et plus** | libre : années (`2026`), `AGO`, `Dossier loc + Garants`, `Id fiscal`, `Photos retouchées`… | aucune convention mesurable | — |

Autres constats : 19 N1 actifs n'ont **aucune** rubrique reconnue (fichiers posés à plat) ; 28 N1 actifs contiennent des
sous-dossiers de **bien** ; 608 fichiers sont posés à même un dossier propriétaire (`1 actifs`).

---

## 2. Rapprochement avec l'annuaire

### 2.1 Ce qui a été utilisé — ÉTABLI
- **Base du Mac** (`sansvisavis`, `SELECT` seulement) : `gestion_annuaire_proprietaire` (313 fiches, 308 après
  exclusion des fiches `_TEST` et supprimées), `gestion_annuaire_lot` (365), `gestion_annuaire_locataire` (510),
  `gestion_annuaire_occupation` (535), `gestion_annuaire_lot_proprietaire` (17).
- **Aucun export WIPPIMMO** dans le projet (recherche `*wippimmo*`, `*.xlsx`, `*.csv` hors `node_modules` : seulement
  Sitadel, PRADA et des pièces jointes de brouillons dans `.minio`) — ÉTABLI.
- Script : `.captures/recon-dossiers-scannes/rapprocher.py`.

### 2.2 Ce qui manque pour un rapprochement complet — ÉTABLI
La base du Mac n'a pas les migrations Location 370-382 :
- **propriétaires et biens créés dans le module Location** (clé `app-…`) : le Mac n'en a que 6. Ceux du serveur
  manquent, donc des N1 récents tombent en « AUCUN » à tort ;
- `sorti_portefeuille_le` (373), `gestion_lot_sortie_origine` (381), `en_gestion` (375) : impossible de vérifier qu'un
  dossier `2 vendus` correspond bien à un bien **sorti** ;
- `categorie` et `gestion_lot_annexe` (372) : impossible de rattacher un N1 `NOM (Parking)` à **l'annexe** plutôt
  qu'au logement ;
- les liens de copropriété ajoutés depuis la 278 sur le serveur (17 seulement sur le Mac).
- Par construction, l'annuaire ne contient **que les mandats importés de WIPPIMMO** : 0 propriétaire `absent_le`,
  0 lot en fin de gestion. Les propriétaires **perdus ou vendus** avant l'import ne peuvent donc pas y être.

### 2.3 Règles de classement (rien n'est rattaché « au jugé »)
Trois critères indépendants, sur le **N1** :
- **(a) nom** : le nom de famille de la fiche figure dans le nom du dossier (ou l'inverse, pour `NOM` contre une fiche
  `NOM1 NOM2`) ;
- **(b) adresse ou n° de lot** : une voie d'un lot de ce propriétaire figure dans le N1 ou ses sous-dossiers (numéro
  exigé s'il est écrit), ou un `lot NN` du dossier est un lot WIPPIMMO de ce propriétaire ;
- **(c) locataire** : un sous-dossier placé sous `Locataire(s)` porte le nom d'un locataire ayant occupé un lot de ce
  propriétaire.

Classes : **SÛR** = (a) + (b) avec un seul candidat · **PROBABLE** = un seul candidat retenu sans (b), soit par le nom
seul, soit par le nom + (c), soit parmi des homonymes départagés par (c) ou par le prénom · **AMBIGU** = plusieurs
candidats que rien ne départage · **AUCUN** = aucun propriétaire de ce nom.
⚠️ (c) n'est **pas** compté comme une adresse : s'il doit valoir « sûr », c'est une décision (question 1).

### 2.4 Effectifs — ÉTABLI (`rapprochement.json`)

| Branche | SÛR | PROBABLE (dont confirmé par un locataire) | AMBIGU | AUCUN | Total N1 |
|---|---|---|---|---|---|
| `1 actifs` | **18** (4 286 fichiers) | **238** (214) — 22 762 fichiers | 5 (500 fichiers) | 5 (381 fichiers) | 266 |
| `2 vendus` | 2 (127) | 8 (2) — 535 | 3 (145) | 7 (414) | 20 |
| `3 perdus` | 0 | 41 (4) — 2 377 | 2 (28) | 34 (816) | 77 |

- 288 des 308 fiches de la base sont retrouvées au moins une fois. Un même propriétaire peut avoir plusieurs N1 (découpage
  par bien ou par commune).
- **Actifs : 232 N1 sur 266 (87 %) ont au moins deux concordances indépendantes** (SÛR, ou PROBABLE confirmé par un
  locataire). SÛR + PROBABLE en actifs couvrent 27 048 fichiers.
- AMBIGU en actifs : homonymes réels, par exemple deux fiches de même nom (parent et enfant), ou deux fiches qui
  partagent un nom composé.
- **Dossiers de locataires** (sous `Locataire(s)`, toute profondeur) rapprochés de la table des locataires par le nom :
  actifs 421 avec un seul candidat, 65 avec plusieurs, 173 sans ; vendus 10/2/17 ; perdus 17/6/69.
- Les **biens** (N2 de type adresse) ne sont rapprochés que par le critère (b) : le seul n° qui identifie un bien dans
  l'archive est un `lot NN` occasionnel (9 N1). Ce `NN` est supposé être l'identifiant de lot WIPPIMMO (NON ÉTABLI
  au-delà des concordances trouvées).

---

## 3. Doublons avec « 00 Arrivée des mails » — ÉTABLI

Comparaison par `md5Checksum` avec les 26 523 fichiers de `Base de données locative/00 Arrivée des mails`, lus le même
jour par GET.

| Branche | Fichiers de l'archive déjà présents dans l'arrivée | dont < 10 ko (logos, signatures) | Volume |
|---|---|---|---|
| `1 actifs` | 1 466 | 253 | 1,97 Go |
| `2 vendus` | 29 | 5 | 0,07 Go |
| `3 perdus` | 81 | 13 | 0,10 Go |
| **Total** | **1 576** (1 305 hors petits fichiers) | 271 | 2,14 Go |

Autres mesures :
- En contenus distincts, 1 248 des 31 152 empreintes de l'archive se retrouvent dans l'arrivée. Côté arrivée, 2 244
  fichiers sur 26 523 ont leur contenu dans l'archive.
- **Doublons internes à l'archive** : 1 216 fichiers en trop (2,17 Go).

---

## 4. Classement fin d'après les noms — ÉTABLI sur les noms, fiabilité réelle NON ÉTABLIE

Méthode : sur les 31 791 fichiers (hors `.DS_Store` et `.tmp`), la rubrique est déduite du **dossier** (N2/N3), puis la
sous-rubrique du **nom de fichier** par mots-clés (DPE, CNI, passeport, bulletin, avis d'imposition, garant, Visale,
GLI, attestation d'assurance, chaudière, ramonage, PNO, taxe foncière…). Script : `structure.py`.

| Mesure | Fichiers | Part |
|---|---|---|
| Rubrique N6 déductible **du dossier** (Propriétaire / Locataires / Photos / Diagnostics / Syndic / Travaux / annexe / litige) | 30 826 | **97,0 %** |
| Placement **au niveau final de la cible** déductible sans hésitation | 13 946 | **43,9 %** |
| — sur un **échantillon tiré au hasard de 200 fichiers** | 102 | **51 %** |
| Sous `Locataire(s)` : une seule sous-rubrique N8 par le nom | 7 828 / 18 479 | 42,4 % (248 conflits, 10 403 indéterminés) |
| Sous `Propriétaire` : PNO ou taxe foncière par le nom | 272 / 4 261 | 6,4 % (le reste : mandats, titres, RIB… sans case dans la cible) |
| Noms génériques (`IMG_…`, `scan…`, `DSC…`, chiffres seuls) | 10 050 | 31,6 % |
| Contrôle croisé dossier ↔ nom de fichier (Diagnostics / Syndic / Travaux) | 360 / 414 | 87 % d'accord |

Ce que ça veut dire :
- **La rubrique (N6) se déduit bien du dossier.** Photos, Diagnostics et Syndic sont rangés à 87 % sous des noms
  canoniques.
- **Le niveau fin (N8, N10) ne se déduit que pour un peu moins de la moitié des fichiers.** La moitié restante finirait
  dans `0 En attente`, selon la règle « une pièce mal rangée est pire qu'une pièce en attente » (`classement.ts:24-26`).
- **La fiabilité réelle n'est pas mesurable sans ouvrir les fichiers**, ce que ce lot interdit. Le seul contrôle
  possible est l'accord entre le dossier et le nom du fichier (87 %).
- Les **baux et états des lieux** (`bail`, `edl`, `contrat de location`) sont reconnus par le nom mais **n'ont pas de
  case** dans la cible N8 (question 5).

---

## 5. Trois stratégies, chiffrées

Hypothèses communes :
- **Débit.** Le dépôt de 26 523 pièces dans `00 Arrivée des mails` a pris environ 15 h (26/09 10:47 → 27/09 01:40,
  `gestion_drive_arbre`), soit environ 0,5 fichier/s. C'était un **envoi**, plus lent qu'une copie interne. Une copie
  côté serveur, avec la pause de 80 ms du code (`driveEcriture.ts:34`), est estimée entre 0,5 et 2 fichiers/s.
  NON ÉTABLI par mesure.
- **Limites Google** (documentation Google, NON ÉTABLI ici) : 400 000 éléments par Drive partagé ; 750 Go transférés
  par utilisateur et par jour ; stockage d'un Drive partagé décompté sur le quota mutualisé de l'organisation.
  Quota restant : NON ÉTABLI.
- **Rien n'est mis à la corbeille.** Le code ne met jamais un dossier à la corbeille (`driveCorbeille.ts:22-23`) : une
  copie de dossiers n'est donc réversible qu'en la **déplaçant** ailleurs.

### A. Rapatriement trié dans la nouvelle arborescence

| Fichiers | Volume copié | Durée de copie | Travail humain | Éléments créés |
|---|---|---|---|---|
| 31 791 (27 048 si l'on se limite aux actifs SÛR + PROBABLE) | 74,5 Go, ou ~72 Go sans les 1 305 doublons de l'arrivée | ~4 h 30 à ~18 h | ~17 800 fichiers en `0 En attente` à trier à la main (56 %) | ~32 000 fichiers + dossiers cibles |

- **Risques** :
  1. erreurs de rubrique, ou d'année (impossible à déduire du nom pour la plupart) ;
  2. **deux versions qui divergent**, puisque l'archive vit encore (246 modifications en octobre) ;
  3. pièces d'identité et avis d'imposition **dupliqués** (RGPD) ;
  4. stockage doublé.
- **Réversible** : partiellement. Les fichiers copiés peuvent aller à la corbeille, les dossiers non (règle du code).
  L'original reste intact.
- **Ce que voit l'utilisateur** : depuis une fiche, le N5 du bien avec les pièces **dans** ses rubriques. Un seul
  endroit à regarder, mais en partie faux ou en attente.

### B. Copie telle quelle sous « Base de données locative » + rattachement en base

| Fichiers | Volume copié | Durée de copie | Travail humain | Base |
|---|---|---|---|---|
| 31 791 | 74,5 Go, 4 330 dossiers recréés | ~4 h 30 à ~18 h | validation des ~250 rattachements PROBABLE et des 10 AMBIGU / AUCUN des actifs | une ligne par N1 copié (363) et par bien N2 (~85), reliée à la fiche propriétaire / bien / locataire |

- **Risques** : divergence (l'archive vit), RGPD (duplication), stockage doublé, **aucun** classement fin.
- **Réversible** : comme A.
- **Ce que voit l'utilisateur** : sur la fiche, un lien « Documents scannés » vers la copie. Ses rubriques restent celles
  d'avant (`Propriétaire`, `Locataires`…), sans lien avec les N6 de la nouvelle arborescence.

### C. Aucune copie : rattachement en base des dossiers ORIGINAUX + raccourcis

| Fichiers copiés | Volume | Durée | Raccourcis | Base |
|---|---|---|---|---|
| 0 | 0 | quelques minutes (~300 à 450 raccourcis à 80 ms + délais Google) | un par N1 ou par bien | une ligne par N1 / bien original, par identifiant |

- **Un raccourci modifie-t-il sa cible ? — NON, ÉTABLI par mesure** sur 40 des 365 raccourcis existants, tirés au
  hasard :
  - pour 39 sur 40, la cible n'a pas été modifiée après la création du raccourci (`modifiedTime` cible < `createdTime`
    raccourci). Les cibles relues gardent `version: 1` et n'ont ni `properties` ni `appProperties` (`raccourcis.json`) ;
  - le 40e a une cible modifiée plus tard, sans que la cause ait été recherchée (des fichiers déposés ensuite dans deux
    biens sont une explication possible, NON ÉTABLIE) ;
  - c'est aussi ce que dit Google : un raccourci est un fichier distinct qui ne porte que l'identifiant de sa cible ;
  - ⚠️ la mesure porte sur des cibles **de notre arborescence**. Aucune n'a été tentée vers l'archive : ce lot interdit
    tout raccourci.
- **Obstacle dans le code — ÉTABLI** : le garde-fou **refuse** un raccourci dont la cible n'est pas dans notre liste
  blanche ou pas sous notre racine (`driveGardeFou.ts:168-182`). C'est une règle voulue : « Un raccourci vers un dossier
  préexistant ferait entrer ce dossier dans notre arborescence à l'œil, et le premier clic y mènerait — c'est
  précisément ce que la règle de sécurité interdit » (`driveArbre.ts:28-30`). La stratégie C exige donc de **lever
  cette règle pour l'archive** — décision d'Arno (question 3).
- **Variante C′ sans aucun raccourci** : on mémorise seulement l'identifiant du dossier original en base, et la fiche
  ouvre `https://drive.google.com/drive/folders/<id>`. **Zéro écriture Drive**, et la règle de sécurité reste intacte.
- **Risques** :
  1. l'internaute qui ouvre le dossier peut y modifier des pièces, mais il le peut déjà aujourd'hui (droits inchangés) ;
  2. l'application, elle, ne peut toujours pas y écrire, car le garde refuse un raccourci comme parent
     (`driveGardeFou.ts:149-153`) ;
  3. les pièces ne sont pas rangées dans les N6.
- **Réversible : totalement.** On efface la ligne en base ; un raccourci se déplace dans un dossier d'abandon.
- **Ce que voit l'utilisateur** : sur la fiche propriétaire (et bien, quand le rattachement descend au N2), un bouton
  « Documents scannés (archive) » qui ouvre le dossier original, toujours à jour puisque c'est le vrai. Dans la nouvelle
  arborescence, un raccourci `→ Documents scannés` sous le N3 ou le N5 (C), ou rien (C′).

---

## 6. Recommandation

**C′ d'abord, puis A par petites touches, et jamais B.**

1. **Tout de suite : C′.** On rattache en base, par identifiant, les N1 SÛR et PROBABLE (actifs : 256), **après
   validation d'Arno** sur une liste de contrôle, ainsi que les ~85 N2 de type bien. Les 10 AMBIGU / AUCUN des actifs
   sont rattachés à la main. Pourquoi :
   - zéro copie, zéro écriture dans l'archive, zéro stockage, et réversible ;
   - chaque fiche gagne immédiatement son lien vers ses documents ;
   - l'archive reste la seule version, ce qui compte parce qu'elle **vit** (246 modifications en octobre).
2. **Ensuite, si Arno veut voir l'archive dans l'arborescence : C**, après décision de lever la règle des raccourcis pour
   cette seule cible.
3. **A seulement le jour où l'archive est gelée** (plus personne n'y dépose). Ce jour-là, pour les rubriques fiables
   (Photos, Diagnostics, Syndic, Travaux : environ 7 900 fichiers, rangés au dossier), un **déplacement** plutôt qu'une
   copie : un seul exemplaire, identifiants conservés, pas de divergence. Mais un déplacement **modifie l'archive** :
   c'est une décision explicite d'Arno, et l'opposé de la règle actuelle. Le reste (locataires, propriétaire) reste
   lié par C′ tant qu'un humain ne l'a pas trié.
4. **B n'apporte rien que C′ n'offre déjà**, et il double stockage et données personnelles sans rien ranger.

---

## 7. Questions de choix métier (en français simple)

1. **Un locataire connu suffit-il à rendre un rattachement « sûr » ?** Exemple : le dossier s'appelle `NOM` (sans
   adresse), il contient `Locataires/NOMLOC`, et dans la base NOMLOC a loué un appartement de la fiche NOM. Faut-il
   compter ce cas comme sûr (214 dossiers actifs), ou le faire valider un par un ?
2. **L'archive continue-t-elle de vivre ?** Exemple : 246 fichiers y ont été modifiés en octobre. Si l'on copie
   aujourd'hui, un document ajouté demain n'existera que d'un côté. Fixe-t-on une date de gel ?
3. **Accepte-t-on un raccourci de notre arborescence vers l'archive ?** Exemple : sous le dossier du bien, `→ Documents
   scannés` mène au dossier d'origine. La règle de sécurité actuelle l'interdit exprès.
4. **Que faire de `2 vendus` et `3 perdus` ?** Exemple : 34 dossiers `perdus` n'ont aucun propriétaire dans
   l'annuaire, parce qu'ils sont partis avant l'import WIPPIMMO. Les relie-t-on à quelque chose, ou restent-ils
   consultables dans l'archive seulement ?
5. **Où vont les baux et les états des lieux ?** Exemple : `Bail signé.pdf` d'un locataire. La cible N8 prévoit
   identité, profil financier, garants, GLI, assurances, entretien, mais pas le bail lui-même.
6. **Où vont les pièces du propriétaire qui ne sont ni PNO ni taxe foncière ?** Exemple : mandat de gestion, titre de
   propriété, RIB : 94 % des 4 261 fichiers `Propriétaire`. À la racine de `1 Propriétaire` ?
7. **Les doublons avec l'arrivée des mails** (1 305 fichiers réels) : les garde-t-on des deux côtés, ou l'exemplaire
   « mail » renvoie-t-il vers celui de l'archive ? Exemple : une quittance reçue par mail, puis scannée et classée.
8. **Les doublons internes à l'archive** (1 216 fichiers, 2,2 Go) : on les ignore, ou on les signale ?
9. **Un propriétaire, plusieurs dossiers.** Exemple : `NOM (11e étage)` et `NOM (7e étage)` sont deux N1 pour la même
   personne, un par bien. Chacun va-t-il au N5 de son bien ? Et quand un N1 contient `Appart 9`, `Appart 11`… (28 cas),
   qui associe chaque sous-dossier au bon lot ?
10. **Les homonymes** (5 AMBIGU en actifs). Exemple : deux fiches de même nom, parent et enfant. Qui tranche, et par
    quel écran ?
11. **Les `Archives` sous `Locataires`** (anciens locataires, 30 dossiers en actifs) : un dossier de bail N7 chacun, ou
    un seul dossier « anciens baux » ?
12. **Les fichiers posés à plat** (608 au niveau du propriétaire, 19 propriétaires sans aucune rubrique) : vont-ils
    dans `0 En attente` du propriétaire, ou dans `À trier` ?
13. **Les pièces d'identité et les avis d'imposition** : accepte-t-on qu'ils existent en deux exemplaires (stratégies A
    et B), au regard du RGPD ?
14. **Avant tout rapprochement définitif**, faut-il le refaire sur la base du **serveur** ? Elle seule a les biens et
    propriétaires créés dans Location et les marques « vendu ». Cela demande ton accord pour s'y connecter.
