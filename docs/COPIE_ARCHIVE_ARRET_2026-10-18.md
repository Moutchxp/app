# Copie de « Documents clients scannés » — diagnostic de l'arrêt du 18/10/2026

> **Diagnostic en LECTURE SEULE STRICTE (nuit du 18 au 19/10/2026).** Rien n'a été écrit dans le Drive, rien n'a été relancé, aucun
> script de `.captures/copie-archive/` n'a été modifié ni exécuté. Les lectures sont des **GET** (passés par
> `fetchDriveLectureSeule`, plus un garde « GET seul, jamais `alt=media` »). Les journaux de la copie ont été **lus** ; tout ce
> que le diagnostic produit est rangé dans `.captures/diagnostic-arret-copie/` (non versionné).
> Le nom du dossier propriétaire est remplacé par « [propriétaire] ».

Dernière ligne du programme :
`2026-10-18T20:24:17.099Z 🔴 ARRÊT : ÉCART taille/type : /1 actifs/[propriétaire]/Propriétaire/Mandat de location signé source 19675 copie 1 (copie 1iha3hDFXldp48L7CLrApW1ua6Y975W7BPsMJYxlTMrw)`

---

## 1. Intégrité de « Documents clients scannés » — INTACTE

Relevé complet refait le 19/10/2026 avec **les mêmes méthodes** que la copie : (a) = sha256 de `id|modifiedTime|md5` triés,
(b) = (a) + `version|headRevisionId`, même parcours en largeur par lots de 8.

| | Attendu (départ de la copie, 19:10 UTC le 18/10) | Relu le 19/10 |
|---|---|---|
| Éléments | 36 705 | **36 705** |
| (a) | `83d72376764b440def326317be7ea4ea685b008ce5cefa35b361d9d4ffc45adb` | **identique** |
| (b) | `3c5900c171f929633a8cb8769cabf94a26979ce963c13ecb22b861d44361683d` | **identique** |

**Éléments changés : 0** (aucun ajouté, modifié ni disparu, comparaison élément par élément avec `releve-complet-depart.json`).

## 2. Le fichier en cause

### Ce que montrent les métadonnées (GET)

Dans le dossier `/1 actifs/[propriétaire]/Propriétaire/` coexistent **DEUX** documents portant **le même nom**,
« Mandat de location signé ». Tous deux sont des **documents Google natifs** (`application/vnd.google-apps.document`) : ils n'ont
**pas de `md5Checksum`**.

| | Source 1 | Source 2 | Copie de la source 1 | Copie de la source 2 (celle du message) |
|---|---|---|---|---|
| id | `1Av70t1E…2CxhbE` | `1ApVqSee…Eodzmc` | `1-pib7Vc…om9Ghk` | `1iha3hDF…975W7BPsMJYxlTMrw` |
| nom | Mandat de location signé | Mandat de location signé | **Copie de** Mandat de location signé | **Copie de** Mandat de location signé |
| mimeType | google-apps.document | google-apps.document | google-apps.document | google-apps.document |
| size / quotaBytesUsed | 19675 / 19675 | 19675 | 19675 / 19675 (relu le 19/10) | 19675 / 19675 (relu le 19/10) |
| md5Checksum | — | — | — | — |
| shortcutDetails | — | — | — | — |
| createdTime | 2025-08-07T09:02:14Z | — | 2026-10-18T20:24:13.075Z | 2026-10-18T20:24:14.125Z |
| modifiedTime | 2025-08-07T09:02:24.609Z | 2025-08-07T09:02:23.501Z | 2026-10-18T20:24:14Z | 2026-10-18T20:24:14.125Z |
| version | 16 | — | — | 6 |
| capabilities | canCopy, canDownload, canEdit | | | canCopy, canDownload, canEdit |
| exportLinks | pdf, docx, odt, rtf, html, txt, md, epub, zip | | | idem |
| étiquettes | | | `svav_source_id` = source 1, `svav_source_modifie` = 09:02:24.609Z | `svav_source_id` = source 2, `svav_source_modifie` = 09:02:23.501Z |
| emplacement | « Documents clients scannés » | « Documents clients scannés » | « Base de données locative / Import… copie du 18-10-2026 » | idem |

(Seuls les champs rendus par le GET sont remplis ; « — » signifie « absent de la réponse ». Les métadonnées complètes
sont dans `.captures/diagnostic-arret-copie/diagnostic.json`.)

### L'explication

