> Passation générée le 18/11/2026 à 11h13

# PASSATION — Sans Vis-à-Vis® / CRITERIMMO

*(Colle ce bloc entier au début de ta nouvelle conversation Claude.)*

> Établie à partir de l'état RÉEL du dépôt le 18/11/2026 (`git log`, `git status`, lecture seule) et de la conversation de
> travail des 17-18/11/2026 (digicodes, syndic, adresses multiples d'une copropriété, mandat par bien, quatre corrections).
> Reprend la passation du 01/11/2026 pour tout ce qui n'a pas changé.

---

## 1. Rôles & workflow

**Arno** — fondateur **non-développeur** de **Sans Vis-à-Vis** (sansvisavis.com), agence et plateforme de
**certification immobilière** : transformer « sans vis-à-vis » en une **norme mesurable, certifiable et auditable**
(Paris + petite couronne). Il porte aussi **CRITERIMMO**, l'activité de **gestion locative** (boîte
`gestion@criterimmo.fr`), d'où les modules **Gestion** et **Location**, et le module **Transaction / Mon espace**
(ventes et CA de CRITERIMMO et MACJ). Depuis début novembre, l'essentiel du travail porte sur **Location** et
**Gestion** (copropriétés, digicodes, syndics, mandats, préavis, pré-visites), plus **Mon espace**.

**Toi (Claude, conversation web/desktop)** — architecte et relecteur : tu produis des **cartouches d'instructions en
français** que l'agent exécute.

**Workflow relais EN VIGUEUR :** tu donnes un prompt (une demande d'Arno, souvent découpée en « lots » ou en
« points ») → Arno le colle à l'**agent Claude Code dans VS Code** → l'agent fait le travail **en RECETTE
seulement**, vérifie (tests, Chrome, captures dans `.captures/<dossier-nommé-dans-le-prompt>/`), puis **committe
LUI-MÊME** et rend messages + hashs :
- `git add` **des seuls fichiers du lot** (jamais `git add -A` / `.`) ;
- message en français citant la demande / décision d'Arno, **SANS ligne `Co-Authored-By`** ni autre attribution ;
- **jamais de `git push`** : **Arno pousse à la main**, puis met la prod à jour lui-même ;
- **un commit par lot / par point** quand le prompt le dit (c'est la règle dans tous les prompts récents).

- Repo : **github.com/Moutchxp/app**, branche **`main`**. Répertoire : `/Users/macbookprom4arnaud/sansvisavis/app`.
- Stack : **Next.js 16.2.9** (Turbopack en dev), **React 19.2.4**, **TypeScript 5** strict, **Tailwind 4**,
  **PostgreSQL 17 + PostGIS** **local**, driver **`pg`** sur `DATABASE_URL`. Fichiers : **MinIO/S3** (jamais
  d'image ni de PDF en base). IMAP via **imapflow** ; Google Workspace (Gmail, Drive, Agenda) pour la Gestion.
- ⚠️ **Next.js 16 n'est pas celui que tu connais** : lire `AGENTS.md` et `node_modules/next/dist/docs/` avant
  d'écrire du code Next.

**Hébergement :**
- **PRODUCTION = serveur OVH `svav-prod`** (bascule Mac → OVH le 15/10/2026). Mise à jour en une commande depuis le
  Mac, après `git push` : `npm run prod:mettre-a-jour -- --essai` puis `-- --appliquer` (`deploy/maj/README.md`) ;
  sauvegarde avant chaque mise à jour ; migrations nouvelles passées par l'outil (registre `svav_migration`).
- **RECETTE = le Mac d'Arno** : `npm run recette` (next dev, port 3000) sur la base **`svav_recette`** ; bandeau
  rouge « RECETTE — envois réels autorisés vers a.jorel@sansvisavis.com » ; tout autre mail, l'agenda et le
  Drive sont interceptés. La base « principale » du Mac s'appelle `sansvisavis` (atelier, pas la prod).

**Langue** : français, tutoiement, direct. Termes métier en français.

---

## 2. Règles de collaboration (impératives)

- **Un chantier = une modif logique = un commit.** Un prompt à la fois ; après chaque lot, on vérifie, puis commit.
- **Recon LECTURE SEULE avant tout write** sur un fichier sensible (liste au §14 de `CLAUDE.md`) — et, pour un
  chantier qui touche un modèle de données, une **étape 1 en lecture seule** (état des lieux, rapport à blanc,
  découpage en lots, questions métier) avant d'écrire quoi que ce soit (pratique des chantiers récents).
- **TOUJOURS des blocs copiables**, clairement labellisés (format au §7). Un prompt par bloc.
- **Ne jamais conseiller de faire une pause ou d'arrêter.** Arno décide seul de son rythme.
- Sur un choix de **design ou de ressenti** : proposer **plusieurs options AVANT** d'implémenter.
- **Question de choix métier** : l'agent l'écrit et s'arrête (formule présente dans les prompts d'Arno).
- **Jamais retirer, masquer, conditionner ou déplacer un élément d'interface** sans l'accord d'Arno pour CET
  élément ; un composant partagé n'est pas un écran (`grep` qui d'autre le rend) ; avant chaque commit, lister ce
  qui a disparu. Formule d'Arno : « Rien d'autre n'est retiré, masqué ni conditionné. »
