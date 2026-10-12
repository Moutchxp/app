# RECON — Stocker les pièces jointes de la gestion sur le Drive

> Lot RECON-STOCKAGE-PIECES-JOINTES-SUR-DRIVE — 12/10/2026. **Reconnaissance seule** : aucune modification de
> l'application, aucune migration, aucune écriture en base, aucune pièce déplacée, rien supprimé. Seule écriture :
> 20 **copies** de pièces dans le dossier de test « _TEST SVAV recon PJ » (racine de Mon Drive de
> a.jorel@sansvisavis.com). Mesures brutes, journal des écritures et empreintes : `.captures/recon-pj-drive/`.

---

## 0. Ce qu'il faut retenir

1. **L'hybride existe déjà, sans avoir été décidé comme tel.** Les 26 522 pièces de septembre et d'avant (13 Go)
   ont été **effacées de MinIO** du 27 au 29/09/2026 (`vider-stockage.ts`, table `gestion_piece_vidage`) après une
   copie vérifiée (taille + md5) sur le Drive. L'application les sert depuis cette copie, à chaque ouverture. Seules
   les 714 pièces arrivées depuis le 29/09 (969 Mo) sont encore dans MinIO — et **elles n'ont aucune copie Drive**.
2. **🔴 Ces copies sont dans le Drive partagé nommé « GESTION LOCATIVE »** (dossier « Base de données locative /
   00 Arrivée des mails »), le même Drive partagé que « Documents clients scannés ». Ce Drive a **9 membres**, dont
   deux comptes **externes** (`amelie@` et `quentin@adhocgestion.fr`) et `comptabilite@criterimmo.fr`. Toutes les
   pièces jointes de la gestion leur sont donc visibles aujourd'hui. Ce n'est **pas** « strictement privé ».
3. **Temps d'affichage mesuré** : MinIO local 1 à 11 ms ; Drive 0,6 à 1,5 s ; miniature locale 6 ms. Une pièce
   ouverte depuis le Drive met donc **0,7 à 1,2 s** dans l'application — sensible mais pas bloquant.
4. **Aucune nouvelle autorisation Google n'est nécessaire** : la délégation du compte de service porte déjà le
   scope Drive complet, pour a.jorel@sansvisavis.com comme pour gestion@criterimmo.fr.
5. **L'espace n'est pas un problème** : 110 To mutualisés, 2,0 To utilisés ; nos pièces pèsent 14 Go (7,9 Go de
   contenu distinct) et grossissent de 0,4 à 1 Go par mois.

**Recommandation : B (hybride), mais dans un emplacement neuf strictement privé, hors « GESTION LOCATIVE »** —
détails §4, décisions §7.

### ⚠️ Écart à signaler sur la consigne « GESTION LOCATIVE : aucune lecture de contenu »

Pour mesurer le temps d'affichage **actuel**, le banc a ouvert 3 pièces déjà vidées de MinIO par la route normale de
l'application (`GET /api/admin/gestion/pieces/<id>`, 20 fois chacune : pièces 5646, 234, 26864). L'application est
allée lire leur copie dans « 00 Arrivée des mails » — c'est-à-dire, je l'ai compris **après** la mesure, dans le
Drive partagé « GESTION LOCATIVE ». Lecture seule, par le chemin qu'emprunte chaque ouverture de pièce dans
l'application, aucune écriture ; mais c'est une lecture de contenu dans ce Drive, que la consigne excluait. Je le
signale plutôt que de le taire. La lecture des membres du Drive partagé (§0.2) est une lecture de **métadonnées**
(liste des permissions), aucune pièce n'a été ouverte pour l'obtenir.

---

## 1. État des lieux

### 1.1 Où sont les pièces