1. **Le contrôle d'un natif compare la taille rendue par l'appel de copie.** Pour un fichier Google natif, sans md5, la copie
   compare `size` et `mimeType` de la RÉPONSE de `files.copy` à ceux de la source (`copie.ts:248`). La réponse à la création a
   rendu **`size = 1`**, comme l'affiche le message « copie 1 » : `r.md5` est absent, c'est donc `r.taille` qui s'affiche.
   Relue aujourd'hui, la même copie mesure **19675**, exactement comme la source. Une taille provisoire, rendue au moment de la
   création d'un document natif puis recalculée par Google, est la lecture la plus simple. **Constat ÉTABLI** : 1 à la
   création, 19675 relu. **Mécanisme interne de Google NON ÉTABLI** : il n'est pas documenté, et je n'ai pas pu relire la
   réponse brute de l'appel.
2. **Le contrôle de nom aurait arrêté aussi.** L'appel de copie (`driveEcriture.ts`, corps `{ parents, appProperties }`) ne
   transmet pas le nom. Pour un document natif, Google nomme alors la copie « **Copie de** Mandat de location signé ». Le
   contrôle suivant (`ÉCART de nom`, `copie.ts:250`) aurait donc arrêté la copie même avec une taille juste. **Cause ÉTABLIE**
   (nom relu sur les deux copies).
3. **Il y a eu deux écarts, pas un.** Les deux sources homonymes se suivent dans l'ordre de copie (index 3470 et 3471). Deux
   ouvriers parallèles les ont copiées à une seconde d'intervalle, et chacun a levé son propre arrêt. Le bilan le confirme :
   `ecartsMd5: 2`. Un seul message est journalisé (le premier rejet de `Promise.all`) ; le second est perdu.
   **Cause ÉTABLIE.**

**En résumé : ce n'est ni un raccourci, ni un PDF converti, ni une copie inachevée.** Les deux sources sont des documents
Google natifs. Pour ce type de fichier, la copie a été jugée sur une taille lue trop tôt, et elle porte un nom préfixé que le
contrôle n'admettait pas. Le contrôle a fait son travail : il a refusé de valider ce qu'il ne pouvait pas prouver.

## 3. État de la copie

### ⚠️ Constat principal : la copie ne s'est PAS arrêtée à 20:24

L'« ARRÊT » a interrompu le programme principal, mais **pas les ouvriers parallèles encore en vol**. Le moteur lance trois
ouvriers par `Promise.all` ; quand l'un lève l'arrêt, la promesse globale échoue aussitôt, mais les autres continuent leur
boucle. Ils ont continué jusqu'à la borne du prochain contrôle d'empreinte (index 5000, `CONTROLE_TOUTES`), puis se sont
éteints d'eux-mêmes. La dernière copie date de **21:11:39 UTC** (23:11 à Paris).

- **1 521 fichiers (3,69 Go) ont été copiés APRÈS l'arrêt**, entre 20:24:17 et 21:11:39 UTC.
- Chacun a passé **son contrôle md5 individuel**, car `progression.jsonl` n'écrit une « copie » qu'après vérification.
- Le **contrôle intermédiaire d'empreinte** prévu à 5 000 copies **n'a jamais tourné**. L'empreinte relue au §1 le remplace :
  « Documents clients scannés » est resté intact.
- Aucun processus de copie ne tourne plus : vérifié par `ps`.

### Les chiffres (mode `complet`, d'après `progression.jsonl`, `journal-copie.log` et `etat.json`)

