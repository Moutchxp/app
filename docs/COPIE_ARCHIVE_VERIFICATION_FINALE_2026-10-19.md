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
| début de l'étape 2 (calcul serveur) | 2026-10-19T07:44:59Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` | IDENTIQUE |
| fin de l'étape 2 | 2026-10-19T07:50:38Z | 36 705 | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` | IDENTIQUE |

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

**Base utilisée : celle du SERVEUR** (`svav-prod`, où vit la Gestion depuis le 15/10/2026).

> **Mise à jour du 19/10/2026, 2e étape.** Le premier calcul avait été fait sur la base du Mac : la connexion SSH était
> refusée par le mode de cette session. Il est **refait** sur une extraction de la base du serveur.

**L'extraction.** Arno l'a lancée lui-même, dans le Terminal, le 19/10/2026 à 09:39:44, avec le script
`.captures/verification-finale/extraire-serveur.sh`. Les fichiers sont dans `.captures/verification-finale/serveur/2026-10-19_093944/`.
- **Lecture seule** : session `default_transaction_read_only`, transaction `READ ONLY`, `COPY … TO STDOUT` ; rien n'a été
  écrit sur le serveur.
- **Tables lues** : 6 — fiches propriétaires, lots, locataires, occupations, copropriétés de lot, arborescence Drive
  mémorisée.
- **0 erreur.** Le serveur a 381 migrations inscrites ; la base du Mac n'a pas ce registre, ce sont donc bien deux bases
  distinctes.

**Constat : l'annuaire du serveur est identique, octet pour octet, à celui du Mac** sur les 6 tables. Ce sont 313 fiches,
365 lots, 510 locataires, 535 occupations, 17 copropriétés et 3 720 dossiers mémorisés. Aucune fiche n'a été créée, modifiée
ni archivée sur le serveur depuis la bascule du 15/10.

**Les propositions portent les identifiants de fiche du serveur.** Le fichier de calcul contient une table « identifiant →
n° WIPPIMMO » des 307 fiches citées.

**Identifiants dans la base de recette du Mac : les mêmes.** Les 307 fiches citées et les 313 fiches de l'annuaire ont le même
identifiant, le même n° WIPPIMMO, le même nom et le même dossier Drive. Rien n'est donc à traduire.

Pour que ce soit **toujours** vérifié, et pas seulement aujourd'hui : le chargeur (`app/scripts/gestion-rapprochement-charger.ts`)
compare, **avant toute écriture**, chaque fiche du calcul à la base visée (même identifiant, même n° WIPPIMMO). Une seule
fiche discordante **refuse tout le chargement**, avec le détail (`fichesDiscordantes`, testé). L'essai à blanc fait ce
contrôle : 307 / 307 fiches concordantes en développement et en recette. Si un jour les bases divergent, on recalcule sur la
base où l'écran sera utilisé ; on ne traduit jamais un identifiant à la main.

Règles : **exactement** celles de l'étape 1 bis (`docs/COPIE_ARCHIVE_ETAPE1BIS_RAPPROCHEMENT_2026-10-18.md` §2). Le script
de l'étape 1 bis est exécuté tel quel, sur :
- le relevé du jour de « Documents clients scannés » ;
- l'annuaire relu ce jour.

Chaque dossier d'archive est ensuite traduit en son **dossier copié**, grâce à la correspondance mémorisée par la copie
(`etat.json`) : **363 / 363 traduits**, aucun manquant.

L'annuaire n'a pas changé depuis le 18/10 : il est identique octet pour octet à l'export de l'étape 1 bis. Le résultat est donc
**identique à l'étape 1 bis : 0 différence** de niveau ou de fiche sur les 363 dossiers.

### 2.1 Comparaison des compteurs : calcul du serveur et calcul du Mac

| Section de l'écran | Calcul Mac | Calcul serveur | Écart |
|---|---|---|---|
| a. Contrôle à l'œil | 20 | 20 | 0 (mêmes 20 dossiers : tirage à graine fixe) |
| b. Vendus / perdus mais en gestion | 7 | 7 | 0 |
| c. Plusieurs dossiers pour un propriétaire | 5 propriétaires / 11 dossiers | 5 / 11 | 0 |
| d. Probables | 67 | 67 | 0 |
| d. Ambigus | 11 | 11 | 0 |
| e. Dossiers sans correspondant | 46 | 46 | 0 |
| e. Clients WIPPIMMO sans dossier | 20 | 20 | 0 |
| Autres SÛRS | 201 | 201 | 0 |
| **Propositions** | **383** | **383** | **0, champ pour champ** |