| Élément | Valeur mesurée |
|---|---|
| Stockage objet | MinIO local (`./.minio/minio server ./.minio/data`, binaire RELEASE.2025-09-07), `S3_ENDPOINT=http://localhost:9000`, bucket `svav-dev`, path-style |
| Données MinIO sur disque | 1,8–1,9 Go (`app/.minio/data`) |
| Disque du Mac | 460 Gio, 403 utilisés, **30 Gio libres** |
| Clé d'une pièce reçue | `gestion/messages/<message_id>/<uuid>.<ext>` (`app/lib/stockage/index.ts:336`) |
| Clé d'une miniature | `gestion/miniatures/<piece_id>/<uuid>.jpg` (`index.ts:470`) |
| Clé d'une pièce de brouillon | `gestion/brouillons/<brouillon_id>/<uuid>.<ext>` (`index.ts:427`) |
| Table des pièces | `gestion_piece` (`cle_stockage`, `taille_octets`, `type_mime`, `empreinte_sha256`, miniature) |
| Copies Drive | `gestion_piece_drive` (`origine = 'copie'` : 26 522 lignes, toutes vérifiées md5, 0 disparue ; `origine = 'manuel'` : 36 dépôts GED) |
| Preuves de vidage MinIO | `gestion_piece_vidage` : **26 522 pièces, 13 Go**, vidées du 27/09 02:22 au 29/09 02:48 |

### 1.2 Comptes

| | Pièces | Volume déclaré |
|---|---:|---:|
| Pièces en base | 27 466 | 14 Go |
| — avec clé de stockage | 27 236 | |
| — sans clé (jamais déposées : Gmail seul) | 230 | |
| — **vidées de MinIO, servies depuis le Drive** | **26 522** | **13 Go** |
| — **encore dans MinIO, SANS copie Drive** | **714** | **969 Mo** |
| Contenus distincts (sha256) | 10 260 | ≈ 7,9 Go |
| Pièces avec miniature locale | 26 600 | 213 Mo dans MinIO |
| Pièces du 12/10 en échec « Storage backend… » | 10 (ids 27480–27489) | ni MinIO, ni Drive — Gmail seul |

### 1.3 Répartition par type

| Famille / type | Pièces | Volume |
|---|---:|---:|
| image (toutes) | 15 087 | 6,8 Go |
| — image/jpeg | 5 963 | 5,6 Go |
| — image/png | 8 703 | 1,0 Go |
| application (toutes) | 11 903 | 6,6 Go |
| — application/pdf | 11 619 | 6,4 Go |
| video (toutes) | 118 | 1,1 Go |
| — video/mp4 | 80 | 783 Mo |
| — video/quicktime | 38 | 350 Mo |

Taille : **médiane 96 ko, p95 2,75 Mo, max 29 Mo**. Une majorité de petites images (logos, signatures) et de PDF.

### 1.4 Croissance mensuelle (par date du mail)

| Mois | Pièces | Volume |
|---|---:|---:|
| 2025-09 | 1 845 | 1 062 Mo |
| 2025-10 | 1 502 | 637 Mo |
| 2025-11 | 1 598 | 1 126 Mo |
| 2025-12 | 1 942 | 1 124 Mo |
| 2026-01 | 2 171 | 1 410 Mo |
| 2026-02 | 1 344 | 982 Mo |
| 2026-03 | 1 266 | 991 Mo |
| 2026-04 | 983 | 585 Mo |
| 2026-05 | 730 | 298 Mo |
| 2026-06 | 785 | 383 Mo |
| 2026-07 | 849 | 567 Mo |
| 2026-08 | 735 | 406 Mo |
| 2026-09 | 1 115 | 497 Mo |
| 2026-10 (au 12) | 417 | 233 Mo |

