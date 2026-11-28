> Passation générée le 18/11/2026 à 11h13 — § 6 mis à jour le 28/11/2026 (titre, cases de rendez-vous, mentions sans doublon ; la 361 prendra la 523)

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
  chaque nouvelle migration : **elle prendra la 523** — décision d'Arno du 28/11/2026 : elle ne part pas avec la 522 ; 519 et 521 non utilisés).
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

**Dépôt (mesuré le 25/11/2026, après `b50ea980`) :**
- ✅ **ÉTAT AU 26/11/2026, ~09h20 (fait foi sur le paragraphe historique qui suit)** : `origin/main` = **`1d4d8e87`** (tout est poussé, y compris les
  « 93 commits non poussés » listés ci-dessous) ; **PRODUCTION = `1d4d8e87`**, migrations jusqu'à **518** ; HEAD = le commit de cette passation
  (non poussé). Détail : « MISE EN PRODUCTION DU 26/11/2026 — RÉUSSIE » plus bas.
- Branche **`main`**, **HEAD = le commit de cette passation** (précédent : `c7ed7867`). `origin/main` = **`38f9fc60`** (poussé par Arno le 25/11/2026 :
  tous les commits jusqu'à la passation `38f9fc60` comprise ; avant, `b1d4d866` le 24/11 à 00:10). **93 commits d'avance, NON POUSSÉS** :
  les quatre demandes d'Arno du 25/11 (`91f06df3`, `6939633b`, `f8069b29`, `13cf958f`), la passation `e806eac9`, les quatre suivantes du 25/11
  (`53d7852b`, `6a9e14ca`, `85d244b2`, `4b7b8bba`), la passation `399463dd`, la pastille unique `bf206a3f`, la passation `74a6601a`, les titres « AGO » `4a92d1be`, la passation `15a99d35`, l'alerte du lundi seulement avec une urgence `0d1a809a`, la passation `45a8e982`, la correction du test instable `59000b2a`, la passation `c88b0caf`,
  puis « Alerte restitution en retard » : `a3376e28` (catégorie), `a0877bca` (mail tous les 2 jours), `f54002df` (couleur des boutons), la passation `2fc22378`,
  le titre « AGO passée — restitution à faire » `8f9e7243`, la passation `d47f3592`, le filtre par capsule AGO `5969e3dd`, la passation `98efb28c`,
  la confirmation avant restitution `fb8b6885`, la passation `971e2a2c`,
  puis `d5507919` (pastilles vertes), `0cc3ef99` (pastille verte des boutons), `88764960` (en-tête de la Gestion retiré sur « 20 % à restituer »),
  la passation `af2d7f76`, puis « Envoyer un mail » : `a1ca94a7` (rubrique « Arrêté des comptes » retirée), `8dfb127d` (bouton + module existant
  + un mail par locataire), `08268902` (quatre modèles), `f1e5f678` (historique), `cfdf2faf` (correctif : liste verte, commentaire), la passation `36e581bd`,
  les modèles revus `a20a86f6`, la passation `40facb47`, les modèles revus (adresse une fois) `4d255049`, la passation `abc1c736`,
  l'introduction syndic réécrite `98cef2c6`, la passation `c186d986`, le classement « À préparer » corrigé `4be4b89e`, « x mails envoyés depuis cette
  page » `905e0e0a` (MIGRATION 515), la passation `46e6c6e8`, les boutons du pied de la fiche Copropriété `a649427f`, « J-N » en rouge `daad8340`,
  « Classer ce mail » verrouillé sur le bien de la sortie `5c3a9d50`, la passation `3c038828`, la restitution au journal du bien `e3de40e7`, les
  locataires proposés limités aux sortis `5ab06e63`, la conversation de la ligne `c0312cc7`, « Répondre » et module fermé `5a8c43c1`, « N mails
  échangés » sous la capsule AGO `9f31e125`, la passation `fbcbd36f`, la nouvelle règle Urgence / Alerte `2c97de46`, les échanges dans
  « Restitutions faites » `46526614`, « Aucun échange pour l'instant » `c44bc880`, les passations `e6c0c7b7` et `1bde3793`, les échanges dans
  « Dates / copropriétés manquantes » `e7817637`, la passation `108e8f84`, l'ordre du plus récent au plus ancien `3251b835`, l'œil des pièces
  jointes `129d9e81`, les mails fermés par défaut `c1cf0891`, les passations `67f9e8b2` et `4e04681d`, le montant des 20 % `887aec04` (MIGRATION 516), la ligne
  de détail encadrée `898e8043`, l'onglet « Restitution des 20 % » `7fdc82f4` (MIGRATION 517), les modèles de mail de restitution `0fcd88d3`, la fenêtre
  « Faire restitution » retravaillée `b50ea980` (MIGRATION 518), la passation `4dde948b`, puis la demande de 22h51 : champ du montant pleine largeur `22ffbff6`, mails de
  restitution dans les échanges `c4fb2def`, « Restitutions faites » sans doublon `335c8e47`, « Restitutions faites » en blocs de trois lignes `adcdc858`, la passation `4086744f`, puis les demandes de 23h12-23h15 : PANNE du montant des 20 % `a3c73098`,
  arrêté des comptes en toutes lettres `3ba3ad33`, date de sortie à valider `2a702d3b`, la passation `1073673f`, puis « Note interne » et « Date de validation de la restitution » `ba382337` (23h42), la passation
  `37999738`, puis 23h52 : panne de la recherche `aee3c35b`, garde « virement » + notes d'essai retirées `d5de05b4`, la passation `b0db0756`, « Enregistrée par » en Prénom NOM
  `d1d501cd` (26/11), la passation `da4ef7d6`, les restitutions dans l'historique de la fiche du locataire `c7ed7867`, et cette passation (détail plus bas). Déjà poussés le 25/11 : `4f3c1e3f` (fenêtre « Valider la sortie », bloc 20 % : le bien sans copropriété aligné sur le cas rattaché, doublons retirés
  avec l'accord d'Arno), `47925902` (passation), `761222a0` (récapitulatif : « Date d'arrêté des comptes » ajoutée, « Texte ajouté au mail
  du (des) propriétaire(s) » retirée — détail plus bas), `c4791cc8` (passation), `4bde8fc2` (champ de recherche d'adresse : un vrai champ,
  pleine largeur — détail plus bas), `c89c786e` (passation), `6f79c98a` (« Valider la sortie » : partenaires sélectionnables un par un, un
  mail chacun), `cf7ecb2f` (mail aux partenaires : retenue de 20 % et date de restitution — détail plus bas), `56d6b7a7` (passation), `4d09d602` (ce
  paragraphe remplacé par le bloc « Retenue de 20 % … : OUI / NON » — détail plus bas), `e79abe93` (passation), `75f3488f` (fiche Copropriété :
  « Adresses » avant « Identité »), `59759271` (passation), puis le lot « 20 % à restituer » : `18f248d5` (cinq catégories), `5b046e8e`
  (« Restitution faite », migration 513), `81f08a64` (alerte du lundi, migration 514), `b9c726d8` (pastille « Urgence »), `cd52f0c2` (passation), puis les décisions de 23h20 : `3cfdef15`
  (date provisoire classée), `418e54e6` (513/514 au registre de la recette), `ed1b0b45` (fiche vide : données d'essai), `d5cb90f4` (lignes
  sur deux lignes), `03a81b9d` (passation), puis 23h40 : `b68d51de` (trois lignes, étiquette d'AG, compte à rebours), `07dd2bf4`
  (« Dates manquantes » en blocs de trois lignes), `09a51b86` (390 px), `16aa0153` (passation), puis 23h53 : `8c3776c0` (« Faire restitution »),
  `75067861` (sans doublon), `03a514f5` (coordonnées), `5ac1e617` (recherche), `d9ac7940` (passation), `8031f942` (coordonnées : un seul locataire sans
  son nom), `1775615f` et `38f9fc60` (passation), puis les quatre demandes d'Arno du 25/11 : `91f06df3` (tout replié à l'ouverture), `6939633b`
  (« Alerte du lundi » en 2e position), `f8069b29` (une trame par catégorie), `13cf958f` (capsules AGO, compteur en locataires) — détail plus bas — et cette passation. Rien n'est poussé par l'agent : c'est Arno qui pousse. Rien n'est parti en
  production avec ce push (production mise à jour le 26/11/2026 : `1d4d8e87`, voir plus bas).
- **Working tree** propre hormis les non suivis, laissés tels quels : `RAPPORT_NUIT_GESTION.md`, `rapatriement-gestion.log`,
  `public/images/sceau-certifie copie.svg`, `scripts/diagTel.ts`, `test-results/`. Ne pas les committer ni les supprimer sans Arno.
