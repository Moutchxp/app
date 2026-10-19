# Copie de « Documents clients scannés » — vérification finale et rapprochement des dossiers clients (19/10/2026)

> **Aucune écriture dans le Drive.** Seulement des lectures de métadonnées (GET, par `fetchDriveLectureSeule`, avec un garde
> « GET seul, jamais `alt=media` »), sur « Documents clients scannés » comme sur la copie.
> **Aucune écriture en base** hors de la transaction annulée décrite au §3.4 : la migration 387 est livrée **non appliquée**.
> Scripts et listes nominatives : `.captures/verification-finale/` (non versionné). Aucun nom de client ici.

La copie s'est terminée le 19/10/2026 à 06:00 (heure de Paris) : `TERMINÉ`, 21 414 copies dans la dernière reprise, 0 erreur,
0 refus, 0 écart de md5. Les empreintes a et b étaient identiques au départ, aux quatre contrôles, au rattrapage et à la fin
(`.captures/copie-archive/journal-copie.log`).

## 0. Empreinte (a) de « Documents clients scannés »

| Relevé | Heure (UTC) | Éléments | a | Verdict |
|---|---|---|---|---|
| début du lot | 2026-10-19T07:04:40Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` | IDENTIQUE |
| fin du lot | 2026-10-19T07:15:53Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` | IDENTIQUE |

b = `e38ed7a94c1662953c3f4a277ff6c4869f6071214ea327f2f2a4a27647e17129`, aussi identique à celle de la fin de la copie.

## 1. Vérification finale de la copie

Relevé complet, en lecture seule, de « Documents clients scannés » (36 705 éléments, racine comprise) et de « Import
Documents clients scannés – copie du 18-10-2026 » (36 001 éléments, racine comprise ; relevé en 313 s). Chaque élément
d'origine est comparé à **sa** copie, celle que la copie a mémorisée (`etat.json`), puis toute la copie est balayée à la
recherche de ce qui n'est la copie de rien.