Rythme courant : **0,4 à 0,6 Go par mois** (≈ 1 Go par mois au plus fort de l'hiver). Les mois anciens sont gonflés
par le rapatriement de l'historique.

### 1.5 Le code qui lit ou écrit une pièce

| Usage | Où | Ce qu'il fait |
|---|---|---|
| Relève Gmail (arrivée) | `app/lib/gestion/captureRepo.ts:368-428` → `deposerPieceGestion` (`app/lib/stockage/index.ts:368`) | dépose l'original dans MinIO, liste blanche de types (`pieceSecurite.ts`) |
| Miniatures | `captureRepo.ts:314` `miniatureALArrivee` → `miniature.ts`; rattrapage `scripts/completer-miniatures.ts` | fabriquées à l'arrivée, stockées dans MinIO, **jamais vidées** |
| Affichage / téléchargement | `api/admin/gestion/pieces/[id]/route.ts` → `lireOctetsPiece` (`octetsPiece.ts`) câblé par `octetsPieceCablage.ts` | **① MinIO ② copie Drive (gestion@criterimmo.fr, md5 vérifié) ③ message Gmail d'origine** |
| Vignette | `api/admin/gestion/pieces/[id]/miniature/route.ts` | MinIO (miniature) |
| Archive d'un mail | `api/admin/gestion/messages/[id]/archive/route.ts` | même lecteur central |
| Envoi d'un mail avec PJ | `piecesEnvoiCablage.ts`, `travailleurEnvoiReel.ts`, `brouillonPieceOctets.ts`, `api/.../brouillons/[id]/pieces/route.ts` | pièces reçues par le lecteur central ; pièces ajoutées au brouillon dans MinIO (`gestion/brouillons/`) |
| Images citées dans un mail | `imagesCiteesReel.ts` | lecteur central |
| Copie vers le Drive | `copiePiecesReel.ts` (déclenchée **à la main** — `releveReelle.ts:257`), `scripts/vider-stockage.ts` | copie dans « 00 Arrivée des mails / AAAA / MM » puis vidage MinIO prouvé |
| Classement GED | `classementDrive.ts`, `classementRepo.ts`, `depotDrive.ts`, `depotDriveReel.ts`, `renommagePieceReel.ts` | déplace / dépose / renomme sous « Base de données locative » |
| Lecture Drive | `pieceDriveLecture.ts` | `GET files/<id>?alt=media` seulement, identifiant tiré de `gestion_piece_drive` |
| Autres modules (hors gestion) | `internaute/photo`, `pdf/publierCertificatPdf.ts`, `carte/publierCarteOrientation.ts`, `veille/demandeReponseRepo.ts`, `permis/*` | MinIO — non concernés par ce lot |

---

## 2. Connexion au Drive

| Question | Réponse mesurée |
|---|---|
| Mécanisme | Compte de service à **délégation sur le domaine** (`compteService.ts`, `driveDelegue.ts` `jetonPourSubject`), clé `GOOGLE_DELEGATION_CLE_FICHIER` / `_JSON` |
| Scope | `https://www.googleapis.com/auth/drive` (**complet** : lire, créer, écrire) — `compteService.ts:27` |
| Comptes qui obtiennent un jeton | a.jorel@sansvisavis.com ✅, gestion@criterimmo.fr ✅ (aussi OAuth `google.ts` pour gestion@, avec `drive`) |
| Faut-il une nouvelle autorisation ? | **Non.** Le dossier de test a été créé avec la délégation existante. |
| Compte des copies actuelles | gestion@criterimmo.fr (26 522 copies) |
| Espace (about.storageQuota) | limite **120 946 279 055 360 o ≈ 110 To** (mutualisé Workspace), utilisé ≈ 2,0 To ; a.jorel : 25,5 Go dans son Drive ; gestion@ : 5,3 Go + 2,1 Go à la corbeille |
| Taille max d'un fichier | 5 To |
| Quotas de l'API Drive (documentés par Google, non mesurés) | ≈ 12 000 requêtes / minute (projet et utilisateur), 750 Go téléversés / jour / utilisateur |
| Risque pour notre volume | **négligeable** : ≈ 1 000 pièces et < 1 Go par mois ; aucune erreur 429 pendant les 20 téléversements et ≈ 300 lectures du banc |

---

## 3. Mesures de réactivité

Banc : `.captures/recon-pj-drive/mesures.json`. Mac de l'agence, connexion de l'agence, 12/10/2026 ~22 h.
« Froid » = 1re lecture ; « chaud » = médiane des 19 suivantes. 20 essais par ligne. Temps en millisecondes.

### 3.1 Lecture complète — MinIO local vs Drive

| Pièce | Taille | MinIO froid | MinIO méd. | MinIO p95 | Drive froid | Drive méd. | Drive p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| PDF ~100 ko | 100 478 o | 5 | 1 | 2 | 811 | 589 | 703 |
| Photo JPEG ~3 Mo | 2 962 064 o | 13 | 3 | 12 | 812 | 761 | 1 346 |
| PDF ~10 Mo | 10 034 760 o | 17 | 7 | 9 | 2 934 | 1 114 | 2 885 |
| Vidéo MOV ~26 Mo | 26 092 894 o | 31 | 11 | 16 | 2 235 | 1 493 | 2 235 |

### 3.2 Drive : lecture partielle (64 premiers ko) et métadonnées

| Pièce | Partiel méd. | Partiel p95 | Statut | Métadonnées méd. | Métadonnées p95 |
|---|---:|---:|---|---:|---:|
| PDF ~100 ko | 554 | 734 | 206 | 229 | 323 |
| Photo ~3 Mo | 555 | 636 | 206 | 228 | 285 |
| PDF ~10 Mo | 713 | 891 | 206 | 246 | 418 |
| Vidéo ~26 Mo | 718 | 844 | 206 | 233 | 402 |

La lecture partielle (`Range`) fonctionne : utile pour **lire une vidéo en continu**. Elle ne sert pas pour l'aperçu
d'un PDF (la table des objets est en fin de fichier) : un aperçu PDF demande le fichier entier ou une image locale.
Le plancher d'une requête Drive est d'environ **0,2 s** (métadonnées) et **0,55 s** (contenu).

### 3.3 Le chemin actuel de l'application (pièce vidée → copie Drive de gestion@)

| Pièce | Taille | Pièce froid | Pièce méd. | Pièce p95 | Vignette méd. | Vignette p95 |
|---|---:|---:|---:|---:|---:|---:|
| PDF ~100 ko (5646) | 100 031 o | 1 128 | 666 | 825 | 6 | 11 |
| Photo ~3 Mo (234) | 3 002 186 o | 997 | 796 | 997 | 6 | 8 |
| PDF ~10 Mo (26864) | 10 034 760 o | 1 641 | 1 210 | 1 595 | 5 | 14 |

Aucune mise en cache : chaque ouverture refait l'aller-retour Drive (froid ≈ chaud).

### 3.4 Téléversement et miniatures Drive (20 fichiers, un essai chacun)

| Fichier | Taille | Téléversement | md5 identique | Miniature prête après* | s220 (o / ms) | s1600 (o / ms) |
|---|---:|---:|---|---:|---:|---:|
| PDF ~20 ko | 21 618 | 2 069 | oui | ≤ 51 s | 13 763 / 395 | 250 776 / 568 |
| PDF ~100 ko | 100 478 | 2 006 | oui | ≤ 49 s | 17 610 / 555 | 266 573 / 530 |
| PDF ~300 ko | 302 757 | 1 901 | oui | ≤ 47 s | 24 589 / 465 | 402 789 / 511 |
| PDF ~1 Mo | 905 938 | 2 085 | oui | ≤ 45 s | 22 467 / 372 | 417 140 / 355 |
| PDF ~3 Mo | 2 526 529 | 2 045 | oui | ≤ 43 s | 28 941 / 371 | 930 589 / 327 |
| PDF ~10 Mo | 10 034 760 | 2 695 | oui | ≤ 41 s | 16 244 / 373 | 169 702 / 340 |
| PDF ~30 Mo | 29 699 014 | 3 463 | oui | ≤ 37 s | 7 808 / 326 | 101 932 / 335 |
| JPEG ~100 ko | 95 455 | 2 338 | oui | ≤ 35 s | 8 749 / 329 | 95 455 / 249 |
| JPEG ~1 Mo | 993 528 | 2 576 | oui | ≤ 32 s | 5 014 / 317 | 93 946 / 329 |
| JPEG ~3 Mo | 2 962 064 | 2 709 | oui | ≤ 29 s | 5 829 / 337 | 286 546 / 510 |
| JPEG ~9 Mo | 8 710 198 | 2 848 | oui | ≤ 26 s | 7 313 / 218 | 244 446 / 562 |
| PNG ~50 ko | 47 379 | 1 841 | oui | ≤ 25 s | 16 972 / 239 | 47 379 / 205 |
| PNG ~1 Mo | 795 725 | 2 914 | oui | ≤ 22 s | 13 249 / 257 | 258 161 / 444 |
| HEIC ~1 Mo | 1 109 798 | 2 499 | oui | ≤ 19 s | 9 084 / 308 | 187 043 / 438 |
| HEIF ~3 Mo | 2 970 732 | 2 794 | oui | ≤ 16 s | 4 238 / 622 | 218 328 / 496 |
| MP4 ~8 Mo | 8 171 312 | 2 055 | oui | **115 s** | 4 737 / 278 | 52 577 / 274 |
| MOV ~5 Mo | 4 986 924 | 1 902 | oui | ≤ 31 s | 6 036 / 358 | 170 571 / 380 |
| MOV ~26 Mo | 26 092 894 | 2 813 | oui | **96 s** | 4 784 / 381 | 252 020 / 414 |
| DOCX ~14 ko | 13 982 | 1 999 | oui | ≤ 7 s | 3 427 / 412 | 36 348 / 442 |
| ZIP ~760 ko | 760 928 | 2 047 | oui | **jamais** (180 s) | — | — |

\* Les fichiers ont été téléversés l'un après l'autre et le sondage n'a commencé qu'après le dernier : pour les
images, PDF et documents, la miniature était **déjà prête au premier sondage** — le chiffre est un majorant. Les
vidéos demandent 1,5 à 2 minutes ; une archive ZIP n'en a jamais.

Qualité : `s220` = 170 × 220 px (vignette de liste, 4 à 29 ko) ; `s1600` est plafonné à **1 024 px de large** pour
une page de PDF (lisible, 100 à 930 ko). Le lien de miniature exige le jeton (pas de lien public).

**Téléversement : 1,8 à 3,5 s par fichier, quelle que soit la taille jusqu'à 30 Mo** — le coût est la latence, pas
le débit. Les 20 empreintes md5 rendues par Drive sont identiques à celles des octets MinIO.

### 3.5 Synthèse comparative

| Geste | MinIO local | Drive direct | Hybride (miniature locale + cache) |
|---|---|---|---|
| Vignette dans une liste | 6 ms | 0,2 s (lien) + 0,3 s (image) | **6 ms** |
| Ouvrir une pièce récente | 1–11 ms | 0,6–1,5 s | **1–11 ms** (en cache) |
| Ouvrir une pièce ancienne | 1–11 ms | 0,6–1,5 s | 0,7–1,2 s (1re fois), puis cache |
| Envoyer un mail avec 12 PJ | ≈ 0,1 s | ≈ 8–15 s séquentiel | idem cache / Drive |
| Arrivée d'une pièce | immédiat | + 2–3 s par pièce | immédiat (copie Drive en différé) |

---

## 4. Les trois architectures

| | **A — Drive seul** | **B — Hybride (recommandée)** | **C — MinIO / stockage objet, Drive en sauvegarde** |
|---|---|---|---|
| Principe | Toute pièce lue et écrite sur le Drive ; rien en local | Drive = **source de vérité** ; en local : miniatures + aperçu 1re page (déjà là, 213 Mo) + **cache LRU plafonné** (2 à 5 Go) des originaux + préchargement des mails récents | Originaux en local (MinIO) ou chez un hébergeur S3 ; Drive = copie de secours |
| Affichage | 0,6–1,5 s à **chaque** ouverture, vignettes à 0,5 s | instantané pour le récent et les vignettes ; ≈ 1 s pour l'ancien jamais ouvert | instantané partout |
| Disque du Mac | ≈ 0 | 2–5 Go (plafond choisi) + 213 Mo | 14 Go aujourd'hui, + 0,5–1 Go/mois — or **30 Gio libres** |
| Coût | 0 € (espace Workspace déjà payé) | 0 € | 0 € en local ; hébergeur S3 ≈ quelques dizaines de centimes à 1 €/mois pour 15 Go (ordre de grandeur à confirmer) |
| Robustesse | dépend d'Internet et de Google pour **tout**, même une vignette | dépend d'Internet seulement pour l'ancien hors cache ; le lecteur central a déjà le repli Gmail | la plus robuste si l'objet est hébergé hors du Mac ; en local, le disque plein (12/10) l'a déjà mise en défaut |
| Sécurité (strictement privé) | dépend de l'emplacement Drive | dépend de l'emplacement Drive | MinIO local : privé par construction ; copie Drive : dépend de l'emplacement |
| Complexité | moyenne (écriture Drive dans la relève, vignettes à refaire) | **faible** : la lecture Drive, la vérification md5, le vidage prouvé et le repli Gmail **existent** ; restent la copie automatique à l'arrivée, le cache LRU et l'emplacement privé | faible en local ; moyenne vers un hébergeur (contrat, clés, RGPD) |

**Pourquoi B.** C'est ce qui tourne déjà pour 97 % des pièces, avec des temps mesurés acceptables (≈ 1 s) ; il
libère le disque du Mac, qui a déjà débordé une fois ; il ne demande aucun service payant ; et il garde tout le
confort pour ce qu'on ouvre vraiment (le récent). Il lui manque trois choses : **un emplacement privé**, **la copie
automatique à l'arrivée** (aujourd'hui manuelle — 714 pièces n'ont aucune copie), et **un cache local plafonné**.

---

## 5. Organisation proposée sur le Drive

- **Emplacement** : un **Drive partagé dédié**, hors « GESTION LOCATIVE » et hors « Documents clients scannés »,
  nommé par exemple **« SVAV — Pièces jointes de la gestion (application) »**, dont les seuls membres sont
  **gestion@criterimmo.fr** (gestionnaire, compte de l'application) et **a.jorel@sansvisavis.com**. Un Drive
  partagé appartient à l'organisation : il survit au départ d'une personne, contrairement à un Mon Drive.
  (Variante si la création de Drive partagé est bridée : un dossier du Mon Drive de gestion@criterimmo.fr, partagé à
  Arno seul.)
- **Sous-dossiers** : `AAAA / MM` d'après la **date du mail** — la convention déjà en place pour « 00 Arrivée des
  mails » (`classement.ts:193`), donc aucun nouveau calcul.
- **Nommage** : `<message_id>-<piece_id>-<nom d'origine>` — unique, lisible, et retrouvable depuis la base sans
  dépendre du nom (la base garde le `drive_file_id`).
- **Doublons** : un même contenu (sha256) reçu plusieurs fois (27 466 pièces pour 10 260 contenus) est copié **une
  seule fois** ; les pièces suivantes pointent sur le même `drive_file_id`. Gain ≈ 6 Go sur 14.
- **Lien avec la base** : la table `gestion_piece_drive` existe et suffit (`drive_file_id`, `md5`,
  `taille_octets`, `verifie_le`, `disparu_le`) ; il faut seulement une `origine` nouvelle (par ex. `'prive'`) pour
  distinguer ces copies de celles de « 00 Arrivée des mails ».
- **Le classement GED** (déposer une pièce dans le dossier d'un bien, sous « Base de données locative ») reste ce
  qu'il est : c'est un **geste métier**, une copie supplémentaire. Le stockage de l'application, lui, ne dépend plus
  du classement.

---

## 6. Plan de migration sans perte (non exécuté)

1. **Créer l'emplacement privé** (décision §7) et y déposer une épreuve « _TEST ».
2. **Copier par lots de 500**, côté serveur Google (`files.copy` depuis les copies vérifiées existantes, sans
   télécharger) pour les 26 522 pièces vidées ; par téléversement depuis MinIO pour les 714 récentes.
   Après chaque fichier : md5 et taille comparés à `gestion_piece_drive.md5` ; une ligne d'avancement par pièce
   (reprise à la pièce près après une coupure, comme `copiePiecesReel.ts`).
3. **Pas d'interruption** : le lecteur central lit ① MinIO ② copie Drive ③ Gmail ; on ajoute la nouvelle copie
   **en tête du ②** seulement quand elle est vérifiée. L'ancienne copie reste en place pendant toute la migration.
4. **Retour arrière** : retirer la nouvelle origine de la liste de lecture ; rien d'autre n'a bougé.
5. **Durée estimée** : téléversement mesuré ≈ 2,3 s par fichier → 714 récentes ≈ 30 min ; copie serveur des
   26 522 anciennes, par 4 en parallèle, ≈ 3 à 5 h (estimation, à confirmer sur un lot de 500) ; en dédoublonnant :
   ≈ 10 260 copies seulement, soit ≈ 1 à 2 h.
6. **Ensuite seulement**, et sur décision d'Arno : la copie automatique à l'arrivée, le cache local plafonné, et
   le sort des copies de « 00 Arrivée des mails » dans « GESTION LOCATIVE » (les retirer de là est un geste
   d'écriture dans ce Drive : décision séparée, jamais implicite).
7. **Les 10 pièces du 12/10** (ids 27480–27489, mails 58116, 58118, 58119, 58122, 58123, 58125) ne sont ni dans
   MinIO ni sur le Drive : elles restent dans les mails Gmail d'origine. Elles se rattrapent avec
   `scripts/rattraper-pieces-refusees.ts` dès que le disque est dégagé (lot précédent, en attente de l'accord
   d'Arno), puis suivent le sort des 714 récentes.

---

## 7. Risques et décisions pour Arno (en clair)

**Risques**

- 🔴 **Aujourd'hui, toutes les pièces jointes de la gestion sont visibles par les 9 membres du Drive partagé
  « GESTION LOCATIVE »**, dont ADHOC (amelie@, quentin@adhocgestion.fr) et la comptabilité : toutes les pièces
  reçues par la gestion, quelles qu'elles soient. C'est le constat le plus important de ce rapport.
- 🟠 **714 pièces récentes (969 Mo) n'existent qu'à un seul endroit** sur le Mac (MinIO), plus Gmail. Un disque
  qui lâche ne perd pas les mails, mais oblige à tout rapatrier.
- 🟠 **La copie vers le Drive est manuelle** : sans relance, l'écart grossit d'environ 1 000 pièces par mois.
- 🟡 **Ouvrir une pièce ancienne prend ≈ 1 s** et dépend d'Internet ; une coupure réseau rend ces pièces
  inaccessibles (repli Gmail, lui aussi en ligne).
- 🟡 Les vidéos ont une miniature Drive tardive (≈ 2 min) et les ZIP n'en ont pas — sans effet si l'on garde les
  miniatures locales.

**Décisions à prendre**

1. **Emplacement privé** : un Drive partagé dédié (gestion@ + Arno seuls) — recommandé — ou un dossier du Mon
   Drive de gestion@ ?
2. **Les copies actuelles dans « GESTION LOCATIVE / Base de données locative / 00 Arrivée des mails »** : les
   laisser en place pendant la migration (recommandé), puis décider de leur sort séparément ?
3. **Faut-il retirer dès maintenant l'accès d'ADHOC et de la comptabilité** à « Base de données locative » (réglage
   de partage, hors application), ou attendre la migration ?
4. **Taille du cache local** : 2 Go (≈ les 4 derniers mois) ou 5 Go (≈ 10 mois) ?
5. **Copie automatique à l'arrivée** dans la relève : oui (recommandé), ou la garder manuelle ?
6. **Le dossier de test « _TEST SVAV recon PJ »** (racine de Mon Drive de a.jorel@sansvisavis.com,
   id `1NteJnq17Di8pNdPvEvTU3L3q6mKhtppz`, 20 copies) : à vider par Arno, comme convenu — rien n'y a été supprimé.

---

## Annexe — Garde-fous tenus pendant le lot

- **Écritures Drive** : 1 dossier + 20 fichiers, tous journalisés (`.captures/recon-pj-drive/journal-ecritures-drive.txt`),
  tous dans « _TEST SVAV recon PJ », vérifié à la racine de Mon Drive (`driveId` absent, parent = racine). Garde-fou
  codé : refus de toute écriture dont le nom contient « Documents clients scannés » ou « Gestion locative », ou dont
  le parent n'est pas le dossier de test. Les fichiers portent un nom neutre (`_TEST recon piece <id> (<taille> o)`),
  jamais le nom d'origine.
- **Empreinte des dossiers interdits** (métadonnées `id`, `modifiedTime`, `version` de « Documents clients scannés »
  et des deux dossiers « Gestion locative ») : **identique avant et après** (`empreinte-avant.json`,
  `empreinte-apres.json`).
- **Aucune suppression**, ni sur le Drive, ni dans MinIO, ni sur le disque. **Aucune écriture en base.** MinIO lu
  seulement (`recuperer`). Rien n'a été déplacé.
- Écart : lecture de 3 pièces dans « 00 Arrivée des mails » par la route de l'application (§0, encadré).