- **Contrôles** (26/11, `c7ed7867`) : `npm test` VERT (1 877 fichiers, 28 165 tests, 21 ignorés ; `.captures/historique-locataire/npm-test-complet-26-11.txt`) ; `tsc` = 0 ;
  Chrome (banc du vrai bloc d'historique, données réelles de LACROIX). ✅ **Preuve curl FAITE par Arno le 26/11/2026 sur HEAD `0eeb5583` (code `c7ed7867`)** : `/admin/login` statut **200**, **0** « Build Error » / « Module not found » — vaut pour tous les commits non poussés. Avant (`d1d501cd`) : `npm test` VERT (1 876 fichiers, 28 160 tests, 21 ignorés ; `.captures/enregistree-par/npm-test-complet-26-11.txt`) ; `tsc` = 0 ;
  Chrome (ordinateur et 390 px, clair et sombre). ⚠️ **Preuve curl À FAIRE par Arno sur `d1d501cd`**. Lot de 23h52 (`d5de05b4`) : `npm test` VERT (1 876 fichiers, 28 157 tests, 21 ignorés ; `.captures/recherche-vingt/npm-test-complet-26-11.txt`) ;
  `tsc` = 0 ; Chrome (rechargement complet, ordinateur et 390 px, clair et sombre). ⚠️ **Preuve curl À FAIRE par Arno sur `d5de05b4`**. Lot de 23h42 (`ba382337`) : `npm test` VERT (1 875 fichiers, 28 148 tests, 21 ignorés ; `.captures/restitution-note/npm-test-complet-25-11.txt`) ;
  `tsc` = 0 ; Chrome (fenêtre « Faire restitution » de DUMONT Claire, puis « Annuler » ; ordinateur et 390 px, clair et sombre ; écritures bloquées). ⚠️ **Preuve curl
  À FAIRE par Arno sur `ba382337`**. Lot de 23h12-23h15 (`2a702d3b`) : `npm test` VERT du premier coup (1 875 fichiers, 28 145 tests, 21 ignorés, 95 s ;
  `.captures/sortie-montant/npm-test-complet-25-11.txt`) ; `tsc --noEmit` = 0 ; Chrome recette (préavis de test « Locataire fictif TESTTEST »), ordinateur et 390 px,
  clair et sombre, écritures BLOQUÉES (aucune requête bloquée ; seul l'aperçu, en lecture) ; base relue : 40 sorties, dernier envoi 83, aucun montant 516 écrit.
  ⚠️ **Preuve curl À FAIRE par Arno sur `2a702d3b`**. Lot de 22h51 (`adcdc858`) : `npm test` VERT du premier coup (1 875 fichiers, 28 106 tests, 21 ignorés, 95 s ;
  `.captures/vingt-pourcent/npm-test-complet-25-11-Y.txt`) ; `tsc --noEmit` = 0. Chrome recette, ordinateur et 390 px, clair et sombre, écritures BLOQUÉES par la vérification
  (aucune requête bloquée : rien n'a tenté d'écrire) ; base relue ensuite : restitutions, mails du module et envois inchangés. ⚠️ **Preuve curl À FAIRE par Arno sur
  `adcdc858`** (couvre tous les commits non poussés). Lot d'avant (`b50ea980`) : `npm test` VERT du premier coup (1 875 fichiers, 28 088 tests, 21 ignorés, 95 s ;
  `.captures/vingt-pourcent/npm-test-complet-25-11-X.txt`) ; Chrome recette, aperçu seulement. Lot d'avant (`cfdf2faf`) : 28 009 tests
  (`npm-test-complet-25-11-L2.txt`) — la passe précédente (`npm-test-complet-25-11-L.txt`) avait rougi sur deux GARDES de
  la Location (`<select>` natif, mot « HistoriqueDuBien » dans un commentaire), corrigées par `cfdf2faf` ; le flake connu `PreavisAccueil.test.tsx`
  (3 061 ms) est revenu une fois en suite filtrée, fichier seul vert deux fois. Chrome recette, ordinateur et 390 px, clair et sombre, APERÇU SEULEMENT :
  aucun mail envoyé, aucun POST d'écriture (seul l'appel de LECTURE `POST /api/admin/gestion/classement` du module, bloqué par le garde de
  vérification). ⚠️ **Preuve curl À FAIRE par Arno sur `b50ea980`** (couvre tous les commits non poussés). Lot `fb8b6885` : confirmation ouverte puis « Revenir » SEULEMENT ; aucun POST ;
  table des restitutions de la recette inchangée (2 lignes du 24/11). Commit `59000b2a` : `npm test` complet VERT DEUX FOIS DE SUITE (27 937 tests ;
  `npm-test-complet-25-11-F-passe1.txt` et `-passe2.txt`). Lot d'avant (`0d1a809a`) : `npm test` VERT à la 2e passe
  (`npm-test-complet-25-11-E-relance.txt`). La 1re a échoué sur `dateSortieUnique.test.ts` (« aucune écriture hors
  de la seule porte ») : `ENOENT … app/lib/svv/__garde_eslint_tmp__.ts` — fichier temporaire que `app/lib/analytics/gardeImports.test.ts`
  crée puis efface pendant que la garde liste et lit tous les fichiers : COURSE ENTRE DEUX FICHIERS DE TEST (sortie
  `npm-test-complet-25-11-E.txt`), fichier seul vert, aucun code de ce lot en cause. ✅ CORRIGÉE par `59000b2a` (décision d'Arno du 25/11) et
  inscrite dans `docs/FLAKES_CONNUS.md`. Chrome recette, ordinateur et 390 px, clair et
  sombre. ⚠️ **Preuve curl À FAIRE par Arno sur `0d1a809a`** (couvre aussi `4a92d1be`, `bf206a3f`, `4b7b8bba`, `13cf958f` et les précédents non prouvés). Lot d'avant (`13cf958f`) : `npm test` VERT à la 2e passe — la 1re a
  rencontré le flake connu `PreavisAccueil.test.tsx` « photo … REVIENT dans le formulaire et repart » (`docs/FLAKES_CONNUS.md`, 2e occurrence,
  3 080 ms ; fichier seul 3 fois vert ; sorties `.captures/vingt-pourcent/npm-test-complet-25-11-*.txt`) ; pages vérifiées dans Chrome sur la
  recette. ⚠️ **Preuve curl À REFAIRE par Arno** sur `13cf958f` (composant client touché ; l'agent n'a pas pu lancer `curl`). Précédente : Preuve curl faite par l'utilisateur le 25/11/2026 sur HEAD `8031f942` (+ passation `1775615f`) : `/admin/login` statut
  **200** et **0** « Build Error » / « Module not found » — elle vaut pour tous les commits non poussés qui touchent des composants client, de
  `4f3c1e3f` à `8031f942` (`761222a0`, `4bde8fc2`, `6f79c98a`, `75f3488f`, `18f248d5`, `5b046e8e`, `81f08a64`, `b9c726d8`, `3cfdef15`,
  `d5cb90f4`, `b68d51de`, `07dd2bf4`, `09a51b86`, `8c3776c0`, `75067861`, `03a514f5`, `5ac1e617`, `8031f942`).
- ⚠️ **Serveur de recette REDÉMARRÉ le 23/11 vers 13h50** (même commande : `npm run recette` avec `RECETTE_URL_PUBLIQUE` et
  `RECETTE_ENVOI_REEL_VERS=a.jorel@…`, base `svav_recette` ; journal `.captures/recette-interception/serveur-2026-11-23.log`) : après une
  erreur passagère de l'agent (import en double), le rechargement à chaud avait gardé un graphe de modules périmé et TOUTE la route
  `/api/admin/location` répondait 500 (« module factory is not available »). Le tunnel `cloudflared` n'a pas été touché.

### ✅ MISE EN PRODUCTION DU 20/11/2026 — RÉUSSIE (lancée par Arno, scripts `.captures/maj/1-…6-*.sh`)
- **A. Sauvegarde complète avant tout** : `/home/ubuntu/sauvegardes/2026-11-20_2231` (témoin TERMINEE, base lisible
  3 928 objets, `minio.tar` 2,9 Go, `reglages.tgz` 169 Mo ; 544 Go libres) — journal `.captures/maj/1-sauvegarde-2026-11-20-2230.txt`.
- **B. Push** de `351f04de` (44 commits) ; **C. essai** réussi (`essai-2026-11-20.txt`) ; **D. `--appliquer`** :
  **MISE À JOUR RÉUSSIE — `351f04de` en service** (22:46, 277 s ; `appliquer-2026-11-20.txt`). Sauvegarde de l'outil sans
  LiDAR : `/home/ubuntu/sauvegardes-maj/20261120-224144_351f04de/`. **Migrations 504 → 510 appliquées et inscrites**
  (34-52 ms chacune) ; golden 11/11 ; services redémarrés ; vérifications et minuteries OK.
- ⚠️ Le script **E (`5-verifier.sh`) n'a laissé aucune trace** dans `.captures/maj/` : à lancer par Arno pour relire le registre
  de production (attendu : 509 lignes dont 4 écartées, 510 inscrite par `351f04de`).
- Conséquence : la mise en garde « ne pas lancer l'import WIPPIMMO avant la mise en production de `609b7aa2` et `f93bf189` »
  (plus bas) est levée — ces deux commits sont en production.
- **Migrations** : dernière = **`510_gestion_adresse_ban_transaction_syndic.sql`** — **appliquées en RECETTE jusqu'à 510**
  (510 appliquée le 20/11/2026 au soir : `psql svav_recette -v ON_ERROR_STOP=1 -1 -f …`, garde de base comprise ;
  la contrainte `gestion_personne_adresse_ban_sujet_check` admet désormais `transaction_vente`, `transaction_personne`,
  `syndic`). Vérifiée à l'écran : adresse officielle enregistrée pour un syndic (« _TEST ADRESSE 510 », syndic 53),
  l'adresse du bien d'un compromis (vente 342) et un vendeur (personne 3) ; `.captures/migration-510/`.
  ⏩ **Depuis le 23/11 : la 512** (`512_gestion_copropriete_arrete_comptes.sql`, arrêté des comptes) — appliquée en RECETTE seulement
  (deux passes) et inscrite au registre de la recette (commit `1819b9f5`) ; la prochaine mise en production devra l'appliquer.
  ⏩ **Depuis le 24/11 : la 513** (`513_location_restitution_vingt_pourcent.sql`, « Restitution faite », table de gestes en ajout seul) **et la
  514** (`514_location_alerte_vingt_pourcent.sql`, journal de l'alerte du lundi, un seul « envoye » par lundi) — appliquées en RECETTE
  seulement (deux passes chacune) et, depuis le 24/11 à 23h30 (décision d'Arno), INSCRITES au registre `svav_migration` de la recette au
  format de la 512 (« mise_a_jour », sha256 du fichier, commits `5b046e8e` / `81f08a64`, duree_ms 0 ; empreintes figées dans
  `migrationsEnAttente.test.ts`, commit `418e54e6`). **La prochaine mise en production appliquera 512 à 518** (🔴 515 : `gestion_location_mail_vingt`, « x mails envoyés depuis cette page »,
  commit `905e0e0a` ; 🔴 516 : `gestion_location_montant_vingt`, montant des 20 %, `887aec04` ; 🔴 517 : sorte « restitution_vingt » des destinataires
  mails, `7fdc82f4` ; 🔴 518 : montant_vingt / motif_difference de la restitution + modèles de mail de restitution, `b50ea980` — chacune testée sur une copie
  de structure supprimée ensuite, appliquée deux fois et inscrite au registre de la RECETTE le 25/11/2026).
  🔴 **La 361 en attente (`db/migrations-en-attente/`) prendra la 519 (516 à 518 prises le 25/11/2026 au soir), le jour où Arno la sortira** (→ **521**
  depuis la décision d'Arno du 26/11/2026 : 519 non utilisé) (décision
  d'Arno du 23/11/2026, « garde le premier libre suivant » redit le 24/11) — la 511 reste vide (refusée une fois 512-514 inscrites ;
  épreuve dans `migrationsEnAttente.test.ts`, mise à jour). Non touchée.
- **Registre des migrations (`svav_migration`) — état au 20/11/2026 au soir** (rapport : `.captures/registre-migrations/RAPPORT.txt`) :
  - **Comment la mise en production choisit** : `npm run prod:mettre-a-jour` → sur le serveur, `scripts/migrations-plan.ts` +
    `planifier()` (`app/lib/ops/migrationsNouvelles.ts`) : est NOUVELLE toute migration `db/migrations/NNN_nom.sql` dont le **nom
    n'est pas au registre de la base visée** ; refus si une nouvelle est numérotée **sous la dernière inscrite**. Un fichier déjà
    inscrit n'est jamais rejoué. `db/migrations-en-attente/` n'est pas lu.
  - **PRODUCTION** — ⏩ **depuis le 20/11 au soir : registre jusqu'à 510** (mise en production ci-dessus). Avant : (lecture seule, `.captures/registre-migrations/lecture-prod.sh`) registre jusqu'à **503** (19/11, commit
    `5f40f193`) ; 502 lignes dont 4 écartées (148, 212, 216, 262) ; aucune empreinte modifiée. **À appliquer : 504 → 510** (plan
    hors ligne : 7 « enveloppées », aucun refus).
    ✅ **Garde de 509 et 510 corrigée** (`d1718d5e`, décision d'Arno du 20/11/2026) : elle accepte `sansvisavis` (production) et
    `svav_recette`, refuse toute autre base (⚠️ la base de DÉVELOPPEMENT du Mac s'appelle aussi `sansvisavis` : elle est acceptée).
    Les deux migrations ne font que du schéma (aucune donnée de recette à séparer). **Éprouvé sur une copie locale de la production**
    (serveur jetable port 5433, base `sansvisavis`, registre à 503, données LiDAR non copiées ; copie SUPPRIMÉE ensuite) par
    `scripts/migrations-plan.ts` + la boucle d'application de `prod:mettre-a-jour` : **504 → 510 passent toutes** (36-53 ms chacune),
    plan vide ensuite, tables / colonnes / contraintes **identiques à la recette**, une autre base refusée par la garde.
    Rapport : `.captures/registre-migrations/epreuve-copie-prod.txt` (scripts `copie-prod/copier-prod.sh`, `copie-prod/epreuve-copie.sh`).
    **La mise en production devra appliquer : 504, 505, 506, 507, 508, 509, 510** (puis la 361 en 511 quand elle sera décidée).
  - **RECETTE** : 128 migrations 383 → 510 vérifiées dans le schéma réel ; 114 en place, inscrites au registre (une transaction,
    garde de base, origine `mise_a_jour`, hash du commit d'ajout, durée 0 — rien réappliqué). Empreintes de 509 / 510 mises à jour
    après leur correction (schéma identique prouvé). Sur les 14 absentes de la recette (la production les a) :
    **appliquées le 20/11 au soir, une par une, effet constaté puis inscrites : 410, 429, 430, 431, 432** (la 431 a ajouté
    `bascule_annexes_gestion = 2026-10-01` à côté du `2026-10-25` déjà en recette, et `bascule_entree_locataire = 2026-10-01`, comme en prod).
    **Puis les 9 autres (accord d'Arno, 20/11 au soir) : 439, 441, 448, 450, 451, 453, 455, 458, 459 appliquées, une par une, effet
    constaté, inscrites** — par le script de recette `.captures/registre-migrations/recette-9-migrations.py` (aucun fichier de
    `db/migrations/` modifié ; SQL réellement appliqué dans `.captures/registre-migrations/appliquees/` ; journal `application-9.txt`).
    **SAUTÉ, et seulement cela** (la version actuelle contenait déjà chaque valeur, vérifié valeur par valeur ; la rejouer aurait retiré
    des valeurs plus récentes) : la recréation de `admin_utilisateur_log_action_check` (439, 441, 451), de
    `transaction_journal_entite_check` (451) et de `transaction_cout_ligne_famille_check` + son VALIDATE (453 ; l'actuelle garde la
    branche `remunerations` de la 472). Effets de données, comme en prod : administrateurs `statut = associe` et
    `commissionne = false` (+ journal), fonctions déduites (451), activité principale (453), statut TVA des apporteurs (455) — les
    chiffres de « Mon espace » en recette ont changé en conséquence. **Registre de la recette complet** (509 lignes) : plan de
    l'outil VIDE, aucun refus. « Mon espace », la Transaction et la Gestion s'ouvrent sans erreur (captures `apres-9-*.jpg`).
- **Serveurs lancés en arrière-plan sur le Mac** : la recette (`npm run recette` avec `RECETTE_ENVOI_REEL_VERS`) et un
  tunnel `cloudflared` (logs dans `.captures/recette-interception/`).

**Commits du 18 au 20/11 — état :**
- **Déjà POUSSÉS** (dans `origin/main`) : mandats par bien et « Créer un nouveau propriétaire » (`4c3fae5b` → `e751d50f`),
  « Non (Sauvegarde du propriétaire) » (`779a0f63`), placeholders « Digicode » (`51a89809`), alignement des légendes
  de la rangée Bâtiment (`1f3a7e7b`), frise (`c16dbb2a`).
- **POUSSÉS ET EN PRODUCTION depuis le 20/11 au soir** (jusqu'à `351f04de`) — ils étaient « en recette, non poussés » :
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
- **21/11/2026 — préavis (EN RECETTE, NON POUSSÉS)** :
  - `b3819054` — **« Corriger / Annuler le préavis des N locataires »** sur l'écran de sortie : colocataires d'un même logement
    au préavis reçu le même jour, un geste pour tous (actions `corriger-preavis-groupe` / `annuler-preavis-groupe`, mêmes
    contrôles, tout vérifié avant la première écriture, une ligne de journal par locataire, aucun mail). Les gestes de chaque
    carte restent.
  - `ec3aff05` — le formulaire présélectionne la **durée proposée** dès qu'elle est connue (avant : « 1 mois » figé au premier
    rendu) ; sans proposition, rien n'est présélectionné et la durée est obligatoire. + registre des flakes (photo du compte
    rendu de pré-visite).
  - `72af1d4b` — 🔴 **RÈGLE D'ARNO (21/11/2026) : préavis par défaut = 1 MOIS pour tous nos logements (zone tendue), vides comme
    meublés** (« non le mois de préavis par défaut doit être 1 mois et pas 3 mois car nos logements sont en zone tendue, donc
    1 mois »). Avant : 3 mois pour un logement vide hors de `gestion_zone_tendue` (75, 92, 93, 94 seulement) — en recette, 6
    logements occupés (95 ×4, 77, 78). « 3 mois » reste choisissable ; aucun préavis enregistré n'a été modifié.
  - Captures : `.captures/preavis-groupe/` (01-24).
- **23/11/2026 — suivi des 20 % retenus (EN RECETTE, NON POUSSÉS ; demandes d'Arno du 23/11/2026)** :
  - `1819b9f5` — **« Date d'arrêté des comptes »** par copropriété (jour + mois annuels, FACULTATIVE ; 29/02 refusé), migration 512 ;
    composant unique `ArreteComptes` dans la fiche Copropriété (bloc « AG ») et dans la fenêtre « Valider la sortie » ; journalisée
    (entité « copropriete »).
  - `b0453dc2` — **le calcul** (`app/lib/location/vingtPourcent.ts`) : exercice = premier arrêté ≥ sortie ; AGO qui compte = première AGO
    après l'arrêté ; projection = jour/mois de la dernière AGO officielle, jamais avant la validation de la sortie ; une AGO officielle
    remplace la projection de son année et recale les suivantes ; restitution ≤ AGO + 1 mois ; alerte à 30 jours et une fois dépassée ;
    arrêté manquant → première AGO après la validation, « Projection incertaine » ; aucune AGO → « Dernière AGO inconnue ».
    🔴 RÈGLES D'ARNO : les dates projetées sont CALCULÉES à l'affichage, jamais stockées par locataire ; seules les AGO officielles et la
    dernière AGO connue servent (la date projetée enregistrée par la fenêtre de sortie reste en base, NON lue) ; « date de validation » =
    jour de validation de la sortie dans l'application.
  - `34c49f0e` — **écran « 20 % à restituer »** (rubrique « Dates manquantes » en tête : copropriété, ce qui manque, locataires,
    « Compléter la fiche Copropriété » = la fenêtre de la fiche ; puis les locataires) ; pleine page `/admin/location/vingt-pourcent` ;
    lecture `?vingtPourcent=1` (routes Location et Gestion, lecture seule).
  - `cf05a27a` — **accès** : entrée « 20 % à restituer » dans la colonne de gauche de la Gestion, juste sous « Préavis »
    (`?ecran=vingt_pourcent`) ; petit bouton à droite sur la ligne de titre « Location » avec pastille rouge (copropriétés à compléter ;
    aucune à 0).
  - Captures : `.captures/vingt-pourcent/` (01-15).
- **23/11/2026 (suite) — « Valider la sortie » et la copropriété (EN RECETTE, NON POUSSÉS ; demandes d'Arno du 23/11/2026)** :
  - `068bb9dd` — **« Créer une copropriété »** ouvre LA fiche Copropriété (même composant que la Gestion : adresse officielle, parcelle,
    adresses prises, anti-doublon, « Rattacher à … ? », « Non » mémorisé) ; à sa fermeture la fenêtre se relit. CONSTAT : l'ancienne création
    de la sortie identifiait la copropriété par le NOM tapé (sans adresse officielle ni parcelle : doublon possible). La sortie ne crée plus
    rien par un nom ; `creerCoproprietePourLot` (qui ne servait qu'à la sortie) n'est plus appelé, GARDÉ dans `agCoproprieteRepo.ts`.
  - `d56c0315` + `03a4db8a` — bandeaux « Date d'arrêté des comptes manquante » (avec ArreteComptes, la date écrite UNE fois sur la
    copropriété) et « Dernière AGO manquante » (disparaît dès qu'elle est saisie).
  - `f6274d92` — **« Prochaine AGO » préremplie par le calcul des 20 %** (après l'arrêté, jamais avant la validation) ; 🔴 OPTION A d'Arno :
    dernière AGO de plus d'un an, ni confirmée ni corrigée → la décision du 17/11 (champ vide, alerte, sortie bloquée) ; confirmée ou
    corrigée → le calcul.
  - `8e949180` — 🔴 RÈGLE D'ARNO : une prochaine AGO **projetée** n'est jamais présentée au locataire comme planifiée — « attendue vers
    [mois année] (date approximative, estimée d'après les dates des précédentes assemblées de la copropriété) » ; **officielle** : « prévue le
    JJ/MM/AAAA ». Paragraphe du locataire (donc récapitulatif et mail) et case. La phrase des propriétaires et la copie interne : inchangées.
  - `4e8353e2` — le bouton « Créer une copropriété » sur toute la largeur de la colonne.
  - `fc736919` — l'arrêté se saisit dans la fenêtre dès qu'une copropriété est rattachée, y compris juste après sa création (bloc rendu par
    copropriété) ; sans copropriété : « Rattachez ou créez la copropriété pour saisir sa date d'arrêté des comptes. »
  - `803dc30a` — 🔴 RÈGLE D'ARNO : **plus aucune date d'AG écrite sur la sortie** — officielle : sur la copropriété ; projetée : jamais
    enregistrée ; sans copropriété : rien (les champs restent obligatoires, pour la phrase du mail). « Ne pas rattacher maintenant » gardé
    (« Sans copropriété, le suivi des 20 % restera incomplet… ») ; le bien figure dans « Dates manquantes » sous « Bien sans copropriété »
    (compté dans la pastille). Recette : AUCUNE date stockée avec une sortie. Production : script de LECTURE SEULE prêt, NON LANCÉ —
    `bash .captures/vingt-pourcent/dates-sur-sorties-prod.sh` (READ ONLY + ROLLBACK ; dit pour chaque ligne la copropriété trouvée par
    l'immeuble, de quoi décider d'un rattachement ; rien supprimé).
  - Captures : `.captures/vingt-pourcent/` (16-28).
- **23/11/2026 (soir) — retours d'Arno sur la fenêtre « Valider la sortie » (EN RECETTE, NON POUSSÉS)** :
  - `2cb281cc` — plus de cerclage rouge autour de « Date projetée / Date officielle » (le statut reste obligatoire, message gardé).
  - `8a845ae0` — prochaine AGO calculée : « Date projetée » sélectionné d'office ; « Date officielle » d'un clic (la date ne suit plus le
    calcul) ; saisie manuelle possible ; sans calcul, rien de présélectionné.
  - `f35f53a2` — 🔴 RÈGLE D'ARNO : **le locataire est prévenu de l'AGO QUI COMPTE** (exercice clos au premier arrêté ≥ sortie, puis première AGO
    après), PAS de la simple « Prochaine AGO » (désormais = la prochaine AGO de la COPROPRIÉTÉ, première après la validation — elle reprenait
    jusqu'ici l'AGO qui compte, f6274d92). Case : « Indiquer au locataire l'AGO qui permettra de restituer ses 20 % : attendue vers mars 2028
    (date approximative) — exercice clôturé le 30/06/2027. » (arrêté inconnu : « (estimation incertaine : … ) ») ; encadré « Texte ajouté au
    mail du locataire : » en direct ; aide sous « Prochaine AGO » ; récapitulatif « AGO indiquée au(x) locataire(s) » ; même phrase pour tous.
  - `c4405330` — « Paragraphe ajouté aux mails des locataires » sur toute la largeur (le bloc l'alignait à gauche : 445 → 508 px).
  - `4699df09` — DÉFAUT trouvé au Chrome et corrigé : après « Voir le récapitulatif » puis « Revenir », l'AGO indiquée (et le paragraphe du
    mail) repartait de l'arrêté lu à l'OUVERTURE ; une saisie d'arrêté fait désormais relire la copropriété.
  - Captures : `.captures/vingt-pourcent/` (29-33). Aucune sortie validée, aucun mail (récapitulatif ouvert en lecture, jamais « Confirmer »).
  - `e3249124` — **textes « 20 % » plus « ronds »** (demande d'Arno du 23/11) : paragraphe des locataires et phrase des propriétaires
    réécrits, l'article 22 cité EN ENTIER une fois (loi n° 89-462 du 6 juillet 1989 …, rédaction issue de la loi ALUR n° 2014-366 du
    24 mars 2014) ; la date devient une phrase à part après « … dans le mois qui suit l'approbation des comptes. » (« Pour votre logement,
    il s'agit de l'exercice clos le …, dont les comptes seront approuvés lors de l'assemblée générale ordinaire attendue vers … (date
    approximative, estimée d'après les précédentes assemblées de la copropriété). ») ; 🔴 le PROPRIÉTAIRE reçoit la MÊME date (l'AGO qui
    compte, calculée au serveur avec `agoQuiCompte`, désormais dans `app/lib/location/vingtPourcent.ts`). Point ouvert d'avant RÉSOLU.
  - `82037e4c` — encadré et récapitulatif en direct ; ligne « Date indiquée au(x) propriétaire(s) » au récapitulatif.
  - Captures : `.captures/vingt-pourcent/` (34-39). Arrêté d'essai de la copropriété 313 passé à 30/06 pour l'essai puis REMIS à 31/12
    (journal 46825-46828). Aucune sortie validée, aucun mail.
  - `79ff9020` — **fiche Copropriété : « AG et arrêté des comptes »** (demande d'Arno du 23/11 : « je ne vois pas où saisir la date d'arrêté
    des comptes […] ni où ajouter une ou des dates d'AG ») : le bloc existe AUSSI pour une fiche NOUVELLE (avant : « aucune encore (fiche à
    créer) ») ; arrêté et AG y sont GARDÉS puis écrits avec la copropriété au premier « Valider », dans la même transaction (« Fermer » : rien
    d'écrit) ; « + Ajouter un PV d'AG » devient « + Ajouter une AG » avec la mention verte « Date officielle uniquement : l'assemblée a eu lieu
    ou sa date est fixée par convocation. ». 🔴 INTERPRÉTATION à faire confirmer par Arno : une date À VENIR est acceptée (« fixée par
    convocation ») et rangée en « prochaine AG », OFFICIELLE ; une date passée reste un PV. Les PV de « Nouveau bien » / « Modifier le bien »
    restent passés seulement. Action « ag » de la route des AG.
  - `f06248d9` — par défaut « Dernière AGO » et « Prochaine AG » (officielle la plus proche, à défaut projetée) ; « Afficher l'historique des
    AG (N) » déplie la liste d'avant (PV avec « Corriger », autres dates), « Masquer … » la replie — fiche Copropriété SEULE (fiche du bien et
    fiche syndic inchangées). Sans aucune AG, le lien n'apparaît pas.
  - `d1b57b8f` — « Valider la sortie », « Ne pas rattacher maintenant » : bandeau « Pour saisir la date d'arrêté des comptes et les AG, créez
    ou rattachez la copropriété (bouton « Créer une copropriété » ci-dessus). ».
  - `86f8829e` — **mail « Compte rendu de l'état des lieux de sortie (locataire) »** (demande d'Arno du 23/11) : juste après « … Votre sortie
    du logement est enregistrée à cette date. », « Vous trouverez en pièce jointe de ce mail l'état des lieux de sortie réalisé ce jour-là. Nous
    vous invitons à le conserver. » (plusieurs pièces : « … en pièces jointes … les documents … les conserver. ») — SEULEMENT si une pièce est
    jointe ; sinon le récapitulatif dit « Aucun état des lieux joint : le mail ne l'annoncera pas. » (envoi non bloqué). Chaque locataire, jamais
    le propriétaire ni la copie interne. Vu au Chrome SANS pièce (préavis « TESTTEST » 1 rue du Préavis de Test, le locataire de « _TEST SORTIE
    CREATION COPRO » n'ayant pas d'e-mail) ; le cas AVEC pièce n'est éprouvé que par les tests (joindre une pièce = un dépôt, non fait).
    Captures 50-52.
  - `c146e4fe` — fiche Copropriété : « Renseigner la date d'arrêté des comptes » pleine largeur (date absente ; « Modifier » garde sa taille).
    ⚠ Constat : sur une fiche ENREGISTRÉE, « + Ajouter une AG » n'est PAS pleine largeur (145 px ; il l'est sur une fiche nouvelle) — non
    demandé, non touché ; à aligner si Arno le souhaite.
  - `cb744be3` — « Valider la sortie », bloc 20 % : la ligne « Date d'arrêté des comptes » DESCEND juste au-dessus de « Dernière AGO connue » ;
    le bandeau « Date d'arrêté des comptes manquante » est FUSIONNÉ dans la ligne (« ⚠ Date d'arrêté des comptes : non renseignée — sans elle,
    le suivi des 20 % ne peut pas être fiable. ») ; sans copropriété : « Date d'arrêté des comptes : aucune copropriété rattachée » +
    « Créer une copropriété pour la renseigner » (la même fiche). Le cas « copropriété rattachée SANS arrêté » n'existe pas en recette sur un
    préavis : éprouvé par les tests seulement. Captures 53-60.
  - ⚠ Constat en recette (23/11, 21:49) : une copropriété 315 « 1 rue du Préavis de Test (FICTIF) » a été créée (auteur a.jorel@…) sans
    requête d'écriture dans le journal du serveur de recette ni geste de l'agent (seules des lectures « parcelle ») — origine à éclaircir
    avec Arno (autre session, script ?). Non touchée.
  - `520ce23d` — « + Ajouter une AG » → « + Ajouter une date d'AG » (fiche nouvelle et enregistrée), pleine largeur partout ; formulaire « Nouvelle
    date d'AG ». (Constat de `3188bac6` sur la largeur : RÉSOLU.)
  - `77c9ce31` — bloc « Date d'arrêté des comptes » (fiche et sortie) : Jour / Mois et Annuler / Enregistrer en grille 50 / 50, même hauteur,
    empilés s'ils ne tiennent pas (à 390 px ils tiennent : 148 px chacun) ; « Renseigner » ET « Modifier » pleine largeur.
  - `fc7830e2` — « Valider la sortie » : « Texte ajouté au mail du (des) locataire(s) — modifiable » et « Texte ajouté au mail du (des)
    propriétaire(s) — modifiable » ; le texte propriétaire devient une zone modifiable (calculé et en direct tant qu'on n'y touche pas, puis
    gardé et envoyé tel quel : `phraseProprietaire` côté serveur) ; grisée « Aucun mail au propriétaire pour cette sortie » sans propriétaire
    coché ; récapitulatif : ligne « Texte ajouté au mail du (des) propriétaire(s) ». Aucun propriétaire des biens d'essai n'a d'e-mail : la
    zone ACTIVE n'est éprouvée que par les tests.
  - `1883f206` — en tête du bloc 20 % : « Créer une copropriété pour cette adresse » / « Accéder à la copropriété » (pleine largeur, LA fiche
    Copropriété du bien, relecture à la fermeture) ; « Créer une copropriété pour la renseigner » (cb744be3) remplacé. ✅ (24/11) Question
    réglée : le bouton « Créer une copropriété » de « Ce bien n'est relié à aucune copropriété » est retiré avec son bloc, accord d'Arno (`4f3c1e3f`).
  - `36b1a2ea` — copropriété rattachée au bien : « Immeuble en copropriété » coché d'office, plus de « Copropriété non renseignée sur la fiche
    du bien ». ÉCART = DONNÉE DU BIEN : biens 442-448 (1 rue du Préavis de Test (FICTIF)) au champ « Copropriété » vide, alors que la
    copropriété 315 (créée par la fiche le 23/11 à 21:49) porte la clé de leur adresse ; la fiche Copropriété ne renseigne pas ce champ.
    Rien corrigé en base. Copropriété 315 non touchée (AG du 23/04/2026 et du 04/11/2026 saisies à 22:14 par Arno).
  - Captures 61-71.
  - `976079cc` — « Date projetée » / « Date officielle » : boutons de la fenêtre (plein = choisi, contour = l'autre), grille 50 / 50, 44 px
    (aussi dans la fenêtre d'alerte « projection périmée »).
  - `c787dd4c` — le MOIS DE RESTITUTION (mois suivant l'AGO, délai d'un mois) : « … attendue vers novembre 2027 (date approximative, …) ; le solde
    vous sera donc restitué ou ajusté vers décembre 2027. » / « … prévue le 15/03/2028 ; le solde vous sera donc restitué ou ajusté au plus tard le
    15/04/2028. » (propriétaire : « lui ») ; case, encadré, récapitulatif, mails. Décembre → janvier. « 20 % à restituer » : colonne déjà en DATE
    (AGO + 1 mois) → inchangée.
  - `fda0c461` — fiche Copropriété : bandeau VERT dans le pied (toujours visible) : « Date d'AG du 04/11/2026 enregistrée. », « Date d'arrêté des
    comptes enregistrée : 31/12. », « Fiche copropriété enregistrée. » ou, rien de changé, « Aucune modification à enregistrer — les dates d'AG sont
    enregistrées dès leur ajout. » (la requête de « Valider » part COMME AVANT : elle peut compléter la fiche côté serveur). Vérifié au Chrome par
    l'arrêté de la copropriété 313 (30/06 puis remis à 31/12, journal 46829-46830) ; AUCUNE date d'AG d'essai ajoutée : la table des AG refuse
    toute suppression (trigger « ajout seul »), une date d'essai resterait à jamais — l'ajout d'AG n'est éprouvé que par les tests.
  - `90e05b93` — « Accéder à la copropriété » → « Accéder à la fiche de copropriété ».
  - Captures 72-77.
  - `74061ea5` — TEXTE DES PROPRIÉTAIRES refait (trois paragraphes, `texteProprietaire`) : la retenue (base légale, exercice clos le … / « couvrant
    sa période d'occupation »), la date (AGO qui compte + restitution le mois suivant, projetée / officielle), la demande de transmettre la date de
    l'AGO et son PV (officielle : le seul PV) ; « vos locataires » / « leur » s'ils sont plusieurs ; sans date (case non cochée) : restitution « dans
    le mois qui suit l'approbation des comptes » + demande de la date (repli du mail). Modifiable, en direct tant que non modifié. La ligne
    « Date indiquée au(x) propriétaire(s) » du récapitulatif reprend le 2e paragraphe. Texte du locataire inchangé. Aucun propriétaire des biens
    d'essai n'a d'e-mail : zone vue grisée ; récapitulatif et mail éprouvés par les tests. Captures 78-81.
  - Constat : arrêté de la copropriété 315 saisi par Arno à 22:44 (01/03, journal 46831).
  - Cas « case non cochée » du texte propriétaire (sans date) : VERSION RETENUE par Arno (23/11).
  - `e642bbe0` — date d'arrêté des comptes en gros sur une ligne, « saisie par Prénom NOM le … » dessous (petit gris) ; le prénom NOM est écrit
    désormais (comme les AG) ; une saisie d'avant (adresse e-mail) est traduite à la lecture par admin_utilisateur ; le journal garde l'identifiant.
  - `1cc1ea2d` — paragraphe pièce jointe : locataire « Vous trouverez en pièce jointe de ce mail le rapport de l'état des lieux de sortie de votre
    logement. Nous vous invitons à le conserver. » (pluriel « le rapport et les documents ») ; PROPRIÉTAIRE (nouveau) juste après sa phrase
    d'ouverture « … de votre logement situé [adresse]. » ; avertissement du récapitulatif étendu au propriétaire. Cas AVEC pièce vu par les
    tests seulement (joindre = un dépôt).
  - `14e01401` — « Confirmer et envoyer » SANS pièce jointe (mail locataire ou propriétaire) : fenêtre plein écran « Aucun état des lieux joint »
    (« Revenir ajouter l'état des lieux » → saisie, défilement aux pièces ; « Valider sans pièce jointe » → l'envoi d'avant, même corps). Vérifié au
    Chrome sur le préavis « TESTTEST » avec un VERROU dans la page (toute demande « valider-sortie-edls » bloquée, éprouvé avant le clic) :
    seul « Revenir … » cliqué, aucune demande de validation partie. Captures 82-89.
  - `8c86daff` — « Confirmer cette date comme référence » RETIRÉ (accord d'Arno) : il servait, quand la dernière AGO avait plus d'un an (règle du
    17/11), à confirmer cette date pour que la prochaine AGO suive le calcul (sinon champ vide, sortie bloquée). Désormais une date SAISIE ou
    corrigée dans « Dernière AGO connue » vaut confirmation (prochaine AGO calculée, jamais passée) ; la fenêtre d'alerte du 17/11 s'ouvre toujours
    (son bouton dit « Fermer ») et un rappel reste affiché tant que la dernière AGO a plus d'un an. Une dernière AGO ancienne PRÉREMPLIE reste
    bloquée jusqu'à une saisie (de la dernière ou de la prochaine AGO). Petit écart : la fenêtre d'alerte garde son titre « Prochaine AGO à saisir »
    alors que le champ peut être déjà rempli.
  - `04e448fa` — pièces jointes de « Valider la sortie » : plus de « Modification enregistrée » (en-tête « propre ») ; ligne verte « ✓ Pièce jointe
    ajoutée : … » / « retirée : … » dans la fenêtre, saisie conservée. CAUSE de la sortie du parcours (reproduite) : Échap fermait la modale ET la
    fenêtre de sortie (deux écouteurs Échap) ; ModaleIssue garde désormais Échap pour elle seule (partout). « Voir la fiche » de la modale générale
    recharge toujours la page (inchangé). Recette : 4 pièces fictives « _TEST etat des lieux.pdf » (gestion_location_sortie_piece 139-142, occupation
    554, + leurs fichiers au stockage de recette) restent, rattachées à aucune sortie — DÉCISION d'Arno (23/11) : on n'y touche pas. Captures 90-98.
  - `46958f1b` — mails de sortie : le paragraphe « pièce jointe » passe SOUS le compte rendu (ouverture → compte rendu → pièce jointe → 20 % → fin ;
    sans compte rendu, juste sous l'ouverture) ; même ordre chez le propriétaire. Vu par les tests seulement (aucune nouvelle pièce ajoutée).
  - `8f58b039` — récapitulatif : « AGO indiquée au(x) locataire(s) » (avec « Texte ajouté au mail ») et « Date indiquée au(x) propriétaire(s) »
    RETIRÉS (accord d'Arno), remplacés par « Restitution des 20 % annoncée » : « vers mai 2027 (AGO attendue vers avril 2027, date approximative) » /
    « au plus tard le 15/04/2028 (AGO prévue le 15/03/2028) » / « sans date ». 🔴 QUESTION OUVERTE : la ligne « Texte ajouté au mail du (des)
    propriétaire(s) » (texte complet, seulement si un mail au propriétaire part), non citée, est GARDÉE — la retirer aussi ? Captures 99-103.
  - Constat (recette) : pièces 136-138 et 143 (occupation 555) déposées par le compte d'Arno le 23/11 entre 23:19 et 23:37 (une capture d'écran et un
    « Contrat d'agent commercial immobilier » au nom d'un tiers) — ni d'un essai de l'agent, ni touchées.
  - `ec528f8e` — paragraphe pièce jointe : « le rapport complet de l'état des lieux de sortie » (locataire et propriétaire, singulier « … le rapport
    complet de … », pluriel « … le rapport complet et les documents … »). Vu en lecture seule par l'APERÇU serveur (aucune écriture) avec la pièce
    _TEST 139 existante sur le préavis TESTTEST (occupation 554) : ouverture → compte rendu → « … le rapport complet … » → fin. Capture 104.
  - Constat (recette, 23-24/11) : le compte d'Arno a validé deux sorties d'essai (gestion_location_sortie_validee 5 et 6 : lots 445 / 446,
    occupations 557 / 558, 23:59 et 00:01) et déposé la pièce 144 (occupation 557) — essais d'Arno, rien de l'agent.
  - `4f3c1e3f` (24/11) — « pourquoi il y a 2 modales différentes pour la même fonction ? » : le bien SANS copropriété prend l'agencement du bien
    rattaché (bouton de tête « Créer une copropriété pour cette adresse » → « Copropriété : aucune copropriété rattachée — sans elle, le suivi des
    20 % restera incomplet. » → case « Immeuble en copropriété » → « Date d'arrêté des comptes : aucune copropriété rattachée » → AGO…). RETIRÉS
    (accord d'Arno, doublons) : bloc « Ce bien n'est relié à aucune copropriété » (bouton « Créer une copropriété » + aide), encadré « Pour saisir
    la date d'arrêté des comptes et les AG… », ligne « Sans copropriété, le suivi des 20 % restera incomplet… » (fusionnée), message orange
    « Copropriété non renseignée sur la fiche du bien … » quand la case 20 % est cochée. « Ne pas rattacher maintenant » seul choix : implicite
    (plus de radio) ; copropriétés proposées (même parcelle) : liste gardée sous la ligne « Copropriété : … ». Aucun contrôle assoupli.
    🔴 POINT À CONFIRMER : case 20 % DÉCOCHÉE, le bloc 20 % n'est pas affiché et le message orange (avec son lien « Renseigner la copropriété sur
    la fiche du bien ») reste la seule trace de la copropriété non renseignée : il est GARDÉ dans ce cas — le retirer aussi ? Vérifié au Chrome
    (ESSAIPREAVIS Paul sans copropriété, _TEST SORTIE CREATION COPRO rattaché ; ordinateur et 390 px, clair et sombre ; aucune requête
    d'écriture, fenêtres abandonnées par « Annuler »). Captures 105 (avant, copie de 69) et 106-111 (après).
  - ✅ Question réglée (24/11) : la rubrique « Texte ajouté au mail du (des) propriétaire(s) » du récapitulatif est retirée (`761222a0`).
  - `761222a0` (24/11) — récapitulatif de « Valider la sortie » : « ajouter la date de clôture des comptes en plus de la dernière AGO connue et de
    l'AGO projetée » → rubrique « Date d'arrêté des comptes » juste avant « Dernière AGO » (« 31/12 » lu sur la copropriété, « non renseignée »,
    « aucune copropriété rattachée ») — récapitulatif seulement (résultat et mails inchangés). RETIRÉE (accord d'Arno) : la rubrique « Texte
    ajouté au mail du (des) propriétaire(s) » (le texte reste dans « Afficher le texte du mail » ; la zone modifiable de la saisie reste). Vu au
    Chrome en lecture seule (aperçu seul, puis « Revenir » / « Annuler ») : _TEST SORTIE CREATION COPRO → « 31/12 », ESSAIPREAVIS Paul →
    « aucune copropriété rattachée » ; « non renseignée » et « mail au propriétaire » par les tests seulement (aucun des deux biens n'a de
    propriétaire avec e-mail, aucune copropriété d'essai sans arrêté ouverte). Captures 112-115.
  - `4bde8fc2` (24/11) — fiche Copropriété, « ADRESSES » > « Une autre adresse » : « il faut faire un vrai champ de saisie visible […] qui prend
    toute la largeur de la colonne ». Le champ du composant partagé (classe `cp-saisie`) n'avait pas de style propre ; la fiche Copropriété ne
    l'habillait pas → champ nu (0 bordure, 24 px, 196 px). Corrigé dans le style partagé `CSS_CHAMP_ADRESSE` (`ChampAdresseBan.tsx`) : règle
    `:where(.cab-enveloppe > input.cp-saisie)` à spécificité NULLE — pleine largeur, 1 px, 44 px, 8 px 10 px, rayon 10 px, .88rem (= « Nom de la
    copropriété ») ; contour au focus = celui du navigateur, comme les autres champs. Les écrans qui habillent déjà `cp-saisie` gardent leur rendu
    (mesuré au Chrome avec et sans la règle : identique sur « Nouveau bien » et « Nouveau compromis »). Champ monté par : fiche Copropriété,
    « Adresses à vérifier » (Gestion), adresses du bien (`AdresseBien` : Nouveau bien, fiche du bien Location/Gestion, apporteur), cartes de
    personnes (`FormulaireCarte` : Nouveau propriétaire, Nouveau locataire, annuaire, dossier location), Transaction (`ChampAdresseTexte`). Non
    concernés (leur propre classe) : fiche syndic, carte vive, Caractéristiques et planche des permis, site public. Fonctionnement inchangé ;
    rien retiré. Vu au Chrome (ordinateur et 390 px, clair et sombre ; « Valider » / « Ajouter » jamais cliqués ; seul POST = la recherche par
    parcelle `action: 'parcelle'`, lecture seule, bloquée par le garde). Captures `.captures/adresse-champ/` 01 (avant) à 10.
  - `6f79c98a` (24/11) — « lorsque l'on coche "Informer nos partenaires", il faut afficher en dessous les différents partenaires possibles à
    informer et pouvoir les sélectionner individuellement ». CONSTAT D'AVANT : la liste vient du réglage « Paramètres Location › Destinataires
    mails », liste « Sorties » (table `gestion_location_mail_destinataires`, `sorte = 'sortie'`, dernière version ; aucune adresse dans le code) —
    en recette : ADHOC seul (`gestion.criterimmo@gmail.com`, posé par la migration 460) ; MONGA n'est que dans « Nouvelles locations ». Un SEUL
    mail partait, tous les partenaires en « À », en copie gestion@ et la personne qui valide (`copiesAvis`). APRÈS : sous la case, une case par
    partenaire (nom + adresse), toutes cochées par défaut ; case principale décochée = liste décochée et masquée (recochée : tous recochés) ;
    aucun coché = aucun mail partenaire ; UN mail par partenaire coché, un seul « À » ; seule la liste « Sorties » décide (adresse inconnue
    ignorée ; sans sélection transmise : tous, comme avant) ; récapitulatif « Mail à nos partenaires — ADHOC » par bloc. Copies gestion@ + valideur
    GARDÉES sur chaque mail partenaire. 🔴 POINT À CONFIRMER : les mails locataire/propriétaire partent sans copie visible (la copie interne est un
    mail à part) — faut-il aussi retirer gestion@ et le valideur de la copie des mails partenaires ? (retrait non fait sans accord).
  - `cf7ecb2f` (24/11) — « indiquer s'il y a une retenue ou pas des 20 % de l'article 22, et la date approximative ou non » : paragraphe après
    « Le logement est désormais vacant. » (`paragrapheRetenuePartenaires`, `validationSortie.ts`) — 4 variantes (projetée « est attendue vers …
    (date approximative) », officielle « est prévue au plus tard le … », sans date « interviendra dans le mois qui suit l'approbation des comptes
    de l'immeuble », pas de retenue « Aucune retenue … n'a été appliquée. ») ; « aux locataires » s'ils sont plusieurs. Même AGO qui compte que
    le locataire et le propriétaire ; calculé par le serveur, identique aperçu / envoi. L'écran de sortie plus ancien (`envoyerMailsSortie`) inchangé.
    Vu au Chrome sur ESSAIPREAVIS Paul (aperçu seul, « Revenir » / « Annuler » ; aucun envoi, seuls POST = `apercu-validation-sortie`) : sans
    retenue et retenue sans date (Paul n'a pas de copropriété → arrêté inconnu) ; variantes projetée / officielle par les tests seulement.
    Captures `.captures/vingt-pourcent/` 116-119 (partenaires), 120-123 (paragraphe).
  - Diagnostic (24/11, 22h, lecture seule) « pourquoi pas de case partenaires sur le préavis TEST — 1 rue du Préavis de Test (FICTIF) » : la case
    n'existe que pour un bien `en_gestion` (`logementDe`, `mailsPreavisSortieRepo.ts:92`) ; `creerPreavisTest` crée le bien en `location_seule`
    (`preavisTestRepo.ts:49-50`) — biens 442-448. Et un préavis de test ne laisse partir un mail qu'au créateur (`filtrerPourTest`). DÉCISION
    D'ARNO (24/11) : règles inchangées. Liste « Sorties » en recette depuis le 24/11 21:58 (versions 7 et 8, identiques) : ADHOC
    (gestion.criterimmo@gmail.com) + MONGA (laura@monga.io).
  - `4d09d602` (24/11) — REMPLACE le paragraphe de `cf7ecb2f` : « ajouter si ce locataire est assujetti à la retenue de l'article 22 (20 %), avec
    les dates de dernière AGO, de la projection de la future AGO ou de sa date officielle, de la date anniversaire de clôture des comptes de la
    copropriété, et enfin le mois auquel la restitution des 20 % au locataire est projetée/probable » → bloc (`blocRetenuePartenaires`,
    `validationSortie.ts`) « Retenue de 20 % du dépôt de garantie (article 22 de la loi n° 89-462 du 6 juillet 1989) : OUI » + 4 lignes « – »
    (arrêté « 31/12 » / « non renseignée » / « aucune copropriété rattachée » ; dernière AGO ; AGO qui permettra la restitution « vers mars 2027
    (date projetée, approximative) » ou « le 15/03/2027 (date officielle) » ; restitution « vers avril 2027 » / « au plus tard le 15/04/2027 » /
    « dans le mois qui suit l'approbation des comptes de l'immeuble » si case « Indiquer l'AGO » non cochée ou calcul impossible). Sans retenue :
    « … (article 22) : NON », seul. ⚠️ L'AGO de la ligne « AGO qui permettra la restitution » est l'AGO qui compte calculée MÊME case non cochée
    (seule la restitution perd sa date). Vu au Chrome sur _TEST PREAVIS VALIDE SORTIE NON VALIDEE (aperçu seul, « Revenir » / « Annuler », seuls
    POST = aperçu) : OUI projetée, bien sans copropriété, même bloc pour ADHOC et MONGA. Captures 124-126.
  - `75f3488f` (24/11) — fiche Copropriété, « inverser l'ordre entre le bloc Adresses et le bloc Identité » : Adresses, Identité, puis Digicodes,
    AG et arrêté des comptes, Habitants et gardiens, Syndic (fiche nouvelle et existante ; composant unique `FicheCopropriete`, donc partout).
    Blocs déplacés tels quels. L'épreuve d'ordre du 16/11 (`FicheCopropriete.test.tsx`) mise à jour + épreuve « fiche nouvelle ». Vu au Chrome
    (ordinateur et 390 px, clair et sombre ; « Fermer », jamais « Valider » ; seul POST = recherche par parcelle, lecture seule, bloquée) sur
    « _TEST ARRETE COMPTES 20 POURCENT 2 » ouverte depuis « 20 % à restituer » (« Compléter la fiche Copropriété ») et sur la fiche à créer
    « _TEST PREAVIS VALIDE SORTIE NON VALIDEE ». ⚠️ CONSTAT (antérieur, non traité) : depuis Gestion › Copropriétés, la ligne « _TEST ARRETE COMPTES
    20 POURCENT 2 » ouvre « Ce bien n'a ni immeuble ni adresse : aucune fiche copropriété possible. » (cause non instruite ; même affichage quel que soit l'ordre des blocs : ce message précède les blocs).
    Captures 127-130.
  - 🔴🔴 LOT « 20 % À RESTITUER » (24/11, demande d'Arno, un commit par point) — AG qui compte = calcul b0453dc2 ; date limite = AG + 1 mois ;
    une ligne = une sortie validée (colocataires ensemble).
    · `18f248d5` — cinq catégories exclusives (`classerVingtPourcent`, `vingtPourcent.ts`) : « Dates manquantes » (pas de dernière AGO, pas
      d'arrêté, ou pas de copropriété ; par copropriété, sortie la plus ancienne d'abord ; la ligne complète de chaque locataire sous sa
      copropriété), « Urgence » (> AG + 20 j), « AG passée — restitution à faire » (AG ≤ j ≤ AG + 20), « À préparer » (AG dans 30 j OU
      officielle), « En attente » ; b-e par date limite ; repliables, compteurs ; « Jours restants » (rouge si dépassée).
      ✅ TRANCHÉ par Arno (24/11, 23h20) → `3cfdef15` : une date PROVISOIRE calculable (dernière AGO connue, arrêté manquant) classe le
      locataire dans sa catégorie réelle, mention orange « date provisoire — arrêté des comptes manquant », alerte du lundi comprise ; sa
      copropriété reste dans « Dates manquantes » (compteur = copropriétés à compléter = la pastille). Seuls les locataires SANS aucune date
      restent uniquement dans « Dates manquantes ». « _TEST ARRETE COMPTES 20 POURCENT Locataire 3 » → Urgence.
    · `5b046e8e` — « Restitution faite » (migration 513, `restitutionVingtRepo.ts`) : fenêtre (date, montant restitué, retenu au titre des
      charges facultatif, commentaire ; montants par `ChampNombre`) ; gestes en ajout seul « faite » / « annulee » ; journal du dossier de
      CHAQUE locataire (`gestion_journal`, entité « annuaire », `location_restitution_20_faite` / `_annulee`) ; actions POST
      `restitution-20-faite` / `restitution-20-annuler` sur /api/admin/location (droit Location ; la route Gestion reste en lecture seule) ;
      la sortie quitte la liste et toute alerte ; « Restitutions faites (N) » repliée, « Annuler » avec confirmation. Essai recette : sortie 8
      restituée puis annulée (restitution 1 / annulation 2, journal 551).
    · `81f08a64` — alerte du lundi (migration 514, `alerteVingt.ts`, `alerteVingtRepo.ts`) : sur la minuterie du serveur web existante
      (`minuteriePrevisite.ts`) ; le lundi à partir de 8 h (Paris), si ≥ 1 locataire en « Urgence », UN mail à l'adresse de la Gestion (réglage =
      gestion@criterimmo.fr), objet « [Urgent] 20 % à restituer — 1 locataire / N locataires » (accord singulier/pluriel au lieu de
      « locataire(s) »), une ligne par locataire, lien vers l'écran ; journal 514 (« envoye » / « echec ») ; un seul « envoye » par lundi
      (index unique + verrou) ; échec réessayé le même lundi. Transport `transportParDefaut` (en recette : intercepté). Mode essai : GET
      `?alerteVingtEssai=1` + section « Alerte du lundi » en bas de l'écran (« Voir le mail tel qu'il partirait »). Aucun envoi fait (table 514
      vide en recette).
    · `b9c726d8` — pastilles : accueil Location, pastille des copropriétés gardée + pastille « Urgence » rouge vif (jeton
      `--color-svv-rouge-vif`, #d70000 / #ff4d40). L'entrée « 20 % à restituer » de la colonne de gauche de la Gestion n'avait AUCUNE
      pastille ; elle reçoit les DEUX — ✅ validé par Arno (24/11, 23h20).
    · Données d'essai RECETTE « _TEST 20 POURCENT CATEGORIES 1-6 » (script `.captures/vingt-pourcent/donnees-test-20-pourcent-categories.sql`) :
      copropriétés « _TEST 20 POURCENT CATEGORIES n — … », biens 470-475, sorties validées 7-12 (une par catégorie + une officielle lointaine).
    · Captures `.captures/vingt-pourcent/` 131-146.
    · `d5cb90f4` — « chaque bloc de locataire est trop important : le limiter à deux lignes qui se déploient à la demande. Jamais
      d'information en doublon » : une ligne par sortie, repliée (adresse, puis nom(s) ; à droite « AGO du … » / « AGO vers … (projetée) »
      ou, en orange, ce qui manque ; « Fiche copropriété » / « Créer la copropriété » ; « Restitution faite ») ; clic = détail (copropriété,
      sortie, exercice, arrêté, dernière AGO, limite, jours, alerte) ; 390 px : boutons pleine largeur. Fiche fermée : tout se relit.
      ✅ Question des CARTES « Dates manquantes » tranchée par Arno (24/11, 23h40, « option A adaptée ») → `07dd2bf4`.
    · `b68d51de` (23h40) — ligne repliée (catégories b-e) sur TROIS lignes de même hauteur (92 px à l'ordinateur) : adresse ; nom(s) ;
      « Restitution au plus tard le … » + compte à rebours (`compteAReboursVingt` : « AG dans N jours » gris avant l'AG, « J-N » de l'AG à la
      limite, « Dépassé de N jours » rouge après). À droite : étiquette `etiquetteAgo` ROUGE « AGO vers mars 2027 (projetée) » / VERTE « AGO
      15/03/2027 (officielle) » (encre --color-svv-green-ink), dessous la mention orange « date provisoire — arrêté manquant » (texte raccourci
      sur décision d'Arno ; place réservée sinon), puis les deux boutons. Le détail perd date limite, jours restants et la phrase d'alerte.
      ⚠️ Choix fait : une AGO projetée s'affiche « vers mois année » (jamais le jour, règle d'Arno du 23/11), pas « AGO 15/03/2027 (projetée) ».
    · `07dd2bf4` (23h40) — « Dates manquantes » : la grande carte par copropriété REMPLACÉE par un bloc de trois lignes (immeuble ; locataires
      concernés ; « Manque : dernière AGO et arrêté des comptes » orange, ou « Bien sans copropriété » + « Aucune copropriété ») et UN bouton
      « Fiche copropriété » / « Créer la copropriété » ; déplié : chaque locataire concerné (nom, logement, sortie, « sans date : figure
      seulement ici » ou « date provisoire : apparaît dans « Urgence » »), avec « Restitution faite ». TOUTES les copropriétés de la pastille
      visibles ; tri par le locataire concerné sorti le plus anciennement. Aide et « N copropriétés à compléter » gardées.
    · `09a51b86` (23h40) — 390 px : tête en colonne (3 lignes, étiquette, boutons pleine largeur) ; hauteurs réservées (adresse et noms sur 2
      lignes coupées, 3e ligne sur 2 lignes sans troncature) ; mesuré : 289 px pour les lignes datées, 178 px pour « Dates manquantes ».
    · Captures 152-156.
    · 23h53 — `8c3776c0` : le bouton « Restitution faite » devient « Faire restitution » partout (lignes, « Dates manquantes ») ; la modale
      (titre « Restitution faite — … ») et la section « Restitutions faites (N) » inchangées.
    · `75067861` : plus de doublon — détail « Dates manquantes » : « Sortie le … — Sans date » / « Date provisoire → Urgence », le nom seulement
      s'il y a plusieurs locataires concernés, l'adresse seulement si ce n'est pas celle du bloc (`dejaDit`, comparaison normalisée) ;
      « N copropriétés à compléter » retiré ; détail des lignes datées : la rubrique « Copropriété » n'est plus dite quand son libellé est
      l'adresse de la ligne (cas courant ; un vrai nom reste).
    · `03a514f5` : coordonnées au strict minimum dans le détail (ligne datée, et sous chaque locataire concerné de « Dates manquantes ») :
      rubriques « Locataire(s) » / « Propriétaire(s) », « Prénom NOM · e-mail · téléphone » (premier de chaque sorte, téléphone formaté par
      le formateur de la Gestion, « — » si absent, mailto / tel). Lecture `contactsDesSorties` (titulaire + indivision en cours). Interne.
      Les biens d'essai « CATEGORIES » n'ont ni coordonnées ni propriétaire (« — ») ; vu avec les sorties des préavis de test.
    · `5ac1e617` : recherche sous le titre (« Rechercher un locataire, une adresse ou un propriétaire », croix) ; `filtrerVingtPourcent` sans
      accents ni majuscules, mots partiels (chaque mot doit se trouver : « 2 » trouve aussi « 20 POURCENT ») ; toutes les catégories,
      « Dates manquantes » et « Restitutions faites » comprises ; compteurs filtrés ; catégories vides masquées ; « Aucun résultat ». Pastilles
      inchangées. Captures 157-161.
    · `8031f942` (décision d'Arno du 25/11) : coordonnées sans doublon — un bloc qui ne concerne qu'UN locataire (ligne datée à un locataire ;
      bloc « Dates manquantes » à un seul locataire en tout) → « e-mail · téléphone » ; plusieurs → « Prénom NOM · e-mail · téléphone » ;
      propriétaires inchangés. Captures 162-164.
    · Demandes d'Arno du 25/11/2026 (un commit par point, NON poussés) :
      - `91f06df3` « par défaut toutes les lignes de chaque catégorie sont fermées » : à l'ouverture, Dates manquantes, les quatre catégories et
        Restitutions faites repliées (titre et compteur visibles), lignes repliées ; une recherche ouvre les blocs qui ont des résultats
        (`blocsOuvertsPourRecherche`), effacée tout se replie, lignes dépliées comprises. « Alerte du lundi » reste repliée hors recherche.
      - `6939633b` « Alerte du lundi » en 2e position : Dates manquantes, Alerte du lundi, Urgence, AG passée, À préparer, En attente,
        Restitutions faites. Contenu inchangé.
      - `f8069b29` une trame par catégorie : jetons `--color-svv-vgp-<teinte>-fond / -accent` (globals.css, clair / sombre / système) ;
        -accent = liseré ET fond du titre. Alerte rouge, Urgence rouge orangé, AG passée orange, À préparer orange clair, En attente vert,
        Restitutions faites gris. Encre ≥ 7:1 sur chaque fond et titre (épreuve qui calcule sur les vraies valeurs). « Dates manquantes »
        INCHANGÉE (fond gris, liseré rouge) : elle n'avait PAS de trame ambre, question posée à Arno. Le liseré rouge d'« Urgence » non vide
        devient le rouge orangé de la catégorie.
      - `13cf958f` capsules empilées dans l'en-tête des quatre catégories : verte « AGO officielle · N », rouge « AGO projetée · N », grisée
        à 0 ; date provisoire = projetée (`capsulesAgo`). ⚠️ Le COMPTEUR de ces catégories comptait des SORTIES : il compte désormais des
        LOCATAIRES (colocataires un par un) ; somme des capsules = compteur. Pas de capsules sur Dates manquantes, Alerte, Restitutions faites.
        NON alignés (question posée à Arno) : la pastille « Urgence » (accueil Location, Gestion) et l'objet du mail du lundi comptent
        encore des sorties. Recette : une seule personne par sortie d'essai, les chiffres ne bougent pas.
      Captures `.captures/vingt-pourcent/25-11-*.jpg` (ordinateur clair / sombre, recherche, 390 px clair + sombre).
    · Réponses d'Arno du 25/11 (« Dates / copropriétés manquantes » garde son fond gris ; « Restitutions faites » ouverte par la recherche et
      liseré rouge orangé d'Urgence : validés) et demandes de 10h14 (un commit par point, NON poussés) :
      - `53d7852b` « compter en locataires partout » : pastille « Urgence » (accueil Location ET colonne de gauche de la Gestion, même hook
        `usePastillesVingt` → `nombreUrgences` = locataires) et objet + intro du mail du lundi (`nombreLocatairesAlerte`) ; la colonne
        `nombre` du journal 514 suit. La liste du mail reste une ligne par sortie.
      - `6a9e14ca` écart DOUBLÉ (28 px contre 14) autour des deux blocs gris d'extrémité (Dates / copropriétés manquantes ↔ Alerte du lundi,
        En attente ↔ Restitutions faites), mesuré dans Chrome à l'ordinateur et à 390 px.
      - `85d244b2` le bloc « Dates / copropriétés manquantes » n'apparaît que s'il contient des locataires (`datesManquantesVisibles`), ni quand
        la recherche n'y trouve rien ; son écart part avec lui. Disparaît avec lui la phrase « Toutes les copropriétés concernées ont… »
        (seul cas où elle s'affichait). Pastille de l'accueil inchangée.
      - `4b7b8bba` « Dates manquantes » → « Dates / copropriétés manquantes » partout (titre, nom accessible, infobulle de la Gestion,
        commentaires, tests ; `TITRES_CATEGORIES.manquantes` seule source). À 390 px, le compteur passe sous le titre.
      Captures `.captures/vingt-pourcent/25-11-B-*.jpg`.
    · `bf206a3f` (demande d'Arno du 25/11, « faire une seule capsule rouge qui cumule le nombre d'alertes ») : sur le bouton « 20 % à restituer »
      de l'accueil Location ET sur l'entrée de la colonne de gauche de la Gestion, UNE pastille rouge vif (en haut à droite du bouton) au lieu de
      deux : total = locataires en urgence + copropriétés à compléter (recette : 2 + 4 = 6), masquée à 0 ; détail au survol (title) et pour
      les lecteurs d'écran : « 2 locataires en urgence · 4 copropriétés à compléter » (`pastilleVingt`, les deux parties toujours dites).
      Compteurs de l'écran inchangés. Captures `.captures/vingt-pourcent/25-11-C-*`.
    · `4a92d1be` (demande d'Arno du 25/11) : « En attente » → « AGO > 1 mois – En attente », « À préparer » → « AGO < 1 mois – À préparer »
      (tiret demi-cadratin, choix d'Arno pour le second titre). Titres seulement (`TITRES_CATEGORIES`) : classement inchangé, une AGO officielle
      lointaine reste dans « AGO < 1 mois – À préparer ». Le mail du lundi et l'aide ne citaient pas ces titres. Captures `25-11-D-*`.
    · `0d1a809a` (demande d'Arno du 25/11, « n'afficher la ligne "Alerte du lundi" que si elle contient un locataire, sinon elle n'est pas
      présente ») : bloc présent seulement s'il y a au moins un locataire en « Urgence » (sur les résultats filtrés en recherche), sinon absent
      avec son espace. Envoi du lundi et journal inchangés ; mode essai dans le bloc quand il est affiché ; pas de compteur au titre.
      Captures `25-11-E-*`.
    · `59000b2a` (décision d'Arno du 25/11) : `dateSortieUnique.test.ts` ignore un fichier listé puis disparu avant sa lecture (ENOENT seul,
      `lireSiPresent` ; même chose pour le `stat` de la liste) — cause : le fichier temporaire `app/lib/svv/__garde_eslint_tmp__.ts` que
      `gardeImports.test.ts` crée puis efface en parallèle. Contrôle gardé : chaque fichier sauté est vérifié ABSENT, et ils restent < 5 ;
      toute autre erreur fait échouer. `gardeImports.test.ts` inchangé. Cas inscrit (cause, correction, conduite) dans `docs/FLAKES_CONNUS.md`.
    · « Alerte restitution en retard » (demandes d'Arno du 25/11, un commit par point, NON poussés) :
      - `a3376e28` catégorie `retard` « Alerte restitution en retard », 2e place, fond rouge, À LA PLACE du bloc « Alerte du lundi » (retiré, comme
        demandé) : AGO OFFICIELLE (date provisoire exclue, même règle que les capsules) ET date limite dépassée (le lendemain de la limite).
        Absente si vide. « Urgence » = AGO + 21 j → date limite incluse ; une AGO PROJETÉE dont la limite est passée y reste, avec la mention
        orange « AGO à confirmer — saisir la date officielle » (`agoAConfirmer`) ; une date provisoire dépassée y reste avec sa mention. Recette :
        « CATEGORIES 1 » passe en retard (41 j) ; « Locataire 3 » (projetée, 34 j) reste en Urgence avec la mention.
      - `a0877bca` le mail d'alerte REMPLACE celui du lundi : dès 8 h (Paris), si le dernier envoi réussi de cette alerte date d'au moins 2 jours
        (`alerteDue(m, dernierEnvoi)`), et s'il y a au moins un locataire en retard : objet « [Alerte] 20 % à restituer en retard — N locataire(s) »,
        liste (locataire, logement, AGO officielle, date limite, jours de retard), lien ; à l'adresse Gestion du réglage. Serveur arrêté le jour
        prévu : envoi le jour suivant. SANS MIGRATION : journal = table de la 514 (colonne `lundi` = jour de l'envoi ; ces envois reconnus à leur
        objet « [Alerte] … » ; les lignes « [Urgent] … » du lundi restent et ne comptent pas dans le rythme ; un envoi par jour, index unique).
        Mode essai dans la catégorie (rubrique « Alerte par mail »). Recette : journal de la 514 VIDE à la fin du lot (aucun envoi automatique).
      - `f54002df` boutons de raccourci (accueil Location, colonne de gauche de la Gestion) : ROUGE si un locataire en retard, ORANGE si une
        urgence, sinon d'origine (`niveauBoutonVingt`) ; pastille unique = retard + urgence + copropriétés (recette 1 + 1 + 4 = 6), détail à trois
        nombres. Orange vérifié dans Chrome par permutation de la classe à l'écran (la recette n'a pas de cas « urgence sans retard »).
      Captures `.captures/vingt-pourcent/25-11-G*-*`.
    · `8f9e7243` (demande d'Arno du 25/11) : la catégorie s'appelle « AGO passée — restitution à faire » (avant : « AG passée … »), partout
      (`TITRES_CATEGORIES`, commentaires, tests) ; le mail et l'aide ne citaient pas ce titre. Règles inchangées. Captures `25-11-H-*`.
    · `5969e3dd` (demande d'Arno du 25/11) : un clic sur la capsule « AGO officielle · N » / « AGO projetée · N » d'une catégorie l'ouvre et n'en
      montre que les lignes de ce type (provisoire = projetée) ; capsule pressée (contour marqué, aria-pressed), ligne « Filtre actif : … »
      (role="status") ; compteur inchangé. Même capsule ou ailleurs sur l'en-tête : filtre retiré (l'en-tête garde son ouvrir / fermer) ; l'autre
      capsule bascule. Capsule à 0 : grisée, non cliquable (span). Filtre local à la catégorie : il suit la recherche, il est retiré quand on l'efface
      ou qu'on recharge. Clavier (Entrée / Espace) vérifié dans Chrome. Captures `25-11-I-*`.
    · `fb8b6885` (demande d'Arno du 25/11) : « Enregistrer la restitution » (après les contrôles du formulaire) ouvre la fenêtre « Confirmer la
      restitution » par-dessus : « En confirmant, vous attestez que la restitution de […] € à [Prénom NOM] a bien été effectuée le [date]. Ce locataire
      sortira du suivi des 20 % et passera dans l'historique « Restitutions faites ». » (+ « Montant retenu au titre des charges : … € » s'il est
      saisi ; pluriel pour des colocataires ; `texteConfirmationRestitution`). « Revenir » (et Échap) : saisie gardée, rien écrit ; « Confirmer la
      restitution » (rouge) enregistre comme avant, une seule fois même sur double clic (useRef). Annulation inchangée. Captures `25-11-J-*`.
    · Demandes d'Arno du 25/11 (un commit par point, NON poussés) :
      - `d5507919` le compteur de « AGO passée — restitution à faire » et de « AGO < 1 mois – À préparer » : pastille à fond VERT
        (`--color-svv-green-ink`, chiffre en surface : 5,4:1 clair, 10:1 sombre), grise à 0.
      - `0cc3ef99` boutons de raccourci (accueil Location, colonne de la Gestion) : pastille VERTE = « AGO passée » + « AGO < 1 mois »
        (`nombreAPreparer`, en locataires ; recette 1 + 2 = 3), en haut à gauche du bouton Location, à gauche de la rouge dans l'entrée de la
        Gestion ; masquée à 0 ; détail « N restitution(s) à préparer ou à faire » (title, aria-label). Pastille rouge et couleur du bouton inchangées.
      - `88764960` (retrait ACCORDÉ par Arno pour cet écran seul) : Gestion › « 20 % à restituer » (`?ecran=vingt_pourcent`) n'affiche plus le bloc
        d'en-tête de la Gestion (titre, introduction, « Rapprochement des dossiers clients », relève et boutons, alerte « relève arrêtée », copie
        Drive à reprendre) — `sansBlocVingt`, même traitement que Copropriétés (f4e736fc) ; page commençant par « ← Retour à la Gestion ». Boîte et
        autres écrans inchangés (constaté : sur la boîte en plein écran, l'en-tête était DÉJÀ masqué par `:root[data-gst-plein="1"]`, lot 5-GMAIL
        8d25f2e5 du 24/09 — rien à voir avec ce lot ; l'alerte de relève y reste). Épreuve `GestionVue.vingtPourcent.test.ts`.
      Captures `.captures/vingt-pourcent/25-11-K*-*`.
    · « Envoyer un mail » (demandes d'Arno du 25/11 ; décisions 1A, 2A, 3A ; quatre modèles validés), un commit par point, NON poussés :
      - `a1ca94a7` (retrait accordé) : plus de rubrique « Arrêté des comptes » dans le détail déplié (doublon de « Exercice clos le … »).
      - `8dfb127d` bouton « Envoyer un mail » à droite de la ligne « Locataire / Propriétaire » du détail. CÔTÉ GESTION : le module EXISTANT
        `Redaction` monté dans la ligne (`MailVingtPourcent.tsx`, comme « Nouveau message » de la fiche d'un bien : bien pré-coché, propositions
        du bien en couleurs — ancien locataire violet, propriétaire rouge, syndic rose —, saisie libre) ; « Fermer » / nouveau clic = la porte de
        l'éditeur (`fermetureDemandee`). CÔTÉ LOCATION : un lien vers `/admin/gestion?ecran=vingt_pourcent&vingtMail=<sortie>` (catégorie, ligne et
        module ouverts) — garde-fou Location (`requeteDepuisLaLocation`) INCHANGÉ. UN MAIL PAR LOCATAIRE (`refusUnLocataireParMail`) : écran (motif
        au-dessus du module) + serveur (marque `vingtPourcent: { sortieId }`, seul ajout à Redaction ; la route `envois` relit en base les adresses
        des locataires de la sortie, `mailVingtPourcentRepo.ts`, refus 422 avant file et envoi direct ; mails non marqués : inchangés).
      - `08268902` les quatre modèles (`texteModeleVingt`, `destinatairesModeleVingt`) : a syndic ; b propriétaire(s) ; c syndic + propriétaire(s)
        EN COPIE ; d un module PAR LOCATAIRE. Seule adaptation aux textes validés : l'estimation de l'AGO n'est dite que si elle est PROJETÉE.
        Sur les lignes des catégories, aucune restitution n'est enregistrée (elle ferait quitter la liste) : le modèle d y est toujours « [à compléter] ».
      - `f1e5f678` historique : le bien de la ligne part en cible EXPLICITE (`ciblesAvecLeBien`, jamais écartée par `ciblesCoherentes`) → cible
        d'envoi → rattachement confirmé à la capture → historique du bien ; personnes par leurs adresses ; copropriété par ses biens (3A) ; journal
        par la route.
      - `cfdf2faf` correctif des gardes de la Location : liste verte `ListeChoix` au lieu d'un `<select>` ; commentaire reformulé.
      Captures `.captures/vingt-pourcent/25-11-L*-*`. À noter : choisir un modèle REMPLACE le message en cours (si l'on avait déjà tapé, l'ancien
      brouillon enregistré par le module reste dans les Brouillons).
    · `a20a86f6` (demandes d'Arno du 25/11) modèles revus : plus AUCUNE phrase d'estimation de l'AGO (a, b, c) ; a et c commencent par « Nous
      sommes le cabinet CRITERIMMO, gestionnaire du lot n° [num_lot_copro, s'il est sur la fiche] situé [adresse], pour le compte de notre client
      [civilité Prénom NOM] (nos clients … , copropriétaires), copropriétaire de la résidence [copropriété] dont vous assurez le syndic de
      copropriété. » puis « Pour finaliser la restitution du solde du dépôt de garantie de son (leur) ancien locataire, nous avons besoin de la date
      de la prochaine assemblée générale ordinaire, qui approuvera les comptes de l'exercice clos le [JJ/MM/AAAA]. » (locataire jamais nommé) ; c :
      « [noms], propriétaire(s), est/sont en copie de ce mail. » avant les remerciements ; b : inchangé hors l'estimation. Civilité mise seulement
      pour une personne (M., Mme, Mlle, M. et Mme). Captures `25-11-M-*`.
    · `4d255049` (demandes d'Arno du 25/11) modèles revus encore : « nous avons besoin de CONNAÎTRE la date » ; a et c : « Nous sommes le cabinet
      CRITERIMMO, gestionnaire, pour le compte de notre client [civilité Prénom NOM], du lot n° [n°] ([bâtiment], [étage]), situé [adresse]. Notre
      client est copropriétaire dans cette résidence (dans la résidence [nom], si le NOM de la copropriété — colonne `nom`, pas le libellé — diffère
      de l'adresse, sans « Résidence » en tête), dont vous assurez le syndic de copropriété. » — l'ADRESSE UNE FOIS ; lots = num_lot_copro du bien puis
      de ses annexes rattachées non détachées (`gestion_lot_annexe`) ; bâtiment et étage de la fiche (libelleEtage, « 3e étage »), chacun s'il est
      renseigné ; sans numéro « du lot situé … ». b : plus d'adresse dans le texte (elle est dans l'objet), copropriété nommée si nom distinct.
      Objet de a, b, c : « Date de la prochaine AGO — [adresse du bien] ». Captures `25-11-N-*`.
    · `98cef2c6` (demandes d'Arno du 25/11) : a et c commencent désormais par « Nous sommes le cabinet CRITERIMMO, gestionnaire du lot n° [n°]
      ([bâtiment], [étage]) situé [adresse], pour le compte de notre client [civilité Prénom NOM], copropriétaire dans la résidence [nom] (sinon « dans
      cet immeuble »), dont vous êtes le syndic. » puis « Afin de finaliser […] au cours de laquelle seront approuvés les comptes de l'exercice clos
      le … » ; b, 2e paragraphe : « Si vous avez reçu la convocation, ou si vous connaissez la date de la prochaine assemblée générale ordinaire, … ».
      DONNÉES D'ESSAI (recette, hors dépôt) : noms des copropriétés 335-340 → « _TEST Les Tilleuls N », la 339 SANS nom (valeurs d'avant :
      `.captures/vingt-pourcent/noms-coproprietes-essai-avant-25-11.txt`, script `noms-coproprietes-essai-lisibles.sql`, script de création aligné).
      Captures `25-11-O-*`.
    · `4be4b89e` (demande d'Arno du 25/11) : « AGO < 1 mois – À préparer » = l'AGO qui compte dans les 30 prochains jours SEULEMENT (officielle ou
      projetée) ; la règle du 24/11 « officielle, même lointaine » est abandonnée : au-delà de 30 jours, « AGO > 1 mois – En attente », officielle
      comprise. Recette : « CATEGORIES 4 » (officielle à 202 j) passe en En attente ; pastille verte 3 → 2.
    · `905e0e0a` (demande d'Arno du 25/11) « x mail(s) envoyé(s) depuis cette page » : MIGRATION 515 `gestion_location_mail_vingt` (sortie, clé
      d'idempotence, modèle ; ajout seul), notée par la route `envois` après le contrôle « un mail par locataire » ; la marque `vingtPourcent` porte
      le modèle. Compte = envois `gestion_envoi.etat = 'envoye'` et partis, JAMAIS une simulation de la recette (identifiant Gmail « recette-… » :
      intercepté, pas parti, pas compté). Ligne repliée : mention discrète sous les boutons ; détail : liste (date et heure, destinataires, copies,
      modèle, « Voir dans l'historique » dès la relève). Aucun mail envoyé en recette : affichage vérifié dans Chrome par une réponse modifiée dans
      le navigateur seulement. Captures `25-11-P*-*`.
    · `a649427f` (demande d'Arno du 25/11) fiche Copropriété, composant PARTAGÉ (vaut partout) : « Fermer » et « Valider » 50 % chacun, même hauteur ;
      sous 600 px empilés pleine largeur, Valider au-dessus (colonne inversée, ordre du code inchangé). Fiche ouverte puis fermée, jamais validée.
    · `daad8340` (demande d'Arno du 25/11) le compte à rebours « J-N » de la ligne repliée en rouge du thème (#a30402 / #ff6b6b) ; « Dépassé » rouge,
      « AG dans N jours » gris, inchangés.
    · `5c3a9d50` (demande d'Arno du 25/11) « Classer ce mail » VERROUILLÉ depuis une ligne du 20 % : Redaction `classementVerrouille` (case verte inerte
      « Rattaché — adresse, lot n° … », aucune proposition, aucun bien d'après les destinataires ; absente ailleurs = inchangé) ; la route `envois`
      REPOSE le bien de la sortie (`cibleDeLaSortie`, s.lot_id) pour tout mail marqué. Traçabilité vérifiée de bout en bout (préavis → occupation →
      sortie validée lot_id figé → ligne / mails / restitution / restitutions faites par s.lot_id et s.occupation_ids) : aucune étape ne passe par
      l'adresse, le nom ou le bail en cours ; relocation sans effet. Pas de migration.
      ⚠️ À SAVOIR (vérification Chrome) : bloquer `fetch` ne suffit pas pour Redaction — l'enregistrement automatique retombe sur `navigator.sendBeacon`.
      Brouillon d'essai n° 170 (recette) écrit ainsi ; MIS À LA CORBEILLE le 25/11 sur décision d'Arno (geste normal « Supprimer le brouillon »,
      DELETE sans `definitif` : réintégrable). Désormais, à chaque vérification : `fetch` ET `navigator.sendBeacon` doublés. Captures `25-11-Q*-*`.
    · `e3de40e7` (décision d'Arno du 25/11) « Faire restitution » et son annulation écrivent AUSSI au journal du BIEN (entité `annuaire_lot`,
      bien lu sur `s.lot_id`, même transaction) ; visibles dans l'historique de la fiche du bien. Pas de migration.
    · `5ab06e63` (décision d'Arno du 25/11) le module ne propose comme locataire que le(s) locataire(s) SORTI(S) de la ligne (`suggestionsDeLaSortie`,
      Redaction `filtreSuggestions` facultatif, absent ailleurs = inchangé) : le locataire actuel du lot et les autres anciens disparaissent de tous
      les groupes ; les sortis absents sont ajoutés (« Locataire sorti »). Le serveur, lui, ne refuse pas un nouveau locataire saisi à la main.
    · `c0312cc7` (demande d'Arno du 25/11, point 1) CONVERSATION DE LA LIGNE : les fils ouverts par les mails partis du module (515 → mail capturé →
      fil), réponses comprises, tous fils mêlés, du plus ancien au plus récent ; chaque mail rendu par `MessageConversation` (la carte de la boîte
      Gestion, pas de copie), lu par la route du fil. Les réponses SUIVENT LE BIEN : la route pose la portée « Ce mail + futurs échanges »
      (`demande.rattachement = { position: 'suite' }`, appliquée après capture par `poserClassement`) ; avant, seule la réponse rattachée par adresse
      arrivait au bien. Une réponse appartient à la ligne parce qu'elle entre dans le fil par ses en-têtes (In-Reply-To/References), comme dans la
      boîte. ⚠️ Une réponse écrite comme NOUVEAU mail (sans répondre) n'entre pas dans le fil : elle n'apparaît pas dans la ligne.
    · `5a8c43c1` (point 2) ligne dépliée : « Échanges (N) » visible, module d'écriture fermé ; « Répondre / Répondre à tous / Transférer » sur
      chaque mail ouvrent le module EN RÉPONSE (même fil, classement verrouillé, « un mail par locataire » maintenu, pas de modèle). Le lien
      « Envoyer un mail » de la Location ouvre toujours le module (demande explicite).
    · `9f31e125` (point 3) ligne repliée : « N mails échangés — dernier le … » SOUS la capsule AGO (envoyés + reçus) ; remplace « x mails envoyés
      depuis cette page » (905e0e0a). Hauteur de la ligne inchangée (92 px). Captures `25-11-R*-*` (vrai fil « _TEST » 37134 + réponse simulée
      dans le navigateur seulement).
    · `2c97de46` (demande d'Arno du 25/11, second lot, point 1) RÈGLE DES CATÉGORIES : AGO le 01/09 → AGO passée du 01/09 au 19/09, Urgence du
      20/09 (AGO + 19 j, JOURS_APRES_AG_URGENCE = 19, « à partir de ») au 01/10 inclus (limite = AGO + 1 mois, `ajouterMois` : 31/01 → 28/02,
      29/02 en bissextile), Alerte dès le 02/10. CHOIX D'ARNO : AGO PROJETÉE (ou provisoire) dépassée → Alerte aussi (avant : Urgence), mention
      « AGO à confirmer » gardée ; le mail d'alerte dit « AGO projetée (à confirmer) ». Recette : « _TEST ARRETE COMPTES … Locataire 3 » passe en Alerte.
    · `46526614` (point 2) les échanges suivent la SORTIE dans toutes les catégories et jusque dans « Restitutions faites » (mention + conversation
      en lecture, sans « Répondre »).
    · `c44bc880` (point 3) niveau 2 : « Échanges (0) — Aucun échange pour l'instant ». Les 3 niveaux : 1 ligne repliée, 2 détail + échanges
      (module fermé), 3 module (« Envoyer un mail » / « Répondre »). Objet d'une réponse : « Re: » comme la boîte Gestion (Arno a écrit « RE : »).
    · Point 4 (mention sous la capsule AGO) : déjà livré en `9f31e125`, rien de plus.
    · POINT 5 — CHOIX D'ARNO (a) (25/11) : DEUX LOCATAIRES D'ESSAI CRÉÉS EN RECETTE (svav_recette seulement), sans commande de suppression, sans
      lever aucun verrou, AUCUN mail envoyé. Script (non commité) `.captures/vingt-pourcent/creer-locataires-conversation-test.ts` (refuse une autre
      base, refuse une 2e passe) ; compte rendu `.captures/vingt-pourcent/creation-locataires-conversation-25-11.txt`. Aucun code changé.
      🔴 DONNÉES _TEST CRÉÉES (recette, le 25/11/2026, signées « essai _TEST (25/11/2026) ») :
        - syndic n° 54 « _TEST Syndic Conversation » <a.jorel+syndic@sansvisavis.com>, rattaché aux deux copropriétés ;
        - A : copropriété 341 « _TEST Résidence Conversation A » (41 rue _TEST CONVERSATION 20 POURCENT, arrêté 30/06, AGO officielle 15/11/2026),
          propriétaire 329 « _TEST Propriétaire » <a.jorel+proprio@…>, lot 476 (`app-test-conv-20-lot-A`), locataire 556 « _TEST CONVERSATION
          20 POURCENT A » <a.jorel+locataire@…>, occupation 583 (sortie 15/03/2026), sortie validée 13 (retenue 20 %) → « AGO passée » ;
        - B : copropriété 342 « _TEST Résidence Conversation B » (42 rue …, AGO officielle 31/10/2026), propriétaire 330, lot 477
          (`app-test-conv-20-lot-B`), locataire 557, occupation 584, sortie validée 14 → « Urgence » ;
        - par locataire, 3 fils (A : 37195-37197 ; B : 37198-37200), 7 mails (4 envoyés, 3 reçus ; Message-ID `<essai-test-conv-20-…@criterimmo.fr>`,
          In-Reply-To / References chaînés), chacun rattaché CONFIRMÉ au lot, période « Ce mail + futurs échanges » par fil ; 4 envois par locataire
          (`gestion_envoi`, cle `essai-test-conv-20-…`, état envoye, jamais en file) notés au module (515, modèles syndic / proprietaire / locataire /
          libre) ; une pièce PDF factice (709 octets, stockage LOCAL MinIO) sur la réponse du syndic (mails 58434 et 58441).
      🔴 LES RETIRER, PAR LES GESTES NORMAUX (jamais une suppression) : ① sur chaque ligne « _TEST CONVERSATION 20 POURCENT A/B » de « 20 % à
      restituer » : « Faire restitution » (elle passe dans « Restitutions faites ») ; ② dans la fiche de chaque bien (lots 476, 477) : « Sortir du
      suivi » sur chacun des 7 mails (restaurable) ; ③ dans la boîte Gestion, les 6 conversations (objets « Date de la prochaine AGO — 41/42 rue
      _TEST CONVERSATION… », « Restitution du solde de votre dépôt de garantie — … ») : mise à la corbeille. Les fiches (copropriétés, syndic,
      propriétaires, lots, locataires) restent, marquées « _TEST ».
      Vérifié dans Chrome (ordinateur et 390 px, clair et sombre) : niveau 1 « 7 mails échangés — dernier le 23/11/2026 » sous la capsule AGO (A en
      AGO passée, B en Urgence, hauteur 92 px) ; niveau 2 « Échanges (7) », PDF visible, module fermé ; niveau 3 « Répondre » : même fil, destinataire
      prérempli (syndic, locataire), « Re: … », classement verrouillé — « Envoyer » jamais cliqué ; aucun brouillon. Captures `25-11-T-*`.
    · 21h14 (Arno : « Il n'y a toujours aucun locataire avec des échanges de mails ») — PREUVE : le serveur de localhost:3000 (next-server, pid 89178,
      lancé par `npm run recette`) a ses DEUX connexions PostgreSQL sur `svav_recette` (pg_stat_activity, ports clients du processus) ; les scripts
      écrivent dans `svav_recette` (garde current_database). Après rechargement complet, A et B s'affichaient bien (A en AGO passée, B en Urgence,
      « 7 mails échangés »). Si Arno ne les voit pas, il regarde une autre adresse (tunnel, autre poste, production) ou une page non rechargée.
    · `e7817637` (rappel d'Arno : « tout bloc locataire qui inclut des échanges mails doit apparaître dans le bloc original […] ») « Dates /
      copropriétés manquantes » : « N mails échangés » sur le bloc (colonne de droite), conversation du locataire déplié avec « Répondre » (même
      module, même fil). Sans mail : bloc inchangé.
    · JEU D'ESSAI COMPLET « _TEST JEU 20 POURCENT » (recette, 25/11/2026 vers 21h30, signé « essai _TEST JEU (25/11/2026) » ; choix (a) : aucune
      suppression, aucun verrou levé, AUCUN mail envoyé). Script (non commité) `.captures/vingt-pourcent/creer-jeu-essai-20-pourcent.ts`, compte
      rendu `creation-jeu-essai-25-11.txt`. Sortie de tous : 01/03/2026, arrêté 30/06 (exercice clos le 30/06/2026), syndic n° 54 commun,
      un « _TEST Propriétaire » <a.jorel+proprio@…> par bien, locataire <a.jorel+locataire@…>, adresses « 51 à 63 rue _TEST JEU 20 POURCENT » :
        - sortie 15 « Dates manquantes sans copropriété » (lot 478, aucune copropriété) — 4 mails (modèles b, d) ;
        - sortie 16 « Dates manquantes copropriété sans date » (lot 479, copropriété 343 sans AGO ni arrêté) — 0 mail ;
        - sortie 17 « Alerte officielle » (lot 480, copro 344, AGO 20/09/2025 et 20/09/2026) — 8 mails (a avec PDF, c, d) ⚠️ un de plus que
          le maximum demandé (7) ; ne se supprime pas ;
        - sortie 18 « Alerte projetée » (lot 481, copro 345, AGO 20/09/2025 → projetée 20/09/2026) — 0 mail ;
        - sortie 19 « Urgence officielle » (lot 482, copro 346, AGO 01/11/2025 et 01/11/2026) — 0 mail ;
        - sortie 20 « Urgence projetée » (lot 483, copro 347, AGO 01/11/2025 → 01/11/2026) — 2 mails (a) ;
        - sortie 21 « AGO passée officielle » (lot 484, copro 348, AGO 15/11/2025 et 15/11/2026) — 4 mails (b, d) ;
        - sortie 22 « AGO passée projetée » (lot 485, copro 349, AGO 15/11/2025 → 15/11/2026) — 0 mail ;
        - sortie 23 « À préparer officielle » (lot 486, copro 350, AGO 10/12/2025 et 10/12/2026) — 0 mail ;
        - sortie 24 « À préparer projetée » (lot 487, copro 351, AGO 10/12/2025 → 10/12/2026) — 3 mails (c) ;
        - sortie 25 « En attente officielle » (lot 488, copro 352, AGO 20/03/2026 et 20/03/2027) — 6 mails (a, b, d) ;
        - sortie 26 « En attente projetée » (lot 489, copro 353, AGO 20/03/2026 → 20/03/2027) — 0 mail ;
        - sortie 27 « Restitution faite » (lot 490, copro 354, AGO 05/10/2025 et 05/10/2026) — 4 mails (a avec PDF, d) ; restitution n° 3
          enregistrée par `enregistrerRestitution` (le chemin de « Faire restitution » : 284,00 € restitués, 36,00 € retenus, journal locataire + bien).
      Les catégories suivent les DATES : le jeu glissera avec les jours (ex. « AGO passée » devient « Urgence » le 04/12/2026).
      🔴 RETRAIT, PAR LES GESTES NORMAUX (jamais une suppression) : « Faire restitution » sur chaque ligne « _TEST JEU 20 POURCENT … » (la ligne
      passe dans « Restitutions faites ») ; « Sortir du suivi » sur chaque mail dans la fiche du bien (lots 478-490) ; mise à la corbeille des
      conversations dans la boîte Gestion (objets « Date de la prochaine AGO — 5x rue _TEST JEU 20 POURCENT … », « Restitution du solde de votre
      dépôt de garantie — … »). Les fiches restent, marquées « _TEST ».
      Contrôle à l'écran (localhost:3000, rechargement complet, ordinateur et 390 px, clair et sombre) : chaque catégorie contient les locataires
      attendus ; capsules = compteurs (Alerte 2+2, Urgence 2+1, AGO passée 3+1, À préparer 1+2, En attente 2+5) ; pastilles de l'accueil Location :
      rouge 13 (4 + 3 + 6), verte 7 (4 + 3) ; niveau 1 « N mails échangés » sous la capsule sur chaque ligne à mails ; niveau 2 conversation visible
      (dont « Dates manquantes » et « Restitutions faites ») ; niveau 3 « Répondre » prérempli — « Envoyer » jamais cliqué, aucun brouillon.
      Captures `25-11-U-*`.
    · Demande d'Arno du 25/11, 21h24 (trois commits, tout dans `EchangesVingt.tsx`, PROPRE à l'écran ; la boîte Gestion ne change pas) :
      `3251b835` « Échanges (N) » du plus RÉCENT au plus ancien (plusRecentDabord à l'affichage ; fusion chronologique gardée ; mails pas encore
      capturés en tête ; bandeau « Envoyé depuis cette page » au-dessus de son mail) — lignes, « Dates manquantes », « Restitutions faites » ;
      `129d9e81` l'ŒIL des pièces jointes : la carte PiecesJointes (partagée) l'affiche dès qu'on lui passe onVisualiser — la boîte Gestion le
      passait déjà (œil déjà présent, RIEN ajouté là-bas), les échanges non ; il ouvre la liseuse habituelle ApercuFichierDrive (source « piece »,
      Précédent / Suivant entre les pièces de la conversation, sans « Ranger dans le Drive ») ; `c1cf0891` mails FERMÉS par défaut (plus
      d'ouverture auto du dernier sur cet écran), l'en-tête de la carte (bouton pleine largeur, inchangé) ouvre / referme d'un clic, « Répondre »
      et « ⋮ » à côté n'ouvrent rien, plusieurs ouverts possibles. Vérifié dans Chrome sur « _TEST JEU 20 POURCENT Alerte officielle » (8 mails,
      PDF factice affiché dans la liseuse), ordinateur et 390 px, clair et sombre. Captures `25-11-V-*`.
      ⚠️ Brouillons 171 (21:29) et 172 (21:30) en recette, « nouveau », auteur Arnaud Jorel (le compte de la session), destinataires
      a.jorel+syndic / +proprio, objet « Date de la prochaine AGO — 58 rue _TEST JEU … » : PAS écrits par les vérifications (aucune action Chrome
      entre 21:23 et 21:33) — très probablement les essais d'Arno ; laissés tels quels.
    · 21h34 — JEU D'ESSAI RÉALISTE (dérogation voulue par Arno à « _TEST » dans les noms AFFICHÉS ; recette seulement ; aucune suppression, aucun
      verrou levé, AUCUN mail envoyé ; aucun code changé). Script (non commité) `.captures/vingt-pourcent/creer-jeu-realiste-20-pourcent.ts`, compte
      rendu `creation-jeu-realiste-25-11.txt`. 🔴 MARQUE INTERNE (jamais affichée) : identifiants `app-exemple-20-…` (lots 491-503, locataires,
      propriétaires, occupations), clés `…#exemple-20`, Message-ID `<exemple-20-…@criterimmo.fr>`, envois `exemple-20-…` (15). Aucune note interne
      non affichée n'existe (les champs « note » des fiches s'affichent) : la marque n'est donc que dans ces clés et ici. Signé « Gestion locative ».
      Syndics inventés (4) : Cabinet Martel Gestion (Mme Laurence Petit, a.jorel+syndic-martel@), Syndic Duval & Associés (M. Olivier Fabre,
      +syndic-duval@), Agence Rivière Copropriétés (Mme Nathalie Roussel, +syndic-riviere@), Lemoine Immobilier Syndic (M. Bertrand Caron,
      +syndic-lemoine@). Propriétaires a.jorel+proprio-<nom>@, locataires a.jorel+locataire-<nom>@sansvisavis.com.
        - sortie 28 Camille DURAND, 14 rue Jean Jaurès 92800 Puteaux (bien sans copropriété) → Dates manquantes — 4 mails
        - sortie 29 Thomas BERNARD, 7 allée des Glycines 92400 Courbevoie (copropriété sans dates, Duval) → Dates manquantes — 0
        - sortie 30 Julie MOREAU, 22 rue Charles Lorilleux 92800 Puteaux, Résidence Les Marronniers (Martel), AGO 20/09/2026 → Alerte — 7 (PDF)
        - sortie 31 Nicolas LEFORT, 48 rue de Villiers 92200 Neuilly-sur-Seine (Duval), AGO projetée sept. 2026 → Alerte — 0
        - sortie 32 Émilie ROUSSEAU, 15 rue Cartault 92800 Puteaux (Martel), AGO 01/11/2026 → Urgence — 0
        - sortie 33 Antoine MERCIER, 9 rue Lauriston 75016 Paris, Résidence du Parc Lauriston (Rivière), projetée nov. 2026 → Urgence — 2
        - sortie 34 Claire DUMONT, 31 boulevard Richard Wallace 92800 Puteaux, Résidence Les Jardins de Wallace (Lemoine), AGO 15/11/2026 → AGO passée — 4
        - sortie 35 Julien FAURE, 5 rue Madeleine Michelis 92200 Neuilly-sur-Seine (Duval), projetée nov. 2026 → AGO passée — 0
        - sortie 36 Sarah BENOÎT, 63 rue de la Convention 75015 Paris, Résidence Convention (Rivière), AGO 10/12/2026 → À préparer — 0
        - sortie 37 Maxime GAUTHIER, 18 rue de Bezons 92400 Courbevoie (Lemoine), projetée déc. 2026 → À préparer — 3
        - sortie 38 Léa FONTAINE, 3 rue Voltaire 92800 Puteaux, Résidence Voltaire (Martel), AGO 20/03/2027 → En attente — 6 (PDF)
        - sortie 39 Hugo BARBIER, 40 avenue Charles de Gaulle 92200 Neuilly-sur-Seine (Duval), projetée mars 2027 → En attente — 0
        - sortie 40 Manon LACROIX, 11 rue de l’Abreuvoir 92400 Courbevoie, Résidence Les Acacias (Rivière) → Restitutions faites (restitution n° 4,
          263,90 € restitués / 36,10 € retenus, par enregistrerRestitution) — 4 (PDF)
      Défauts connus (les mails ne se modifient pas) : « l’assemblée générale ordinaire de Résidence Les Marronniers » (article manquant dans les
      réponses de syndic que j'ai rédigées) ; certaines AGO tombent un dimanche ; les annexes (lots 45, 112, 61) sont citées dans les mails
      mais ne sont pas créées comme biens annexes (l'aperçu des modèles ne cite que le lot principal).
      Retrait plus tard : mêmes gestes normaux que les jeux précédents (« Faire restitution », « Sortir du suivi », corbeille de la boîte Gestion).
    · SORT DE L'ANCIEN JEU (« _TEST JEU 20 POURCENT … », « _TEST CONVERSATION 20 POURCENT A/B ») : RIEN FAIT, question de choix pour Arno. Une
      ligne ne quitte l'écran que si ① une restitution est enregistrée (« Faire restitution » → elle reste visible dans « Restitutions faites ») ou
      ② une occupation de la sortie n'est plus « sortie » (« Annuler la sortie » : ne supprime rien, mais remet le faux locataire OCCUPANT du lot,
      visible ailleurs dans la Location). Aucun autre geste sans suppression. Brouillons 171-172 non touchés.
      Vérifié dans Chrome (localhost:3000, rechargement complet, ordinateur et 390 px, clair et sombre) : les 13 aux bonnes catégories, capsules =
      compteurs ; 3 mails relus en entier (syndic Moreau, propriétaire Girard, locataire Durand), aperçu du modèle « Syndic » sur Benoît, convocation
      PDF lisible dans la liseuse ; aucun « _TEST / JEU / essai / exemple » dans ces textes. Aucun brouillon. Captures `25-11-W-*`.
    · Demande d'Arno du 25/11, 22h06 (UN COMMIT PAR POINT ; le point 5 est commité AVANT le point 4, qui s'en sert) :
      `887aec04` (1) MONTANT DES 20 % : migration 516 (ajout seul, dernière ligne fait foi, origine calcule / saisi) ; calcul = 20 % du dépôt de garantie
      des conditions d'entrée (centimes, `gestion_location_conditions_entree`), arrondi au centime ; « Valider la sortie » : champ prérempli modifiable,
      obligatoire si case cochée, écrit après la sortie, dit au récapitulatif / résultat / journal du bien ; suit : détail de la ligne, fenêtre de
      restitution, « Restitutions faites », journal de la restitution ; sorties existantes : calcul à la lecture, sinon « Montant des 20 % à saisir » +
      saisie sur la ligne (action « montant-20-saisi »).
      `898e8043` (2) le détail encadré : Date de sortie / Exercice / Dernière AGO / Montant retenu (20 %), fond teinté (color-mix de l'encre du thème).
      `7fdc82f4` (3) onglet « Restitution des 20 % » des Paramètres Location (migration 517) : liste VIDE en recette (rien repris d'ADHOC / MONGA).
      `0fcd88d3` (5) modèles de mail (locataire, partenaire) : texte d'Arno ; NOM de famille tiré de « NOM Prénom » (mots en majuscules) ; civilité
      inconnue → « Madame, Monsieur » (les vraies fiches locataires n'ont presque jamais de civilité ni de prénom : 517 / 521 en « NOM Prénom » en recette).
      `b50ea980` (4) fenêtre « Faire restitution » (migration 518) : 20 % / restitué préremplis, différence, MOTIF obligatoire, cases locataires (cochées)
      et partenaires (décochées), un mail par destinataire via `/api/admin/gestion/envois` (marque `vingtPourcent`, modèles restitution_*), récapitulatif,
      l'attestation d'avant gardée, « Renvoyer » ; titre « Restitution faite — … » gardé ; l'ancien champ « Montant retenu au titre des charges » est
      remplacé par la différence + son motif. Vérifié sur BENOÎT Sarah (400 / 370 / « régularisation de charges »), RIEN confirmé ni envoyé.
      Données d'essai : civilité posée sur les 13 locataires « exemple-20 » (UPDATE de mes fiches d'essai) pour « Bonjour Madame BENOÎT ».
      ⚠️ Brouillon 173 (21:45, « nouveau », sans objet, a.jorel+syndic-duval@) : pas de mes vérifications (le seul module ouvert était sur BENOÎT,
      cabinet Rivière) — très probablement un essai d'Arno ; laissé tel quel. ⚠️ Écart de règle signalé : une commande `git stash list` a été lancée
      par erreur dans ce lot (lecture seule, sortie ignorée) — interdite par la consigne, à ne pas refaire. Captures `25-11-X*-*`.
    · Demande d'Arno du 25/11, 22h51 (UN COMMIT PAR POINT ; ordre des commits : 4, 2, 3, 1 — le point 3 sur l'ancienne carte, puis le point 1 la remplace) :
      `22ffbff6` (4) « Valider la sortie » : le champ « Montant des 20 % retenus (€) » sur toute la largeur de la colonne (le bloc s'étire, le champ perd la borne de
      22rem de `.pvs-champ input`) ; mesuré sur « _TEST PREAVIS VALIDE SORTIE NON VALIDEE » : 508 px = colonne à l'ordinateur, 354 px = colonne à 390 px. Rien validé.
      `c4fb2def` (2) mails de la fenêtre « Faire restitution » dans les échanges. CONSTAT : le chemin existait déjà (b50ea980 : marque vingtPourcent de la sortie,
      modèles restitution_locataire / restitution_partenaire admis par la 518 — contrainte vérifiée en recette —, noté par la route, classé sur le bien, « Ce mail +
      futurs échanges » : les réponses suivent le fil, comptées). CHANGÉ : le bandeau « Envoyé depuis cette page — Locataire — restitution du solde validée » /
      « … — Partenaire — restitution du solde validée » (avant « Restitution des 20 % — mail au locataire / au partenaire »). ⚠️ En recette, AUCUN mail n'est encore
      parti de cette fenêtre (aucune restitution validée par elle ; celle de LACROIX vient du jeu d'essai, son mail du 21/11 porte le modèle « locataire » du module,
      bandeau « Locataire — restitution du solde effectuée ») : vu par les TESTS seulement.
      `335c8e47` (3) « Restitutions faites » : « Restituée le » retirée (doublon, accord d'Arno), remplacée par « 20 % retenus à la sortie » (toujours dite, « non
      renseigné » sans montant) ; la date sous « Restitution validée le » ; « Retenu au titre des charges » → « Montant retenu », suivi de « Motif » (avant « Motif de la
      différence »). 🔴 COMMENTAIRE DU JEU D'ESSAI LAISSÉ : « Virement effectué le 21/11/2026 » (restitution 4, LACROIX) — la table des restitutions est en ajout seul
      (513, tout UPDATE refusé par déclencheur) ; seule voie sans lever le verrou : « Annuler » puis refaire la restitution sans commentaire (non fait, à décider).
      `adcdc858` (1) « Restitutions faites » au format des catégories : bloc de trois lignes repliable (adresse / NOM Prénom / « Restitution validée le … — … restitués » ;
      capsule AGO, « N mails échangés », « Fiche copropriété » — ajouté sur ces lignes) ; déplié : encadré habituel (Copropriété si utile, Date de sortie, Exercice,
      Dernière AGO, 20 % retenus à la sortie), coordonnées, encadré « Restitution » (validée le, restitué, retenu, motif, enregistrée par, commentaire s'il existe),
      « Échanges (N) » en lecture, « Annuler » (même confirmation, même geste). Lecture : la sortie de chaque restitution relue comme une ligne (`RestitutionFaite.ligne`),
      hors catégories, hors « Dates manquantes », hors pastilles.
      ⚠️ CONSTAT : « 20 % retenus à la sortie » = « non renseigné » pour LACROIX et « _TEST JEU 20 POURCENT Restitution faite » (ni dépôt dans les conditions d'entrée,
      ni montant 516) ; rien n'est déduit des autres montants. Captures `25-11-Y4-*` (sortie), `25-11-Y3-*` (point 3), `25-11-Y1-*` (point 1, replié / déplié).
    · Demandes d'Arno du 25/11, 23h12 / 23h13 / 23h15 (UN COMMIT PAR POINT) :
      `a3c73098` (1) 🔴 PANNE BLOQUANTE « je n'arrive pas à valider une sortie de locataire ; j'ai bien instruit le champ des 20 % mais […] il n'en tient pas compte ».
      Reproduite au Chrome (préavis de test, dépôt inconnu, « 1200 » tapé → « Saisissez le montant des 20 % retenus… »). CAUSE : la route /api/admin/location recopiait
      le corps champ par champ dans la demande de validation et 887aec04 n'y avait jamais ajouté `montantVingt` (le serveur le recevait vide) ; MÊME PANNE pour
      `phraseProprietaire` (fc7830e2 : le texte modifié des propriétaires était perdu, le calculé partait). 22ffbff6 hors de cause (style seul). Correctif : la demande
      est construite par `demandeValidationDuCorps` (validationSortieRepo.ts) + GARDE (chaque champ du type DemandeValidation doit en sortir) ; règle pure partagée
      fenêtre / serveur `verifierMontantVingt` (« 1200 », « 1200,00 », « 1 200,50 », « 1200.5 », « 1 200 € » ; vide / nul / négatif / illisible : motif dédié) ; refus SOUS
      le champ, champ centré à l'écran et focalisé. Les tests de la fenêtre (PreavisAccueil.test.tsx) ont désormais un dépôt connu par défaut (`DEPOT_CONNU`).
      `3ba3ad33` (2) date d'arrêté en toutes lettres À L'ÉCRAN (`arreteEnLettres` : « 1er MARS », « 30 JUIN », « 31 DÉCEMBRE », accents) : composant ArreteComptes (fenêtre
      de sortie, fiche Copropriété), récapitulatif, message vert de la fiche ; insécable entre jour et mois. GARDÉS en chiffres : journal, data-arrete-valeur, dates avec
      année, et les MAILS (restitution partenaire « 1er mars » ; bloc « Retenue de 20 % » du mail partenaires de la sortie « 31/12 »).
      `2a702d3b` (3) « Date de sortie effective » PROPOSÉE (bord orange, « Date proposée — à valider ») ; « Valider cette date » à droite → « ✓ Date validée » (vert) ;
      modifier la date fait tomber la validation ; récapitulatif et confirmation refusés sans validation (« Validez la date de sortie (bouton à droite) avant de
      continuer. » sous le champ) ; 390 px : bouton sous le champ, pleine largeur. Seule la fenêtre « Valider la sortie » préremplit cette date (sortie unique ou groupée) ;
      « Déclarer la sortie » et « Enregistrer un départ » partent vides, inchangés. Refus sous les champs en rouge.
      Captures `.captures/sortie-montant/` (01 avant, 02-03 montant, 04-06 arrêté, 07-10 date).
    · Demande d'Arno du 25/11, 23h42 (UN commit) — `ba382337` : fenêtre « Faire restitution » : « Commentaire (facultatif) » → « Note interne (facultatif) — non envoyée
      aux tiers » + aide « Visible uniquement dans le détail de la restitution (catégorie « Restitutions faites ») et dans l'historique du bien. » ; « Date de restitution * »
      → « Date de validation de la restitution * » (et ses refus) ; « Restitutions faites » : « COMMENTAIRE » → « NOTE INTERNE ». CONSTAT : la note est enregistrée avec la
      restitution, lue dans « Restitutions faites » et au journal (locataires + bien, historique de la fiche du bien) ; AUCUN mail ne la reçoit. ÉCART CORRIGÉ : « Date de
      validation : … » du mail au partenaire prenait la date du JOUR, elle prend la date SAISIE (✅ accepté par Arno). Captures `.captures/restitution-note/`.
    · Demandes d'Arno du 25/11, 23h52 (un commit par point) :
      `aee3c35b` (1) PANNE DE LA RECHERCHE — reproduite (adresse …&vingtMail=35, FAURE Julien) : à « l », la ligne 35 réapparaissait, rouvrait son module d'écriture et
      prenait le curseur. CAUSE : le n° vingtMail (posé par « Envoyer un mail » depuis la Location) restait en mémoire et dans l'adresse ; chaque réapparition de la
      ligne le relisait. CORRECTIF : le n° sert UNE fois (`consommerMailInitial`), puis il est oublié et retiré de l'adresse (replaceState) ; ligne introuvable : oublié
      aussi. Frappe, effacement, croix, rechargement n'ouvrent plus rien ; champ vide = catégories fermées. Un brouillon commencé dans le module est enregistré par
      Redaction (Brouillons de la Gestion) mais n'est pas rouvert sur la ligne.
      `d5de05b4` (2) GARDE `restitutionVirementTexte.test.ts` (aucun texte du code n'affirme un virement effectué ; seule « la demande de virement a été transmise à notre
      service comptabilité ») + RECETTE : restitutions d'essai 4 (LACROIX, « Virement effectué le 21/11/2026 ») et 3 (_TEST JEU, « Virement _TEST (jeu d'essai) »)
      ANNULÉES (5, 7) puis REFAITES par la fenêtre (6, 8) : date 21/11/2026, mêmes montants, motif « Retenue au titre de la régularisation des charges » (exigé par la
      fenêtre), SANS note, toutes cases décochées ; montants 20 % enregistrés (280 / 320, « saisi ») ; AUCUN envoi (83 / file 33 / mails module 38 inchangés). Les
      lignes de journal du 25/11 « Virement … » restent (journal en ajout seul). Scripts de jeu d'essai (.captures) corrigés.
      SIGNALÉS, non modifiés : modèle « Locataire — restitution du solde effectuée » (« nous vous confirmons la restitution du solde le … ») ; mails d'essai déjà
      envoyés avec ce modèle et réponse d'essai « j'ai bien reçu le virement » (historique inaltérable) ; « Enregistrée par » de « Restitutions faites » affiche
      l'adresse e-mail du compte (pas « Prénom NOM ») → ✅ corrigé le 26/11 (`d1d501cd`). Captures `.captures/recherche-vingt/`.
    · Correction validée par Arno le 26/11 — `d1d501cd` : « Enregistrée par » de « Restitutions faites » = « Arnaud JOREL, le 26/11/2026 à 00h02 » (compte lu par
      saisie_par, sinon par l'identifiant écrit en libellé ; introuvable : le libellé, adresse mail en dernier recours ; rien réécrit en base). Historique de la fiche
      du bien : déjà « Arnaud Jorel » (par auteur_id), rien changé. CONSTAT : la trace de la fiche du LOCATAIRE ne liste pas les restitutions (journal du dossier,
      non lu par `historiqueFiche('locataire')`) — signalé → ✅ décidé et fait le 26/11 (`c7ed7867`). Captures `.captures/enregistree-par/`.
    · Décision d'Arno du 26/11 — `c7ed7867` : les restitutions dans l'historique de la fiche du LOCATAIRE (ModaleFicheLocataire › BlocTraceFiche). CAUSE : lignes
      du dossier (entité « annuaire ») écrites sans « sujet » et sans verrou de champ → écartées par le filtre. `historiqueFiche('locataire')` ajoute les actions
      location_restitution_20_faite / _annulee (même journal que le bien, rien copié) ; montants lus sur la restitution nommée (`restitutionHistorique.ts`, pur).
      Rendu : « Restitution des 20 % validée le … — X restitués sur Y retenus (différence Z : motif) » + « par Prénom NOM, le … à HHhMM » + « Annulée le … par … »
      dessous ; ligne d'annulation à sa place (texte du bien). INCHANGÉS : autres lignes, historique du bien, filtreFiche (conflit), « Dernière modification ».
      Vu par un banc (vrai composant monté dans une page de la recette, données réelles) : LACROIX n'est dans aucune ligne de « Suivi du mois ». Captures
      `.captures/historique-locataire/`.
    · `418e54e6` — 513 et 514 inscrites au registre de la recette (voir « Migrations »).
    · `ed1b0b45` — « depuis Gestion › Copropriétés, « _TEST ARRETE COMPTES 20 POURCENT 2 » ouvre une fiche vide » : CAUSE = données d'essai
      mal formées (le NOM écrit dans `libelle`, qui porte l'immeuble dont `cle_immeuble` est la forme normalisée ; la liste ouvre la fiche par
      ce texte). Corrigé en RECETTE pour les 9 copropriétés d'essai (310-312, 335-340 : `nom` ← nom, `libelle` ← immeuble ;
      `.captures/vingt-pourcent/correction-libelle-coproprietes-essai.sql`) et dans le script de création des données « _TEST 20 POURCENT
      CATEGORIES ». Aucun code modifié ; épreuve de forme dans `coproprieteRepo.test.ts`. Conséquence : l'écran « 20 % » affiche pour elles
      l'adresse de l'immeuble comme nom de copropriété (il lit `libelle`, comme pour les vraies copropriétés).
    · Captures 147-151.
  - Captures : `.captures/vingt-pourcent/` (40-49). Fiches ouvertes et saisies faites puis abandonnées (« Fermer » / « Annuler ») : aucune AG,
    aucune copropriété, aucune sortie, aucun mail écrits (vérifié en base).
- **Données d'essai en recette** (23/11, suite) : « _TEST SORTIE CREATION COPRO » — bien 467 (64 avenue des Bergères, Puteaux — VRAIE
  adresse officielle, choisie libre de tout bien et de toute copropriété en recette), locataire, occupation 574, préavis 23 en cours ;
  copropriété **313** créée par la fiche depuis la sortie (nom « _TEST SORTIE CREATION COPRO », alerte de parcelle vue, arrêté 31/12 saisi
  depuis la sortie, journal 46823) ; biens 468 (préavis 24 en cours, sans copropriété) et 469 (sortie validée avec 20 % le 05/11/2026, sans
  copropriété). Aucune sortie validée pendant les essais, aucun mail.
- **Données d'essai en recette** (23/11) : « _TEST ARRETE COMPTES 20 POURCENT 1 / 2 / 3 » — copropriétés 310 / 311 / 312, biens 464-466,
  locataires 1-3, occupations 571-573 (sorties validées avec 20 %) ; 310 : AGO 25/03/2026 + arrêté 31/12 saisi à l'écran (journal 46821) ;
  311 : ni AGO ni arrêté ; 312 : AGO 22/09/2020, sans arrêté (restitution en retard). Pastille de l'accueil Location : 2.
- **Données d'essai en recette** (21/11) : « _TEST PREAVIS GROUPE » (bien 463, code postal 00000, colocataires A / B =
  locataires 542 / 543, occupations 569 / 570, bail 552) ; préavis d'essai 17 → 22 tous annulés ou remplacés (journal
  46811-46820), aucun ouvert. Compte d'essai de recette `essai.preavis@exemple.test` (id 10) : DÉSACTIVÉ.
- **Données d'essai en recette** (20/11) : syndics 49 « _TEST SYNDIC CONTACTS » (contacts 81-86), 50 « … BIS », 51
  « _TEST SYNDIC CREE DEPUIS COPRO », 52 « _TEST SYNDIC APRES RETRAIT » ; copropriété 297 « 12 rue _TEST Syndic Contacts »
  (rattachée au 49, sans contact) ; syndic 53 et compromis 342 « _TEST ADRESSE 510 » (vendeur 3, acquéreur 4) ;
  « _TEST PREAVIS VALIDE SORTIE NON VALIDEE » (locataire 539, bien 460, occupation 566,
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
  ⏩ **Levé le 20/11 au soir** : les deux commits sont en production (`351f04de`).
- 🔴 **Arno doit retirer ces deux dates de sortie dans WIPPIMMO** (INEO RAIL 02/11/2026, EMMAIMA Fathi 30/11/2026).
- Les 6 locataires réellement partis (ROUSSEL, FAUGERE, POYET, JONQUEUR, POUPOT, PLACE et MUNEKATA) : laissés « anciens ».

**Points ouverts / à valider par Arno :**
- ✅ Restitution 4 (LACROIX, jeu d'essai) : commentaire « Virement effectué le 21/11/2026 » LAISSÉ tel quel (décision d'Arno du 25/11, 23h12 : ni annulation, ni nouvelle restitution).
- « 20 % retenus à la sortie » = « non renseigné » pour les restitutions d'essai (aucun dépôt ni montant saisi) ; aucune saisie proposée dans « Restitutions faites ».
- 🔴 **AG « à venir » dans la fiche Copropriété** : interprétation de « sa date est fixée par convocation » (voir `79ff9020`) — à confirmer.
- Écran Copropriétés de la Gestion : la ligne « _TEST ARRETE COMPTES 20 POURCENT 1 » (copropriété 310, libellé ≠ clé d'immeuble des données
  d'essai) ouvre « Ce bien n'a ni immeuble ni adresse : aucune fiche copropriété possible. » ; la même fiche s'ouvre bien depuis le bien 464.
  Non touché (lecture de la fiche inchangée) : données d'essai ou défaut d'ouverture par libellé, à regarder si Arno le souhaite.
- Fiche Copropriété nouvelle : un « regroupement » proposé (« Même syndic ») avec un arrêté ou des AG en attente est REFUSÉ (message clair) :
  le regroupement ne les reprend pas.
- Fenêtre de sortie : la copropriété rattachée s'affiche par son LIBELLÉ (« 64 Avenue des Bergères ») et non par son NOM saisi dans la fiche
  (« _TEST SORTIE CREATION COPRO ») — la lecture commune `coproprieteDeCle` ne lit que le libellé ; à aligner si Arno le souhaite (touche
  aussi les blocs AG des fiches).
- Un « Rattacher » choisi par case dans la fenêtre de sortie ne s'applique qu'à la confirmation : l'arrêté de cette copropriété ne peut donc
  se saisir qu'après (ou par « Créer une copropriété » / la fiche).
- 🔴 **20 % — restitution jamais marquée « faite »** : aucun geste ne dit qu'une restitution des 20 % a été faite ; toutes les sorties avec
  retenue restent dans « 20 % à restituer » (et leurs copropriétés dans « Dates manquantes »). Proposition : un geste « Restitution faite »
  (date, montant restitué / ajusté, journalisé) qui sort le locataire de la liste — à décider.
- 20 % — l'arrêté des comptes dans la fenêtre « Valider la sortie » est vérifié par les tests seulement (aucune sortie à valider dans la
  recette) ; à regarder à l'écran à la prochaine sortie validée avec 20 %.
- 🔴 **Préavis groupé — colocataire arrivé plus tard (QUESTION OUVERTE)** : un « bail » = occupants d'un même logement entrés le
  même jour (`bail_id`). Un colocataire entré à une autre date (avenant) est sur un AUTRE bail : il n'a pas de carte sur l'écran
  de sortie et ne peut pas être joint au préavis groupé (il n'apparaît que dans « le logement reste loué à … »). En recette :
  aucun logement dans ce cas (un seul logement à 2 occupants séparés). Proposition à décider : un groupe « Autres occupants du
  logement (autre bail) », sélectionnables.
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

### ✅ MISE EN PRODUCTION DU 26/11/2026 — RÉUSSIE (Arno, 08h09 : « on va pousser toutes les évolutions en production »)
- **PRODUCTION = `1d4d8e87`** (« MISE À JOUR RÉUSSIE — 1d4d8e87 en service », 09:15:21 ; `.captures/maj/appliquer-2026-11-26.txt`). Avant :
  `351f04de` (20/11). **Migrations 512 → 518 appliquées et inscrites 7/7** : registre de production à **518** (516 lignes dont 4 écartées).
  Pas de 511 (trou sans effet : le garde ne refuse qu'une migration numérotée SOUS la dernière appliquée). **La 361 en attente prendra la 519** (→ **521**, décision d'Arno du 26/11/2026)
  (elle reste dans `db/migrations-en-attente/`, elle n'est PAS partie). Aucune variable d'environnement ni unité systemd nouvelle.
- **5-verifier.sh : « ÉTAPE E RÉUSSIE »** — pages 200, aucune erreur au journal, services actifs, liste « Restitution des 20 % » (517) **vide**,
  **aucune ligne d'alerte encore** dans `gestion_location_alerte_vingt` au moment de la vérification.
- **Sauvegardes** : sauvegarde du jour `/home/ubuntu/sauvegardes/2026-11-26_0823` (TERMINEE, base lisible 4 002 objets, minio.tar, reglages.tgz) ;
  plus les sauvegardes propres à l'outil dans `/home/ubuntu/sauvegardes-maj/` (une par essai / application). Retour arrière possible vers
  `351f04de` par `.captures/maj/6-retour-arriere.sh` (code seulement ; la base ne se restaure que sur décision d'Arno).
- **À surveiller** : l'alerte « [Alerte] 20 % à restituer en retard — N locataires » part de la minuterie du serveur web (toutes les 5 min, à partir
  de 8 h, tous les 2 jours) vers **gestion@criterimmo.fr** dès qu'au moins un locataire est en « Alerte restitution en retard » (sur la copie
  d'essai : 10 locataires). Relire le journal : `bash .captures/maj/5-verifier.sh` (partie 4, lecture seule). Montant des 20 % : calculé à la
  lecture si le dépôt de garantie du bail est connu, sinon « Montant des 20 % à saisir » (40/40 en recette).
- **Épreuve préalable sur copie (26/11, ~08h15)** : recette restaurée sur un PostgreSQL JETABLE (port 5433), ramenée à l'état 510, puis
  `migrations-plan.ts` + boucle d'application de `serveur.sh` : 7 NOUVELLE, aucun REFUS, 2e passe sans erreur, plan vide, schéma identique à la
  recette ; `/admin/login` et « 20 % à restituer » en 200. Tout supprimé ensuite. Journaux : `.captures/maj/essai-copie-2026-11-26/`.
- 🔴 **1er essai REFUSÉ (08h50, étape 3 « next build en échec »), production restée sur `351f04de`.** Vraie erreur : **« JavaScript heap out of
  memory » pendant « Running TypeScript »**, puis « Failed to type check » — Node 24 plafonne le tas à ~4 Go par défaut, et la vérification des types
  de `next build` en demande désormais davantage (4,5 Go mesurés au plus haut). L'avertissement turbopack sur `dilaIngest.ts:225` (« Dynamic
  filesystem access ») n'est QU'UN avertissement. **Correctif `1d4d8e87`** : `package.json` → `"build": "NODE_OPTIONS=--max-old-space-size=8192 next
  build"` (le serveur a 62 Go et lance `npm run build`) ; la vérification des types est GARDÉE (pas de `typescript.ignoreBuildErrors`). Échec
  reproduit sur un clone propre de `fbf1d5f3` (npm ci + npm run build), build réussi sur un clone neuf de `1d4d8e87` ; `npm test` complet vert
  (1 877 fichiers, 28 165 tests, 21 ignorés ; `.captures/maj-build-26-11/`). Journal refusé : `.captures/maj/essai-2026-11-26-refuse-fbf1d5f3.txt`.
- 🔴 **FAUTE DE L'AGENT (à ne pas refaire)** : le 26/11 au matin, le build de l'épreuve sur copie avait D'ABORD échoué exactement de la même façon
  (manque de mémoire à « Running TypeScript ») ; l'agent l'avait relancé avec `NODE_OPTIONS=--max-old-space-size=8192` et avait annoncé « build
  réussi » **sans signaler** que le serveur, lui, construirait avec le plafond par défaut. D'où l'essai refusé et une boucle de correction évitable.
  **Règle** : une épreuve « comme en prod » se fait SANS aucun réglage que la prod n'a pas (pas de NODE_OPTIONS, clone propre, `npm ci`,
  `npm run build`) ; tout contournement nécessaire est un DÉFAUT à corriger dans le dépôt et à signaler, jamais un détail d'exécution.
- **Scripts `.captures/maj/`** (ignorés par git ; versions du 20/11 dans `.captures/maj/avant-2026-11-26/`) : 1 → 4 visent `1d4d8e87` ; 5-verifier.sh
  n'exige plus de HEAD (registre 516 / 4, 518 inscrite par `1d4d8e87`, ni 519 ni 361, version en service, alerte et liste 517 en lecture seule via
  `lecture-alerte-vingt.sql`) ; 6-retour-arriere.sh affiche la sauvegarde du jour et propose `351f04de`. Pour la PROCHAINE mise en production :
  remettre le hash cible et les numéros de migrations dans 1 → 5.

### 26/11/2026 — « Dates / copropriétés manquantes » = le classement (`fc4f3098`, décision d'Arno du 26/11/2026) — NON POUSSÉ
- **La règle** : le bloc ne montre plus que les locataires classés « manquantes » (`categorieVingt` : AUCUNE AGO officielle connue — bien sans
  copropriété, ou copropriété sans AGO officielle). L'arrêté des comptes ne joue PAS sur le classement. Construit sur les groupes de
  `classerVingtPourcent` ; `datesManquantesVisibles` suit la même règle. **Compteur du bloc = locataires** (`nombreSansDate`, colocataires un par un).
- **Aucun doublon** : une copropriété à qui ne manque que l'arrêté n'a plus de bloc ; ses locataires restent dans leur catégorie avec « date
  provisoire — arrêté manquant » et « Fiche copropriété » (déjà présents partout, SAUF quand « AGO à confirmer » occupait la ligne : la mention
  s'ajoute désormais dessous — cas de « _TEST ARRETE COMPTES 20 POURCENT Locataire 3 », en « Alerte restitution en retard » seulement).
- **Pastille des boutons de raccourci** (accueil Location + colonne de gauche de la Gestion, même hook) : 3e terme = locataires sans date (et non
  plus les copropriétés à compléter) → total = Alerte + Urgence + Dates / copropriétés manquantes, en locataires. Détail : « N locataires sans date
  d'AGO (copropriété à compléter) ». `nombreCoproprietesACompleter` existe toujours (plus lu par les boutons).
- Recette : bloc 7 (avant 8 copropriétés), bouton 18 = 6 + 5 + 7. Chrome ordinateur et 390 px, clair et sombre, 0 écriture ; `npm test` vert
  (1 877 / 28 168) ; captures `.captures/vingt-manquantes-bloc/`. ⚠️ Preuve curl à faire par Arno (vérifiée par l'agent via node : 200, 0 erreur).
- ⚠️ **Défaut PRÉEXISTANT constaté, non corrigé** (hors lot) : à l'ordinateur, sur 18 lignes sur 31, l'étiquette « AGO … (projetée/officielle) » et
  les mentions orange débordent sur le bouton « Fiche copropriété » (colonne de l'AGO ~240 px, étiquette jusqu'à 263 px, `max-width:60%` de
  `.vgp-ligne-droite`). Au téléphone, rien ne déborde. À corriger dans un lot dédié si Arno le souhaite.

### 26/11/2026, 11h36 — deux points d'Arno (NON POUSSÉS)
- **`51c69a00` — Gestion › Syndics sans le bloc d'en-tête** (retrait accordé pour CET écran) : `sansBlocSyndics`, même mécanisme que Copropriétés
  et « 20 % à restituer » (aux quatre mêmes endroits de `GestionVue.tsx`). La page commence par « ← Boîte · Syndics (N) · + Ajouter un syndic ».
  Les tests qui prenaient Syndics comme exemple d'écran AVEC bloc prennent « Adresses à vérifier ». **État relevé dans Chrome (recette, 26/11)** :
  titre « Gestion » + cadre de relève et ses boutons ENCORE affichés sur **À rattacher** (`a_trier` : Relever maintenant, Rafraîchir, Annuaire),
  **Historique** (hors fiche personne) et **Adresses à vérifier** (les quatre boutons) ; titre « Gestion » seul sur l'**écran partagé** ; rien sur
  Événements, Annuaire, Tâches, Préavis, Copropriétés, 20 %, Syndics. La boîte (accueil et `?ecran=boite`) n'a plus ce bandeau depuis les lots
  ERGO-BOITE / ACCUEIL-GESTION (fonctions dans la colonne et le bouton rond « Relever et actualiser » de la liste) — inchangée par ce lot. ⚠️ Constaté
  sans le corriger : en navigateur automatisé, la liste de la boîte reste parfois sur « Chargement de la boîte… » (requêtes `/boite/comptes`,
  `/empreinte` sans réponse) ; l'entrée « À rattacher » n'apparaît pas dans la colonne de la boîte (à faire regarder par Arno dans son navigateur).
- **`1c6f1c06` — « 20 % à restituer » : plus de chevauchement à l'ordinateur** : droite plafonnée à `calc(100% - 8.5rem - 52px)` (plus de 60 %),
  gauche cède d'abord (min 8,5 rem), colonne AGO min 9,5 rem, étiquette et mentions passent à la ligne (sans points de suspension), boutons fixes,
  tête de ligne `min-height:92px`. Mesuré sur 31 lignes : 0 chevauchement ; 1 280 px toutes à 92 px ; 1 024 px l'étiquette passe à la ligne ;
  390 px inchangé. Captures `.captures/syndics-sans-en-tete/` et `.captures/vingt-chevauchement/` ; `npm test` vert (1 878 / 28 176).
  ⚠️ Preuve curl à faire par Arno (vérifiée par l'agent via node : 200, 0 erreur).

### 26/11/2026, 11h58 — fenêtre « Copropriété » : trois points d'Arno (NON POUSSÉS, aucune migration)
- **« À vérifier »** = l'adresse rattachée n'est pas (encore) reconnue AVEC CERTITUDE comme adresse de la Base Adresse Nationale (rattachée à
  l'instant : le rapprochement `officielleDeLaCopropriete` ne se calcule qu'à l'ouverture, sur les adresses ENREGISTRÉES ; ou rapprochement hésitant).
  Affichage seulement : ne bloque ni digicodes ni enregistrement.
- **`20022366` (point 1)** : « à vérifier » = bouton → examen en lecture seule (action `adresse-examiner` : adresse écrite, officielle + motif, parcelle,
  position, « Voir sur la carte » OpenStreetMap) ; « Confirmer cette adresse » (part avec « Valider », journal `adresse_confirmee`, relue par
  `adressesConfirmees` tant que l'adresse reste rattachée) ; « Retirer de la copropriété » = le « × » (qui reste) ; tout retrait d'adresse journalisé
  (`adresse_retiree`) ; « Historique des adresses (N) » fermé dans le bloc Adresses. Modules `adresseCoproExamen.ts` (base) et
  `adresseCoproExamenModele.ts` (pur, importé par l'écran).
- **`dd2aa115` (point 2)** : cause — les blocs DIGICODES venaient de la seule fiche ENREGISTRÉE, et le serveur refusait le digicode d'une adresse ajoutée
  dans le même « Valider ». Correctif : `digicodesDesAdresses` (un bloc par adresse de la saisie, ordre ADRESSES, dès le rattachement) ; serveur :
  digicode d'une adresse rattachée dans ce « Valider » accepté et écrit à son adresse, règle « chaque adresse se numérote pour elle » sur les adresses
  de la saisie.
- **`9bac0ec1` (point 3)** : « Adresses proposées sur la même parcelle (N) ▸ / ▾ » repliable (ouvert sans adresse rattachée, replié dès une ; « Une autre
  adresse » toujours visible).
- **Reproduction en recette (données d'essai LAISSÉES)** : bien `app-test-copro-digicodes` (id 504, 137 rue Gérhard, Puteaux, inséré en recette) →
  copropriété « _TEST Copro Digicodes » avec 17 rue Voltaire, 19 passage Voltaire, 35 rue Gérhard (proposées, aucune portée par un vrai bien) et
  129 rue Gérhard (manuelle) ; digicodes 1371 / 1701 (+ cages A17, B17) / 1901 / 3501 / 1291. Après « Valider », fermeture, réouverture : tout
  conservé, plus aucun « à vérifier », historique des adresses (5). Note : la parcelle des propositions est celle de l'application (12 adresses), pas
  seulement celle de la BAN. Captures `.captures/copro-digicodes/` ; `npm test` vert (1 879 / 28 192). ⚠️ Preuve curl à faire par Arno (agent via
  node : 200, 0 erreur).

### 26/11/2026, 12h23 — fenêtre « Copropriété » : deux points d'Arno (NON POUSSÉS, aucune migration)
- **`1fe5c7c7` — rattachement en deux temps** : une adresse ajoutée est « en attente de validation » (retirable par « × », PAS de bloc digicode —
  dd2aa115 adapté : le bloc vient à la validation) ; « Valider le rattachement des adresses à cette copropriété (N) » (pleine largeur) enregistre
  IMMÉDIATEMENT les seules adresses (fiche créée si besoin avec ce que sa création emporte ; nom enregistré, ni contacts ni digicodes ni syndic) ;
  ensuite un bloc DIGICODES par adresse validée, propositions repliées. Filet : le « Valider » du bas enregistre aussi les adresses en attente ;
  fermer (bouton, « × », Échap) avec des adresses en attente pose la question « N adresses rattachées non validées seront perdues. ».
  « à vérifier » reste distinct.
- **`9907f0b4` — MAJUSCULES** : `majusculesBatiment` (fr-FR, accents gardés) dans `libelleBatiment` (Gestion/Location ; le Permis a sa propre
  fonction, non touchée), le champ commun (saisie + encadré), le menu, les lectures (digicodes, registre), la saisie serveur (fiche Copropriété,
  `verifierComplements` du bien). Clé inchangée (« a » = « A »). Aucune réécriture en masse.
- ⚠️ **QUESTION OUVERTE pour Arno** : la règle existante « Bât. B » = « bâtiment b » = « B » est GARDÉE — « bat a » s'écrit « BAT A » pendant la
  saisie mais s'enregistre « A » (la lettre A) ; « cage b » → « CAGE B ». Arno attendait « BAT A » : changer l'équivalence (garder le mot « BAT »)
  serait une décision métier (A et « BAT A » deviendraient deux bâtiments différents).
- Recette : « _TEST Copro Digicodes » — 4 adresses de plus (19 rue Voltaire, 39 et 43 bis rue Gérhard, 1 rue Léon et Robert Morane, aucune portée par
  un vrai bien), 9 blocs ; « A » (A19) et « CAGE B » (B19) sur le 19 rue Voltaire. Captures `.captures/copro-rattachement/` ; `npm test` vert
  (1 879 / 28 200). ⚠️ Preuve curl à faire par Arno (agent via node : 200, 0 erreur).

- ✅ **Décision d'Arno (26/11/2026)** : on GARDE « bat a » = « Bât. A » = « A » (enregistré « A »), pour éviter les doublons de bâtiments.

### 26/11/2026, 12h50 — fenêtre « Copropriété » : deux points d'Arno (NON POUSSÉS, aucune migration)
- **`aeb97ec7` — « Retirer cette adresse »** sur chaque bloc DIGICODES (prop `onRetirerAdresse` du composant partagé, fiche Copropriété seulement) :
  fenêtre (adresse, digicodes / bâtiments qui partent avec elle, biens et conséquence), « Oui, retirer cette adresse » / « Annuler » ; immédiat
  (`retirerAdresseCopro`, une transaction : retire_le, regroupement prévenu, syndic retiré des biens, journal « adresse_retiree » complet). Le « × »
  d'une adresse enregistrée ouvre la même fenêtre. Principale non retirable (« Choisissez d'abord une autre adresse principale »). **Nouveau :
  « Définir comme adresse principale »** (`definirAdressePrincipale` : la secondaire devient la principale — clé, libellé, CP, commune, ban_id de
  `gestion_copropriete` —, l'ancienne principale devient une adresse ; AG et contacts lus par l'id de la copropriété ; refus écriture d'origine /
  regroupement ; journal « adresse_principale_changee »). Bâtiments du registre d'une adresse retirée : plus proposés (rien d'effacé).
- **`32761a3a` — exclusivité d'une adresse** : `cleComparable` (bis/ter/quater, casse, accents) + CP compatible + ban_id ; contrôle au rattachement
  (action `adresse-conflit`, y compris « Rattacher » sur une adresse « déjà rattachée à une autre copropriété ») et à l'enregistrement (avant + DANS
  la transaction, `deplacementsConfirmes`) ; fenêtre Oui / Non ; Oui = `deplacerAdresse` (retire_le chez l'autre, regroupement, syndic retiré des biens,
  bâtiments copiés au registre, journaux « adresse_cedee » / « adresse_reprise ») ; principale de l'autre : refus.
- ⚠️ **Doublons** : AUCUN en recette. Requête LECTURE SEULE pour la production : `.captures/copro-exclusivite/doublons-lecture-seule.sql`
  (`PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -X -f …`). **Contrainte en base NON posée** (état de la prod inconnu) : contrôle
  serveur seulement ; l'index unique `gestion_copropriete_adresse_en_cours` (adresses secondaires) existe déjà ; manque le croisement principale ↔
  secondaire (déclencheur, migration 520) — à décider après la vérification de la prod. Limite connue : la clé d'unicité en base (`cle_immeuble`)
  ignore le code postal.
- Recette : « _TEST Copro Digicodes » (137 rue Gérhard, bien 504) et « _TEST Copro Rattachement » (5 rue Gérhard, bien 505, créée) — le 129 rue Gérhard
  est passé à Rattachement (code 1291 suivi) ; « 1 rue Léon et Robert Morane » retirée. Captures `.captures/copro-retrait/`, `.captures/copro-exclusivite/` ;
  `npm test` vert (1 882 / 28 222). ⚠️ Preuve curl à faire par Arno (agent via node : 200, 0 erreur).

### 26/11/2026, 13h27 et 13h30 — fenêtre « Copropriété » : sélection multiple et tri (NON POUSSÉS, aucune migration)
- **`114c86e4` — sélection multiple** : « Adresses proposées sur la même parcelle (N) » OUVERT par défaut, plus de repli automatique (repli d'un clic
  conservé) ; une case à cocher par proposition (toute la ligne, `data-fcp-proposition`), à la place de « Rattacher » : cocher = « en attente de
  validation » dans ADRESSES (conflit d'exclusivité dès la coche ; sans numéro : la confirmation d'avant) ; décocher = elle en sort ; une validée
  n'est plus proposée. Le « × » d'une adresse en attente décoche sa case. Le bouton « Valider le rattachement… (N) » est DANS la liste ADRESSES
  (`data-fcp-valider-rattachement-ligne`), juste sous les adresses en attente ; validation de 1fe5c7c7 inchangée.
- **`3583a9f4` — tri** : `app/lib/gestion/ordreAdresses.ts` (`trierAdresses`, fonction UNIQUE) : rue (alphabétique, casse et accents ignorés), numéro
  en nombre, indice après son numéro, « 12-28 » à 12, sans numéro en fin de rue ; principale en tête. Appliqué à l'affichage (ADRESSES : validées
  puis en attente ; blocs DIGICODES ; propositions) — l'ordre de la saisie ne change pas.
- Vérifié en LECTURE SEULE sur la copropriété du 34 rue Baudin (aucune écriture) ; captures `.captures/copro-selection/` ; `npm test` vert
  (1 883 / 28 230 ; flake connu `PreavisAccueil.test.tsx` vu une fois, vert au 2e passage complet).

### 26/11/2026, 14h06 — ADRESSES : une seule présentation de ligne (NON POUSSÉ, aucune migration)
- **`29b26f1b`** : chaque adresse (principale, validées, en attente, adresses de biens) = `li.fcp-adr` > `.fcp-adr-ligne` [texte] [état] [actions]
  [`.fcp-adr-retrait`], colonnes alignées par `subgrid` ; 390 px (requête de conteneur ≤ 620 px) : adresse + « × » en haut, état et actions dessous.
  États `ETAT_ADRESSE` (principale / ✓ Vérifiée vert / À vérifier orange / Nouvelle bleu `--color-svv-blue`). « Vérifier » partout (`data-fcp-verifier`) ;
  la principale se confirme aussi (journal « Adresse principale confirmée ») ; une re-confirmation est journalisée (« confirmée de nouveau »).
  ⚠️ Changement de geste à connaître : le « × » d'une adresse EN ATTENTE retire tout de suite (avant : petite question « Oui / Non » au milieu de la
  ligne) ; celui d'une adresse validée ouvre toujours la fenêtre de aeb97ec7.
- Vérifié en lecture seule sur le 30 rue Baudin (n° 373 ; Arno en a fait l'adresse principale à 13h59 et y a ajouté 32, 36, 38). Ses six adresses
  sont vérifiées : « À vérifier » montré en modifiant la seule réponse de lecture dans le navigateur. Captures `.captures/copro-lignes/`.

- ✅ **Décision d'Arno (26/11/2026, 14h35)** : on garde le « × » SANS question pour une adresse en attente (retrait immédiat).

### 26/11/2026, 14h35 — boutons pleine largeur, digicodes en MAJUSCULES (NON POUSSÉS, aucune migration)
- **`9af33a9a` — boutons d'action de section en pleine largeur** (classe `fcp-bouton-plein`, rendu des boutons du bloc AG) : « + Ajouter un habitant
  ou un gardien », « Choisir / créer le syndic » / « Changer de syndic », et aussi « Retirer le syndic », « + Rattacher un contact du syndic »
  (`ContactsSyndicCopropriete`, rendu seulement par la fiche), « Ajouter » (« Une autre adresse »). Petits boutons de ligne inchangés.
  Inventaire mesuré dans Chrome (30 rue Baudin sans syndic, 25 rue Edith Cavell avec syndic).
- **`3c17655f` — digicodes en MAJUSCULES** : `majusculesDigicode` (digicodeImmeuble.ts) ; frappe (6 champs : commun, bâtiment, correction, « Nouveau
  digicode » planifié, ancien champ CreationBien et fiche du bien) ; serveur (`valeurSaisie`, `verifierDigicode`, `bienComplet`) ; affichage
  (motValeur, libelleValeur, motChangementAVenir, motCode ×2, résumé/fiche du bien, mail Nouvelle location, fiche d'intervention, sortie). Aucune
  réécriture en masse ; `memeCode` ignore toujours la casse → réenregistrer un code identique n'écrit rien. En recette : 2 codes en minuscules
  seulement (« 7 rue test digicode », restes d'essai « …undefined »), laissés tels quels.
- ~~Dette relevée~~ → **réglée par `d3076e1d`** (décision d'Arno du 26/11/2026) : une seule limite, `MAX_CODE_DIGICODE = 15`
  (digicodeImmeuble.ts) ; `MAX_CODE_DIGICODE_UNIFIE`, la limite 8 et la sonde de la 482 supprimées ; champ commun `ChampCodeDigicode` (6 saisies,
  compteur « n/15 », « 15 caractères au maximum » sous le champ, pas de maxLength) ; serveur : refus « Digicode trop long : 15 caractères au
  maximum. », plus aucune coupe (20 / 8). Aucun code > 15 en recette ; requête prod LECTURE SEULE :
  `.captures/digicode-longueur/digicodes-plus-de-15-lecture-seule.sql`. `syndicBien.itest.ts` mis à jour (16 caractères), non lancé.

### 26/11/2026, 16h — MIGRATION 520 : une adresse, une seule copropriété, EN BASE (`30e05d78`, NON POUSSÉ)
- Décision d'Arno après le contrôle de production de 15h53 (0 / 0 / 0). Registre `gestion_copropriete_adresse_exclusive` (clés « a:<clé
  comparable>|<code postal> » et « ban:<BAN> », jamais effacé : `fermee_le`) + index unique partiel `…_ouverte` + déclencheurs sur
  `gestion_copropriete` et `gestion_copropriete_adresse` ; clé calculée par `gestion_cle_adresse_comparable` = `cleComparable` (parité 365 / 0 écart).
  Refus : 23505, contrainte `gestion_copropriete_adresse_exclusive`, message « Cette adresse appartient déjà à la copropriété … : « adresse ». Rien
  n'est enregistré. » ; verrou par clé (`pg_advisory_xact_lock`) pour deux écritures simultanées. Le code : `motifExclusiviteAdresse`
  (enregistrerCopropriete, définir la principale, 10 routes d'écriture → 409 dans la forme de chaque route).
- Épreuve : copie jetable de la recette à 518 (port 5433, `.captures/maj/essai-copie-520/`, pgdata effacé) — journal `epreuve.log`. **Appliquée en
  RECETTE seulement** (115 clés, 58 copropriétés). Production : NON.
- ✅ **Décision d'Arno (26/11/2026) : 519 non utilisé, 361 → 521.** La 361 n'est pas prête et ne part pas avec la 520 ; au réveil, elle sera renommée
  521 (en-tête de `db/migrations-en-attente/361_permis_emprise_numero_reveil.sql` ; `migrationsEnAttente.test.ts` le fige : 519 refusée après
  la 520, 521 acceptée). `scripts/migrations-plan.ts` inchangé (il ne nomme aucun numéro).
- Limite connue : une adresse sans code postal et la même avec code postal ne sont pas vues comme la même clé EN BASE (le serveur, lui, les
  rapproche : codes postaux compatibles) ; la clé `cle_immeuble` des adresses secondaires (index d'avant) ignore toujours le code postal.
- Scripts `.captures/maj/` préparés pour la prochaine mise en production, SANS rien lancer (anciens rangés dans `.captures/maj/avant-520/`) :
  1-sauvegarde, 2-push calés sur le commit ; **3-essai lance d'abord `0-controles-lecture-seule.sh`** (nouveau contrôle n° 4 : doublons selon la
  clé EXACTE de la 520, éprouvé sur un doublon « 77b / 77 bis ») et exige 0, puis l'essai avec exactement 1 nouvelle (520) ; 4-appliquer exige
  l'essai du jour ; 5-verifier : registre 517 / 4 écartées, 520 inscrite par le commit, verrou en place (`lecture-exclusivite-520.sql`).

### ✅ 26/11/2026, 16h25-16h41 — MISE EN PRODUCTION TERMINÉE (lancée par Arno)
- Sauvegarde : `/home/ubuntu/sauvegardes/2026-11-26_1625`. `3-essai.sh` : ESSAI RÉUSSI. `4-appliquer.sh` : « MISE À JOUR RÉUSSIE — 1c40ed6c en
  service », migration 520 appliquée et inscrite 1/1. `5-verifier.sh` : « ÉTAPE E RÉUSSIE » — déclencheurs = 2, index unique = 1, copropriétés sans
  clé = 0, clés ouvertes = 29, copropriétés 16 / 16.
- Partis avec elle : tous les lots du 26/11/2026 (`fc4f3098` → `1c40ed6c` : 20 %, Syndics, fenêtre Copropriété, adresses, exclusivité, digicodes
  en MAJUSCULES et limite de 15, migration 520).
- **Migrations : 519 inutilisé ; la 361 (en attente) prendra la 521.**

### 27/11/2026, 09h48 — Événements : « ouvert par » (NON POUSSÉS, aucune migration)
- **Point 0 (lecture seule, rien modifié)** : « Ajouter une carte RDV intervention » (sous la carte Ouverture, `FriseAvancement.tsx`, depuis 508cbab0
  du 23/10/2026, option A) n'écrit rien : il ouvre la fenêtre d'ajout d'une carte avec le type « RDV intervention » déjà choisi — la même carte
  que le « + » de la frise ; elle ne déclenche ni tâche, ni rappel, ni mail, ni tableau de bord. Recette : 0 carte RDV intervention posée à la main
  depuis le 23/10 (1 avant, retirée ; 16 venues de Monga). La base ne distingue pas le lien du « + ». Requête prod LECTURE SEULE :
  `.captures/evenement-ouvert-par/cartes-rdv-intervention-lecture-seule.sql`. ✅ **Décision d'Arno (27/11/2026) : lien et phrase RETIRÉS** — `2adbc759`.
- **`4cddd862` — point 1** : la création écrivait DÉJÀ l'utilisateur de la session (`ouvert_par`, depuis la 228) et la journalisait ; désormais
  éprouvé (une valeur de la requête est ignorée). Règle unique `ouvreurDe` (`app/lib/gestion/ouvreurEvenement.ts`) + lecture
  `ouvreursDesEvenements` : colonne, sinon journal de création, sinon « non renseigné » ; automate sans compte : « automatique ». Aucune
  réécriture, aucune migration (522+ non utilisée). Recette : 6 / 6 par un compte. Requête prod : `ouvreurs-lecture-seule.sql`.
- **`0fa48347` — point 2** : « Ouvert par Prénom NOM le JJ/MM/AAAA » sous la carte Ouverture (lien RDV gardé), « · ouvert par … » dans l'en-tête
  (en cours et clos) et sur chaque ligne de la liste.
- **`5687808e` — point 3** : famille de filtres « OUVERT PAR » (Tous, utilisateurs avec nombre, Automatique, Non renseigné), `&evf=ouvert:…`,
  combinée aux autres. Captures `.captures/evenement-ouvert-par/`.

- **`2adbc759` — retrait du lien « Ajouter une carte RDV intervention » et de sa phrase** sous la carte Ouverture (accord explicite d'Arno du
  27/11/2026) ; avec eux `onRdvIntervention`, `AIDE_DATE_A_VENIR`, `MOT_LIEN_RDV`, `.fav-aide-ouverture` (aucun autre usage). La carte RDV
  intervention reste au « + » (vérifié dans Chrome) ; cartes RDV existantes intactes (16 Monga) ; `MOT_OUVERTURE_NON_MODIFIABLE` (refus serveur)
  inchangé. Sous la carte : « créée le … » et « Ouvert par … le … ». Captures `.captures/retrait-lien-rdv/`.

### 27/11/2026, 11h01 — « OUVERT PAR » : plus d'anonymat, fenêtre des collègues (NON POUSSÉS, aucune migration)
- **Point 0 (lecture seule)** : un événement ne se crée QUE par `creerEvenementDansTransaction` (gestes.ts, seule insertion dans
  `gestion_evenement`), via trois routes humaines (fils/[id]/affectation, messages/[id]/affectation, monga → `creerEvenementEtRelier`), toutes
  derrière `exigerCompteActif`, qui refuse toute session sans compte depuis le 15/10/2026. Aucune création par la relève, le démon, un script ou
  une tâche planifiée : ni automatique, ni anonyme.
- **`44c08532` — point 1** : auteur OBLIGATOIRE côté serveur (`MOTIF_OUVERTURE_SANS_AUTEUR`, avant toute écriture ; rattacher à un événement
  existant non concerné) ; « Automatique » et « Non renseigné » retirés du filtre. Les 6 événements gardent leur auteur.
- **`93cef884` — point 2** : bouton « Ouvert par : Tous ▾ » + `FenetreOuvertPar` (comptes actifs avec accès Gestion OU Location —
  `colleguesGestionLocation` —, par NOM, cases multiples, Tout / Aucun, recherche > 8, Appliquer / Annuler, plein écran ≤ 600 px) ; état
  `ouvreurs: string[]` en union ; `&evf=ouvert:u…`. Correctif : `cleFiltreBrute` (ecranUrl) admet les chiffres (plafond 400) — le filtre se
  perdait au rechargement depuis 5687808e. Captures `.captures/ouvert-par-collegues/`.
- Limite connue : un événement ouvert par un compte aujourd'hui désactivé ou sans accès n'a pas de case dans la fenêtre (règle « collègues ayant
  accès ») ; il reste visible avec « Tous ».

### 27/11/2026, 12h37 — panne « pas de bouton d'envoi depuis l'historique » (Location) — `7b5715a6` (NON POUSSÉ, aucune migration)
- **Cause** : règle VOULUE du 17/10/2026 — fiche commune ouverte depuis la tuile Location = mails en lecture (écran `redaction={null}` + bandeau ;
  serveur : `peutEnvoyerAuNomDeGestion` et les routes envois / brouillons / pièces refusaient toute requête « contexte Location », même admin).
  ✅ **Levée par Arno le 27/11/2026.**
- **Correctif** : `useContexteRedaction` (la lecture du contexte, DÉPLACÉE de GestionVue dans `contexteRedactionLu`) pour `FicheCommuneLocation` et
  l'écran de sortie (`HistoriqueEchangesLecture`, classé sur le logement du bail) ; dans `HistoriqueDuBien`, « Écrire un mail » pleine largeur en tête
  (`MOT_ECRIRE_UN_MAIL`) et, sans droit, « Envoi de mails non autorisé pour votre compte » (`MENTION_ENVOI_NON_AUTORISE`) ; serveur : plus de refus
  « Location », le droit d'envoi décide (`capaciteEnvoiGestion` : administrateur, ou perm_gestion + perm_gestion_envoi). `requeteDepuisLaLocation`
  reste pour l'annuaire (libellé / affichage). Captures `.captures/ecrire-depuis-historique/` (aucun mail envoyé).
- Écrans d'historique de bien : Gestion › Annuaire (fiche bien, propriétaire, locataire) — avait déjà l'écriture ; Location › bien / propriétaire /
  locataire (même composant) — ne l'avait PAS, l'a ; Location › sortie des locataires (historique du logement) — ne l'avait PAS, l'a.

### ✅ 27/11/2026, 20h37-20h53 — MISE EN PRODUCTION TERMINÉE (lancée par Arno)
- Sauvegarde : `/home/ubuntu/sauvegardes/2026-11-27_2037`. `3-essai.sh` : ESSAI RÉUSSI. `4-appliquer.sh` : « MISE À JOUR RÉUSSIE — 568344f0 en
  service », 0 migration (attendu 0). `5-verifier.sh` : « ÉTAPE E RÉUSSIE » — services actifs, aucune erreur, verrou 520 en place, « Écrire un
  mail » et « Ouvert par » dans les fichiers servis.
- Partis avec elle : les lots du 27/11/2026 (`4cddd862` → `568344f0` : « ouvert par » des événements, retrait du lien RDV intervention, plus
  d'événement sans auteur, fenêtre des collègues, « Écrire un mail » depuis chaque historique de bien en Gestion et en Location).
- Scripts `.captures/maj/1` à `6` calés sur `568344f0` (anciens dans `.captures/maj/avant-568344f0/`) : à recaler avant la prochaine mise en production.

### 27/11/2026 — contrôle Monga en production (lecture seule, `0-controles-monga-lecture-seule.sh`)
- **32 événements, dont 5 seulement reliés à une référence Monga** ; **42 références MNG- reçues sans aucun événement**, leurs mails restés
  « À classer » (ni lien Monga, ni rattachement à un événement). Monga EST utilisé (constat Gmail : ~17 références sur 60 jours) : ce qui manque,
  c'est le classement des mails Monga dans un événement. Requêtes : `.captures/controles-monga/monga-lecture-seule.sql`. Rien de corrigé : à
  décider par Arno.

### 27/11/2026, 21h10 et 21h19 — bloc 3 « État des lieux de sortie » : la fenêtre de la pré-visite, trois états (`ced02fed`, `d53856e9`)
- **Point 1 (`ced02fed`)** — « appliquer la même fenêtre que celle du RDV pré-visite sur le bloc 3, et ne pas allonger le bloc ».
  - Le cadre de la fenêtre « RDV pré-visite » est sorti en `CadreFenetreRdv` + `EnteteFenetreRdv` (`PrevisiteAccueil.tsx`). Il est réutilisé, sans copie, par
    « RDV état des lieux de sortie » et par « Confier à quelqu'un d'autre ».
  - La fenêtre de l'état des lieux reprend la pré-visite : Date et Durée sur une ligne, puis Début et Fin ; Oui / Non obligatoire ; « Annuler » et « Voir le récapitulatif ».
  - Elle garde « Confier à » (un seul collègue) et le commentaire. Le récapitulatif est celui des tâches, confirmé par « Planifier » (`libelleConfirmer` de `useRecapEnvois`).
    Plein écran à 390 px. Ce que fait la planification ne change pas.
- **Point 2 (`d53856e9`)** — trois états, la présentation du bloc 2 (`data-etat-edls`).
  - **À programmer** : « Planifier l'état des lieux de sortie », pleine largeur.
  - **RDV fixé** : cartouche « RDV fixé — le … de … à … · confié à Prénom NOM », et « Modifier le RDV » pleine largeur.
  - **Effectué dès la FIN prévue + 1 h** (`edlsEffectue`, `frisePreavis.ts`) : étape 3 « faite » (case verte, ✓), cartouche « ✓ État des lieux effectué — … · par Prénom NOM ».
    « Valider la sortie » inchangé ; « Modifier le RDV » reste proposé (le serveur juge).
  - « Modifier le RDV » met à jour la MÊME tâche (jamais une seconde). Il est prérempli, commentaire compris (nouveau : modifiable, journalisé
    `location_edls_commentaire`, note de la tâche réécrite). Si seul le commentaire change, la tâche n'est pas touchée et aucun mail ne part au collègue.
- **Décision d'Arno (27/11/2026)** : la règle fin + 1 h vaut pour le SEUL bloc 3. La pré-visite reste effectuée par le geste du compte rendu (13/11/2026),
  inchangée. Vérifié : elle n'avait aucune règle horaire d'effectuation (seul le DÉBUT du rendez-vous ouvre le compte rendu).
- **« Modifier / déplacer la pré-visite » vérifié de bout en bout** dans Chrome (recette), ouvrir → heure changée → récapitulatif : il fonctionne, rien n'a été corrigé.
  Même parcours pour « Modifier le RDV » de l'état des lieux. Rien n'a été planifié ni envoyé : seuls les aperçus passaient, toute autre requête était bloquée (0 bloquée).
- Contrôles : `npm test` VERT (1 890 fichiers, 28 310 tests, 21 ignorés) ; `tsc` = 0 ; lint sans erreur nouvelle ; pages construites (`/admin/login` 200).
  Chrome : ordinateur et 390 px, clair et sombre. Captures dans `.captures/edls-trois-etats/`. Aucune migration.
- Libellés remplacés à la demande : « État des lieux programmé — … » → « RDV fixé — … · confié à … » ; « Modifier / déplacer l'état des lieux » → « Modifier le RDV » ;
  dans la saisie, « Date de l'EDLS / Heure de début / Heure de fin » → « Date / Début / Fin ». Le bouton de saisie « Planifier » / « Déplacer le rendez-vous » →
  « Voir le récapitulatif » ; « Planifier » passe au récapitulatif. Rien n'est retiré.

### 27/11/2026, 22h17 — « 20 % à restituer » : envoi depuis la Location, adresse libre, coordonnées (`87c58d69`, `691d4b02`, `e7334caf`)
- **Décisions d'Arno sur le bloc 3** (EDLS) : validés tels quels — « Modifier le RDV » visible à l'état effectué, commentaire modifiable, boutons visibles sous la fenêtre.
- **Point 1 (`87c58d69`) — le droit d'envoi décide, pas la tuile** (règle de 7b5715a6).
  - Cause : la page /admin/location/vingt-pourcent ne recevait aucun module d'envoi (décision 1A du 25/11, levée).
  - Désormais, `mailVingtDuContexte` est partagé par la Gestion et la Location. Mails de la restitution, « Envoyer un mail » de la ligne, « Répondre ».
  - Sans droit : « Envoi de mails non autorisé pour votre compte : la restitution s'enregistrera sans mail. », cases désactivées. Le serveur relit le droit à chaque envoi.
  - **Autres écrans de Location vérifiés.** Les « Écrire » des contacts des fiches (bien, propriétaire, locataire, archivage) étaient en mailto : ils ouvrent le
    « Nouveau message » de gestion@ en fenêtre flottante (`EcrireFlottant.tsx`, brouillon partagé avec PleinEcranBoite).
  - La fiche syndic de la Location reçoit « Écrire depuis gestion@ ». Les autres écrans (historiques, écran de sortie, préavis, pré-visite, EDLS) étaient déjà sous le droit d'envoi.
- **Point 2 (`691d4b02`) — « + Ajouter une adresse »** sous PARTENAIRES.
  - Format vérifié, doublon refusé, nom facultatif, case cochée, « × ».
  - Un mail par adresse : modèle « Partenaire » par défaut ou « Locataire », texte modifiable, récapitulatif.
  - Le mail part par la porte d'envoi de la Gestion : journal, « Échanges », historique du bien. Jamais ajoutée aux Paramètres.
- **Point 3 (`e7334caf`) — un bloc par contact** : « NOM Prénom » (sinon le nom tel qu'il est enregistré), tous les téléphones, tous les mails.
  - Locataires à gauche, propriétaires à droite, empilés à 390 px ; toutes les catégories.
  - Le nom est maintenant toujours dit (fin de la règle du 25/11 qui l'omettait pour un locataire seul).
- Contrôles : `npm test` VERT (1 891 fichiers, 28 326 tests) ; `tsc` = 0 ; pages construites (`/admin/login` 200).
  - Chrome (recette, Location ET Gestion, ordinateur et 390 px, clair et sombre) : fenêtre ouverte, adresse libre ajoutée (refus de format et de doublon vus), récapitulatif lu.
  - Restitution NON validée, rien envoyé : toute requête non GET était bloquée. Une seule a été tentée et bloquée : l'aperçu de classement de la fenêtre d'écriture, sur la fiche syndic.
  - Captures : `.captures/vingt-envoi-adresse-coordonnees/`. Aucune migration.

### 27/11/2026, 23h30 — copropriété, libellés, lots vacants (`0e0c62a4`, `d1d6c2d3`, `a2e7f196`, `994eed68`, `24df9b60`, `e0af8a0d`)
- Décisions d'Arno du 27/11 : les trois choix du lot « 20 % » validés ; les 19 dossiers Playwright du 15/11 restent dans le dossier temporaire.
- **Point 1 (`0e0c62a4`)** — « Retirer cette adresse » devient une croix « × » discrète, à droite sur la ligne de l'adresse de chaque bloc (fiche copropriété,
  le même composant en Gestion, en Location et depuis un bien ; le formulaire de création n'a pas ce bouton).
  - La fenêtre dit ce qui part (digicodes, bâtiments / cages d'escalier), met à part le bien d'où l'on vient, liste les AUTRES biens (« aucun autre bien concerné »).
  - Elle se valide par « Valider le retrait » ou « Annuler ». Même geste que aeb97ec7.
- **Point 2 (`d1d6c2d3`)** — « Bâtiment / cage d'escalier » partout à l'écran ; une garde refuse tout « bâtiment / cage » sans « d'escalier ».
- **Point 3 (`a2e7f196`)** — « pas de digicode » / « plus de digicode » au niveau du champ.
  - Le compteur « 0/15 » est sorti du flux, et la ligne réserve sa place par une marge commune (CSS_CHAMP_CODE_DIGICODE).
  - Mesuré au Chrome : bas du champ = bas de la case.
- **Point 4 (`994eed68`)** — une seule base de copropriété.
  - Recensement des 8 parcours dans le message de commit. Création, Modifier et compléments inscrivaient déjà bâtiments, cages et digicodes dans la copropriété (prouvé).
  - Corrigé (`rattacherBienALaCoproprieteDeSonAdresse`) : un bien de l'application dont l'adresse est celle d'une copropriété pour la 520 (« 12bis » = « 12 bis »)
    la rejoint (« Immeuble » aligné, journalisé) au lieu d'en créer une autre.
  - Un changement d'adresse fait suivre l'« Immeuble », et les digicodes de « Modifier » s'écrivent après l'adresse.
  - Preuve en recette par les vraies fonctions, en transaction ANNULÉE (comptes identiques, journal compris) : bâtiment C et cage C2 au 7 rue _TEST Deux Adresses,
    visibles dans la fiche de la copropriété 271 et proposés au second bien.
  - Pas de vraie création à l'écran : elle aurait laissé un bien et des lignes de journal indélébiles en recette. À faire par Arno s'il le souhaite.
  - **Limite** : « 7 r. » ≠ « 7 rue » pour la 520 (clé de comparaison), comme avant.
- **Point 5 (`24df9b60`)** — « Prélèvement du loyer », « Honoraires d'agence », « Paiement des charges de copropriété » : écrans, récapitulatif, résumé du bail, mail, messages.
  - Le tri des changements du dossier lit la constante. Journaux d'avant inchangés.
- **Point 6 (`e0af8a0d`)** — « Location (Nombre de lots vacants : N) », calcul serveur à chaque affichage.
  - Règle : biens actifs (en gestion / location seule) sans locataire en place ; une annexe rattachée n'est pas comptée, une annexe seule l'est ; vacant le jour de la sortie.
  - Recette : 88, égal au comptage direct. Le bouton « 20 % » ne bouge pas.
- Contrôles : `npm test` VERT (1 895 fichiers, 28 349 tests) ; `tsc` = 0 ; pages construites (`/admin/login` 200).
  - Chrome (recette, ordinateur et 390 px, clair et sombre), toute écriture bloquée ; captures `.captures/copro-bien-libelles-vacants/`. Aucune migration.
- Un flake connu est réapparu une fois (PreavisAccueil, photo « page rechargée pendant la coupure », docs/FLAKES_CONNUS.md) ; vert en relance.

### 28/11/2026 — annexes dans la copropriété, abréviations d'adresse (`7779d9bd`, `e4c6c944`, MIGRATION 522)
- Décisions d'Arno du 28/11 : la règle des lots vacants est acceptée (vacant le jour de la sortie ; un préavis ne libère rien) ; pas de vraie création de bien à l'écran en recette.
- **Point 1 (`7779d9bd`)** — `rattacherAnnexeALaCopropriete` (digicodesBienRepo.ts), appelé par sa carte (ajouterAnnexe — jusqu'ici rien), dans « Modifier » et à la création :
  - une annexe à la MÊME adresse que son logement prend l'« Immeuble » du logement (journalisé) ;
  - à une AUTRE adresse, elle rejoint la copropriété qui porte cette adresse (règle 520).
  - Une annexe n'a pas de champ « Bâtiment / cage d'escalier » : rien d'autre à inscrire. Aucune copropriété à son adresse : rien ne change. Annexe importée : inchangée.
  - Prouvé en recette, en transaction annulée (copro 271).
- **Point 2 (`e4c6c944`, migration 522)** — `cleComparable` (serveur) et `gestion_cle_adresse_comparable` (base) écrivent en entier le type de voie abrégé juste
  après le numéro : r., av./ave, bd/bld/bvd/boul., pl., all., imp., ch./chem., sq., qu. ; bis / ter / quater collés ou non.
  - La 522 recalcule le registre de la 520 (rejouable, sans garde recette, arrêt clair si un doublon naissait). Aucune adresse enregistrée réécrite.
  - Contrôle en LECTURE SEULE : `db/controles/522_doublons_lecture_seule.sql` (recette : 0 doublon, 0 clé qui change ; détection d'un doublon prouvée en transaction annulée).
  - Épreuve sur copie jetable de la RECETTE à 520 (fichier final, empreinte `2da58edd…`) : appliquée, rejouée deux fois, parité 316 + 27 / 0 écart,
    refus du « 7 r. » dans une autre copropriété — `.captures/abreviations-adresse/epreuve-copie-recette-final.log`.
  - **Appliquée et inscrite en RECETTE** (518 lignes, commit `e4c6c944`). Production : NON.
- ⚠️ **À FAIRE PAR ARNO (production, lecture seule)** : `bash .captures/abreviations-adresse/0-controle-522-lecture-seule.sh` (le contrôle des doublons). Puis, pour l'épreuve
  demandée sur une copie de la PRODUCTION à l'état 520 : `bash .captures/abreviations-adresse/copier-prod.sh` (lecture de la prod par ssh, copie jetable port 5433),
  puis `bash .captures/abreviations-adresse/epreuve.sh > .captures/abreviations-adresse/epreuve-copie-prod.log`. Claude ne lance rien sur la production.
- ⚠️ **361 / 521** : une fois la 522 inscrite, une 521 est REFUSÉE par l'outil (numérotée sous la dernière appliquée). La 361 devra partir AVEC la 522 ou prendre
  un numéro après elle (garde `migrationsEnAttente.test.ts`). L'en-tête de la 361 dit toujours « 521 » : à décider par Arno.
- Contrôles : `npm test` VERT (1 895 fichiers, 28 355 tests) ; `tsc` = 0. Chrome (recette, ordinateur et 390 px, clair et sombre) : fiche de la copro 271
  inchangée, conflit « 7 r. » reconnu par le contrôle (lecture seule), toute écriture bloquée.
  - Une adresse abrégée ne peut pas venir de l'écran (suggestions BAN seulement) : elle vient des biens « hors liste » et de l'import.

### 28/11/2026, 00h45 — titre, cases de rendez-vous, mentions sans doublon (`48007afa`, `ad02d810`, `f2cbaae9`)
- **Décisions d'Arno (28/11/2026)** :
  - la 361 prendra la **523** (elle ne part pas avec la 522) : en-tête de `db/migrations-en-attente/361_…`, garde `migrationsEnAttente.test.ts` et règle en tête de ce document mis à jour dans ce commit ;
  - les deux scripts `.captures/abreviations-adresse/` (`0-controle-522-lecture-seule.sh`, `copier-prod.sh` + `epreuve.sh`) seront lancés par Arno avant la
    prochaine mise en production, pas maintenant.
- **Point 1 (`48007afa`)** — « (Nombre de lots vacants : N) » en 0,8 rem, poids normal, couleur secondaire, sur la ligne de « Location » (d'un bloc au téléphone).
- **Point 2 (`ad02d810`)** — cartouche vert de l'état des lieux : « RDV fixé — le … de … à … » (et « État des lieux effectué — … ») sans le nom, gardé sur la ligne
  « Prénom NOM : … ».
  - Les cases « Pré-visite » et « État des lieux » passent par le même composant `PresentationRdv` (PrevisiteAccueil.tsx) : même ordre, mêmes classes,
    boutons pleine largeur juste après les informations, les deux cases alignées en haut (avant : centrées, l'une plus bas que l'autre). Rien retiré.
- **Point 3 (`f2cbaae9`)** — liste : même personne et même statut sur les deux rendez-vous → une seule mention « confié à … · Confirmé » sur les deux rangées
  (`mentionsCommunes`, triRdvPreavis.ts) ; même règle pour « Locataires : … ». Sinon une mention par rendez-vous. Au téléphone : les dates, puis la mention.
- Contrôles : `npm test` VERT (1 895 fichiers, 28 361 tests) ; `tsc` = 0. Chrome sur le préavis de test (bail 544), recette, ordinateur et 390 px, clair et sombre,
  toute écriture bloquée, rien planifié ni envoyé ; captures `.captures/location-titre-tuiles-confie/`. Aucune migration.

### ⏭️ PROCHAINE ACTION IMMÉDIATE
**Production = `568344f0`, migrations jusqu'à 520** (registre : 517 lignes dont 4 écartées ; **519 et 521 inutilisés ; la 361 prendra la 523**, décision du 28/11/2026).
En attente de mise en production : `ced02fed`, `d53856e9`, `87c58d69`, `691d4b02`, `e7334caf`, `0e0c62a4`, `d1d6c2d3`, `a2e7f196`, `994eed68`, `24df9b60`,
`e0af8a0d`, `7779d9bd`, **`e4c6c944` (MIGRATION 522)**, `48007afa`, `ad02d810`, `f2cbaae9` et leurs passations, non poussés. **Avant la prochaine mise en production
(Arno)** : `bash .captures/abreviations-adresse/0-controle-522-lecture-seule.sh`, puis l'épreuve sur copie de production (`copier-prod.sh`, `epreuve.sh`). Les scripts `.captures/maj/1` à `6` restent calés sur `568344f0` :
à recaler avant la prochaine mise en production. À décider : le classement des mails Monga « À classer » (42 références sans événement).

### 26/11/2026, 15h50 — `.captures/maj/0-controles-lecture-seule.sh` (préparé, NON lancé sur la production ; hors git)
- Sur le modèle de 1-sauvegarde.sh / 5-verifier.sh : `ssh svav-prod`, `.env` chargé SUR le serveur (aucun secret affiché), envoi des deux fichiers
  sur l'entrée de psql. Trois verrous : `PGOPTIONS default_transaction_read_only=on`, chaque fichier en `BEGIN READ ONLY … ROLLBACK`, garde local qui
  refuse tout fichier contenant un mot d'écriture. Digicodes MASQUÉS (« ••• », longueur et adresse seulement). Journal `.captures/maj/controles-AAAA-MM-JJ.txt`.
- Essai sans production : `CONTROLES_BASE_LOCALE=svav_recette bash …` (refusé sur toute base qui n'est pas svav_recette… / svav_test…) — 0 / 0 / 0 ligne,
  « CONTRÔLES TERMINÉS — rien n'a été modifié » ; compteurs d'écriture (pg_stat_user_tables) et empreinte md5 des 6 tables lues IDENTIQUES avant / après ;
  un UPDATE envoyé sous le même réglage est refusé par la base (« cannot execute UPDATE in a read-only transaction »). Arno : lancer la requête des doublons en production, puis décider de la migration 520. Arno : surveiller le premier mail d'alerte des 20 % (gestion@criterimmo.fr) et, en
production, la page « 20 % à restituer » (montants « à saisir »). Puis retour en recette sur 22h51 (« Restitutions faites » en blocs de trois lignes,
bandeaux des mails de restitution, champ du montant pleine largeur) et sur 23h12-23h15 (montant des 20 % transmis, arrêté « 1er MARS », date de
sortie à valider) ; décision sur les points ouverts ci-dessus ; retour sur le préavis (`b3819054`, `ec3aff05`, `72af1d4b`) et la question du
colocataire d'un autre bail. 🔴 **Prochaine mise en production UNIQUEMENT quand Arno dit « on met en production »** (scripts à remettre à jour,
HEAD poussé). Les reprises de données (bâtiments par adresse, mandats par bien) restent soumises à leurs rapports d'essai sur une copie de la
production. Rien à pousser ni à appliquer côté agent.

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