- **Hors staging, toujours** : `app/lib/svv/adaptateurIaPhoto.ts`, `app/api/analyse-photo/route.ts` (Gemini) et
  **`PASSATION.md`**.
- **Migrations** : seulement si **indispensables** ; **numéro libre suivant** ; **ajout seul, idempotentes**
  (`IF NOT EXISTS`), **enveloppées** (`psql -X -q -v ON_ERROR_STOP=1 -1 -f …`, jouées deux fois sans erreur),
  **appliquées à la RECETTE seulement** ; le code doit tourner SANS elles (sondes de schéma `colonneExisteMemo`,
  hors transaction). Garde à jour : `app/lib/ops/migrationsEnAttente.test.ts` (la 361 en attente se décale à
  chaque nouvelle migration : **elle devra prendre la 493**).
- **CONTRÔLE DE FIN OBLIGATOIRE = `npm test` COMPLET vert** (= `vitest run`). **Mesuré le 18/11/2026 :
  1 790 fichiers, 27 096 tests verts + 21 ignorés.** (Le « 173 fichiers » d'`AGENTS.md` est très périmé, le principe
  reste : les suites filtrées par chemin sont des contrôles RAPIDES, **jamais** le contrôle de fin — précédent :
  `curation.test.ts` rouge du 14/07 au 03/08/2026, invisible aux filtres. Pas d'alias `test:tout`.) `tsc --noEmit`
  est dans le gate. Une suite qui dépasse ~2 min = test figé : le borner.
- **Composant client touché → preuve curl** : `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/admin/login`
  = 200, et la page sans « Module not found » ni « Build Error » (un 500 n'en contient aucun : **lire le statut**).
  `curl` est refusé dans les sessions de l'agent : Arno la lance lui-même (`! curl …`) ; dernière preuve le
  18/11/2026 : 0 erreur, statut 200.
- **Vérification au Chrome du Mac** (Playwright, canal `chrome`, jeton de session signé) : **téléphone 390 px ET
  ordinateur, clair ET sombre**, sur la recette ; en **lecture seule** par défaut (toute écriture bloquée par
  interception), une écriture réelle seulement sur des **données d'essai nommées d'après ce qu'on teste**
  (« _TEST MANDAT », « _TEST DEUX ADRESSES », « _TEST NON SAUVEGARDE PROPRIETAIRE »…). Captures « avant / après » dans
  le seul dossier nommé par le prompt. Les scripts de vérification vivent dans ce dossier (`.tmp-*`), pas dans le
  scratchpad (playwright ne s'y résout pas), et sont **effacés en fin de lot** avec le jeton.
- **JAMAIS `npm run test:integration` en entier** (des itests écrivent dans la vraie base) : seulement les fichiers
  nommés, dont `pipeline.itest.ts`.
- **Tests — ne jamais figer la FORME d'un SQL émis** : asserter le comportement + paramètres liés, et au besoin des
  fragments sur `sql.replace(/\s+/g, ' ')` + `toContain` (modèle : `curation.test.ts`, « entité supprimée »).
- **Flakes connus** : jamais une hypothèse présentée comme une cause ; registre **`docs/FLAKES_CONNUS.md`** (niveau de
  preuve par entrée). `certificatPdf.test.ts` : cause **NON ÉTABLIE** ; l'ancien diagnostic « comparaison d'octets non
  déterministe / timestamp » est **RÉFUTÉ** (générateur prouvé déterministe octet à octet) — ne pas le réimprimer.
- **Diagnostic → mesure → correctif**, dans cet ordre ; le rapport dit lequel des trois est établi.
- **Dossier `location/`** : un test de garde refuse toute couleur hexadécimale et tout `var(--x, repli)` (jetons
  `--color-svv-*` seulement). Un garde CSS exige que les éléments de 1 px absolus soient épinglés (`top:0;left:0`).

### Garde-fous permanents (absolus — répétés dans chaque prompt d'Arno)

- **Git** : **aucun** `git stash` (**y compris `git stash list`**), `git checkout -- …`, `git restore`, `git reset`,
  `git clean`. État du dépôt : `git status --short`, `git log`, `git diff` uniquement. Pour comparer : écrire la
  référence ailleurs, jamais par-dessus un fichier suivi. Un fichier se retire par `git rm`.
- **Aucune action sur la production.** **Envois réels uniquement vers `a.jorel@sansvisavis.com`** ; **aucun mail à
  un client** ; ne toucher à **aucun brouillon réel** ; **« Documents clients scannés » jamais touché** ; **aucun
  secret affiché**. Une adresse de l'agence est refusée comme coordonnée d'un propriétaire : les fiches d'essai
  prennent une adresse fictive en `@exemple.invalid`.
- **Drive** : l'app ne s'autorise que déplacer / copier / renommer / corbeille ; jamais de suppression définitive,
  jamais un DOSSIER à la corbeille ; un essai n'utilise QUE des pièces de mails « _TEST… ».
- **Rien sur le Bureau** (ni Documents, ni Téléchargements) : tout dans **`.captures/<dossier>/`** (ignoré par git) ;
  sauvegardes de base dans `.captures/sauvegardes/` (jamais effacées sans Arno). **`rm` seulement dans `.captures/`
  ou le scratchpad** (pour régénérer des types Next : `npx next typegen`, jamais `rm -rf .next/types`).
- **Fichiers de travail effacés en fin de lot** : copies de serveur, dumps, profils Chrome, scripts `.tmp-*`, jetons.
- **Historique inaltérable** (Gestion) : un mail entré dans l'historique d'un bien n'en sort que par « Sortir du
  suivi » ; verrou EN BASE (339-340). On marque, on n'efface pas.

---

## 3. Objectif à atteindre

**Objectif global.** Une application mobile qui **certifie automatiquement** si un logement est « Sans Vis-à-Vis® »
(verdict géométrique binaire), produit un **certificat PDF** et une **estimation de plus-value liée à la vue** ; plus
une **interface d'administration interne**, mobile-first, qui permette à Arno — qui ne code pas — de **piloter toutes
les variables des moteurs sans toucher au code ni à la base**. S'y ajoutent les outils métier internes de l'agence :
**Permis**, **Gestion** (courrier et suivi des biens CRITERIMMO, copropriétés, digicodes, syndics), **Location**
(dossiers, biens, propriétaires, préavis, pré-visites, Outils de suivi), **Transaction / Mon espace** (ventes, CA,
coûts des deux sociétés CRITERIMMO et MACJ).

**Chantier le plus récent (17-18/11/2026), tous les lots livrés et validés par Arno, puis 4 corrections :**
1. **Adresses multiples d'une copropriété** (lots 1-5) : les bâtiments rattachés à LEUR adresse, la proposition de
   rattachement par parcelle.
2. **Mandat par bien** (lots 1-4 + retrait de l'ancienne page) : le n° de mandat (gestion ET transaction locative)
   porté par chaque bien, le propriétaire sans statut « en gestion », la nouvelle page « Créer un nouveau
   propriétaire ».
3. **Quatre corrections du 18/11** (un commit chacune) : « Digicode » comme texte d'exemple partout ; le message
   « Bâtiment et digicodes enregistrés. » seulement s'il y a eu écriture ; « Non (Sauvegarde du propriétaire) » ;
   l'alignement de la rangée « Bâtiment / cage d'escalier — Étage — N° de porte ».
Aucun lot n'est en cours d'écriture : **Arno valide en recette et choisit la suite.**

---

## 4. Invariants verrouillés (garde-fous permanents)

Prouvés `fichier:ligne` dans **`docs/INVARIANTS_SVAV.md`** — **le code fait foi**.

- **Golden de non-régression = `40.77232776704026`** (note Couche 1 /80), scellé `app/lib/db/pipeline.itest.ts:88` et
  `app/lib/svv/golden.test.ts` (sans base), hand-verified, BITIDENT=true. Rejoue **Asnières** (lat
  `48.90693182287072`, lon `2.269431435588249`, azimut 90, étage 2). Rescellé le 22/10/2026 (29.12915579059343 →
  40.77232776704026, pivot face à la façade, décision d'Arno ; verdict inchangé) ; avant : 14/10/2026 (« un frôlement
  n'est pas un contact »). Toute modif touchant le score change le golden → recalcul + **validation manuelle** +
  **rescellage en commit SÉPARÉ**. Asnières est un oracle faible pour le patrimoine.
- **Verdict binaire 100 % GÉOMÉTRIQUE** : 1ᵉʳ obstacle réel **≥ 40 m** sur l'axe → `SANS_VIS_A_VIS`, sinon
  `VIS_A_VIS` (`THRESHOLD_M`, `config.ts:82` ; `verdict.ts:103`). **Jamais couplé au score ni à la photo**
  (`scoreTotal.ts:44`). L'IA photo n'intervient QUE dans le score de qualité de vue (/100, 50/50).
- **Œil vs toit** : A_œil = MNT LiDAR au point exact + hauteur de vision ; A_toit = **MNS LiDAR lu DIRECTEMENT**,
  jamais sol + hauteur. BD TOPO = emprise + `cleabs` (hauteur BD TOPO = fallback NON certifiant). Hors bâtiment / hors
  LiDAR → INDÉTERMINÉ. Végétation jamais obstacle.
- **Hauteur de vision = FORMULE À PARAMÈTRE VARIABLE** : `étage × (hauteur_sous_plafond + 0,30 dalle) + 1,65 yeux`
  (`config.ts:56-61`). Sous-plafond **choisi par l'internaute**, défaut **2,50 m**, fourchette **[2,40 ; 4,50] m** par
  pas de 0,10. ⚠️ « 2,80 » = coefficient du seul cas par défaut (2,50 + 0,30), **pas une constante** ; l'ancienne
  formule « × 2,90 » est **PÉRIMÉE** ; ⚠️ « 2,90 » = `FLOOR_HEIGHT_OBSTACLE_M`, constante DISTINCTE (immeuble voisin
  sans hauteur BD TOPO).
- **AUCUN ARRONDI nulle part** ; distances autoritatives en **Lambert-93 (EPSG:2154)**. **`ST_Force2D` jamais retiré.**
- **Tolérances** : rattachement patrimoine **15 m** ; point d'origine hors emprise **0,30 m**.
- **Certificat `SAVV-AAAA-NNNNNN`** (cible, compteur atomique ; la Gestion utilise `GES-AAAA-NNNNNN`).
- **Requêtes spatiales** : un KNN `<->` ne lit jamais son point d'un CTE multi-référencé (inliner) ; tout nouvel
  index vérifié par `EXPLAIN (ANALYZE, BUFFERS)` sur la requête réelle.
- **`prefers-reduced-motion`** respecté ; **mobile-first** (iPhone portrait, cibles ≥ 44 px, rien au survol seul, aucun
  débordement horizontal) ; **couleurs = jetons `--color-svv-*`**, une information jamais portée par la seule couleur.
- **EXIGENCE ARCHITECTURE — PILOTAGE SANS CODE.** Toute variable de tout moteur de score est externalisée et éditable
  au runtime : `config_scoring` (**39 colonnes**, singleton `id=1`, lu par `profilConfig.ts:57`, repli sûr
  `PROFIL_DEGAGEMENT_DEFAUT`). Dans CHAQUE chantier : aucune constante de score en dur (exception actée :
  `SCORE_LABEL` 75/60) ; toute nouvelle variable naît **en table de config** (type, défaut, plage / liste fermée) ;
  statut **VIVE / VESTIGIALE / GARDE** documenté ; schéma et nommage pensés pour une interface lisible par un
  non-développeur. Même esprit côté Location : paramètres versionnés en base, jamais en dur.
- **Gestion / Location — règles d'Arno à ne pas réinterpréter :**
  * **Un bâtiment de copropriété est identifié par (adresse, nom)** ; unicité (copropriété, adresse, nom)
    (migrations 489-490) ; le menu d'un bien ne propose QUE les bâtiments de son adresse ; la règle lettres / chiffres
    vaut pour toute la copropriété ; un bâtiment sans adresse = « adresse à préciser », jamais deviné.
  * **Le n° de mandat (gestion ET transaction locative) et sa date sont portés par CHAQUE BIEN** (migration 492) ; un
    même n° ne couvre que des biens d'**EXACTEMENT le même ensemble de propriétaires** (M. Martin seul ≠ M. et
    Mme Martin) ; même propriétaire → fenêtre « Le mandat n° X est déjà utilisé pour <adresse> de ce propriétaire.
    L'utiliser aussi pour ce bien ? » (Confirmer / Corriger) ; autre propriétaire → refus absolu, même pour un bien
    sorti de gestion ; gestion et transaction contrôlées séparément ; une annexe rattachée lit le n° de son logement ;
    propriétaires changés après coup → signalement orange, jamais bloquant. Tant qu'un bien n'a pas de n°, les
    lecteurs replient sur l'ancien n° de la fiche propriétaire.
  * **Un propriétaire n'a plus de statut « en gestion »** : seul le bien porte « Bien en gestion ? ».
  * **« Créer un nouveau propriétaire » + bien = tout ou rien** : les fiches et le bien sont écrits dans la MÊME
    transaction (`creerProprietairesEtBien`).
  * **Historique inaltérable** (voir §2).
- **Suivi CA (Transaction)** : la fin d'année de tout graphique = le total des tuiles / du Bilan, au centime ; contrôle
  permanent `grapheGlobal.itest.ts` (à lancer seul, par son nom).

**Hors périmètre permanent** sans demande explicite : moteur de score, verdict, golden, comportement du module Permis,
`app/lib/email/imap.ts`, fichiers Gemini, `PASSATION.md`.

---

## 5. Résumé de l'historique

### 5.1 Corpus figé à lire AVANT tout chantier données / verdict / certificat / permis
**`docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md`** (session des 25-26/07/2026). Ne pas redécouvrir :
- **§1-2 Fraîcheur et contrôle mixte LiDAR/BD TOPO, deux régimes.** Régime 1 (polygones *modifiés*) : altitude de
  toit remplie à 86 % (≥ 2023) → 95,2 % (≥ 2025), la règle marche. Régime 2 (bâtiments *réellement neufs*,
  `date_creation ≥ 2024`) : altitude de toit **7,8 %**, `nombre_d_etages` **0,1 %** — cas le plus dangereux (immeuble
  postérieur au vol LiDAR). Remplissage **non monotone** → brancher sur la **présence du champ**, jamais un seuil de
  date. Décision : en Régime 2, ne pas substituer une valeur plus faible au LiDAR → **certificat « à revérifier »**.
- **§3 Sources externes de hauteur** : PLU = borne réglementaire ; BDNB = pivot, pas mesure ; DPE neufs, RNB, OSM.
- **§4 Permis = recours d'ARBITRAGE.** Sitadel ne donne pas la hauteur. Dossier communicable par e-mail et sans frais
  (CRPA L311-9 3°) si **délivré** ; délai 1 mois, silence = refus → CADA. **Interdit** : demande systématique ; 1-2
  demandes/commune/an ; à visage découvert. **Automatiser le workflow, jamais la donnée** (extraction validée par un
  humain).
- **§5 Sitadel** : ≈ 28,6 constructions neuves/an sur 5 communes → ~10 alertes/an pour 1 000 certificats.
- **§6 Conformité** : fond de carte du certificat conforme ; **trou** : attribution OSM/Esri désactivée à l'écran
  (`MapContent.tsx`, `FaisceauMap.tsx`, `FaisceauMini.tsx`) ; pas de `LICENSE`/`NOTICE`.
- **§7 Prochain gros chantier énoncé** : mise à jour continue des maps par les nouveaux permis (prérequis : index
  `batiment.cleabs`, 2ᵉ édition BD TOPO historisée, `cleabs` de l'obstacle dans le snapshot).

### 5.2 Chantiers antérieurs (terminés)
Moteur de scoring externalisé (`config_scoring`) · barème des familles patrimoine · couches LiDAR HD (MNT/MNS), BD
TOPO, cadastre · module **Internaute** · **Banc de test** · **Curation** · **Analytics** · module **Permis** (veille,
demandes CADA, relances, GED, liseuse, extraction assistée, rattachement, registre d'altitudes, parcelles) · audit de
dette `docs/AUDIT_2026-09-21_diagnostic_code_et_dette.md` · mise à jour de la prod en une commande · golden rescellé
deux fois.

### 5.3 Module GESTION (CRITERIMMO) — socle livré (sept.-oct.)
Boîte mail façon Gmail (relève IMAP continue, ~56 000 mails, lu/non lu = Gmail seul, éditeur), **rattachement mail →
bien** (la cible est toujours un BIEN), **historique inaltérable**, **événements** `GES-…` (frise, état calculé),
**annuaire** (propriétaires, lots, locataires, syndics, copropriétés), mises à jour WIPPIMMO, **statut du bien** (403 :
en gestion / ancienne gestion / location seule), **Drive** (sélecteur unique, arbre, rangement, « Base de données
location seule » 404), **tâches**, journal append-only en base.

### 5.4 Module LOCATION — socle livré (oct.)
Nouveau locataire / dossier de location (honoraires au barème 392, GLI), **Outils de suivi** (Suivi du mois, Suivi
annuel, variable des négociateurs, Résultat net, annuaire des apporteurs, paramètres versionnés), historique importé
des fichiers « CA JBP » 2020-2026.

### 5.5 Module TRANSACTION — livré du 26/10 au 01/11 (≈ 190 commits, lots C → DZ, LS, LO, LG, GE, UI, CG1-12)
Ventes / compromis de CRITERIMMO et MACJ, répartitions, inter-cabinet, écrans « Le mois » / « L'année », Gestion,
Suivi CA › Location, FUSION Location & Gestion, **CA global** (tuiles, Bilan, graphique filtrable, contrôle permanent
`grapheGlobal.itest.ts`, zéros masqués, zone +15 %).

### 5.6 Du 02/11 au 18/11/2026 — ≈ 276 commits (feat/fix location ≈ 95, gestion ≈ 83, mon-espace ≈ 48, transaction ≈ 21)
Migrations **448 → 492** (toutes en recette ; l'état de la prod se lit par `prod:mettre-a-jour -- --essai`) :
- **Mon espace** (448-459, 462, 471-472) : droit d'accès, n° de mandat de vente obligatoire et unique (449),
  apporteurs, **coûts saisis et validation** (451-452), fonctions datées, permissions des tuiles (454), particulier /
  professionnel, compromis commun, négociateur ↔ compte, taux de commission obligatoire, CA Gestion saisi,
  rémunérations des associés ; onglets et graphiques repris du Suivi CA.
- **Location** : mails de préavis et de sortie (457, 460, destinataires configurables), copropriété du lot (461),
  **pré-visite** (464, 474 : compte rendu en page, vocaux, dictée, envois automatiques par minuterie), textes de mail
  modifiables (466), validation de sortie et EDL (467-468), **préavis de TEST** réservé aux administrateurs (473), AG de
  copropriété et ses PV (475, 481, 483), nature d'adresse (480, 485, 486 : « Adresses uniformisées »).
- **Gestion** : nouveautés d'événement (456), traduction Monga (463), tâches (invitations de contacts 465, RDV 469-470),
  **fiche Copropriété** séparée du syndic (476 : registre des bâtiments ; 477), **digicodes unifiés** (478-479, 482,
  484, 487-488 : un composant unique fiche Copropriété / « Nouveau bien » / « Modifier le bien » / fiche du bien Gestion,
  « Modifier » daté avec mails aux locataires et à la Gestion — A « Prévenir la Gestion seulement » = ALERTE, B
  « Prévenir la Gestion et les locataires » = INFORMATION ou ALERTE avec la raison —, « Corriger une erreur »,
  « Enregistré le … par … », « − » qui retire un bâtiment sans code), **syndic** (un seul bouton « Choisir / créer le
  syndic », recherche d'abord partout, « Retirer le syndic » avec confirmation).
- **Adresses multiples d'une copropriété (17/11, lots 1-5)** : `1553eae4` preuves (détacher / remplacer un syndic garde
  toutes les adresses) · `0e988896` migration **489** (`adresse_cle` sur chaque bâtiment) + rapport à blanc ·
  `ab4230a4` migration **490** (unicité (copropriété, adresse, nom)), écritures par adresse, reprise réelle en recette
  (rien effacé ; script `batiments-par-adresse-reprise.ts`) · `4c1fd005` écrans (bâtiments sous leur adresse, menu
  limité, « Bâtiments de l'adresse … », « Retirer le bâtiment A du … ? », bloc « ADRESSE À PRÉCISER ») · `fa99fa48`
  migration **491** (refus mémorisés) : « Rattacher à la copropriété <nom> — <adresses> ? » à la saisie de l'adresse
  d'un bien, « Non, c'est une autre copropriété » mémorisé, le rattachement crée le bloc digicode vide. Rapport à blanc
  sur une copie de la prod (à lancer par Arno) :
  `DATABASE_URL='<copie>' NODE_OPTIONS=--conditions=react-server npx tsx app/scripts/batiments-par-adresse.ts --rapport=.captures/copropriete/`
- **Mandat par bien (18/11, lots 1-4)** : `4c3fae5b` migration **492** (n°, forme normalisée, date ×2 sur
  `gestion_annuaire_lot`) + règle pure `mandatParBien.ts` / `mandatParBienRepo.ts` (verrou par n°) · `c4f23d55`
  écritures (« Nouveau bien », geste de statut, « Modifier le bien ») + fenêtre Confirmer / Corriger + n° modifiable
  sur le bien + signalement · `4436dd2f` lecteurs (résumé du bien, fiche propriétaire en LECTURE SEULE « N° de mandat de
  ses biens », liste, mails ADHOC & MONGA et portefeuille, suivi des annexes) + **script de reprise À BLANC**
  `app/scripts/mandats-par-bien-reprise.ts` (`--reel` jamais lancé ; servira sur une copie de la prod) · `c22b71f7`
  page « Créer un nouveau propriétaire » (question « Propriétaire(s) en gestion ? » retirée, « Souhaitez-vous créer un
  bien immédiatement ? », formulaire « Nouveau bien » complet dessous, `creer-proprietaires-et-bien` tout ou rien) ·
  `e751d50f` retrait de l'ancienne page `/admin/location/nouveau` (404). Rapport à blanc : la base du Mac et la recette
  n'avaient AUCUN n° de mandat (rien à reprendre ici). Commande sur une copie de la prod (lecture seule) :
  `PGOPTIONS='-c default_transaction_read_only=on' psql "<copie>" -X -f .captures/mandats/rapport-a-blanc-mandats.sql`
- **Quatre corrections (18/11)** : `51a89809` « Digicode » (au lieu de « facultatif » / « code » / « nouveau code »)
  dans les quatre champs du composant unique, intitulé « Nouveau digicode » dans « Modifier » · `b23e33dc`
  « Bâtiment et digicodes enregistrés. » seulement si un bâtiment ou un digicode a RÉELLEMENT été écrit (compteur dans
  `ecrireDigicodesDuBien`), sinon aucun message · `779a0f63` « Non (Sauvegarde du propriétaire) » : la légende dans le
  bouton, le clic enregistre (mêmes contrôles ; manque → rouge, pas de modale ; refus du serveur → modale rouge comme
  avant), modale « Propriétaire enregistré » + « Le nouveau propriétaire Prénom NOM est bien enregistré. » + « Ouvrir la
  fiche du propriétaire » (les gestes d'avant gardés en second), aucun doublon (double clic, second « Non », « Oui »
  après « Non ») · `1f3a7e7b` rangée « Bâtiment / cage d'escalier — Étage — N° de porte » alignée en haut, ses légendes
  dans une ligne pleine largeur sous la rangée (au téléphone, juste sous le champ Bâtiment) ; les autres rangées
  vérifiées, aucune à corriger.

### 5.7 Pièges payés (à ne pas repayer)
1. **`withTransaction` COMMITE au retour normal** : LIRE (`FOR UPDATE`) → refuser → écrire ; un refus après une écriture
   doit être LEVÉ.
2. **Un repli DANS une transaction ne s'exécute jamais** : sondes de schéma hors transaction.
3. **`pg` rend les `bigint` en chaîne** : `::int` ou `Number()`.
4. **Un backtick dans un commentaire SQL ou CSS en gabarit** casse le littéral (500).
5. **Classe Tailwind collée à `${}`** n'est plus générée : une espace avant.
6. **Tester le SQL sur une base jetable** ou en transaction annulée ; les tests unitaires simulent `query`.
7. **Migration avant le code** quand le serveur de dev tourne et qu'Arno est dans l'app.
8. **Supprimer / renommer une route Next** casse `tsc` par le cache `.next/types` → `npx next typegen` (sans rien supprimer).
9. **Un test d'écran qui re-rend le même composant garde son état** : démonter avant de changer les props.
10. **Playwright** : les pages Gestion ne sont jamais « networkidle » (attendre `load` + l'élément) ; un bouton dans la
    barre collante du bas se déclenche par `dispatchEvent('click')` au téléphone ; filtrer la sortie d'un script peut
    cacher qu'une écriture a bien eu lieu (relire la base).
11. **Une fenêtre (ModaleIssue) qui se ferme rend le focus** à ce qui l'avait ouverte : reposer le focus après un délai.
12. **`.loc-ample .loc-grille{align-items:end}`** : une légende sous un champ décale ses voisins ; une rangée concernée
    s'aligne en haut et reçoit ses légendes dans une ligne pleine largeur.

---

## 6. État courant & prochaine action

**Dépôt (mesuré le 20/11/2026 au soir) :**
- Branche **`main`**, **HEAD = le commit de cette passation** (précédent : `f4e736fc`). `origin/main` = `5f40f193`
  (19/11, 16h03). **39 commits d'avance sur `origin/main`**, cette passation comprise (38 de code et de doc avant elle :
  1 du 19/11, `3ed33415`, et 37 du 20/11) : **rien n'est poussé, c'est Arno qui pousse**.
- **Working tree** propre hormis les non suivis, laissés tels quels : `RAPPORT_NUIT_GESTION.md`, `rapatriement-gestion.log`,
  `public/images/sceau-certifie copie.svg`, `scripts/diagTel.ts`, `test-results/`. Ne pas les committer ni les supprimer sans Arno.
- **Contrôles** (dernier lot, `f4e736fc`) : `npm test` VERT (1 858 fichiers, 27 663 tests, 21 ignorés) ; preuve curl
  d'Arno : 0 « Module not found / Build Error », statut 200.
- **Migrations** : dernière écrite = **`510_gestion_adresse_ban_transaction_syndic.sql`**. ⚠️ **Constat du 20/11 au soir
  (lecture seule)** : en recette, la **509** est appliquée (table `gestion_personne_adresse_ban`), mais **PAS la 510** :
  la contrainte `gestion_personne_adresse_ban_sujet_check` n'admet encore que `proprietaire, locataire, carte, apporteur`
  (la 510 ajoute `transaction_vente, transaction_personne, syndic`) ; le registre `svav_migration` de la recette n'est
  pas tenu au-delà de la 382 (migrations posées hors registre). **À appliquer en recette avant de dire « jusqu'à 510 »**
  (consigne d'Arno de ce soir : « appliquées jusqu'à 510 »). La **361** en attente (`db/migrations-en-attente/`) prendra
  le **premier numéro libre (511)**.
- **Serveurs lancés en arrière-plan sur le Mac** : la recette (`npm run recette` avec `RECETTE_ENVOI_REEL_VERS`) et un
  tunnel `cloudflared` (logs dans `.captures/recette-interception/`).

**Commits du 18 au 20/11 — état :**
- **Déjà POUSSÉS** (dans `origin/main`) : mandats par bien et « Créer un nouveau propriétaire » (`4c3fae5b` → `e751d50f`),
  « Non (Sauvegarde du propriétaire) » (`779a0f63`), placeholders « Digicode » (`51a89809`), alignement des légendes
  de la rangée Bâtiment (`1f3a7e7b`), frise (`c16dbb2a`).
- **EN RECETTE, NON POUSSÉS** (20/11 sauf mention) :
  - copropriétés en double, « Regrouper » (`3ed33415`, 19/11) ; correctif 504 (`92efafce`) ; journal des syndics (`79d81dfb`) ;
  - **adresses officielles BAN, lots 2 → 7d** (`88c2d787`, `ab621949`, `ce3cd64c`, `0db7b801`, `b9238882`, `f716ed04`,
    `102ce075`, `285844bd`, `d88ee231`, `5c979735`, `2c514e40`, `6cac5ad6`, `59f657d1`, `1bde59bc`, `6d5275c4`,
    `655d6a61`, `fa49b8a3` = lot 7d) ; test figé à l'heure (`0f888fdd`) ; registre des flakes (`ff4ac405`) ;
  - **statut du locataire et préavis** : `8ecd8369` (annulé par `60570ec7`, seul le déplacement neutre d'`annulerSortie`
    reste), `60570ec7` (retour à la règle d'avant), `f93bf189` (préavis validé sans sortie validée = « en préavis ») ;
  - **protection de l'import** : `609b7aa2` (une sortie annulée dans l'application n'est plus remise par l'import) ;
  - passation des corrections de prod (`376d7629`) ;
  - **page « Supprimer un/des locataire(s) »** qui retrouve aussi les sorties enregistrées (`c9fcdf2a`), repliées sur une
    ligne « Sorties enregistrées (N) » (`440c776c`) ; **retrait du bloc « Sortie du logement »** de la fiche locataire
    (`7d80e266`, accord d'Arno, option B) ;
  - **blocs 3 « Conditions d'entrée » et 4 « Suivi commercial » sur la fiche locataire** (`8327f3e6`), sous l'en-tête
    du locataire, au-dessus de « LE BAIL » (`c3a1969f`) ;
  - **contacts du syndic depuis la copropriété** : rattacher / détacher (`be389191`), créer (`5738be43`), changement ou
    retrait de syndic = contacts détachés et journalisés, jamais supprimés (`3583668e`) ;
  - **fenêtre syndic partagée** : la modale Copropriété rattache ou crée le syndic par LA fenêtre de la carte du bien (`36686a7f`) ;
  - **« Retirer le syndic »** dans la modale Copropriété, retrait seul ou suivi du choix / de la création d'un autre
    syndic, préparé jusqu'à « Valider » (`ed6c79f3`) ;
  - **en-tête de la Gestion retiré de l'écran Copropriétés seul** (`f4e736fc`).
- **Données d'essai en recette** (20/11) : syndics 49 « _TEST SYNDIC CONTACTS » (contacts 81-86), 50 « … BIS », 51
  « _TEST SYNDIC CREE DEPUIS COPRO », 52 « _TEST SYNDIC APRES RETRAIT » ; copropriété 297 « 12 rue _TEST Syndic Contacts »
  (rattachée au 49, sans contact) ; « _TEST PREAVIS VALIDE SORTIE NON VALIDEE » (locataire 539, bien 460, occupation 566,
  préavis 16). Antérieures : « _TEST DEUX ADRESSES », « _TEST MANDAT » 323-325, 327, « _TEST NON SAUVEGARDE PROPRIETAIRE » 328,
  biens 453-456.
- **Captures livrées** (20/11) : `.captures/syndic-copro/`, `.captures/gestion-coproprietes/`, `.captures/regle-preavis/`,
  `.captures/locataire-ineo/`, `.captures/locataire-fathi/` (et les dossiers des lots adresse).

### 🔴 Corrections de PRODUCTION du 20/11/2026 (accord écrit d'Arno, script validé, données seulement, aucune règle changée)
Deux sorties recopiées de WIPPIMMO (import du 20/10/2026) annulées en production, locataires toujours dans les lieux.
Méthode : SQL en UNE transaction par `ssh svav-prod` + psql (essai en lecture seule d'abord, puis gardes, écriture,
vérification, COMMIT seulement si tout est conforme), lancé par Arno ; jamais le code de la recette contre la prod.
- **INEO RAIL chez GBS Services** (fiche 250, occupation 262, bail 211, bien 133, 18 rue Pierre Curie, Puteaux) :
  sortie du 02/11/2026 → vide, bail en cours ; journal **n° 52958** « location_sortie_annulee ». Fichiers :
  `.captures/locataire-ineo/`.
- **EMMAIMA Fathi** (fiche 191, occupation 202, bail 490, bien 321, 4 Square Léon Blum, Puteaux) : remise occupante
  « de force », sortie du 30/11/2026 → vide, bail en cours ; journal **n° 52959**. Fichiers : `.captures/locataire-fathi/`.
- 🔴 **NE PAS lancer `npm run gestion:annuaire:importer` sur la production avant la mise en production de `609b7aa2` et
  `f93bf189`** : l'import actuel réécrit la sortie d'un bail importé et défairait les deux corrections.
- 🔴 **Arno doit retirer ces deux dates de sortie dans WIPPIMMO** (INEO RAIL 02/11/2026, EMMAIMA Fathi 30/11/2026).
- Les 6 locataires réellement partis (ROUSSEL, FAUGERE, POYET, JONQUEUR, POUPOT, PLACE et MUNEKATA) : laissés « anciens ».

**Points ouverts / à valider par Arno :**
- « Supprimer un/des locataire(s) » : le compteur « Sorties enregistrées (N) » n'apparaît qu'après une recherche.
- La ligne « Conditions d'entrée et suivi commercial » est absente de la fiche locataire de la **Gestion** (seule la
  fiche de la Location la porte).
- Contact du syndic : un doublon au **nom identique** est refusé ; un simple avertissement serait à envisager.
- Téléphones de syndic affichés **sans espaces**.
- Écran Copropriétés : deux **alertes de panne** laissées (rattachement en échec, copie Drive ARRÊTÉE) ; à retirer aussi
  sur demande d'Arno (une ligne chacune).
- Fiche locataire : le bouton **« Dossier Drive du bail » affiché deux fois**.
- Modale « Propriétaire enregistré » : gestes d'avant gardés en second ; bouton « Enregistrer le propriétaire (sans
  bien) » resté (même enregistrement que « Non ») — à confirmer.
- Anciens points non revérifiés : attribution OSM/Esri à l'écran, gros chantier « permis → mise à jour continue des maps ».

### ⏭️ PROCHAINE ACTION IMMÉDIATE
Aucun lot en cours. Attendre le retour d'Arno en recette. 🔴 **Mise en production UNIQUEMENT quand Arno dit « on met en
production »**, et seulement après les **rapports d'essai sur une copie de la production** (bâtiments par adresse,
mandats par bien) ; la reprise des mandats (`--reel`) n'est lancée qu'après sa validation. Rien à pousser ni à
appliquer côté agent : Arno pousse et met la prod à jour lui-même.

---

## 7. Format des livrables (à respecter systématiquement)

Pour **chaque** instruction technique, un **bloc copiable** précédé d'un titre sans équivoque, avec sa pastille :

- 🔵 **PROMPT** — prompt de travail en relais manuel pour l'agent Claude Code dans VS Code (« vibe coding ») : l'agent
  produit le lot, vérifie, puis — **pratique actuelle** — committe lui-même les seuls fichiers du lot, SANS
  `Co-Authored-By`, SANS push ; Arno relit et **pousse à la main**. **TOUJOURS préciser DANS QUEL TERMINAL** l'envoyer.
- 🔴 **PROMPT AUTO** — prompt qui **déclenche l'automatisation** (`/svav-build` ou tout run autonome multi-subagents).
  Vigilance accrue, contrôle a posteriori via le rapport final (Phase 7) ; commit toujours manuel / jamais poussé par
  l'agent.
- 🟢 **COMMIT** — message de commit à coller dans la boîte de commit de VS Code (Source Control), **seulement** quand
  Arno committe lui-même (si un prompt dit à l'agent de ne pas committer).
- ⚪ Les **commandes Terminal pour Arno** (preuve curl, migration à appliquer, mise à jour de la prod) vont dans leur
  propre bloc titré.

Règles : tout prompt lançant un run autonome porte 🔴 PROMPT AUTO, jamais 🔵. **Ne JAMAIS mélanger un prompt et un
commit dans le même bloc.** Un prompt par bloc. Dans chaque prompt, reprendre les **règles permanentes** d'Arno (git
interdit, aucune action sur la production, envois réels vers a.jorel@ seulement, aucun brouillon réel, « Documents
clients scannés » jamais touché, aucun secret affiché, captures dans le seul dossier nommé, un commit par lot / point).
