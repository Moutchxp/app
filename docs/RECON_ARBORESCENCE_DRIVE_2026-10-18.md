# RECON — Nouvelle arborescence Drive « Base de données locative » (lecture seule)

> 18/10/2026 · lot RECON-ARBORESCENCE-DRIVE · **aucune écriture** : ni Drive (toutes les requêtes passées par
> `fetchDriveLectureSeule`, GET seulement), ni base (SELECT seulement), ni code applicatif.
> Fichiers de travail (gitignorés) : `.captures/recon-arbo-drive/` (`lire.ts`, `droits.ts`, `arbre.txt` = liste
> complète des 3 niveaux, `stats.json`, `droits.json`).
>
> Chaque point porte **ÉTABLI** (prouvé par le code, une requête ou une lecture du Drive) ou **NON ÉTABLI**.

**Archive « Documents clients scannés » — non parcourue.** Seuls son identifiant et sa date ont été relevés :

| Relevé | Identifiant | modifiedTime |
|---|---|---|
| début (17:06, `lire.ts`) | `1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI` | `2025-11-24T10:45:31.682Z` |
| fin (17:12, `droits.ts`) | `1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI` | `2025-11-24T10:45:31.682Z` |

La copie T9 n'a pas été touchée.

---

## 0. QUESTIONS DE CHOIX MÉTIER (à trancher par Arno avant tout lot d'écriture)

