> Passation générée le 07/09/2026 à 20h18

# PASSATION — Application Sans Vis-à-Vis®

Colle ce document au tout début d'une nouvelle conversation avec Claude. Il te donne le projet, les
rôles, les règles, l'historique et la prochaine action, sans qu'Arno ait à réexpliquer.

---

## 1. Rôles & workflow

> ### 🔒 RÈGLE PERMANENTE D'AUTONOMIE DE L'AGENT — À RECONDUIRE DANS TOUTE PASSATION FUTURE
>
> **Cette section est PERMANENTE.** Quand cette passation servira de base pour en régénérer une
> nouvelle, elle DOIT être reportée **telle quelle** — jamais résumée, jamais supprimée, jamais diluée.
>
> **Arno donne son accord PAR DÉFAUT pour tout.** Il ne veut plus valider des demandes d'autorisation à
> répétition. L'agent Claude Code travaille **de bout en bout sans solliciter Arno** : édition de
> fichiers, commandes shell, tests, build, git local, commits — tout passe **sans validation**.
>
> **DEUX SEULES EXCEPTIONS** ont le droit d'interrompre son travail :
> 1. une **QUESTION DE CHOIX à trancher** — arbitrage produit, option de design, décision métier :
>    quelque chose dont **Arno seul** a la réponse ;
> 2. une **DEMANDE D'ACCÈS à un service pour lequel Claude Code n'a pas ENCORE reçu l'accord** d'Arno —
>    service de son ordinateur personnel, ou service externe sur internet. **Une fois l'accord donné
>    pour un service, il n'est plus redemandé.**
>
> **CONSÉQUENCE À ASSUMER PAR LE CLAUDE ARCHITECTE** : les garde-fous qui reposaient sur une demande de
> validation (écriture en base *live*, `git push`, commandes destructives) **ne sont plus portés par les
> permissions**. Ils doivent donc être **ÉCRITS NOIR SUR BLANC DANS LE TEXTE** de chaque cartouche
> 🔵 PROMPT — « lecture seule stricte », « tu ne pousses pas », « aucun DELETE/TRUNCATE/DROP », « pas
> d'écriture en base » — et **jamais** confiés à une invite de confirmation qui n'arrivera pas.
>
> Cette règle est **PERMANENTE** et se reconduit dans toute passation future.

- **Arno** = fondateur **non-développeur** de **Sans Vis-à-Vis** (sansvisavis.com), plateforme de
  certification immobilière « vue dégagée / sans vis-à-vis » (Paris + petite couronne). Décide seul,
  tranche le métier.
- **Claude** = architecte / relecteur / concepteur des chantiers. Communication **en français,
  tutoiement, direct, sans flagornerie**.
- **Workflow relais (« vibe coding »)** : Claude rédige des **cartouches d'instructions** → Arno les
  colle à l'**agent Claude Code dans VS Code** → l'agent **exécute en autonomie** (lecture, édition,
  shell, tests, build, commits locaux) selon la règle d'autonomie ci-dessus. **Le `git push` reste
  manuel par Arno**, sauf accord explicite ; chaque cartouche redit ses garde-fous en toutes lettres.
- **Repo** : github.com/Moutchxp/app — branche `main`. Git user : Moutchxp.
- **Stack** : Next.js 16.2.9, React 19.2.4, TypeScript 5, Tailwind v4, **PostgreSQL + PostGIS en
  LOCAL** (plus de Supabase ; driver `pg` sur `DATABASE_URL=postgresql://localhost:5432/sansvisavis`).