| | Nombre |
|---|---|
| Fichiers à copier dans le manifeste (hors dossiers, raccourcis et fichiers système exclus) | **31 667** |
| Dossiers miroirs créés | 4 321 (+ racine ; 4 333 au journal, 0 adopté) |
| Fichiers copiés **et vérifiés** (md5 identique) | **4 992** (3 471 avant l'arrêt, 1 521 après) |
| En échec de vérification (les deux « Mandat de location signé ») | **2** (copies créées, non validées) |
| Erreurs de copie / refus du garde-fou | 0 / 0 |
| Plage traitée | index 0 à 4 999 de 31 667, tous traités (4 992 + 2 écarts + 6 déjà faits à l'essai) |
| Dernier fichier traité | index 4999, copié à 21:11:39 UTC |
| Volume copié (mode complet) | ≈ 14,5 Go |
| Copies validées mais **absentes de `etat.json`** (après la dernière sauvegarde de l'état, à 21:10:26) | **42** |
| Reste à copier | 26 667 fichiers (index 5000 à 31 666) |

L'essai du 18/10 (60 fichiers, autre propriétaire) figure aussi dans `etat.json` : 5 010 clés = 4 992 − 42 + 60.

### Les autres fichiers au même profil

Le manifeste compte **3 documents Google natifs**, tous `application/vnd.google-apps.document`. Aucun autre type natif
(tableur, présentation…) n'y figure, et aucun raccourci n'est copié.

- les **2** « Mandat de location signé » de l'arrêt (index 3470 et 3471) ;
- **1** autre (index 29 253, 1 024 octets), **pas encore atteint**. Il aurait provoqué **le même arrêt**.

## 4. Proposition de correctif (rien n'est implémenté)

### a. Traiter les natifs sans affaiblir le contrôle

**Recommandé : les mettre de côté, listés.** On sort les **3** documents natifs du passage automatique, dans une liste
nominative (`natifs-a-part.json`). Ils sont traités à part, un par un, par un geste dédié :

1. copie avec le **nom exact** passé dans le corps ;
2. **relecture GET** de la copie jusqu'à une taille stable ;
3. comparaison du `mimeType`, du nom et de la taille relue.

Le contrôle md5 des **31 664 fichiers binaires reste strictement inchangé**.

Variante plus forte, à décider par Arno : exporter les deux documents (source et copie) au même format, PDF ou docx, et
comparer les empreintes de ces exports. C'est une lecture de contenu, donc hors de la règle « métadonnées seulement » suivie
jusqu'ici.

**À écarter** : assouplir la comparaison en ignorant la taille ou le nom. Ce serait affaiblir le contrôle pour tous.

> ⚠️ Passer le nom à la copie suppose de modifier `driveEcriture.ts`, interdit tant que la consigne en vigueur ne l'autorise
> pas. Cela relève d'un lot distinct, avec l'accord d'Arno.

### b. Faire repartir proprement : corriger le moteur AVANT toute reprise

1. **Un arrêt arrête tout.** Un drapeau partagé est lu par chaque ouvrier avant de prendre le fichier suivant. On utilise
   `Promise.allSettled`, puis on relève **tous** les écarts (chacun journalisé, pas seulement le premier), et on enregistre
   `etat.json` dans un `finally`.
2. **Une adoption se vérifie.** À la reprise, une copie étiquetée retrouvée dans le dossier de destination est aujourd'hui
   **adoptée sans contrôle** (`copie.ts:240`, clé `svav_source_id|svav_source_modifie`).
   🔴 **Les deux copies fautives portent des étiquettes exactes : relancé tel quel, le programme les ADOPTERAIT
   silencieusement**, avec leur nom « Copie de … ». Toute adoption doit donc revérifier le nom, et le md5 ou la taille (relus
   par GET), comme une copie neuve.

### c. Les deux copies fautives

Elles sont dans « Base de données locative / Import Documents clients scannés – copie du 18-10-2026 / … / Propriétaire »,
**jamais dans « Documents clients scannés »** :

- `1-pib7VcyGmRaPfF7-6xEybaaN_4KtLarwl1peom9Ghk`
- `1iha3hDFXldp48L7CLrApW1ua6Y975W7BPsMJYxlTMrw`

Proposition : les **mettre à la corbeille par le geste normal de l'application** (qui tient le registre ; jamais de
suppression définitive), **avant** la reprise, puisque la reprise ne lit que les fichiers hors corbeille. Les deux documents
seront ensuite recopiés par le traitement à part (§4a).

Alternative : les renommer au nom exact, puis les valider par le contrôle du §4a. C'est une écriture de plus, et elle laisse
une version 6 qui n'est pas celle de la source. Je ne la recommande pas.

Aucune écriture tant qu'Arno n'a pas tranché.

### d. Pourquoi la reprise ne fera pas de doublon

- **Les 5 010 fichiers de `etat.json`** sont sautés d'office.
- **Les 42 copies validées mais absentes de `etat.json`** sont retrouvées par leur étiquette dans le dossier de destination
  (relu avant toute copie inconnue) et adoptées, avec la vérification ajoutée au §4b.2, sans être recopiées.
- **Les 2 copies fautives** sont mises à la corbeille avant la reprise (§4c), puis les deux documents sont recopiés à part.
  Si elles étaient laissées en place, la vérification du §4b.2 les refuserait au lieu de les adopter.
- **Les 4 333 dossiers miroirs** sont tous dans `etat.json` et ne sont pas recréés.
- **Départ** : l'empreinte (a) de départ est inchangée (§1), donc la vérification `ATTENDU_A` passe. La copie repart à
  l'index 5000.

---

*Sources lues : `.captures/copie-archive/{journal-copie.log, sortie-complet.log, progression.jsonl, etat.json,
releve-complet-depart.json, copie.ts}`, `app/lib/gestion/driveEcriture.ts` (lecture). Script de lecture et sorties :
`.captures/diagnostic-arret-copie/` (`diag.ts`, `integrite.log`, `diagnostic.json`).*