| Contrôle | Résultat |
|---|---|
| Dossiers d'origine (hors racine) → dossier copié, même chemin complet, même nom | **4 333 / 4 333** |
| Fichiers d'origine → copie au même chemin, même nom, même type, **même md5, même taille** | **31 664 / 31 664** |
| Documents Google (sans md5) → copie au même chemin, même nom, même type | **3 / 3** (contrôle adapté : le contenu a été jugé pendant la copie sur type + nom + taille stabilisée) |
| Exclus, comme prévu (`.DS_Store`, `._…`, `~$…`) | 704, **aucun** dans la copie |
| Élément d'origine sans copie mémorisée / copie mémorisée introuvable | **0 / 0** |
| Chemin, type, md5 ou taille différents | **0 / 0 / 0 / 0** |
| Une même copie pour deux origines | **0** |
| Éléments de la copie qui ne sont la copie de rien (en trop) | **0** |
| Doublons (même dossier, même nom, même type, même md5, plus nombreux que dans l'origine) | **0** |

**Bilan : 36 000 éléments copiés pour 36 000 attendus** (4 333 dossiers + 31 664 fichiers + 3 documents Google), **0 écart**.
La liste des écarts (`ecarts.txt`) est vide.

## 2. Rapprochement à jour

**Base utilisée : celle du Mac**, lue en transaction READ ONLY. La lecture de la base du serveur était autorisée (décision 3),
mais la connexion SSH à `svav-prod` a été **refusée par le mode de permission de cette session** (aucune commande lancée sur le
serveur). Ce qui en dépend :
- le Mac n'est plus la production depuis le 15/10/2026. Les fiches créées ou modifiées sur le serveur depuis ne sont donc
  **pas** dans ce calcul ;
- les **identifiants de fiche** des propositions sont ceux du Mac. Ceux d'avant la bascule du 15/10 sont les mêmes sur le
  serveur (la base y a été copiée), pas forcément les suivants ;
- **avant de charger les propositions sur le serveur**, il faut refaire ce calcul sur sa base (§5).

Règles : **exactement** celles de l'étape 1 bis (`docs/COPIE_ARCHIVE_ETAPE1BIS_RAPPROCHEMENT_2026-10-18.md` §2). Le script
de l'étape 1 bis est exécuté tel quel, sur :
- le relevé du jour de « Documents clients scannés » ;
- l'annuaire relu ce jour.

Chaque dossier d'archive est ensuite traduit en son **dossier copié**, grâce à la correspondance mémorisée par la copie
(`etat.json`) : **363 / 363 traduits**, aucun manquant.

L'annuaire du Mac n'a pas changé depuis le 18/10 : propriétaires, locataires, occupations, copropriétés et arborescence sont
identiques octet pour octet à l'export du 18/10. Le résultat est donc **identique à l'étape 1 bis : 0 différence** de niveau ou
de fiche sur les 363 dossiers.

| Branche | SÛR | PROBABLE | AMBIGU | AUCUN | Total |
|---|---|---|---|---|---|
| `1 actifs` | 231 | 24 | 6 | 5 | 266 |
| `2 vendus` | 4 | 6 | 3 | 7 | 20 |
| `3 perdus` | 4 | 37 | 2 | 34 | 77 |
| **Total** | **239** | **67** | **11** | **46** | **363** |

- **SÛR** : 239, dont **220** « nom + locataire » seul.
- **Clients WIPPIMMO sans dossier** : **20**. Ce sont des fiches vivantes, avec un numéro WIPPIMMO, qu'aucun dossier SÛR ou
  PROBABLE ne désigne. Elles gardent leur dossier actuel (décision 5).

## 3. L'écran « Rapprochement des dossiers clients »

**Adresse** : `/admin/gestion/rapprochement-dossiers`. Un bouton « Rapprochement des dossiers clients » y mène depuis l'en-tête
de la tuile Gestion, et il n'apparaît **qu'à l'administrateur**. Rien n'a été retiré de la tuile.

**Deux barrières** :
- le proxy exige le droit « Gestion » ;
- la page et sa route exigent le rôle administrateur. Côté route, ce rôle est **relu en base** à chaque appel
  (`exigerAdministrateur`).

### 3.1 Sections et compteurs (calcul du 19/10)

| Section | Lignes | Ce qu'elle contient |
|---|---|---|
| a. Contrôle à l'œil | **20** (compteur « n/20 validés ») | 20 SÛRS « nom + locataire » tirés au hasard, avec une graine fixe (le tirage est rejouable), hors des sections b et c |
| b. Vendus / perdus mais en gestion | **7** | SÛR en `2 vendus` ou `3 perdus`, fiche en gestion, sans autre dossier SÛR en actifs (décision 6 : on n'y touche pas) |
| c. Plusieurs dossiers pour un propriétaire | **11 dossiers, 5 propriétaires** | dossier principal proposé : celui des actifs, à défaut celui dont le dernier fichier est le plus récent (décision 7) |
| d. Probables | **67** | |
| d. Ambigus | **11** | les fiches possibles sont listées, et choisies par « Corriger » |
| e. Dossiers sans correspondant | **46** | |
| e. Clients WIPPIMMO sans dossier | **20** | information seulement : la fiche, son dossier actuel, et la mention « garde son dossier actuel » |
| Autres SÛRS | **201** | section ajoutée, repliée, pour pouvoir les relire un par un |

L'un des 5 propriétaires de la section c a un dossier en actifs (le principal) et un autre en `2 vendus`. Il est rangé en c,
pas en b, ce qui donne bien les 7 cas de la décision 6 et les 5 cas de la décision 7.

### 3.2 Chaque ligne

- **Le dossier copié**, en lien qui l'ouvre dans le Drive (`drive.google.com/drive/folders/<id de la copie>`), avec son
  niveau, sa branche et son nombre de fichiers.
- **La fiche proposée**, en lien vers `/admin/location/proprietaire/<id>`.
- **La raison en clair**. Exemples : « même nom + locataire NOM connu », « même nom + adresse … connue », « même nom, aucun
  second critère », « 2 fiches de ce nom : aucune ne se distingue ».
- **Trois gestes** : **Valider** (grisé quand aucune fiche n'est proposée), **Corriger** et **Aucun rattachement**.
  - **Corriger** propose d'abord les fiches candidates, puis une recherche par nom parmi toutes les fiches non supprimées,
    archivées comprises.
- **La décision qui fait foi** : le geste, l'auteur et la date. Si plusieurs décisions ont été posées, leur nombre s'affiche.
- **« Valider tous les SÛRS »** :
  - il est **grisé**, avec le motif affiché, tant que les **20** lignes du contrôle à l'œil ne sont pas toutes **validées**.
    Une ligne corrigée ou refusée laisse le contrôle incomplet ;
  - ensuite, il valide les SÛRS encore sans décision, **sauf** les 7 de la section b. Soit **212** avec les décisions
    actuelles : 239 − 20 du contrôle − 7 ;
  - le refus est aussi vérifié **côté serveur**, sous verrou, dans la transaction.
- Mobile d'abord : cartes empilées, sections repliables, cibles de 44 px, jetons `--color-svv-*` seulement (aucune couleur en
  dur, vérifié par un test).

### 3.3 Les décisions

Aucune décision n'écrit dans le Drive ni dans l'annuaire : `drive_dossier_id` ne bouge pas.

Chaque décision est une ligne de `gestion_rapprochement_decision` : le geste, la fiche, la date, l'auteur (identifiant et
libellé), et si elle a été posée en masse. Cette table, en **ajout seul**, est le journal des décisions.

Une décision se **modifie** en en posant une nouvelle : la plus récente fait foi, et les précédentes restent lisibles. Ce sera
possible jusqu'au lot suivant, qui figera les décisions en les lisant.

Le journal général (`gestion_journal`) n'est **pas** utilisé : sa liste fermée d'entités imposerait de modifier sa contrainte,
donc une autre table.

### 3.4 Migration 387 — livrée NON APPLIQUÉE

`db/migrations/387_gestion_rapprochement_dossiers.sql` crée deux tables neuves, et ne touche à aucune table existante :
- `gestion_rapprochement_proposition` ;
- `gestion_rapprochement_decision`.

Un verrou en base refuse UPDATE, DELETE et TRUNCATE sur les deux tables. Sans la migration, l'écran dit « La migration 387
n'est pas encore appliquée », et rien ne tombe.

**Essais faits, sans rien laisser** :
- la migration, jouée deux fois dans une transaction **annulée**, sur la base de développement **et** sur la recette : elle
  est idempotente, et les quatre refus UPDATE, DELETE, TRUNCATE et « Valider sans fiche » se déclenchent ;
- un parcours du dépôt sur la vraie base du Mac, dans une transaction annulée (`.captures/verification-finale/parcours-annule.ts`) :
  - les 383 propositions sont chargées, et un second chargement est refusé ;
  - « Valider tous les SÛRS » est refusé (0/20), puis accepté (212) ;
  - « Corriger » fonctionne sur un AMBIGU, ainsi que la recherche ;
  - après l'annulation, la table **n'existe pas**.

**Commandes** (depuis `app/`) :
```
# développement
export $(grep -E '^DATABASE_URL=' .env | xargs)
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f db/migrations/387_gestion_rapprochement_dossiers.sql
# recette
psql "${DATABASE_URL%/*}/svav_recette" -X -1 -v ON_ERROR_STOP=1 -f db/migrations/387_gestion_rapprochement_dossiers.sql
# puis charger le calcul (développement) — un essai à blanc d'abord
npx tsx app/scripts/gestion-rapprochement-charger.ts .captures/verification-finale/propositions-2026-10-19.json --essai
npx tsx app/scripts/gestion-rapprochement-charger.ts .captures/verification-finale/propositions-2026-10-19.json
```
Sur le serveur, la migration passe par la mise à jour ordinaire. Le chargement y attend un calcul refait sur sa propre base
(§2).

## 4. Plan du lot suivant (rien n'est exécuté)

Il est recalculé à partir des décisions enregistrées (`planDuLotSuivant`, testé) et affiché en bas de l'écran. Aujourd'hui, sans
aucune décision : 266 déplacements vers « Actifs », 90 vers « Inactifs », 7 dossiers laissés en place, 363 dossiers à décider.

1. **Déplacements** : chaque dossier copié rejoint « Actifs » (`1 actifs`) ou « Inactifs » (`2 vendus`, `3 perdus`), selon
   la décision 4.
   - Les 7 de la section b **restent où ils sont** (décision 6).
   - Les dossiers « Actifs » et « Inactifs » sont à créer sous « Base de données locative », par la porte de création
     existante.
2. **Repointages en base** : pour chaque fiche retenue (« Valider », ou la fiche choisie par « Corriger »),
   `gestion_annuaire_proprietaire.drive_dossier_id` passe de son dossier actuel au dossier copié.
   - Si la fiche a plusieurs dossiers validés : **un seul** repointage, vers le principal (décision 7).
   - Le code qui lit l'ancien dossier se repointe dans le même lot (étape 1 bis §4b), y compris le bouton « dossier » de la
     carte de bien, qui ouvrira le dossier copié (décision 8).
   - `gestion_drive_arbre` : l'ancien dossier et ses descendants sont marqués `absent_le`, jamais effacés.
3. **Corbeille de l'ancienne arborescence** : l'ancien dossier de chaque fiche repointée, sous le verrou de l'étape 1 bis §6.
   - Le geste passe par **une porte unique**, qui exige une **liste validée en base**.
   - La chaîne des parents est relue chez Google, et doit rester hors de « 00 Arrivée des mails » et de « Documents clients
     scannés ».
   - Le dossier doit être de sorte `proprietaire`, sans **aucun fichier** dans son sous-arbre relu.
   - Le repointage doit être déjà fait.
   - Seuls sont permis `PATCH {trashed: true}` et l'action inverse ; **jamais** de suppression définitive.
4. **Dossiers d'essai** : les 8 « _TEST CLAUDE … à supprimer par Arno » et « _TEST COPIE », à la corbeille par la même porte
   (décision 10). Leur contenu est relu avant le geste.
5. **Non concernés** : les 20 clients sans dossier, qui gardent le leur (décision 5), et les dossiers marqués « Aucun
   rattachement », qui sont seulement déplacés.

Décision 1 (plus aucun dépôt dans « Documents clients scannés ») : le garde-fou existant (`driveVerdict` /
`driveGardeFou`) refuse déjà tout dépôt de l'application dans ce dossier. Ce lot ne l'a pas touché.

## 5. Ce qui reste à faire

- Appliquer la migration 387 (développement, recette, puis serveur) et charger le calcul.
- **Pour le serveur** : autoriser la lecture de sa base (une commande `ssh svav-prod` en lecture seule, que cette session n'a
  pas pu lancer), pour refaire le calcul avec ses identifiants avant d'y charger les propositions.

---

*Sources : `.captures/verification-finale/{verifier.ts, journal.log, verification.json, ecarts.txt, rapprocher2.py,
bilan2.json, propositions-2026-10-19.json, rapprochement-nominatif.csv, parcours-annule.ts}`.*