**La seule différence relevée n'en était pas une.** Au premier essai, 47 propositions différaient par le **locataire cité en
exemple** dans la raison (« même nom + locataire NOM connu »). Leur niveau, leur fiche et leur section étaient identiques.
- **La cause** : quand plusieurs locataires d'une fiche concordent, le script de l'étape 1 bis les parcourt dans un ensemble
  Python, dont l'ordre change à chaque lancement.
- **Le correctif** : l'exemple cité est désormais le premier locataire par identifiant. Les deux calculs sont alors identiques
  sur tous les champs, et un second lancement donne le même résultat.

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

**Commandes** (le fichier de calcul est `propositions-2026-10-19-serveur.json`, calcul « 2026-10-19-serveur ») :
```
cd /Users/macbookprom4arnaud/sansvisavis/app
export $(grep -E '^DATABASE_URL=' .env | xargs)
# migration 387 : développement, puis recette
psql "$DATABASE_URL" -X -1 -v ON_ERROR_STOP=1 -f db/migrations/387_gestion_rapprochement_dossiers.sql
psql "${DATABASE_URL%/*}/svav_recette" -X -1 -v ON_ERROR_STOP=1 -f db/migrations/387_gestion_rapprochement_dossiers.sql
# essai à blanc (concordance des fiches + comptes, rien n'est écrit), puis chargement réel — développement
npx tsx app/scripts/gestion-rapprochement-charger.ts .captures/verification-finale/propositions-2026-10-19-serveur.json --essai
npx tsx app/scripts/gestion-rapprochement-charger.ts .captures/verification-finale/propositions-2026-10-19-serveur.json
```

### 3.5 Comment les décisions atteindront la base du SERVEUR (lot suivant ; rien n'est exécuté dans ce lot)

Les décisions se prennent sur l'écran du **Mac**, en développement (`http://localhost:3000/admin/gestion/rapprochement-dossiers`).
La migration 387 n'est pas encore sur le serveur, et le repointage ne doit pas dépendre d'un écran de production à moitié
déployé. Elles atteindront le serveur ainsi :

1. **Export des décisions** (Mac, lecture seule) : un fichier par décision qui fait foi. Il contient la proposition, le
   geste, l'identifiant de fiche, son n° WIPPIMMO, le dossier copié retenu (le principal pour une fiche à plusieurs
   dossiers) et le dossier actuel de la fiche vu au calcul. Le fichier est rangé dans `.captures/`.
2. **Script de repointage sur le serveur**, lancé par Arno lui-même dans le Terminal (`ssh svav-prod`), comme l'extraction.
   Il agit en **une transaction**.
   - **Contrôles d'abord**, pour chaque ligne : la fiche existe, avec le même identifiant et le même n° WIPPIMMO, et son
     `drive_dossier_id` vaut encore le dossier vu au calcul.
   - **Une seule discordance annule tout**, sans aucune écriture.
   - **Ensuite seulement**, l'écriture : `drive_dossier_id` reçoit le dossier copié ; l'ancien dossier et ses descendants
     sont marqués `absent_le` dans `gestion_drive_arbre`, jamais effacés ; chaque fiche est journalisée.
   - **Il produit** un compte rendu ligne par ligne et la liste des fiches repointées.
3. **Le bouton « dossier » des fiches et des cartes de bien** (`ficheRattachementRepo`, `dossierDuBienRepo`) lit
   `drive_dossier_id`. Il ouvre donc le dossier copié dès le repointage. Le code qui visait le « En attente » de l'ancien
   dossier se repointe dans le même lot (étape 1 bis §4b).
4. **Les gestes Drive** (déplacements vers Actifs / Inactifs, corbeille de l'ancienne arborescence et des dossiers d'essai)
   partent du Mac avec le compte de gestion, comme la copie. Ils passent par la porte verrouillée de l'étape 1 bis §6, qui
   **relit le serveur** avant chaque corbeille : la fiche doit déjà être repointée.
5. **Traçabilité** : la migration 387 rejoint le serveur par la mise à jour ordinaire. On y verse alors les propositions et les
   décisions (même chargeur, même contrôle de concordance), pour que la trace vive aussi en production.

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

- Appliquer la migration 387 (développement, recette) et charger le calcul du serveur (§3.4).
- Prendre les décisions à l'écran ; au lot suivant, les porter sur le serveur (§3.5).

---

*Sources : `.captures/verification-finale/{verifier.ts, journal.log, verification.json, ecarts.txt, rapprocher2.py,
bilan2.json, propositions-2026-10-19.json, rapprochement-nominatif.csv, parcours-annule.ts, extraire-serveur.sh,
serveur/2026-10-19_093944/, propositions-2026-10-19-serveur.json, rapprochement-nominatif-serveur.csv, bilan2-serveur.json}`.*