- **Langue du domaine** : français (faisceau, obstacle, point d'observation, corps de bâtiment…).
- **Taille du dépôt (repère)** : ~185 800 lignes de code applicatif (TS+TSX+SQL+CSS) sur ~1 422
  fichiers ; `.ts`+`.tsx` ≈ 172 500 lignes à eux seuls. ~218 k lignes tout compris (docs, JSON).
  Tests : **506 fichiers `*.test.ts`** (collectés par `npm test`) + **33 `*.itest.ts`** (collectés par
  `npm run test:integration`) — les deux globs sont **séparés volontairement** (cf. §2).

---

## 2. Règles de collaboration (impératives)

- **Un chantier = un prompt = une modif logique = un commit.** Après chaque diff : vérifier puis committer.
- **Recon LECTURE SEULE avant tout write** sur fichier sensible (moteur pur `app/lib/svv/*`, accès
  données `app/lib/db/*`, front `app/page.tsx`/`MapContent.tsx`, test golden `pipeline.itest.ts`).
- **Livrables = blocs copiables clairement labellisés** (voir §7). Jamais mélanger un prompt et un commit.
- **Ne jamais conseiller de faire une pause / d'arrêter.** Arno décide seul. Proposer plusieurs options
  AVANT d'implémenter sur un choix de design / ressenti.
- **2 fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et `app/api/analyse-photo/route.ts`.
- **CONTRÔLE DE FIN OBLIGATOIRE = `npm test` COMPLET vert** (= `vitest run`, **506 fichiers `*.test.ts`**
  aujourd'hui, glob `app/**/*.test.ts`). Les suites filtrées par chemin (`vitest run …/internaute`,
  `…/sitadel`, `…/permis`) sont des contrôles RAPIDES en cours de travail, **jamais** le contrôle de fin :
  une large majorité des fichiers vivent hors de ces sous-ensembles (précédent : `curation.test.ts` rouge
  du 14/07 au 03/08/2026, invisible aux contrôles filtrés). **Pas d'alias `test:tout`** — `npm test` fait
  déjà ça. **Deux globs SÉPARÉS volontairement** (`vitest.config.ts` = `*.test.ts` ; `vitest.integration.config.ts`
  = `*.itest.ts`) pour que `npm test` ne ramasse pas les itests : le golden + les **33 `*.itest.ts`** (dont
  `pipeline.itest.ts`) tournent à part via `npm run test:integration`. Un chantier complet lance **les deux**.
  (Le « ~536 » d'anciennes passations était un arrondi périmé : le vrai partage est **506 + 33 = 539** sur disque.)
- **Tests : ne jamais figer la FORME d'un SQL émis au runtime** (pas de regex sur le WHERE complet) →
  asserter le COMPORTEMENT (réponse, paramètres liés) + le SQL par FRAGMENTS sémantiques
  whitespace-normalisés (`sql.replace(/\s+/g,' ')` + `toContain`). Modèle : `curation.test.ts`.
- **Un KNN `<->` ne lit JAMAIS son point d'un CTE multi-référencé** (matérialisation → seq scan silencieux) :
  inliner l'expression du point dans le `ORDER BY`. Vérifier tout nouvel index par `EXPLAIN` sur la
  requête RÉELLE (le planificateur doit le PRENDRE, pas juste exister).
- **Flakes connus** → registre versionné `docs/FLAKES_CONNUS.md` (une entrée par flake, niveau de
  preuve explicite). Pour `certificatPdf.test.ts` : cause **NON ÉTABLIE**, ancien diagnostic « octets
  non déterministes / timestamp » **RÉFUTÉ** (générateur prouvé déterministe octet à octet). Ne JAMAIS
  réimprimer « octets non déterministes » ; pointer vers le registre.
- **Pièges de type `pg`** : le driver `pg` renvoie les colonnes **`numeric` comme des CHAÎNES** (aucun
  `setTypeParser` dans `app/lib/db/client.ts`). Un `json_build_object`, lui, renvoie des **nombres**.
  Ne jamais supposer qu'une valeur de journal typée `number` en TS l'est au runtime : coercer
  (`Number(...)`) au point de comparaison numérique.

---

## 3. Objectif à atteindre

- **Objectif GLOBAL** : transformer « sans vis-à-vis » (subjectif) en **norme mesurable, certifiable,
  auditable** — verdict 100 % géométrique + score de qualité de vue /100 + certificat PDF
  (`SAVV-AAAA-NNNNNN`, cible non encore implémentée) + estimation de plus-value.
- **Chantier EN COURS = module interne PERMIS**, phase **RATTACHEMENT & PERF**. Le module instruit les
  permis de construire (Sitadel + pièces PDF) pour **détecter le bâti neuf** qui invaliderait un
  certificat, et prépare le futur **contrôle mixte LiDAR/BD TOPO** (voir §5). Série récente : séparation
  nette de l'onglet **« Sous surveillance » (radar)** et de l'onglet **« Rattachement » (travail)** ;
  **validation de projection bâtiment par bâtiment** ; **numéro de permis qui passe au vert** quand il
  est prêt à être envoyé ; puis une **série perf** sur la fiche permis (mémoïsation + persistance du
  best-of PDF, parallélisation des lectures GED, réutilisation du texte déjà extrait). **Aucun chantier
  verdict/score en cours** ; tout est resté côté outillage interne (le golden n'a jamais bougé).

---

## 4. Invariants verrouillés (garde-fous permanents)

- **Golden Asnières = `29.107259068449615`** (note Couche 1 /80, scellé `pipeline.itest.ts:42`,
  hand-verified). Tout ce qui touche le score /100 change le golden → recalcul + validation main +
  **rescellage en commit SÉPARÉ**.
- **Verdict binaire = 100 % géométrique** : 1er obstacle réel **≥ 40 m** sur l'axe → `SANS_VIS_A_VIS`,
  sinon `VIS_A_VIS` (`THRESHOLD_M`). Jamais couplé au score ni à la photo.
- **Toit = MNS LiDAR lu DIRECTEMENT** (absolu, nettoyé), jamais sol + hauteur côté obstacle ; terrain =
  MNT LiDAR ; BD TOPO = emprise + identité (`cleabs`) uniquement, jamais l'altimétrie d'un certificat.
- **Hauteur de vision = FORMULE À PARAMÈTRE VARIABLE** : `etage × (hauteur_sous_plafond + 0,30 dalle)
  + 1,65 yeux`. Sous-plafond **choisi par l'internaute**, défaut **2,50 m**, fourchette **[2,40 ; 4,50]**
  pas 0,10. **« 2,80 »** = coefficient du seul cas par défaut (2,50+0,30 = `FLOOR_HEIGHT_M`), **PAS**
  une constante (le « × 2,90 » comme formule est PÉRIMÉ). **« 2,90 » = `FLOOR_HEIGHT_OBSTACLE_M`**,
  constante DISTINCTE (estimation immeuble voisin sans hauteur BD TOPO), à ne pas confondre. Œil
  **1,65 m** = définitif.
- **Aucun arrondi nulle part** ; distances horizontales autoritatives en **Lambert-93 (EPSG:2154)** ;
  **`ST_Force2D` jamais retiré** des opérations distance/raster.
- **Tolérances** : rattachement patrimoine monument→cleabs = **15 m** ; point d'origine hors emprise =
  **0,30 m** (`ORIGIN_OUTSIDE_TOLERANCE_M`).
- **`config_scoring`** : 39 colonnes, singleton `id=1`, lues au runtime avec repli sûr
  `PROFIL_DEGAGEMENT_DEFAUT`. Aucune constante de score en dur dispersée. **`prefers-reduced-motion`**
  respecté pour toute animation.
- **EXIGENCE ARCHITECTURE — PILOTAGE SANS CODE** : toute variable de tout moteur de score (Couche 1
  dégagement, Couche 2 photo, barème familles, cumul, couloir, orientation, bornes années…) DOIT être
  externalisée en table de config, éditable au runtime, jamais codée en dur. Cible = **interface
  d'administration native utilisable par un non-développeur (Arno)**. Conséquences dans CHAQUE chantier :
  * Aucune constante de score en dur (tout en table lue au runtime). Seule exception actée : les
    libellés d'affichage `SCORE_LABEL` (75/60), à ne pas étendre.
  * Toute nouvelle variable de moteur naît en table de config avec type, défaut, plage/validation
    (min/max, liste fermée pour les enums type `mode_combinaison`).
  * Statut à documenter : VIVE (agit sur le score) / VESTIGIALE (masquée/grisée en lecture seule) /
    GARDE (éditable mais contrainte à une liste fermée, ex. `mode_combinaison`).
  * Tout schéma/nommage/loader anticipe cette interface future (lisible/éditable par un non-dev).
- **EXIGENCE INTERFACE MOBILE** : toute interface d'admin interne pensée **responsive / mobile-first**
  (lisible et utilisable sur iPhone portrait) ; contenus denses → repli en cartes/accordéons, jamais un
  débordement horizontal illisible.
- **RÈGLE ABSOLUE du chantier PERMIS/liseuse** : ZÉRO ligne modifiée dans le **canvas / afficherPage /
  cliquerPdf / cliquerSchema / aperçu-ratio / viewport / conversion de coordonnées**. **Filets 19/19
  verts et inchangés** (`tracage.filet` 8 + `agrandissement.filet` 5 + `tracageSchema.filet` 6). Les
  deux rendus pdf.js (liseuse lecture seule vs `BlocTraceEmprise` surface de dessin) sont des **jumeaux
  volontairement distincts** (décision Arno 31/08/2026) — ne jamais unifier.
- **PRÉCALCUL = ACCÉLÉRATEUR, JAMAIS UN PRÉREQUIS** (série fond, cf. §5) : toute route qui lit un résultat
  pré-calculé garde **intégralement son repli calcul-à-la-volée**. Une ligne de précalcul absente/périmée
  ne casse jamais l'écran ; elle est juste recalculée.
- **GARDE `echecTelechargement`** : **jamais** de persistance d'un résultat calculé sur une GED
  incomplètement téléchargée — pour **aucun** type (best_of comme complétude), ni côté lecteur, ni côté
  producteur de fond. En cas de doute, on recalcule ; on ne fige jamais un résultat dégradé.
- **Socle générique `permis_best_of_precalcul`** (migration 209) : clé **`(dossier_id, type)`** ; colonne
  `type` **NOT NULL SANS DEFAULT** (un default ré-ouvrirait l'écrasement silencieux entre consommateurs) ;
  **liste fermée par CHECK** (`best_of`, `completude`). `empreinte` = clé d'invalidation **propre au type**.
- **La part VIVANTE ne se précalcule JAMAIS** : ce qui dépend de `config_veille` (ou d'un autre réglage)
  est appliqué **au read** (modèle `lireCompletude` : `classements` stables pré-calculés + familles
  attendues appliquées à la lecture). La **fraîcheur est structurelle**, pas « gérée » : un changement de
  réglage est reflété immédiatement, jamais au prochain tick.
- **Avant de généraliser un socle de précalcul pour un nouveau consommateur, VÉRIFIER D'ABORD s'il a déjà
  sa table dédiée** : la dupliquer créerait une 2ᵉ vérité (leçon de P-fond 4b — la complétude a gardé
  `permis_completude`, le `type='completude'` du socle reste réservé à un consommateur sans table).
- **Le lanceur macOS (LaunchAgent `com.sansvisavis.veille`) ne tourne que machine allumée + session
  ouverte** : le précalcul de fond (étape de `executerVeille`, tick 900 s) peut prendre du retard — d'où
  le **repli calcul-à-la-volée obligatoire** ci-dessus.

> Le code fait foi : `docs/INVARIANTS_SVAV.md` prouve chaque invariant `fichier:ligne`. En cas de
> divergence formulation/doc/code, se référer au code cité.

---

## 5. Résumé de l'historique

**Moteur & socle (déjà en place).** Verdict géométrique (LiDAR MNT/MNS, faisceaux, obstacles par
balayage), score de qualité de vue /100 (50/50 dégagement objectif / qualité paysage, IA photo via
Gemini — hors staging), `config_scoring` externalisé, golden Asnières scellé. Auditabilité : entité
centrale « test », rattachements patrimoine (MH/Inventaire/mondial).

**Module PERMIS (gros de l'activité récente, ~centaines de commits).** Ingestion Sitadel, curation,
rapprochement cadastral (colonne `origine_lien`), empreinte/rattachement des corps de bâtiment,
surveillance des polygones, complétude des pièces, demandes de pièces manquantes (fil mail
In-Reply-To/References), GED (`dossier_document`), extraction (journal `permis_extraction_journal` avec
`origine` auto/manuelle), analyse IA au grain page et fichier, deux process (email/téléservice),
réglages par rail/commune. **Migrations appliquées jusqu'à 209.** Mémoire projet détaillée dans les
fichiers `memory/` (MEMORY.md indexe les lots D1→D5, FUS, PARC, RATT, PART, LOT 69→104…).

**Série récente — onglet RATTACHEMENT (séparation radar / travail) puis PERF fiche permis.** Du plus
ancien au plus récent :
- `d0b834b` **séparer « Sous surveillance » (radar) de « Rattachement » (travail)** — deux onglets
  distincts. `cdfdc0a` l'entrée en Rattachement = permis **validés** (① signal / ② en veille), les
  non-validés restent en Sous surveillance. `2c7f452` critère d'entrée **durci** : altitudes **ET**
  emprises VALIDÉES.
- `fc56b9e` **migration 206** : validation de projection **au niveau du bâtiment** (colonnes
  `emprise_validee_*`). `f619517` valider la projection **bâtiment par bâtiment** depuis la capsule du
  cartouche. `f258c1b`/`b7818ff` capsule d'état d'emprise (jumelle de la capsule d'altitude), **une
  seule source de vérité** pour l'état emprise/projection d'un bâtiment. `b0afce8` parité test/normal
  sur « Valider la projection ». `5323da0` chaîne de 3 boutons par bâtiment (enregistrer → valider →
  modifier), capsule au vert sans rechargement.
- `0ab1864` **moteur de recherche de l'onglet Rattachement** (6 critères, filtrage en base).
  `d30a96b` panneau « Sous surveillance » repliable, fermé par défaut. `e5561fd` mode de passage en
  Rattachement devenu un **réglage** (automatique / clôture manuelle) — **migration 207**.
- `fbdeb0e`/`a922f67`/`2dc5dce`/`c742dff`/`2056d91` **bouton de clôture** : en-tête « Projection(s)
  validée(s) » en vert, bouton de clôture posé **en haut** du détail (retrait du « Valider la
  projection » global), sort du cartouche replié, réduit à trois emplacements (décision Arno : trop de
  boutons). `0edea3c`/`0d5158b` le **numéro de permis passe au vert** quand il est prêt à être envoyé ;
  la capsule affiche l'auteur **en nom**, jamais l'identifiant brut.
- **Série PERF initiale (mémoire + persistance du best-of, jusqu'à `3302284`)** : `b91023a` supprimer le
  doublon de `GET /emprise` (P3). `5fc1f01` **mémoïser le best-of PDF de `/emprise`** (P1, cause dominante ;
  invalidation par empreinte de la GED). `582a9f7` la détection Cerfa **réutilise le texte déjà extrait**
  au lieu de re-télécharger N objets (P2 Lever 1). `a06b967` **paralléliser les lectures de pièces** de
  `lireGedPermis` à concurrence bornée (P2 Lever 2). `96fc5b8` **persister le best-of PDF** (survit au
  redémarrage/HMR — **migration 208** `permis_best_of_precalcul`). `3302284` **purger le best-of à l'entrée
  en Rattachement** (PC-2 — **retiré ensuite par P-fond 2**, voir ci-dessous).

**Série FOND (P-fond 1 → 4b, 6 commits après `3302284`) — profilage d'abord, puis exécution.** Un
profilage chiffré a établi que l'onglet **Bâtiments** ouvrait à froid en **~9 s** (dominé par pdf.js
mono-thread + S3, `lireGedPermis` sur ~80 pièces) et que **POST /completude** relisait la GED une **3ᵉ
fois** (~8,5 s lourd / ~0,75 s léger). La série déplace ce travail en tâche de fond et supprime les
lectures redondantes :
- `2a4ed6e` **P-fond 1** — brancher le **producteur de fond** manquant (que la migration 208 annonçait) :
  une étape de `executerVeille` calcule et persiste le best-of **avant** l'ouverture (`calcule_par='fond'`),
  univers **borné** (permis sous surveillance/rattachement ∩ GED), **en série**, sous un budget de temps
  nommé `PRECALCUL_BUDGET_MS` (120 s), garde `echecTelechargement`. Extraction du calcul en source unique
  `calculerBestOf` (`bestOfCalcul.ts`), partagée route ↔ fond.
- `a2f6914` **fix fixture** `seedCandidat('avec_alt')` (itest `sortieTestRelances`) au critère d'entrée
  durci (altitude **et** emprise validées) — la fixture décrivait un monde périmé.
- `dce5be9` **P-fond 2** — **ne plus purger** le best-of à l'entrée en Rattachement (retrait du DELETE
  PC-2) : l'entrée ne touche pas la GED → le best-of persisté reste valide et sert **tel quel** → ouverture
  instantanée pile dans la vue de travail.
- `cf61a7f` **P-fond 3** — la **shortlist** des confirmations réutilise le texte déjà extrait par
  `lireGedPermis` (comme le Cerfa en 582a9f7), **zéro re-téléchargement** ; best-of identique octet pour octet.
- `5b66cf7` **P-fond 4a** — **socle générique** : `permis_best_of_precalcul` passe en clé **`(dossier_id,
  type)`**, `type` NOT NULL sans default, **liste fermée CHECK** `best_of|completude` (**migration 209**).
- `d52b0c2` **P-fond 4b** — **mutualiser** la lecture GED : **une seule** `lireGedPermis` alimente le
  best-of **et** la complétude (pré-remplie dans sa table dédiée `permis_completude`, part `config_veille`
  appliquée **au read** → fraîcheur immédiate). Le `type='completude'` du socle reste **réservé**.
- **Gains MESURÉS** : ouverture Bâtiments **~9 s → dizaines de ms** (hit persisté ~0,4 ms + SQL vivant) ;
  complétude servie **~8,8 s → ~15 ms** (mémoire pré-remplie) ; **une seule lecture GED par dossier au
  lieu de deux**. Golden **inchangé** ; aucune régression (`npm test` 506 + `test:integration` 33 verts).

**Corpus figé `docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md` (25-26/07/2026) — À RELIRE avant tout
chantier données/verdict/certificat/permis.** Points clés :
- **État des données réel** : couverture LiDAR = **1 km² de test à Asnières (92)**, rien d'autre ;
  `mns_bati_propre` VIDE ; **aucun millésime LiDAR** enregistré ; édition BD TOPO **≈ mars 2026**
  (déduite de `date_modification`, écrite nulle part) ; aucune procédure de réingestion. Chiffrage
  extension LiDAR : Paris+92+93 ≈ 16 Go, périmètre complet ≈ 90 Go de rasters (+20-30 % index).
- **Contrôle mixte** : détecter les polygones dont emprise/hauteur change entre 2 éditions BD TOPO.
  Hauteur inchangée → **on garde le LiDAR** ; hauteur changée → altitude toit BD TOPO devient valeur de
  contrôle + certificat marqué **CONTRÔLE MIXTE**. L'invariant « toit = MNS LiDAR » n'est PAS modifié :
  BD TOPO = **détecteur de changement**, jamais mesure du verdict.
- **Deux régimes** (les taux de remplissage coupent la règle en deux) : **Régime 1** (polygones
  modifiés récents) `altitude_maximale_toit` bien rempli (86-95 %), la règle marche. **Régime 2** (bâti
  réellement NEUF, `date_creation` récent) : `altitude_maximale_toit` ~7-8 % seulement → **cas le plus
  dangereux** (l'immeuble sorti après le vol LiDAR est justement celui qui invalide un certificat).
  Décision Régime 2 : **ne PAS substituer une valeur plus faible**, **MARQUER le certificat « à
  revérifier »** (un polygone neuf plus proche que la distance certifiée suffit à re-certifier). Brancher
  la règle sur la **présence du champ** (`altitude_maximale_toit IS NOT NULL`), **jamais sur un seuil de date**.
- **Prochain gros chantier (énoncé porteur)** : « mettre à jour en continu la base des maps pour tenir
  compte des nouveaux permis, et en déduire si on garde le LiDAR ou si on le remplace par les données
  des permis, le temps d'un nouveau passage LiDAR. » Prérequis identifiés : **index sur `batiment.cleabs`**
  (absent), **historisation d'une 2ᵉ édition BD TOPO** (table séparée ≈ +426 Mo, lecteurs inchangés),
  **capture du `cleabs` de l'obstacle du verdict dans le snapshot** (absent aujourd'hui), calibration
  « vrai changement vs re-numérisation » impossible avant une 2ᵉ édition réelle.

---

## 6. État courant & prochaine action

- **Working tree** : propre sauf `PASSATION.md` (ce fichier). **HEAD = `d52b0c2`**, branche `main`
  **À JOUR avec `origin/main`** (la série fond a été poussée).
- **Dernier chantier** : **série FOND terminée** (P-fond 1 → 4b + fix fixture, cf. §5), `d52b0c2` —
  committée et poussée. Migrations appliquées jusqu'à **209**. Tous contrôles verts (`npm test` 506,
  `test:integration` 33, `tsc` 0, `eslint` 0, `next build` OK, golden inchangé).
- **PROCHAINE ACTION IMMÉDIATE** : **aucune tâche engagée**. Attendre le prochain chantier d'Arno.
  Candidats naturels : (a) **ergonomie de l'onglet Rattachement / clôture** (retours d'Arno après essai
  réel) ; (b) le **gros chantier contrôle mixte** (§5) en commençant par ses **prérequis** : index
  `batiment.cleabs` (absent), **capture du `cleabs` de l'obstacle du verdict dans le snapshot** (absent),
  puis **historisation d'une 2ᵉ édition BD TOPO**. Rien n'est engagé : demander à Arno ce qu'il veut
  attaquer avant d'implémenter.

---

## 7. Format des livrables (à respecter par le nouveau Claude)

Pour CHAQUE instruction technique, un bloc copiable précédé d'un titre sans équivoque + pastille :

- 🔵 **PROMPT** — prompt de travail en relais manuel (« vibe coding ») : l'agent Claude Code produit un
  DIFF, Arno vérifie puis commit à la main. **Toujours préciser DANS QUEL TERMINAL** l'envoyer.
- 🔴 **PROMPT AUTO** — prompt qui DÉCLENCHE L'AUTOMATISATION (lancement de `/svav-build` ou de tout run
  autonome multi-subagents). Pastille rouge = run en autonomie : vigilance accrue, contrôle a posteriori
  via le rapport final, commit toujours manuel par Arno.
- 🟢 **COMMIT** — message de commit à coller dans la boîte de commit de VS Code (Source Control).

Règle : tout prompt lançant un run autonome porte 🔴, jamais 🔵. **Ne JAMAIS mélanger un prompt et un
commit dans le même bloc.** Messages de commit en Conventional Commits FR, **sans `Co-Authored-By`**.