1. **Sort de l'ancienne arborescence.** Elle vit déjà sous la même racine `Base de données locative` (§3) :
   `1 Propriétaires` (307), `2 Biens immobiliers` (365, 521 dossiers de bail), `00 Non rattachés`,
   `00 Arrivée des mails`. La cible ajoute-t-elle `Actifs`/`Inactifs`/`À trier` **à côté**, dans la même racine (même
   identifiant, garde-fou inchangé) ? Puis l'ancien arbre est-il **déplacé** (dossiers de bail réutilisés → leurs
   identifiants survivent), **laissé tel quel**, ou vidé puis rangé dans une « archive » ? (Rien ne se supprime : la
   corbeille d'un dossier est interdite par le code, `driveCorbeille.ts:22-23`.)
2. **`00 Arrivée des mails` (26 523 fichiers, tous référencés en base).** Il devient `À trier` (renommage, même
   identifiant) ? Il reste à part, avec `À trier` réservé aux pièces sans bien ? Ou ses pièces sont déplacées une à une
   dans `0 En attente` des biens ? Le classement actuel (`classement.ts`, `triPieces.ts:519-520`) vise l'ancien arbre :
   il faudra dire vers quoi il pointe désormais.
3. **Bien à plusieurs propriétaires distincts.** La cible dit « une fiche = un dossier N3 ». Un bien détenu par
   **deux fiches** (indivision créée depuis Location : une fiche par carte, `creationBienRepo.ts:118-125`, liens
   `gestion_annuaire_lot_proprietaire`) va sous lequel ? Celui de `proprietaire_id` (le principal), avec un raccourci
   chez l'autre ? Ou les deux ? Le Mac en compte **5 biens** dans ce cas (liens ouverts, `jusqu_a IS NULL`).
4. **Ce qui fait « inactif ».** Cinq marques coexistent sur le propriétaire (§4) : `en_gestion = false`, `archive_le`,
   `sorti_portefeuille_le`, `supprime_le`, `absent_le` (absent de l'export WIPPIMMO). Laquelle — ou quelle combinaison
   (`sqlProprietaireActif`, `portefeuilleRepo.ts:251-254`) — déclenche le déplacement N3 → `Inactifs` ? `absent_le`,
   posé par un import et non par un humain, doit-il en être exclu (la cible dit « décision humaine ») ?
5. **Ce qu'est un BAIL pour l'arborescence.** Il n'y a pas de table bail. Un bail = occupations d'un même lot à la même
   date d'entrée (`annuaireEditionRepo.ts:822`). Un bail « logement + cave » fait donc **deux** groupes (un par lot).
   Faut-il les regrouper au niveau du BIEN (même date, mêmes locataires sur le logement et ses annexes) ? Et les
   **anciens baux** (sortis) : un N7 chacun, ou seulement le bail en cours ? (Mac : 535 occupations, 317 en cours.)
6. **Date d'entrée inconnue / nom.** « Bail JJ/MM/AAAA – NOMS » : que mettre si `entree` est vide ? Quel format pour
   NOMS (NOM seul, NOM Prénom, « et » ou virgule) ? Longueur maximale ?
7. **Adresse « normalisée ».** Aucune clé BAN n'est stockée (`ChampAdresseBan.tsx:39` ne rend que voie/CP/commune).
   `adresse_normalisee` n'est qu'une normalisation de texte (minuscules, sans accents, `annuaire.ts:44`) :
   « 57-61 rue J.-J. Rousseau » et « 57 rue Jean Jacques Rousseau » restent deux adresses. Accepte-t-on cette clé ? Ou
   faut-il d'abord stocker l'identifiant BAN (`cleInterop`) de chaque bien (lot de données préalable) ? Et le nom
   affiché du dossier N4 : l'adresse telle que saisie, ou celle de la BAN ?
8. **Lot orphelin : détecté ou déclaré ?** Le seul concept existant est l'**annexe détachée**
   (`annexe_detachee_le`, migration 379 : « louable séparément »), posée par un geste humain. La cible le veut
   « automatique » quand un bail ne reprend pas tous les lots. Le déclencheur est-il ce geste « Détacher », ou une
   détection sur les occupations ? Même question pour le **retour** (geste « Rattacher » ou constat « mêmes locataires
   sur tous les lots »).
9. **Années.** À la création du nouvel arbre pour les biens existants : seulement `2026` (« jamais d'années passées ») ?
   Un bien en `Inactifs` ne reçoit plus d'années ; et un bien **réactivé** : rattrape-t-il l'année en cours ?
10. **Nom du dossier N5 quand le bien n'a ni nature ni type** (imports incomplets), et quand deux biens d'une même
    adresse ont le même libellé (« Appartement Studio » ×2) : faut-il un discriminant (n° de lot, étage) ?
11. **Quel compte agit** (§1) : `gestion@criterimmo.fr` (gestionnaire de contenu, ne peut pas supprimer — c'est un
    atout) pour les gestes automatiques, ou la personne connectée quand le geste vient de l'interface ?
12. **Quelle base fait foi pour la mémoire de l'arbre** (§6) : la base du Mac porte `gestion_drive_arbre` (remplie le
    26/09) mais pas les migrations Location 370-382 ; le serveur a sans doute l'inverse ou les deux (NON ÉTABLI).

---

## 1. Le code Drive existant

### 1.1 Fichiers (ÉTABLI, en-têtes lus — `app/lib/gestion/` sauf mention)

| Fichier | Rôle |
|---|---|
| `compteService.ts` | compte de service, JWT de délégation, scope Drive (l.10-31) |
| `driveDelegue.ts` | `jetonPourSubject` : un jeton par adresse, en cache (l.47-82) |
| `jetonCollaborateur.ts` | adresse de la personne connectée (session → `admin_utilisateur`), contrôle du domaine |
| `google.ts` | OAuth de `gestion@` pour **Gmail** (aucune route Drive ne l'emploie) |
| `drive.ts` | lister, chercher, déposer un fichier |
| `driveEcriture.ts` | **seule porte gardée** : `creerDossier`, `creerRaccourci` (l.140-169), `creerRacine` |
| `driveGardeFou.ts` | verdict pur : parent sous la racine ET dans la liste blanche `gestion_drive_arbre` |
| `driveArbre.ts` / `driveArbreRepo.ts` | plan pur de l'ancien arbre / sa mémoire en base |
| `driveCreation.ts` | bouton « Nouveau dossier » de l'interface (journal `gestion_drive_dossier_cree`) |
| `driveMouvement.ts`, `driveDeplacement.ts` | déplacer (PATCH `addParents/removeParents`), copier ; verdict `peutMouvoir` |
| `driveCorbeilleReel.ts`, `driveCorbeille.ts` | corbeille (fichiers seulement) |
| `renommageDrive.ts` | renommer un **fichier** (PATCH `name`, l.61) |
| `arriveeDrive.ts`, `copiePiecesReel.ts` | `00 Arrivée des mails/AAAA/MM`, `dossierPeriode`, déplacement de pièces |
| `classement.ts`, `classementDrive.ts`, `triPieces.ts` | proposer une destination ; `classementDrive` « ne doit pas être exécuté » (l.5-7), sans appelant |
| `dossierDuBien.ts` (+Repo) | « dossier du bien » = dossier du **propriétaire** lu en base (`dossierDuBienRepo.ts:13-16`) |
| `driveLectureSeule.ts` | `fetch` limité aux GET (tâches, et cette recon) |
| `app/scripts/construire-arbre-drive.ts` | CLI qui a bâti l'ancien arbre |
| `app/scripts/copier-pieces-drive.ts`, `deplacer-vers-arrivee.ts` | copie/déplacement de masse vers l'arrivée |
| `app/scripts/verifier-delegation-drive.ts` | teste la délégation pour une adresse |
| routes `app/(admin)/api/admin/gestion/drive/*` | renommer, corbeille, dossier, dossier-du-bien, localiser, dossiers, fichiers, deplacer, apercu |

### 1.2 Identité qui agit — ÉTABLI
- **Compte de service avec délégation au niveau du domaine** (`compteService.ts:10-12`), clé dans
  `GOOGLE_DELEGATION_CLE_FICHIER` / `GOOGLE_DELEGATION_CLE_JSON` (l.30-31). Scope unique
  `https://www.googleapis.com/auth/drive` (`compteService.ts:27`, `driveDelegue.ts:72`).
- **Interface** : le « subject » est la personne connectée (`jetonCollaborateur.ts:75-94`), via `jetonPourRequete`.
- **Scripts** : subject en dur, `gestion@criterimmo.fr` par défaut (`construire-arbre-drive.ts:45`, `--compte=`).
- Aucun identifiant de dossier en variable d'environnement : `RACINE_NOM` / `DRIVE_NOM` en dur
  (`driveGardeFou.ts:32,35`), Drive partagé retrouvé par son nom (`construire-arbre-drive.ts:105-111`), puis
  identifiants mémorisés en base.
- NON ÉTABLI : un jeton OAuth personnel d'Arno pour ce Drive (rien trouvé).

### 1.3 Droits réels sur « GESTION LOCATIVE » — ÉTABLI (lu chez Google, `droits.json`, 18/10 17:12)

| Compte | Rôle déduit | canAddChildren | canMoveItemWithinDrive (racine) | canRename | canTrashChildren | canDeleteChildren | canManageMembers |
|---|---|---|---|---|---|---|---|
| `gestion@criterimmo.fr` | **gestionnaire de contenu** | oui | oui | oui | oui | **non** | non |
| `a.jorel@sansvisavis.com` | gestionnaire | oui | oui | oui | oui | oui | oui |

`gestion@` peut donc créer, renommer, déplacer des dossiers **dans** le Drive, et ne peut **rien supprimer
définitivement** — profil idéal pour les gestes automatiques.

### 1.4 Raccourcis, déplacement, renommage
- **Raccourcis : ÉTABLI.** `driveEcriture.creerRaccourci` (`shortcutDetails.targetId`, l.161), sous garde-fou (parent
  ET cible en liste blanche). Déjà employé : **365 raccourcis** existent dans `1 Propriétaires` (§3).
- **Déplacer un dossier : ÉTABLI, possible.** Route `drive/deplacer` (`route.ts:346-361`) → `peutMouvoir`
  (`driveDeplacement.ts:85-120`), qui ne refuse que l'archive, l'auto-inclusion et une chaîne illisible.
  ⚠️ **Ce chemin n'est pas soumis à la liste blanche** de `driveGardeFou` : pour des déplacements AUTOMATIQUES, il
  faudra une porte gardée dans `driveEcriture.ts` (déplacer seulement un nœud de l'arbre vers un nœud de l'arbre).
- **Renommer un dossier : NON ÉTABLI — aucun code.** `renommageDrive.ts` ne vise que les fichiers et la route refuse
  tout identifiant absent de `gestion_piece_drive` (`renommer/route.ts:70-77`). À écrire.
- **Corbeille :** jamais un dossier (`driveCorbeille.ts:22-23, 92`) ; aucun `files.delete` ni `emptyTrash`.
- **Recherche par nom :** l'arbre est relu par `(sorte, cle)`, jamais par nom (`driveArbre.ts:23-26`) — conforme à la
  cible. Recherches par nom restantes, hors arbre : homonyme de racine (`driveEcriture.ts:187`), doublon à la
  création manuelle (`driveCreation.ts:81`), recherches utilisateur (`drive.ts:170,716`), « Documents clients
  scannés » retrouvé par nom pour le protéger (`driveVerdict` l.257).

---

## 2. Ce que le code crée aujourd'hui — ÉTABLI

Plan pur `construirePlanArbre` (`driveArbre.ts:156-239`), écrit par la CLI **manuelle**
`npm run gestion:drive:construire -- --appliquer` (à blanc par défaut, `construire-arbre-drive.ts:16-29`).

```
Base de données locative/
  00 Non rattachés/            (AAAA/MM à la demande — plus alimenté, arriveeDrive.ts:7-8)
  1 Propriétaires/
    NOM Prénom (n° WIPPIMMO)/  En attente/  + « → <bien> » (raccourci vers chaque bien)
  2 Biens immobiliers/
    Adresse, CP Commune — Nature Type — lot <Id>/
      1 Locataires/ NOM Prénom (entrée JJ/MM/AAAA – sortie …|en cours)/
      2 Travaux/  3 Assurances/  4 Litige/  En attente/
  00 Arrivée des mails/AAAA/MM/   (décision du 26/09, commit d161dc8a)
```

- **Quand :** uniquement à la main. Racine et arbre bâtis le **26/09/2026 entre 01:04 et 01:40** ; `00 Arrivée des
  mails` et ses mois créés paresseusement par `copier-pieces-drive` / `deplacer-vers-arrivee` (`assurerArrivee`,
  `arriveeDrive.ts:40-72`), du 26/09 10:47 au 27/09 01:40. Dernier nœud créé : `2026-09-27 01:40`.
- **Aucun déclencheur automatique :** ni à la création d'un propriétaire (`annuaireEditionRepo.ts:567-572` insère
  `drive_dossier_id = NULL`), ni d'un bien, ni d'un bail, ni à l'arrivée d'un mail (`relever-gestion-continu` ne crée
  aucun dossier). Les biens/propriétaires créés depuis l'interface (clé `app-…`) **n'ont donc pas de dossier**.
- **Le « dossier d'attente général du 26/09 »** = `00 Arrivée des mails` (sorte `arrivee`, migration 256) ;
  `00 Non rattachés` (sorte `non_rattaches`) est son prédécesseur, abandonné le même jour (un seul mois `2026/09`,
  vide).
- **Mémoire :** `gestion_drive_arbre` (migration 254) — `drive_id`, `parent_drive_id`, `sorte`, `cle`, unicité
  `(sorte, cle)`, `CHECK sorte IN (racine, non_rattaches, proprietaires, biens, proprietaire, bien, occupation,
  rubrique, en_attente, raccourci, periode, arrivee)`, `CHECK cree_par = 'construction'`. L'identifiant du dossier
  propriétaire est recopié dans `gestion_annuaire_proprietaire.drive_dossier_id` (`driveArbreRepo.ts:145-149`).

---

## 3. État réel de « Base de données locative » — ÉTABLI (lu le 18/10/2026 17:06-17:11)

Racine `12hZa0zeOXq_2BSpK1bayMg9oMlsvDqWg`, dans le Drive partagé `0AMcTtmCenCqoUk9PVA`. Liste complète des 3
niveaux : `.captures/recon-arbo-drive/arbre.txt` (2 854 lignes).

| N1 | Dossiers dessous | Contenu mesuré |
|---|---|---|
| `00 Arrivée des mails` | `2025` (12 mois), `2026` (9 mois, 01→09) | **26 523 fichiers** dans les mois (= 26 523 lignes en base) |
| `00 Non rattachés` | `2026/09` | 0 fichier |
| `1 Propriétaires` | **307** dossiers | 365 raccourcis ; 307 `En attente`, **tous vides** |
| `2 Biens immobiliers` | **365** dossiers | 365 × (`1 Locataires`, `2 Travaux`, `3 Assurances`, `4 Litige`, `En attente`) |
| ↳ `1 Locataires` | 521 dossiers de bail (355 biens en ont) | 0 fichier au niveau de la rubrique (contenu des dossiers de bail non lu, niveau 4) |
| ↳ `2 Travaux` / `3 Assurances` / `4 Litige` | — | **tous vides** |
| ↳ `En attente` | — | 1 seul non vide : lot 15 (1 fichier) |
| ↳ fichiers posés à même un bien | — | 3 fichiers dans `80 rue de Normandie … — lot 365` |
| 8 dossiers `_TEST CLAUDE … à supprimer par Arno` | — | 15 fichiers au total |

**Ce que la base référence par identifiant Drive** (base du Mac, `sansvisavis`) :

| Table.colonne | Lignes | Ce qu'elles désignent |
|---|---|---|
| `gestion_drive_arbre.drive_id` / `parent_drive_id` | 3 721 (rubrique 1 460, en_attente 672, occupation 521, raccourci 365, bien 365, propriétaire 307, période 25, + 4 têtes) | l'ancien arbre = liste blanche d'écriture ; `absent_le` nul partout |
| `gestion_annuaire_proprietaire.drive_dossier_id` | 307 / 313 fiches | dossier N « propriétaire » |
| `gestion_piece_drive.drive_dossier_id` / `drive_file_id` | 26 558 pièces, 32 dossiers distincts (26 523 dans l'arbre, 35 hors arbre dont les `_TEST`) | pièces déposées |
| `gestion_drive_dossier_cree` | 24 | dossiers créés depuis l'interface (tous des essais `_TEST`/`_MESURE`) |
| `gestion_drive_mouvement` | 238 (49 éléments) | déplacements/copies/corbeille |
| `gestion_drive_empreinte` | 202 617 | index des empreintes (lecture seule) |
| `gestion_drive_production` | 32 026 | inventaire du dossier de production |
| `gestion_piece_vidage` | 26 522 | registre de vidage |
| `gestion_drive_refus` | 6 | refus du garde-fou |
| `gestion_brouillon_piece.source_drive_id` | 28 | pièces jointes de brouillons |
| `gestion_piece_renommage` | 29 | renommages |
| `gestion_tache_piece.drive_fichier_id` | 0 | pièces des tâches |

**Conséquence clé :** comme `gestion_piece_drive` et `drive_dossier_id` désignent les dossiers par identifiant, un
**déplacement** ou un **renommage** les laisse valides ; une **recréation** les casserait.

---

## 4. Modèle de données

| Notion | Où | Statut |
|---|---|---|
| Propriétaire | `gestion_annuaire_proprietaire` (253) ; clé `wippimmo_id`, ou `app-…` si créé dans l'app (`annuaireEditionRepo.ts:563`) | ÉTABLI |
| Couple / indivision | import : une fiche (séparable, `separerPersonne`, migration 278) ; Location : une fiche par carte + `gestion_annuaire_lot_proprietaire(lot_id, proprietaire_id, rang, depuis, jusqu_a)` | ÉTABLI |
| Bien / lot | `gestion_annuaire_lot` (253, enrichie 372-379) ; `categorie` logement/cave/parking/box/local/autre (372) | ÉTABLI (code) |
| Annexe → logement | `gestion_lot_annexe(annexe_id UNIQUE, parent_id)` (372), ajout seul ; `annexe_detachee_le` (379) | ÉTABLI (code) |
| Bail | **pas de table** ; = occupations `(lot_id, entree)` de `gestion_annuaire_occupation` (`annuaireEditionRepo.ts:822`, `portefeuilleRepo.ts:541-545`) | ÉTABLI |
| Locataires d'un bail | `gestion_annuaire_locataire` + occupations de même `(lot, entree)` | ÉTABLI |
| Propriétaire actif/inactif | `en_gestion` (375), `archive_le` (278), `sorti_portefeuille_le` (373), `supprime_le` (287), `absent_le` (253) ; synthèse `sqlProprietaireActif` (`portefeuilleRepo.ts:251-254`) | ÉTABLI (code) |
| Bien vendu / sorti | `gestion_annuaire_lot.sorti_portefeuille_le` (373) + motif `gestion_lot_sortie_origine` (381) ; changement de propriétaire `lot_proprietaire.jusqu_a` | ÉTABLI (code) |
| Adresse | texte `adresse`/`code_postal`/`commune` + `adresse_normalisee` = texte normalisé (`annuaire.ts:44`) ; **aucune clé BAN** | ÉTABLI |
| Dossier Drive d'un bien / d'un bail / d'une adresse | **aucune colonne** (seulement via `gestion_drive_arbre` par `(sorte, cle)`) | ÉTABLI |

**Ce qui manque pour la cible**
- une clé d'**adresse** stable par propriétaire (clé BAN ou règle de normalisation tranchée — question 7) ;
- une notion de **bail** groupant plusieurs lots d'un même bien (question 5) ;
- une notion de **bien = logement + ses annexes liées non détachées** pour nommer N5 (calculable depuis
  `gestion_lot_annexe` + `annexe_detachee_le`, sans colonne nouvelle) ;
- la **branche** (Actifs/Inactifs) de chaque nœud, et un N3/N4 **pouvant exister dans les deux branches** pour un même
  propriétaire (vente partielle) → la clé `(sorte, cle)` actuelle ne suffit pas : il faut `(sorte, cle, branche)` ;
- de nouvelles **sortes** (branche, adresse, rubrique N6, sous-rubrique N7/N9, année, bail, pièce de bail, à trier,
  raccourci de rubrique) — le `CHECK` de la migration 254 les refuse ;
- le **renommage gardé** et le **déplacement gardé** de dossiers (§1.4) ;
- une **file de travaux Drive** (les gestes Location sont transactionnels ; un appel réseau n'a rien à faire dans une
  transaction).

---

## 5. Où brancher les déclencheurs

Toutes les écritures Location passent par `app/(admin)/api/admin/location/route.ts` (POST, champ `action`) — ÉTABLI :

| Événement cible | Point d'entrée | Fonction |
|---|---|---|
| Nouveau propriétaire | route l.222 (cartes) / l.205 (propriétaire + biens) | `creerProprietaires` (`creationBienRepo.ts:86`) → `creerPersonne` (`annuaireEditionRepo.ts:734`) ; `creerProprietaireEtBiens` (`locationRepo.ts:506`) |
| Nouveau bien | route l.234 | `creerBienComplet` (`creationBienRepo.ts:175`, `insererLot` l.146) |
| Annexe ajoutée / rattachée | route l.197 / l.200 | `ajouterAnnexe` (`locationRepo.ts:441`), `rattacherAnnexe` (l.471) → **renommage N5** |
| Nouveau bail | route l.216 / l.252 | `creerLocataireSurBien` / `creerLocatairesSurBien` (`portefeuilleRepo.ts:688/740`) → `ajouterOccupant` (`annuaireEditionRepo.ts:828`) ; côté Gestion `ajouter-occupant` |
| Inactif / réactivé | route l.173, l.191, l.259-273 | `archiverPersonne`, `enregistrerEnGestion` (`creationBienRepo.ts:464`), `sortirDuPortefeuille` / `reactiverDansPortefeuille` (`portefeuilleRepo.ts:386/466`) |
| Vente / sortie d'un bien | route l.275 | `sortirBiensDuPortefeuille` (`portefeuilleRepo.ts:613`) — tous les biens choisis ⇒ archivage du propriétaire (l.621-625) ; Gestion : `remplacer-proprietaire` (`annuaire/route.ts:236`) |
| Lot orphelin / retour | route l.230 | `detacherAnnexe` (`entretienAnnexeRepo.ts:79`) — le seul geste existant (question 8) |
| Changement d'adresse / de nom | fiches d'édition Gestion et Location | → **renommage**, jamais recréation |

**Aucun branchement Drive n'existe dans Location** (grep « drive » vide dans `lib/location`, écrans et route) — ÉTABLI.

**Ordonnanceurs** — ÉTABLI : aucun cron en processus (`instrumentation.ts` = contrôles de démarrage). Sur le Mac :
`ops/com.sansvisavis.{gestion-continu,drive-empreintes,veille}.plist` ; sur le serveur : `deploy/systemd/` —
`svav-gestion-continu` (boucle 60 s, traite déjà la file d'envoi et le classement), `svav-drive-empreintes.timer`
(15 min), `svav-veille.timer` (15 min), `svav-surveillance.timer` (5 min), `svav-analytics-maintenance.timer`
(`OnCalendar=*-*-* 04:30:00`, `Persistent=true`), installés par `deploy/systemd/installer.sh`.
**Pour le 1er janvier**, recommandation : ne pas dépendre d'un seul tir — une étape **idempotente** « années de
l'année en cours manquantes ? les créer » dans la boucle `gestion-continu` (rattrape un serveur éteint le 01/01), et
au besoin un `svav-drive-annees.timer` `OnCalendar=*-01-01 00:10` `Persistent=true` qui ne fait que réveiller la
même fonction.

---

## 6. Schéma plus ancien que le code — ce que ça implique ici

- **ÉTABLI, et en vrai sur ce Mac :** la base `sansvisavis` du Mac **n'a aucune des migrations Location 370-382**
  (`gestion_lot_annexe`, `gestion_location_conditions`, `gestion_lot_sortie_origine`, colonnes `categorie`,
  `sorti_portefeuille_le`, `annexe_detachee_le`, `en_gestion` absentes ; pas de table `svav_migration`), alors
  qu'elle porte toute la mémoire de l'arbre (254, 256). Le code devra donc tourner avec **l'un sans l'autre**.
- Patron à reprendre : `app/lib/db/sondeSchema.ts` (`creerMemoireSonde` : « oui » mémorisé, « non » re-sondé après
  5 s) + `app/lib/gestion/schema.ts` (`colonneExiste` l.25, `tableExiste` l.409, `indexExiste` l.307) + côté Location
  `app/lib/location/sondeLocation.ts` (`colonneExisteMemo`). **Sonde AVANT `withTransaction`**, jamais dedans
  (`schema.ts:10-13`).
- Concrètement :
  1. tant que la migration de la nouvelle arborescence n'est pas appliquée → **aucune action Drive**, et le geste
     Location réussit normalement (un oubli de migration ne doit jamais bloquer la création d'un bien) ;
  2. la file de travaux Drive est remplie **après** le COMMIT du geste Location, par une insertion séparée et sondée ;
  3. le moteur de plan sonde aussi les tables Location (annexes, catégorie, sortie) : sans elles, un bien = un lot,
     sans annexes, et aucun bien n'est « vendu » ;
  4. élargir le `CHECK sorte` de 254 : `DROP CONSTRAINT … ADD CONSTRAINT` dans la même migration — réversible, mais
     un code ancien sur base neuve doit tolérer des sortes qu'il ne connaît pas (lecture filtrée par sorte).
- **NON ÉTABLI :** l'état de la base du serveur (ni lu ni sondé — accès ssh hors de ce lot). Question 12.

---

## 7. Proposition de découpage (un lot = un commit)

Ordre : rien n'écrit dans le Drive avant le lot 5, et l'ancien arbre n'est jamais supprimé.

| # | Lot | Touche | Migration | Réversible |
|---|---|---|---|---|
| 0 | **Décisions d'Arno** (questions 1-12) | — | — | — |
| 1 | **Mémoire v2** : élargir `gestion_drive_arbre` (sortes nouvelles, colonne `branche`, unicité `(sorte, cle, branche)`), table `gestion_drive_travail` (file : type, clés, état, tentatives, erreur ; ajout seul + statut) | `db/migrations/383_…sql`, sondes dans `schema.ts` | **383** | oui (ajouts, contrainte remplaçable) |
| 2 | **Plan pur v2** : `driveArbreV2.ts` — noms N3→N10, clés (propriétaire, adresse, bien = logement + annexes, bail), branche, années ; tests unitaires (dont homonymes, adresse vide, annexes détachées) | lib pure + tests | — | oui (aucun effet) |
| 3 | **Portes gardées** : `renommerDossier` et `deplacerNoeud` dans `driveEcriture.ts` (source ET destination en liste blanche, jamais l'archive) ; raccourci de rubrique | `driveEcriture.ts`, `driveGardeFou.ts` + tests (fetch simulé) | — | oui |
| 4 | **CLI v2 à blanc** : `gestion:drive:construire-v2` (à blanc / `--essai` / `--appliquer`), qui ajoute `Actifs`/`Inactifs`/`À trier` sous la racine existante et dit ce qu'il ferait de l'ancien arbre | script + tests | — | oui |
| 5 | **Construction réelle** (essai 1 propriétaire, puis tout) — après accord d'Arno sur le rendu | Drive (création seulement) | — | oui : rien de supprimé ; dossiers neufs déplaçables |
| 6 | **Reprise de l'ancien arbre** selon la question 1 (déplacer les 521 dossiers de bail, les 3 fichiers du lot 365, le fichier du lot 15, `00 Arrivée des mails`) — par **déplacement**, identifiants conservés | Drive (déplacements) + journal `gestion_drive_mouvement` | — | oui (chaque mouvement journalisé, annulable) |
| 7 | **File + travailleur** : traitement de `gestion_drive_travail` dans `relever-gestion-continu` ; branchement des gestes « nouveau propriétaire / bien / bail / annexe » (insertion après COMMIT) | route Location, repos, boucle | — | oui (désactivable par réglage) |
| 8 | **Actifs ⇄ Inactifs et vente** : déplacement N3 ; vente partielle (N5 seul, N3/N4 recréés dans `Inactifs`) | travailleur | — | oui (retour = déplacement inverse) |
| 9 | **Années** : étape idempotente annuelle + timer `OnCalendar=*-01-01` (serveur) / plist (Mac) | travailleur, `deploy/systemd/`, `ops/` | — | oui |
| 10 | **Lot orphelin / retour** : N5 propre + 4 raccourcis + renommages ; retour = déplacements puis N5 vide → `Inactifs` | travailleur | — | oui |
| 11 | **Classement et « dossier du bien » repointés** vers le nouvel arbre (`classement.ts`, `triPieces.ts:519-520`, `dossierDuBienRepo`, `raccourciDriveRepo`, `ficheRattachementRepo`) | lib Gestion | — | oui |
| 12 | **Sort final de l'ancien arbre** — uniquement sur accord explicite d'Arno (règle « jamais retirer sans accord ») | Drive | — | selon décision |

⚠️ Le bouton « Dossier du bien » ouvre aujourd'hui le dossier du **propriétaire** (`dossierDuBienRepo.ts:13-16`) :
s'il doit ouvrir le N5, c'est un changement d'interface à valider (lot 11).
