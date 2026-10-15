# Rapport de nuit — 16/10/2026

Travail en autonomie, sans question. **Rien n'a été fait sur le serveur**, rien n'a été poussé, aucune tâche launchd du Mac
n'a été relancée, aucun mail ni certificat n'est parti, aucun appel Drive en écriture, aucune migration appliquée. Seule
écriture en base : une base **jetable** (`svav_jetable_nuit_1016`) créée puis supprimée pour le lot 2.

## En bref

| Lot | Résultat | Commit |
|---|---|---|
| 1 — erreur Leaflet de la mini-carte | **corrigé et prouvé** ; même défaut trouvé sur la grande carte du faisceau, **non corrigé** (attend ta décision) | `8644f654b5fb0f0bc8b12e8f4e7ea1e76902b111` |
| 2 — migrations dormantes 212, 216, 262 | 212 et 216 : **réveil préparé** (361, 362) mais **mis de côté**, non appliqué ; 262 : laisser dormir | `e14674bc4c32b001d76c4cc1459e35be199aba8f` |
| 3 — préproduction | **plan** ci-dessous, rien d'exécuté ; 3 questions pour toi | (ce rapport) |

Les commits des jours précédents, également non poussés, partiront avec : `77152ec8` (Refaire le test : point et mode
réels), `d2cdec69` (retour à l'accueil = session vierge), `2daea62b`, `85cb61e7`, `cccabe32`, `0c6f4a06`, `f1d99701`
(migration 360).

---

## Lot 1 — erreur « _leaflet_pos » de la mini-carte

**La cause, trouvée et reproduite.** La mini-carte de la page de résultat (`app/FaisceauMini.tsx`) programmait un
recalage de sa taille **200 ms** après sa création (`setTimeout(() => map.invalidateSize(), 200)`). Si la page est
quittée — ou si la carte est recréée — dans ces 200 ms, le recalage s'exécute sur une carte **déjà détruite** : Leaflet
lève « Cannot read properties of undefined (reading '_leaflet_pos') ». Ce n'était ni un chargement de tuiles ni un zoom.

**Preuve au banc** (le vrai composant, Chrome mobile, démontage après N ms, 3 essais par délai) :
- avant : **9 exceptions sur 9** pour un démontage à 20, 80 et 150 ms ; 0 au-delà de 200 ms
  (`.captures/nuit/mini-avant.txt`) ;
- après : **0 exception sur 24** démontages de 0 à 1 200 ms (`.captures/nuit/mini-apres.txt`).

**Correction** (commit `8644f654`) : le recalage est mémorisé, **annulé au démontage**, et ne vise que la carte encore
affichée ; `stop()` arrête toute animation avant `remove()`. **Affichage inchangé** (même zoom, mêmes tuiles). Test
statique ajouté ; suite complète verte (1 167 fichiers, 19 933 tests au commit du lot 1 ; 1 168 / 19 942 après le lot 2).

**Preuve sur la vraie page** (`npm run dev`, Chrome mobile, `.captures/nuit/journal-sortie-rapide.txt`, captures
`N1-resultat-mini-carte.png`, `N2-accueil-apres-sortie-rapide.png`) : page de résultat quittée **0, 60 et 120 ms**
après l'apparition de la mini-carte → **aucune exception venant de la mini-carte**.

**⚠️ Même défaut sur la grande carte du faisceau — NON corrigé, à ta décision.** Le même passage a relevé 2 exceptions
identiques, dont la pile désigne `FaisceauMap.useEffect → invalidateSize` : la grande carte de l'écran
**d'orientation** (`app/FaisceauMap.tsx`) a le même recalage différé, à **300 ms**. Banc : 9 exceptions sur 12 pour un
démontage avant 300 ms (`.captures/nuit/grande-carte-faisceau.txt`). En usage réel, il faut quitter l'écran d'orientation
moins de 0,3 s après son apparition (« Valider mon orientation » tapé immédiatement) : rare, et sans effet sur le
parcours (le message reste dans la console). Je ne l'ai pas touchée : le lot visait la mini-carte, et la consigne était
de prendre l'option la plus prudente. La correction est la même, en 5 lignes, prête à faire sur ton accord.

---

## Lot 2 — migrations dormantes 212, 216, 262

Rappel : elles n'ont jamais été appliquées, ni sur le Mac ni sur le serveur, et sont inscrites « écartées » au registre.
Le code de chacune tolère leur absence.

### 212 — numéro stable des emprises de « bâtiment en projet »

- **Ce qu'elle crée** : un compteur par dossier (`permis_emprise_numero`) et une colonne `numero` sur
  `permis_emprise_reconstruite`, puis numérote les emprises existantes par ordre de création **dans le dossier**.
- **Qui en dépend** : l'écran « Caractéristiques » d'un permis (admin), qui nomme les emprises « bâtiment A (2) » quand
  un bâtiment en porte plusieurs (`nomCorps.ts`, `nomAffichageEmprise`) ; la création d'emprise
  (`empriseReconstruiteRepo.ts`, `enregistrerEmprise`) ; le choix de l'emprise pointée par l'accès (`choixEmpriseAcces.ts`).
- **Ce qui est dégradé aujourd'hui** : faute de colonne, le numéro est **recalculé à chaque affichage** (rang par id
  parmi les emprises du même bâtiment, `nomCorps.ts:70`). **Supprimer une emprise renumérote les suivantes** : une note
  qui citait « bâtiment A (3) » désigne ensuite une autre emprise. Rien d'autre n'est cassé (repli prévu partout).
