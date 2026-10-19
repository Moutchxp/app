# Construction de l'arborescence Drive validée (N1 → N10), pour tous les propriétaires (19/10/2026)

> **Rien n'a été exécuté par Claude dans ce lot** : aucune écriture dans le Drive, sur le serveur, ni dans les bases de
> développement et de recette. Ont tourné : des GET sur le Drive, des transactions READ ONLY en recette et sur la BAN locale (base
> de développement), la migration 389 dans deux transactions **annulées** (développement, recette), et le chemin réel de K sur
> une base jetable `svav_test_arbo`, créée puis supprimée (§5.3).
>
> **Les scripts** : dans `.captures/arborescence/`, non versionnés. C'est Arno qui lance les étapes réelles.
>
> **Aucun nom de client ici.** Sources de la spécification : `docs/RECON_ARBORESCENCE_DRIVE_2026-10-18.md` (validée le 18/10),
> `docs/RANGEMENT_DOSSIERS_COPIES_2026-10-19.md`, `docs/RANGEMENT_RACINES_PROPRIETAIRES_2026-10-19.md`.

## 0. L'arborescence construite

```
N1 Base de données locative                      (existe : vérifiée, reprise)
› N2 Actifs / Inactifs                           (existent : vérifiés, repris, aucun doublon)
› N3 propriétaire                                (son dossier copié, sa racine, ou un dossier neuf)
› N4 adresse BAN normalisée                      (à défaut, l'adresse telle qu'en base — signalée)
› N5 un dossier par bien, toujours               (logement + annexes liées ; « Appartement Type 2 (lot 100) + Cave n°3 (lot 102) »)
› N6 0 En attente · 1 Propriétaire · 2 Diagnostics · 3 Photos · 4 Syndic · 5 Travaux · 6 Locataires
     1 Propriétaire › N7 PNO › N8 2026 ; N7 Taxe foncière › N8 2026
     6 Locataires   › N7 « Bail JJ/MM/AAAA – NOMS » (baux en cours ET passés connus en base)
                      › N8 1 Papiers d’identité · 2 Profil financier · 3 Garants · 4 GLI
                      › N8 5 Assurances › N9 Assurance habitation › N10 2026
                      › N8 6 Entretien  › N9 Chaudière › N10 2026
```

## 1. Recon chiffrée (lecture seule ; données de la recette, le serveur est relu par le plan réel)

