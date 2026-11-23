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

**Dépôt (mesuré le 23/11/2026) :**
- Branche **`main`**, **HEAD = le commit de cette passation** (précédent : `8f58b039`). `origin/main` = **`351f04de`**
  (poussé par Arno le 20/11 au soir, étape B de la mise en production). **59 commits d'avance (cette passation comprise), NON POUSSÉS** (dont `3c215ca2`, `6c9132f4`, `33e57c2c`, `64c4c852`, `f4bf2c9b`, `3188bac6`, `bcf4356e`, `498f7d56`, `7bd9afd0`, `a6dc9366` et `7b0e5e02`, passations,
  `2cb281cc`, `8a845ae0`, `f35f53a2`, `c4405330`, `4699df09`, retours d'Arno du 23/11 au soir, et `e3249124`, `82037e4c`, textes « 20 % »
  des mails, `79ff9020`, `f06248d9`, `d1b57b8f`, AG et arrêté dans la fiche Copropriété, `86f8829e`, état des lieux joint annoncé,
  `c146e4fe`, `cb744be3`, arrêté des comptes pleine largeur et dans « Valider la sortie », `520ce23d` → `36b1a2ea`, retours du 23/11 au
  soir (date d'AG, agencement de l'arrêté, texte propriétaire modifiable, bouton copropriété, case « Immeuble en copropriété »), `976079cc` → `90e05b93` (boutons de statut, mois de restitution, messages
  verts de la fiche, « Accéder à la fiche de copropriété »), `74061ea5` (texte des propriétaires en trois paragraphes), `e642bbe0` → `14e01401` (arrêté en gros, pièce jointe
  annoncée, fenêtre « Aucun état des lieux joint »), `8c86daff`, `04e448fa` (bouton « Confirmer cette date comme référence »
  retiré, pièces jointes sans « Modification enregistrée »), `46958f1b`, `8f58b039` (pièce jointe sous le compte rendu, ligne
  unique « Restitution des 20 % annoncée ») — détail plus bas) : `b3819054`,
  `ec3aff05`, `72af1d4b` (préavis, 21/11), `1968e642` (passation du 21/11), `1819b9f5`, `b0453dc2`, `34c49f0e`, `cf05a27a`
  (suivi des 20 %, 23/11), `627535e5` (passation du 23/11), `068bb9dd`, `d56c0315`, `f6274d92`, `8e949180`, `4e8353e2`, `fc736919`,
  `803dc30a`, `03a4db8a` (fenêtre « Valider la sortie » et copropriété, 23/11 — détail plus bas) et cette passation. Rien n'est poussé par
  l'agent : c'est Arno qui pousse.
- **Working tree** propre hormis les non suivis, laissés tels quels : `RAPPORT_NUIT_GESTION.md`, `rapatriement-gestion.log`,
  `public/images/sceau-certifie copie.svg`, `scripts/diagTel.ts`, `test-results/`. Ne pas les committer ni les supprimer sans Arno.
- **Contrôles** (dernier lot, `8f58b039`) : `npm test` VERT (1 866 fichiers, 27 807 tests, 21 ignorés) ; pages vérifiées dans
  Chrome sur la recette (aucune « Build Error »).
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
  🔴 **La 361 en attente (`db/migrations-en-attente/`) prendra le prochain numéro libre, la 513, le jour où Arno la sortira** (décision
  d'Arno du 23/11/2026) — la 511 reste vide : une fois la 512 inscrite, l'outil refuserait une 511 (numérotée sous la dernière inscrite ;
  épreuve dans `migrationsEnAttente.test.ts`). Non touchée.
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
    Copropriété du bien, relecture à la fermeture) ; « Créer une copropriété pour la renseigner » (cb744be3) remplacé. 🔴 QUESTION OUVERTE : le
    bouton « Créer une copropriété » de « Ce bien n'est relié à aucune copropriété » (même action) est GARDÉ — doublon visible sans
    copropriété ; le retirer seulement avec l'accord d'Arno.
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

### ⏭️ PROCHAINE ACTION IMMÉDIATE
Aucun lot en cours. Retour d'Arno en recette sur « 20 % à restituer » (`1819b9f5` → `cf05a27a`) et décision sur le geste « Restitution
faite ». Arno : lancer `bash .captures/maj/5-verifier.sh` (vérification d'après mise en production, jamais
faite) — ⚠️ il exige HEAD = `351f04de` : avec les commits du 21/11, relire plutôt `lecture-prod.sh`, les deux pages et
`systemctl is-active` à la main. Puis retour en recette sur le préavis (`b3819054`, `ec3aff05`, `72af1d4b`) et réponse à la
question du colocataire d'un autre bail. 🔴 **Prochaine mise en production UNIQUEMENT quand Arno dit « on met en
production »** (nouveaux scripts, HEAD à jour). Les reprises de données (bâtiments par adresse, mandats par bien) restent
soumises à leurs rapports d'essai sur une copie de la production. Rien à pousser ni à appliquer côté agent.

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