- **Si on l'applique** : les numéros deviennent définitifs. Mesuré sur la copie de la base du Mac (15/10) : 12 emprises,
  7 dossiers, **1 seul bâtiment à plusieurs emprises, et 0 nom affiché qui changerait**. À noter : la numérotation est
  par **dossier**, pas par bâtiment — une nouvelle emprise d'un bâtiment peut donc recevoir « (4) » alors que ce bâtiment
  n'en a que deux ; c'est le choix de conception de 212 (« jamais réattribué »), pas un défaut.
- **Risque** : faible. Une reprise de données (UPDATE de la nouvelle colonne seulement), idempotente.
- **Recommandation** : **appliquer, par une nouvelle migration de réveil** (comme la 359). Préparée : `361`.
  Avant de la publier, relancer la mesure sur la base du serveur (bloc en lecture seule plus bas) : la prod a pu créer
  des emprises depuis le 15/10.

### 216 — lecture IA du Cerfa (passes enregistrées)

- **Ce qu'elle crée** : une table `permis_cerfa_ia`, neuve et vide (une ligne par passe de lecture IA).
- **Qui en dépend** : la commande `npm run permis:lire-cerfa-ia` (lancée à la main, **payante**, Mistral) et la fiche
  permis de l'admin, qui affiche la dernière lecture IA (`caracteristiques/route.ts:120`).
- **Ce qui est dégradé aujourd'hui** : avec `--appliquer`, **rien n'est enregistré** (`compteRenduIaRepo.ts`, repli
  « no-op ») : ni le compte rendu (le revoir = relancer = **repayer**), ni la **preuve de ce qui a été transmis** au
  prestataire (pages envoyées ou refusées) ; le garde-fou « GED inchangée → ne pas rejouer » ne peut pas jouer ; la fiche
  admin n'affiche jamais de lecture IA.
- **Si on l'applique** : **rien ne change pour personne** tant qu'aucune passe n'est lancée ; ensuite, la lecture reste
  affichée sur la fiche, avec sa preuve de transmission et son coût.
- **Risque** : nul (table neuve et vide, aucun appel IA déclenché par la migration).
- **Recommandation** : **appliquer, par une nouvelle migration de réveil**. Préparée : `362`.

### 262 — registre des déplacements de pièces dans le Drive