| Quoi | Nombre |
|---|---|
| Fiches propriétaires | 313 : **298 construites**, 15 exclues (§4) |
| N3 | **300** : **229 repris** (221 dossiers copiés dans « Actifs », 6 racines dans « Actifs », 2 racines dans « Inactifs ») ; **71 à créer** (70 fiches restées sur l'ancien squelette, 1 fiche sans dossier) |
| N3 par branche | Actifs 297, Inactifs 3 (2 racines existantes, 1 fiche inactive sans bien) |
| N4 (adresses) | **299** |
| N5 (biens) | **358**, tous dans « Actifs » (aucun lot sorti du portefeuille en base) |
| Biens avec annexes liées | 0 (aucun lien annexe → logement en base) |
| Lots orphelins autonomes | 0 (aucune fiche autonome ouverte, aucune annexe détachée) |
| Baux (N7) | **513** (occupations groupées par bien et date d'entrée ; aucune date inconnue) |
| Dossiers annuels 2026 | **1 512** : 716 N8 (PNO, Taxe foncière) + 796 N10 (398 baux courant en 2026 × 2) |
| Propriétaires sans bien | 35 (N3 seul) |
| Adresses non normalisables (BAN) | **74 lots** sur 358 (289 normalisés sur les 365 lots de la base) : N4 = adresse telle qu'en base, signalée |
| Total des nœuds | **10 357**, dont **10 128 à créer** |
| Contenus d'origine à déplacer | **1 176** éléments : 905 vers « 0 En attente » d'un bien, 271 vers « Classement d'origine » (49 N3) |
| Fichiers concernés (inventaire) | 31 168 sous « Actifs », « Inactifs » et les 230 dossiers source |

**Fiches par emplacement de leur dossier** (avant ce lot) : 227 dans « Actifs » (dont les 6 racines), 3 dans « Inactifs », 70 dans
l'ancien squelette « 1 Propriétaires », 7 dans le dossier d'import, 6 sans dossier (dont 5 fiches supprimées).

**L'ancien squelette ne contient aucun fichier** : 70 dossiers propriétaires, leurs 70 « En attente » vides, 54 raccourcis. Les 70
propriétaires reçoivent un N3 neuf ; leur ancien dossier ne bouge pas (§6).

**Dossiers copiés sans fiche** : 33 dans « Actifs », 85 dans « Inactifs » (propositions sans réponse ou « aucun rattachement » du
rapprochement). Ils restent où ils sont, à côté des N3 : ce lot n'en décide rien.

## 2. Ce que le code fait (commité)

### 2.1 `app/lib/gestion/arborescenceDrive.ts` (pur, testé)

- **Noms** :
  - N4 = libellé BAN « 12 Rue de la Paix, 75002 Paris » (`choisirAdresseBan`) ;
  - N5 = le logement puis ses annexes liées, chaque lot avec son numéro (`nomBienArbo`) ;
  - N7 = « Bail JJ/MM/AAAA – NOMS » (`nomBail`, date inconnue dite, jamais inventée).
- **BAN locale** (`adresse_ban`, aucune requête en ligne) : il faut l'unique adresse qui porte le numéro, le suffixe et la voie du
  lot (abréviations développées), dans la commune du lot (Paris : l'arrondissement vient du code postal). Le code postal est celui du
  lot (la BAN locale n'en porte pas). Aucune, ou plusieurs adresses distinctes : non normalisable.
- **Biens** (`partagerEnBiens`, même lecture que la tuile Location) :
  - une fiche autonome ouverte est un bien ;
  - sans son logement d'origine, c'est un lot orphelin ;
  - une annexe détachée est un bien orphelin ;
  - un logement et ses annexes liées forment un bien ;
  - tout autre lot est un bien à lui seul.
- **Lot orphelin** : N5 propre ; « 1 Propriétaire » à « 4 Syndic » sont des **raccourcis** vers ceux du bien d'origine ; « 0 », « 5 »,
  « 6 » sont propres, avec ses baux.
- **Branches** :
  - propriétaire inactif (archivé, sorti du portefeuille) : tout dans « Inactifs » ;
  - bien inactif (tous ses lots sortis ou en fin de gestion) d'un propriétaire actif : seul ce N5 va dans « Inactifs », sous un
    N3 / N4 recréés là.
- **Dossiers annuels** : 2026 seulement ; jamais pour un bien ou un propriétaire inactif ; sous un bail, seulement s'il court en
  2026 (en cours, ou sorti en 2026).
- **Identité** : chaque dossier porte l'étiquette `svav_arbo` = sa clé métier :
  - `p:<fiche>:A|I` : N3 ;
  - `a:…` : N4 ;
  - `b:<lot>` : N5 ;
  - `r:<lot>:<0-6>` : N6 ;
  - `l:<lot>:<entrée>` : bail ;
  - `y:…:2026` : année ;
  - `co:…` : Classement d'origine.

  On retrouve un dossier par sa clé sous son parent, **jamais par son nom**.
- **Contenu d'origine** (`deplacementsDuProprietaire`) :
  - un dossier copié rattaché à UN bien (dossier attitré du bien, ou bien unique du propriétaire **dans la même branche**) va,
    structure conservée, dans « 0 En attente » de ce bien ;
  - le reste va dans « Classement d'origine », directement sous le N3 ;
  - aucun tri, aucun renommage ; les raccourcis et « En attente » vides de l'ancien squelette ne sont pas du contenu.
- **Verrou** (`refusRequeteArbo`) :
  - **I** : créer exactement un nœud du plan : nom, parent, étiquette ; un dossier, ou un raccourci vers la rubrique prévue ;
  - **J** : déplacer exactement l'élément du plan, de sa source vers sa destination, corps vide ;
  - **tout le reste est refusé** : DELETE, corbeille, copie, renommage, partage, `alt=media`, upload, untrash, emptyTrash.
- **K** (`sqlEnregistrementArbo`) : une transaction ; elle s'arrête si la migration 389 manque ou si un déclencheur est présent ;
  - elle vérifie chaque nœud, chaque fiche et chaque lot ; une seule discordance annule tout ;
  - elle insère les nœuds, repointe `drive_dossier_id` (fiche → N3, lot → N5), relit, puis COMMIT ;
  - en essai, elle est READ ONLY.

### 2.2 Migration 389 (`db/migrations/389_gestion_drive_noeud.sql`) — **livrée, NON APPLIQUÉE**

- **Table neuve** `gestion_drive_noeud` : une ligne par dossier, avec :
  - la clé métier et l'identifiant Drive (chacun unique) ;
  - le parent, la sorte, le niveau et la branche ;
  - la fiche et le lot ;
  - le nom à la création, la cible d'un raccourci, l'année et la date d'entrée du bail.
- **Verrou en base** : ni DELETE, ni TRUNCATE ; un UPDATE ne change que le parent et la branche.
- **Aucune donnée écrite** par la migration.
- **Essai** : jouée en développement et en recette dans une transaction annulée. UPDATE du nom et DELETE refusés, changement de
  branche accepté ; aucune trace après ROLLBACK.

### 2.3 Les boutons Drive

Aucun écran n'est modifié. Les boutons existants lisent déjà `drive_dossier_id` : K le repointe.
- **Fiche propriétaire** : son N3.
- **Bien** : son N5. C'est aussi le cas de ses annexes liées.

Aucun bouton n'est retiré, masqué ni conditionné.

## 3. Les scripts (`.captures/arborescence/`, non versionnés)

| Script | Rôle | Écrit (réel seulement) |
|---|---|---|
| `plan.ts` | Fige `plan-arbo.json` (avec son empreinte) depuis le **serveur** (ssh, READ ONLY), le Drive et la BAN locale. Il écrit aussi l'inventaire de référence. | rien |
| `I-creer.ts` | Crée N3 → N10, niveau par niveau (4 à la fois), puis les raccourcis. | Drive (création) |
| `J-deplacer.ts` | Fait l'inventaire avant (nombre, md5), puis déplace un par un, chaque élément jugé avant et relu après. | Drive (déplacement) |
| `K-enregistrer.ts` | Relit l'arbre par les étiquettes, puis écrit `gestion_drive_noeud` et repointe les fiches et les lots : serveur puis recette. | serveur, recette |
| `L-verifier.ts` | Vérifie tout (§3 de l'en-tête du script) et écrit `L-rapport.json`. | rien |

**Communs à tous** :
- essai à blanc par défaut, réel avec `--reel` ;
- journal `journal-<étape>.log` ;
- empreinte (a) avant et après, avec `--empreinte-attendue=` et `--accepter-ajouts-humains` ;
- garde-fous `driveGardeFou` / `driveVerdict.idsProteges` : « Documents clients scannés » est localisé, sinon refus ;
- racine, « 00 Arrivée des mails » et dossier d'import relus chez Google ;
- reprise sans doublon (étiquette relue ; un doublon d'étiquette arrête tout) ;
- coupures réseau : 8 lectures et 6 écritures retentées, une création jamais renvoyée sans relire le parent ;
- ssh retenté 3 fois ;
- arrêt global à la première anomalie.

## 4. Exclus et signalés (rien n'est fait pour eux)

| Cas | Nombre | Pourquoi |
|---|---|---|
| Dossier resté dans le dossier d'import (« vendus/perdus mais en gestion ») | **7** | décision 4 : pas de déplacement sans décision d'Arno ; leurs 7 lots n'ont pas de N5 |
| Dossier copié rangé dans « Inactifs » mais propriétaire **actif** en base | **3** | même cas que la décision 4 : créer un N3 dans « Actifs » ferait un doublon, déplacer le N3 contredirait le classement de l'archive. Ces 3 fiches n'ont aucun lot en base. |
| Fiche supprimée | 5 | ce n'est plus un propriétaire |

**Également signalés** :
- **74 adresses non normalisables** : le N4 prend l'adresse telle qu'en base (liste dans `plan-arbo.json`, `signalements`) ;
- **2 contenus d'un dossier « Inactifs »** (racine) d'un propriétaire dont le seul bien est actif : ils vont dans « Classement
  d'origine » de ce N3 « Inactifs », pas dans le bien actif, faute de rattachement établi ;
- **49 N3 reçoivent un « Classement d'origine »** (271 éléments) : un seul dossier copié pour plusieurs biens.

## 5. Les essais à blanc (19-20/10/2026, données de la recette)

### 5.1 Plan

- **0 anomalie.**
- **Empreinte (a)** : identique, `567a736d…` (36 712 éléments).
- **Clés** : 10 357 nœuds, aucun doublon.

### 5.2 I — 10 128 à créer, 0 déjà là, 229 N3 existants relus conformes

Par niveau :

| Niveau | Nœuds |
|---|---|
| N3 | 300, dont 71 à créer |
| N4 | 348 (299 adresses + 49 « Classement d'origine ») |
| N5 | 358 |
| N6 | 2 506 |
| N7 | 1 229 |
| N8 | 3 794 |
| N9 | 1 026 |
| N10 | 796 |
| Raccourcis | 0 |

- **Verrou** : chaque requête de création le passe.
- **Empreinte (a)** : identique.

### 5.3 J — 1 176 à déplacer, 0 déjà fait

- **Verrou** : chaque requête le passe.
- **Inventaire avant** : 31 168 fichiers.
- **Sources** : aucun élément hors du plan.

### 5.4 K — garde, puis chemin réel prouvé sur base jetable

- **En recette** : le script psql s'arrête net : « la table gestion_drive_noeud n'existe pas — appliquer d'abord la migration 389 ».
  C'est le garde voulu.
- **Base jetable `svav_test_arbo`** (fiches et lots de la recette, + migration 389), supprimée ensuite :

  | Passage | Résultat |
  |---|---|
  | Essai | 10 357 nœuds à enregistrer, 71 fiches et 358 lots à repointer, 227 fiches déjà sur leur N3, **0 discordance**, rien d'écrit |
  | Discordance provoquée (n° WIPPIMMO faux sur une fiche) | **« ENREGISTREMENT ANNULÉ »**, 0 nœud écrit |
  | Réel | « nœuds 10357 enregistré(s) — fiches 71 repointée(s), 227 déjà faite(s) — lots 358 repointé(s) » |
  | Reprise | « nœuds 0, 10357 déjà là — fiches 0, 298 déjà faites — lots 0, 358 déjà faits » |
  | Autres colonnes des fiches et des lots | identiques avant et après (md5) |

### 5.5 L — écarts attendus avant I, J, K

- **10 128 nœuds absents** : I n'est pas faite.
- **1 176 contenus non rangés** : J n'est pas faite.
- **Bases** : les fiches et les lots ne pointent pas encore vers leur N3 / N5, et la table 389 est absente.
- **Inventaire d'avant J** : absent.
- **Ce qui est déjà conforme** : les 229 N3 existants sont présents.

## 6. La racine « Base de données locative » : ce qui n'est ni « Actifs », ni « Inactifs », ni « 00 Arrivée des mails »

Rien n'y est touché ; à décider par Arno.

| Dossier | Fichiers | Dossiers | Raccourcis |
|---|---|---|---|
| « Import Documents clients scannés – copie du 18-10-2026 » | 509 | 70 | 0 |
| « 2 Biens immobiliers » (ancien squelette) | 35 | 2 713 | 0 |
| « 1 Propriétaires » (ancien squelette) | 0 | 140 | 54 |
| « 00 Non rattachés » | 0 | 2 | 0 |
| « _TEST COPIE » | 11 | 1 | 0 |
| « _TEST CLAUDE renommage à supprimer par Arno » | 1 | 0 | 0 |
| « _TEST CLAUDE arbre à supprimer par Arno » | 4 | 1 | 0 |
| « _TEST CLAUDE rangement2 à supprimer par Arno » | 7 | 0 | 0 |
| « _TEST CLAUDE retouches à supprimer par Arno » | 1 | 3 | 0 |
| « _TEST CLAUDE vitesse à supprimer par Arno » | 7 | 3 | 0 |
| « _TEST CLAUDE rangement à supprimer par Arno » | 4 | 0 | 0 |

## 7. L'ordre (Arno)

1. **Mise en production du code** : `git push` puis `prod:mettre-a-jour` (essai, puis application). Elle applique la migration 389
   sur le serveur, ce que K exige.
2. **Migration 389** en développement et en recette (psql, une transaction).
3. **plan** (relit le serveur), **I**, **J**, **K**, **L** (0 écart).

## 8. Points signalés

- La **mémoire de l'ancienne arborescence** (`gestion_drive_arbre`) n'est pas modifiée. Les nouveaux nœuds n'y sont pas : la
  liste blanche d'écriture de l'application ne les connaît pas, et le dépôt automatique dans ces dossiers reste à brancher.
- **Aucun déclencheur automatique** n'est branché (nouveau propriétaire, bien, bail, 1er janvier) : ce lot construit l'existant.
- **`dossierDuBienRepo`** (ligne prioritaire du sélecteur Drive à l'écriture d'un mail) lit toujours le dossier du propriétaire,
  c'est-à-dire désormais son N3. Non modifié.
- **Les données peuvent changer** entre l'essai (recette) et le réel, puisque le plan réel relit le serveur. I, J, K et L
  exécutent le plan figé, et K s'arrête si une fiche ou un lot a changé de dossier depuis.