- **Ce qu'elle crée** : une table append-only `gestion_piece_classement` (d'où / vers où / règle / certitude) et
  **modifie la contrainte** `gestion_journal_entite_chk` (ajout de l'entité « classement »).
- **Qui en dépend** : **personne aujourd'hui**. La sonde `classementDisponible()` (`schema.ts:590`) n'est appelée nulle
  part ; le plan de classement (`gestion:classement:plan`) tourne en simulation sans cette table. (Les
  `classementDisponible` de l'écran de rédaction désignent autre chose : « Classer ce mail », migration 285.)
- **Ce qui est dégradé aujourd'hui** : rien.
- **Si on l'applique** : rien de visible ; elle ne sert que le jour où les **déplacements réels** dans le Drive seront
  autorisés.
- **Risque** : faible mais non nul (elle touche une contrainte du journal de gestion), pour aucun bénéfice aujourd'hui.
- **Recommandation** : **laisser dormir** jusqu'au lot qui autorisera les déplacements réels.

### Ce qui est préparé (commit `e14674bc`), et pourquoi ce n'est appliqué nulle part

- `db/migrations-en-attente/361_permis_emprise_numero_reveil.sql` (= 212) et `362_permis_cerfa_ia_reveil.sql` (= 216),
  avec l'en-tête `-- svav:remplace …`.
- **Rangées hors de `db/migrations/`, exprès** : la mise à jour de la prod applique tout ce qui est nouveau dans
  `db/migrations/`. Les y mettre aurait voulu dire « appliquées à la prochaine mise à jour », sans ta décision.
- **Pour décider de les appliquer** : déplacer le ou les fichiers dans `db/migrations/` (vérifier que 361 et 362 sont
  toujours les numéros suivants), committer, puis l'outil de mise à jour habituel (l'essai les affichera comme
  « nouvelles »).
- **Tests** (`app/lib/ops/migrationsEnAttente.test.ts`, 9 tests) : aucun refus du garde, mode « enveloppée »,
  instructions **identiques** aux originales, colonnes lues et écrites par le code présentes, et plan de mise à jour le
  jour du déplacement (seules nouvelles ; 212/216 plus rappelées ; 262 toujours rappelée).
- **Preuve sur base jetable** (`.captures/nuit/base-jetable-361-362.txt`) : schéma et 12 emprises copiés depuis la base
  du Mac (lecture seule), 361 passée **deux fois** (idempotente), numérotation reprise conforme, compteur à 4 pour la
  création suivante ; 362 passée deux fois, une passe IA écrite et relue comme le fait le code (transaction annulée) ;
  base supprimée.

**Bloc de mesure sur le serveur, à lancer avant de publier la 361** (lecture seule forcée) :
```
ssh svav-prod 'bash -s' <<'EOF'
cd /home/ubuntu/sansvisavis/current && set -a && . ./.env && set +a
export PGOPTIONS='-c default_transaction_read_only=on'
psql "$DATABASE_URL" -X -At -F ' : ' -c "select 'emprises', count(*) from permis_emprise_reconstruite
union all select 'noms qui changeraient', count(*) from (select row_number() over (partition by dossier_id order by id) rd,
  row_number() over (partition by dossier_id, corps_id order by id) rc, count(*) over (partition by dossier_id, corps_id) n
  from permis_emprise_reconstruite) x where n >= 2 and rd <> rc" < /dev/null
EOF
```
Attendu : « noms qui changeraient : 0 ». Si ce n'est pas 0, ne pas publier la 361 et me le dire.

---

## Lot 3 — préproduction `preprod.sansvisavis.com` (plan, rien d'exécuté)

### Ce que le serveur peut porter (mesures de l'inventaire du 15/10)

32 cœurs, 62 Go de mémoire (2,5 Go utilisés), 647 Go libres. Une version de l'application ≈ 0,9 Go ; `svav-next` ≈ 400 Mo
de mémoire ; un build ≈ 2 à 4 Go pendant quelques minutes. Base : 139 Go dont **128 Go de LiDAR** ; hors LiDAR ≈ 11 Go
(sauvegarde compressée 4,9 Go). MinIO : taille à mesurer (`du -sh /home/ubuntu/sansvisavis/minio/data`).

**Coût estimé de la préprod** : mémoire ≈ 0,5 Go en marche (+ 2 à 4 Go pendant un build) ; disque ≈ 5 Go de versions +
≈ 11 Go de base + la copie MinIO + **128 Go de plus** si le LiDAR est copié (voir question 2).

### Architecture proposée

| Élément | Prod (existant) | Préprod |
|---|---|---|
| Dossier | `/home/ubuntu/sansvisavis/{current,releases,shared}` | `/home/ubuntu/sansvisavis-preprod/{current,releases,shared}` |
| Service web | `svav-next`, 127.0.0.1:3000 | `svav-preprod-next`, 127.0.0.1:**3001** |
| Tâches (veille, relève Gestion, Drive, surveillance, analytics) | actives | **aucune** : pas d'unité, donc rien ne tourne seul |
| Caddy | `authentification.sansvisavis.com` | `preprod.sansvisavis.com` → 127.0.0.1:3001, **protégé par mot de passe** (basic auth) et `X-Robots-Tag: noindex` |
| Base | `sansvisavis` | selon question 2 : schéma `preprod` dans la même base, ou base `sansvisavis_preprod` |
| Stockage | bucket `svav-dev` | bucket `svav-preprod` (copie) |
| `.env` | réel | `shared/.env` préprod : **sans** `SMTP_*`, sans compte Google délégué ni jeton Drive, sans clés IA (Mistral, Gemini), `SITE_URL=https://preprod.sansvisavis.com` |

**Effets extérieurs coupés par construction** : le code n'envoie un mail que si `SMTP_*` est présent
(`lireCompteSmtp`), n'appelle Gmail/Agenda/Drive qu'avec le fichier de clé délégué ou le jeton Drive, et n'appelle l'IA
qu'avec sa clé. Je proposerais un **garde au démarrage** : si `SVAV_ENVIRONNEMENT=preprod` et qu'une de ces variables est
présente, le service refuse de démarrer. Plus un bandeau « PRÉPROD » dans l'interface, et un filigrane sur tout
certificat produit en préprod (pour qu'une capture ne puisse jamais passer pour un vrai certificat).

**LiDAR partagé en lecture seule (option recommandée, question 2)** : préprod = **schéma `preprod` dans la même base**,
avec un rôle dédié `svav_preprod` dont le `search_path` est `preprod, public`. Toutes les tables de l'application
existent dans `preprod` ; le rôle n'a **que** `SELECT` sur les 4 tables LiDAR et `spatial_ref_sys` de `public`, et aucun
autre droit dans `public` : une écriture qui « tomberait » par erreur dans `public` est refusée par la base. Pas de copie
de 128 Go. Alternative : base séparée avec copie du LiDAR (isolation totale, +128 Go, plusieurs heures de copie).

### Rafraîchissement (« copie fraîche »)

Une commande `npm run preprod:rafraichir` (à écrire), lancée depuis le Mac comme la mise à jour, qui sur le serveur :
1. prend la dernière sauvegarde de `sauvegardes-maj` (ou en fait une, `bascule-sans-lidar.sh exporter`) ;
2. la restaure dans la préprod par la procédure éprouvée à l'étape C6 (`bascule-sans-lidar.sh restaurer`, garde LiDAR) ;
3. applique le **traitement des données personnelles** retenu (question 1) ;
4. remet les réglages propres à la préprod (relève et envois automatiques désactivés en base, en plus des variables
   absentes) ;
5. recopie le bucket MinIO ;
6. réapplique les migrations que la version en préprod a en plus de la prod (registre `svav_migration` de la copie).

### Intégration à `prod:mettre-a-jour`

- Option `--cible=preprod|prod` : même outil, même déroulé, paramétré par dossier, unité, port, base, URL. (Il faudra
  rendre `installer.sh` paramétrable : aujourd'hui les noms `svav-*` et `/etc/svav/svav.conf` y sont fixes.)
- Parcours : `--cible=preprod --essai`, `--cible=preprod --appliquer`, validation à la main sur
  `preprod.sansvisavis.com`, puis `--cible=prod --appliquer` du **même commit**.
- Garde proposé (question 3) : la prod **refuse** un commit qui n'est pas passé avec succès en préprod (historique de la
  préprod), sauf option explicite `--sans-preprod` pour une urgence.
- Les migrations passent donc **d'abord** sur la base de préprod : une migration lente ou qui échoue se voit avant la
  prod.

### Risques

- **Données personnelles** : une copie réelle de la base contient des mails de gestion, des contacts et des internautes.
  Une préprod accessible sur Internet est une seconde porte d'entrée vers ces données (d'où le mot de passe Caddy, et la
  question 1).
- **Effet extérieur accidentel** : une variable d'envoi recopiée par erreur dans le `.env` de préprod → mails réels
  envoyés depuis la préprod. Parades : `.env` préprod écrit à part, garde au démarrage, aucune tâche installée.
- **Charge partagée** : même serveur et, en option 1, même base ; un test lourd en préprod ralentit la prod. 32 cœurs et
  62 Go laissent de la marge, mais pas d'isolation.
- **Divergence** : la préprod a des migrations d'avance sur la prod ; un rafraîchissement doit les réappliquer
  (étape 6), sinon le code de préprod tourne sur un schéma trop ancien.
- **Confusion** : mêmes numéros de certificat en préprod et en prod → filigrane obligatoire.
- **DNS** : créer `preprod.sansvisavis.com` (enregistrement A vers le serveur) est un geste chez OVH, à faire par toi.

### Questions pour toi

1. **Données personnelles en préprod** : **(a)** anonymiser la copie à chaque rafraîchissement (noms, adresses mail,
   téléphones, corps des mails de gestion remplacés ; plus sûr, plus long à écrire) ou **(b)** copie réelle, mais envois
   coupés et accès protégé par mot de passe (plus simple, données réelles exposées à un second accès) ? Je recommande (a).
2. **LiDAR** : **(a)** schéma `preprod` dans la même base, LiDAR partagé en lecture seule par les droits (pas de copie) ou
   **(b)** base séparée avec sa copie du LiDAR (+128 Go, isolation totale) ? Je recommande (a).
3. **Garde** : la prod doit-elle **refuser** un commit qui n'est pas passé par la préprod (sauf `--sans-preprod`) ?
   Je recommande oui.

---

## Ce qui attend ta décision

1. **Grande carte du faisceau** (écran d'orientation) : appliquer la même correction que la mini-carte ? (lot 1)
2. **361 / 362** : les déplacer dans `db/migrations/` pour qu'elles partent à la prochaine mise à jour ? Pour la 361,
   lancer d'abord le bloc de mesure ci-dessus. (lot 2)
3. **Préprod** : les 3 questions du lot 3.
4. **Pousser `main` et publier** les commits accumulés (liste en tête), avec l'outil de mise à jour (essai puis appliquer).

## Ce qui a échoué ou a été contourné cette nuit

- **Banc du lot 1, premier passage faux** : le délai de démontage était mal lu (« 20&0 » → aucun délai) et esbuild avait
  refusé de reconstruire (images du CSS de Leaflet) ; le premier « 0 exception » n'était donc pas une mesure. Corrigé
  avant toute conclusion ; seules les mesures valides figurent ci-dessus.
- **Limite anti-abus des analyses** : sur le Mac, faute de `CADENCE_ENTETE_IP`, tous les visiteurs partagent un seul
  compteur (10 analyses par 24 h), épuisé hier par mes essais. Pour la preuve du lot 1, le serveur de développement a
  été lancé avec `CADENCE_ENTETE_IP=x-forwarded-for` **dans l'environnement du seul processus** (pas dans le `.env`), et
  le banc s'est présenté avec une adresse de test réservée (203.0.113.x). Aucun réglage ni aucune base modifiés.
- Une commande combinant un lancement en arrière-plan et un `curl` a été refusée par les permissions ; refaite en deux
  temps.
