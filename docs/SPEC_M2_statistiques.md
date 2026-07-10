# SPEC M2 — Statistiques & Analytique (spec principale)

> Étude d'architecture. **Aucun code, aucune migration, aucune dépendance ajoutée, aucun commit.**
> Documents liés : `SPEC_M2_rgpd_et_donnees_personnelles.md` (Q-A/Q-B/Q-C), `SPEC_M2_evenements.md`
> (nomenclature), `PLAN_M2_lots.md` (lots). Exigences en **EARS** (« DOIT » = SHALL) quand pertinent.
> Intègre les quatre revues adversariales (R1 vie privée, R2 moteur, R3 volumétrie, R4 honnêteté),
> toutes **CORRIGER** — corrections appliquées ci-dessous.

---

## 1. État des lieux (vérifié par lecture)

- **Aucune persistance publique.** Tunnel = SPA éphémère (`app/page.tsx:1145`, `Etape` `:25`), pas
  d'URL par écran. Routes `analyse`/`origine` = lecture seule (aucun `INSERT/UPDATE`). Aucune table
  test/résultat/internaute.
- **Comportemental existant = admin seulement** : `admin_utilisateur_log` (10 lignes),
  `config_edit_log` (17), `curation_patrimoine_log` (269). Tous des journaux **d'écriture**.
- **Permission `perm_statistiques` existe déjà** (`admin_utilisateur`, colonne booléenne). **Aucune
  nouvelle permission à créer.**
- **Point zéro rétroactif ≈ 0** : au déploiement, aucune statistique publique passée n'est produisible.
  Tout se mesure **à partir du début de l'instrumentation**. *(À dire à Arno sans détour.)*
- **Aucune lib de graphes** dans le projet (`package.json` : Leaflet + PostGIS `pg` uniquement ; pas de
  recharts/d3/chart.js). Pas de lib de dates. Pas de geoip.
- **Pool `pg` unique non configuré** : `app/lib/db/client.ts:8` `new Pool({ connectionString })` — pas
  de `max`, pas de `statement_timeout`, `connectionTimeoutMillis=0`. **Partagé** par le tunnel LiDAR et
  l'admin. (Risque central R2/R3, voir §7.)
- **`app/lib/svv/**` n'est PAS sans-DB** : `preparateurPaysage.ts:10` importe `db/client`. La garde
  anti-couplage doit donc cibler le **writer analytics**, pas `db/client` (§7).
- **`after()` disponible** (`next/server`, Next 16) — mécanisme d'émission post-réponse.
- **Middleware `proxy.ts`** : matcher **admin-only** (`/admin`, `/api/admin/**`) → le tunnel public **ne
  passe pas** par le middleware ; ne pas l'y étendre.

---

## 2. Décisions structurantes tranchées (T) + décisions renvoyées à Arno (A) / juriste (J)

| # | Décision | Statut |
|---|---|---|
| D1 | **Store durable = compteurs agrégés au grain jour** (Europe/Paris), pseudonymes, k-safe ; **contexte de session éphémère** (TTL court) pour le parcours/durée, replié en agrégats puis supprimé. Pas de seconde au repos. | **T** (défaut) ; voie « événements bruts » = **A** (Q1) |
| D2 | **Carte : défaut COMMUNE** (choropleth k-supprimé) ; jamais point/cleabs ; verdict/score jamais par maille fine ; maille 200 m/IRIS seulement sur finalité nommée + DPO + double-k + l-diversité. | **T** ; granularité fine = **A/J** |
| D3 | **Pas de « visiteur unique/récurrent »** sans consentement → **« Visites »**. Pas de `ip_hash`, pas de fingerprint. | **T** ; bandeau consentement ou exemption audience = **A/J** |
| D4 | **Séparation stricte** public (pseudonyme) / interne (admin) : tables séparées, **pool analytics dédié**, writer isolé, émission `after()`, aucune influence moteur. | **T** |
| D5 | **Tracer collègues : audit sécurité agrégé par défaut** (périmètre 1) ; **pas de géoloc IP**. Suivi individuel = **A/J** (information préalable). | **T** ; suivi individuel = **A** |
| D6 | **Pas de compte d'« adresses distinctes »** en M2 (mailles ≠ logements) → **« Analyses lancées »** (événements, re-runs inclus). Vrai compte distinct = M3. | **T** |
| D7 | **Ratio verdicts = 3 buckets** (SANS/VIS/INDÉTERMINÉ), toujours avec N absolu, « sur les analyses réalisées » ; non rétroactif. | **T** |
| D8 | **« Durée moyenne » et « page de sortie » REFUSÉES** telles quelles → « étape la plus loin atteinte » + « taux d'abandon par étape » ; durée = médiane/p90 **cappée + badgée estimation**. | **T** |
| D9 | **referer host-only + allowlist UTM + strip click-ids** ; bucket « Direct / inconnu ». | **T** |
| D10 | **Filtrage bots** (event JS requis + liste UA) ; part filtrée affichée. | **T** |
| D11 | **Rétention en config**, purge par **partition mensuelle (`DROP`)**, deux niveaux. | **T** ; chiffres exacts = **J** |
| D12 | Emplacement `app/(admin)/admin/(protected)/statistiques/…`, permission **`perm_statistiques`** (existe). | **T** |
| D13 | **Pas de dépendance graphe** : SVG/CSS inline maison ; Leaflet réutilisé pour la carte. | **T** ; lib graphe = **A** si viz complexe un jour |
| D14 | **Premier lot = fondation** (schéma + writer isolé + pool dédié + garde), **pas** le dashboard. | **T** |

---

## 3. Schéma d'événements (conceptuel — pas de DDL ici)

> **Rappel : aucune migration dans ce lot.** Ce qui suit est un **schéma cible conceptuel** pour cadrer
> les lots ; la DDL réelle est produite au premier lot d'implémentation (`PLAN_M2_lots.md`, Lot 1).

### 3.1 Table unique vs tables spécialisées — tranché : **une table de compteurs + une table de session éphémère + une table interne**, JSONB pour la queue longue
- **Tables spécialisées par type d'événement** = une migration par nouveau type → **casse** la
  contrainte « accueillir des événements inconnus sans migration destructrice ». **Écarté.**
- **Retenu** :
  - `stat_compteur_jour` (public, durable) : agrégat **(jour_paris, nom, dimensions dénormalisées)** →
    `n`. Dimensions dénormalisées (colonnes typées, hot path) : `verdict`, `score_tranche`, `source`,
    `medium`, `device_type`, `commune_insee`, `etape`, `raison`. Queue longue rare → `props JSONB`.
  - `stat_session` (public, **éphémère**, TTL court) : état d'une visite en cours (session_id éphémère,
    étape max, contexte bucketé). **Compacté puis supprimé.**
  - `stat_admin_jour` (interne) : audit sécurité agrégé (jour, utilisateur_id, module, n).
- **Évolutivité** : `nom` + catalogue en config ; nouveau `nom` = pas de migration ; nouvelle métrique =
  nouvelle requête. Dénormaliser une propriété en colonne **dès** qu'elle entre dans un `WHERE`/`GROUP
  BY` fréquent (constat R3-7).

### 3.2 Indexation & volumétrie (constats R3-1/2/3/5/6/7)
- **EARS-V1** — Le store `stat_compteur_jour` DOIT porter une colonne `jour_paris date` **peuplée à
  l'écriture par l'application** (jamais une colonne générée `AT TIME ZONE`, **rejetée** par Postgres
  car `timezone()` est STABLE non IMMUTABLE — constat R3-2), avec un **index btree** sur `jour_paris`.
- **EARS-V2** — Toute requête de fenêtre DOIT filtrer sur `ts`/`jour_paris` **colonne nue** (`ts >= lo
  AND ts < hi`, bornes calculées comme `timestamptz`), et NE DOIT PAS envelopper la colonne dans `AT
  TIME ZONE` dans le `WHERE` (sinon seq scan — constat R3-3).
- **EARS-V3** — Le store d'événements bruts (si voie B) et l'éphémère DOIVENT être **partitionnés par
  mois** dès le départ, la purge se faisant par **`DROP` de partition** (constat R3-6).
- **EARS-V4** — Le hot path (WHERE/GROUP BY fréquents) NE DOIT PAS lire des champs via `props->>` ; un
  **index GIN sur `props` NE DOIT PAS** être créé par défaut (coût d'écriture ×2-5, pics de merge sur le
  pool partagé — constat R3-7).
- **Repères de coût (à titre indicatif, PG17)** : GROUP BY jour sur 1M lignes ≈ 50-200 ms (chaud),
  10M ≈ 0,5-2 s. **À l'échelle réelle (outil interne, faible trafic), 1M événements = plusieurs années.**
  Le **vrai** déclencheur du rollup/partition n'est pas le nombre de lignes mais la **protection du pool
  public** (§7) et la **rétention** (§6). Avec la **voie A (compteurs à l'écriture)**, le dashboard lit
  une table minuscule (≈ 365 j × quelques dimensions) → problème de volumétrie **quasi dissous**.

### 3.3 Fenêtre temporelle libre (constats R3-8, R4-#2)
- **EARS-T1** — Le fuseau de référence DOIT être **Europe/Paris** ; une « journée » DOIT commencer à
  **00:00 Europe/Paris** ; les bornes de jour DOIVENT être des **instants `timestamptz`** (`timestamp 'D
  00:00' AT TIME ZONE 'Europe/Paris'`), jamais un calcul en heure murale locale.
- **EARS-T2** — Les calculs de fenêtre DOIVENT utiliser l'arithmétique **calendaire** (`+ interval '1
  day'`), **jamais** `+ interval '24 hours'` (un jour de changement d'heure fait 23 ou 25 h — constat
  R3-8).
- **EARS-T3** — LÀ OÙ un rollup pré-calculé existe, une fenêtre non alignée au jour DOIT être calculée
  comme `rollup(jours pleins) + live(bords partiels)` avec des **bornes de jour identiques** entre rollup
  et live (sinon double-comptage/trou), et le rollup NE DOIT porter que sur des **jours scellés** (< aujourd'hui
  Paris).
- **EARS-T4** — La granularité temporelle minimale exposée DOIT être le **jour** ; TANT QUE la carte est
  affichée, une fenêtre **sous-jour DOIT être interdite** (une heure sur une maille fine ré-identifie —
  constat R1-5c).

---

## 4. Métriques demandées — fiche par fiche (verdicts après revue R4)

> Convention d'étiquetage obligatoire sur le dashboard (constat R4) :
> **✓ Mesuré** (fait comptable) · **≈ Estimation** (biais connu, infobulle nomme le biais, N brut
> toujours affiché) · **⚠ Approximation grossière**. **Tout pourcentage affiche son N** ; sous un
> plancher configurable (défaut N<30), on affiche le **compte brut** + « échantillon faible », pas le %.
> Un bucket « inconnu/indéterminé » est **toujours** affiché, jamais replié.

### M-1 — Provenance du trafic (source / referer / campagne)
- **Définition** : ventilation des `session_debut` par `source`/`medium`/`campagne` (allowlist) et
  `referer_hote`.
- **Sources** : `session_debut`.
- **Fiabilité** : referer **souvent absent/masqué** (politique navigateur, in-app browsers Instagram/
  TikTok, clients mail). Le bucket inconnu DOIT être nommé **« Direct / inconnu (referer absent ou
  masqué) »**, **jamais « Accès direct »** (constat R4-#1). L'auto-référence (sansvisavis.com→soi) DOIT
  être filtrée. Les campagnes ne s'affichent que **si** un tagging UTM existe, sinon masquées (pas de
  colonne vide trompeuse).
- **RGPD** : allowlist stricte + strip click-ids (RGPD §B.5).
- **VERDICT** : **mesurable avec réserve** (✓ pour source/medium taggés ; ⚠ pour le bucket inconnu).

### M-2 — Trafic par tranche temporelle libre
- **Définition** : nombre de **visites**/événements par fenêtre choisie (≥ jour).
- **Sources** : compteurs jour.
- **Fiabilité** : **sous-jour impossible** sous la troncature au jour (D1) — « trafic par heure » n'est
  PAS disponible sauf voie B assumée pseudonyme (constat R4-#2). Axe libellé « visites », jamais
  « visiteurs ».
- **VERDICT** : **mesurable au grain jour** ✓ ; **non mesurable au grain heure** sans changer D1.

### M-3 — Visiteurs uniques vs récurrents
- **VERDICT** : **NON mesurable proprement sans consentement.** On affiche **« Visites »** (démarrages
  de session). « Récurrent » est **structurellement incompatible** avec un identifiant de session
  éphémère jeté (le mesurer = réintroduire un traçage durable — constat R4-#3). **« Visiteurs uniques »
  et « récurrents » sont REFUSÉS comme métriques nommées.** SI Arno l'exige : une tuile **« Visiteurs
  estimés (≈) »** badgée avec le caveat sous/sur-comptage, **jamais un entier nu**, et seulement après
  décision A/J (bandeau ou exemption audience).

### M-4 — Nombre de tests / adresses distinctes
- **Définition retenue** : **« Analyses lancées »** = nombre d'événements `analyse_lancee` (ou
  `resultat`). **Re-runs inclus** (changement d'étage, rechargement SPA → nouvelle session) → note
  explicite « inclut les relances ».
- **« Adresses distinctes » : RETIRÉ de M2.** Les mailles/communes ≠ logements (une commune = des
  milliers de logements) ; le vrai compte de bâtiments distincts exigerait de stocker le `cleabs` →
  **M3 nominatif**. Au grain communal, seul « nombre de communes touchées » est honnête (proxy faible,
  à ne pas vendre comme « adresses »).
- **« Adresse » — tranché** : ni cleabs, ni BAN, ni point exact en M2. L'unité géo est la **commune**.
  Justification : minimisation (RGPD §A) ; le cleabs/BAN/point sont identifiants ou quasi.
- **VERDICT** : **« Analyses lancées » mesurable** ✓ (avec note re-runs) ; **« adresses distinctes » non
  fourni** en M2.

### M-5 — Ratio SANS_VIS_A_VIS / VIS_A_VIS
- **Nature** : statistique sur des **RÉSULTATS**, pas du comportement.
- **Déjà calculable ?** **NON** : rien n'est stocké aujourd'hui (§1). Mesurable **dès** que l'événement
  `resultat` est émis ; **non rétroactif**.
- **Définition** : **3 buckets** — SANS / VIS / **INDÉTERMINÉ** (existe : pas de bâtiment à l'origine /
  hors LiDAR). N absolu **toujours** affiché. Libellé **« sur les analyses réalisées »** (échantillon
  **auto-sélectionné** : les gens testent parce qu'ils espèrent être éligibles → **ne reflète pas le
  marché**, constat R4-#5). Avertissement « échantillon faible » sous N<30.
- **VERDICT** : **mesurable proprement** ✓ après instrumentation, **avec les garde-fous ci-dessus**.

### M-6 — Durée moyenne sur le site / par page / page de sortie
- **VERDICT** : **« durée moyenne » et « page de sortie » REFUSÉES telles quelles** (constat R4-#6,
  gravité critique). Motifs : **aucun signal de départ** n'existe (pas de beacon/beforeunload/heartbeat ;
  `visibilitychange` `page.tsx:1314` pilote la caméra) ; pas de « pages » (SPA sans URL) ; la dernière
  étape (souvent « résultat », la plus engageante) n'émet aucun événement postérieur → **sous-comptée** ;
  une session à 1 événement donne une durée 0 ; un onglet oublié gonfle la moyenne. Sous troncature au
  jour, une durée sub-jour n'est même pas calculable.
- **Remplacements honnêtes** :
  - **« Étape la plus loin atteinte »** (`etape_max`) — ✓ mesuré.
  - **« Taux d'abandon par étape »** (entonnoir) — ✓ mesuré, avec définition stricte du numérateur/
    dénominateur (constat R4-T3 : un rechargement SPA crée une nouvelle session ; définir « complétion »
    = a atteint `resultat` dans la session).
  - SI un temps est montré : **médiane + p90 inter-événements, cappé** (défaut 30 min, en config),
    **badgé ≈** « temps entre interactions ; exclut la dernière étape ; sessions à 1 événement non
    comptées ». **Jamais une moyenne nue.**

### M-7 — Données géographiques / carte des tests
- **Définition** : choropleth **communal** de densité d'analyses (`resultat` par `commune_insee`), avec
  **suppression sous k** (config, ≥ 11). Libellé « **où des analyses ont été lancées** » (pas « les biens
  sans vis-à-vis »).
- **Verdict/score par zone** : **seulement au niveau commune**, sous `k_attribut` + l-diversité ; jamais
  au niveau maille fine (RGPD §A.4).
- **Fiabilité à faible trafic** : la plupart des communes seront sous k → **carte peu remplie** au
  début. Tension assumée : **honnête ⇒ peu couverte / fine ⇒ ré-identifiante** (constat R4-#7). On
  choisit **honnête**.
- **VERDICT** : **mesurable au grain communal k-supprimé** ✓/⚠. Maille fine = A/J.

---

## 5. Géolocalisation d'IP (interne) — VERDICT : ne pas l'implémenter

- **Solutions locales gratuites** : **GeoLite2** (MaxMind) — « gratuit » = **compte + clé de licence +
  EULA + mises à jour ≥ mensuelles** via `geoipupdate` (cron), DB City ≈ 60-70 Mo ; **DB-IP Lite** —
  **CC-BY** (attribution affichée obligatoire), ≈ 300-400 Mo, mensuel.
- **Précision ville en France** : **faible** (passerelles opérateurs, CGNAT, IPv6) — souvent seul le
  département/région est fiable.
- **Coût argent** : 0. **Coût lookup** : mmap ≈ microsecondes (jamais le problème). **Vrai coût** :
  **maintenance** (compte + clé + cron + suivi de licence) pour **3 comptes admin**.
- **EARS-G1** — Le module M2 NE DOIT PAS géolocaliser ni stocker la localisation IP des comptes admin
  par défaut (Q-C §C.4 : disproportionné, précision faible, apport quasi nul vs le journal de connexion
  **nominatif déjà existant** — on sait déjà **qui** se connecte).
- **Honnêteté** : la réponse à « est-ce que ça apporte quelque chose que le journal n'a pas déjà ? » est
  **globalement non**. Si un besoin « pays / anti-bot » émerge côté public, le `referer`/`utm` ou une
  liste pays statique suffisent — aucun mmdb requis.

---

## 6. Rétention (rappel `SPEC_M2_evenements.md` §6)
- **EARS-R1** — Toute durée de rétention DOIT être lue depuis une **table de config**, éditable au
  runtime (exigence « pilotage sans code ») ; aucune durée en dur.
- **EARS-R2** — Le contexte de session éphémère DOIT être purgé à **TTL court** (config) après
  compaction en agrégats ; les agrégats k-safe MAY être conservés plus longtemps (chiffre **J**).
- **EARS-R3** — La purge DOIT s'effectuer par `DROP` de partition mensuelle, pas par `DELETE` massif.

---

## 7. Intégrité du moteur — le seam d'instrumentation (corrections R2, toutes)

> **Principe non négociable : golden bit-identique ; aucune certification jamais bloquée par
> l'instrumentation.**

- **EARS-M1** — Le writer d'événements DOIT vivre dans un module isolé (`app/lib/analytics/**`) et NE
  DOIT JAMAIS être importé par `app/lib/svv/**` ni `app/lib/db/pipeline.ts` (chemin de calcul du verdict/
  score). *(Garde : voir EARS-M6.)*
- **EARS-M2** — L'émission DOIT se faire via `after()` de Next 16 (post-réponse), avec construction du
  payload **à l'intérieur** d'un `try/catch` dans le callback `after` ; SI la construction ou l'écriture
  lève, ALORS la réponse au tunnel DOIT néanmoins aboutir. *(Constat R2-2 : un `void fn().catch()`
  n'intercepte PAS un throw synchrone dans l'évaluation des arguments → 500 sur une certification
  réussie. Le payload NE DOIT PAS être évalué avant le `after`.)*
- **EARS-M3** — L'écriture analytics DOIT utiliser un **pool `pg` dédié borné** (ex. `max` 2-3,
  `connectionTimeoutMillis` court, `statement_timeout` court), **distinct** du pool de calcul
  (`app/lib/db/client.ts:8`). *(Constat R2-1/R3-1 : le pool partagé `max=10` sans `connectionTimeoutMillis`
  peut être affamé par les écritures analytics → un `connect()` du calcul attend indéfiniment → tunnel
  bloqué.)*
- **EARS-M4** — L'écriture analytics DOIT être un `INSERT`/`UPSERT` mono-instruction auto-commit ; elle
  NE DOIT PAS utiliser `withTransaction` (qui épingle une connexion — `client.ts:32`).
- **EARS-M5** — L'instrumentation NE DOIT PAS être placée dans le middleware `proxy.ts` ni étendre son
  matcher aux routes publiques (sinon latence sur toutes les certifications ; le matcher reste admin-only).
- **EARS-M6** — Une **garde durable anti-couplage** DOIT exister : (a) règle ESLint `no-restricted-imports`
  interdisant l'import de `app/lib/analytics/**` depuis `app/lib/svv/**` **et** `app/lib/db/pipeline.ts`
  (cible **le writer**, pas `db/client` — car `preparateurPaysage.ts:10` importe déjà `db/client`, un
  ciblage naïf ferait un faux positif) ; (b) un **test de graphe d'imports** asserant que
  `app/lib/analytics/**` n'apparaît jamais dans la clôture transitive de `pipeline.ts`/`verdict.ts`/
  `scoreTotal.ts`. *(Constat R2-4/5 : le golden ne prouve PAS l'absence de couplage — un writer branché
  par erreur dans `analyserAdresse` ne bougerait pas le score.)*
- **EARS-M7** — La migration analytics NE DOIT ajouter **aucun** trigger, colonne ou FK sur une table de
  calcul (`bdtopo_batiment`, `mns_lidar_brut`, `mnt_lidar_brut`, `patrimoine_entite*`, …) ; les tables
  analytics DOIVENT être **strictement nouvelles et autonomes** *(constat R2-5 : sinon locks/plans →
  golden potentiellement affecté)*.
- **EARS-M8** — La perte d'événements (crash avant flush de `after`) est **acceptable** (analytics
  best-effort) ; l'événement NE DOIT PAS être émis **avant** la réponse (ce serait bloquant).

---

## 8. Architecture du dashboard

- **EARS-D1** — Le dashboard DOIT être servi sous `app/(admin)/admin/(protected)/statistiques/…` et
  gardé par **`perm_statistiques`** (existe déjà ; réutiliser le patron `garde`/`proxy`).
- **EARS-D2** — Les routes de lecture analytics (pseudonymes) DOIVENT être **séparées** des routes
  nominatives (M3) et NE DOIVENT PAS ralentir l'app publique (pool/`statement_timeout` distincts).
- **EARS-D3** — LÀ OÙ un pourcentage est affiché, le dashboard DOIT afficher le **N absolu** ; SI N <
  seuil (config, défaut 30), ALORS il DOIT afficher le compte brut + « échantillon faible », pas le %.
- **EARS-D4** — Chaque métrique DOIT porter son badge **✓ / ≈ / ⚠** ; une métrique **≈** DOIT exposer,
  en infobulle, la **nature du biais**.
- **EARS-D5** — Le dashboard DOIT être **responsive mobile-first (375px)** : KPI en cartes empilées,
  graphiques en repli (barres/sparklines simples), tableaux denses en accordéon/cartes ; la carte
  Leaflet DOIT être utilisable **au doigt** (pinch-zoom).
- **EARS-D6** — Aucun élément neuf du dashboard NE DOIT utiliser de **bleu** (hiérarchie SVAV : rouge
  plein primaire, rouge contour secondaire, gris contour neutre ; focus non-bleu). *(Exception : le bleu
  métier existant de la carte de curation, hors M2.)*
- **EARS-D7** — Le dashboard NE DOIT PAS ajouter de dépendance de graphes ; les graphiques simples
  DOIVENT être rendus en **SVG/CSS inline** ; la carte réutilise **Leaflet** (déjà présent). SI un besoin
  de visualisation complexe apparaît, l'ajout d'une lib légère est une **décision d'Arno** (poids bundle,
  maintenance), pas un défaut.
- **Évolutivité UI** : une nouvelle métrique = une nouvelle carte lisant une requête d'agrégat existante,
  sans schéma ni dépendance nouvelle.

---

## 9. Ce qui n'est pas demandé mais qui manquerait (max 5 — options, hors périmètre)

1. **Détection d'échec de connexion / brute-force admin** (`session/route.ts` ne trace que les succès).
   *Deux lignes de valeur : sur 3 comptes, un credential-stuffing passe aujourd'hui inaperçu.*
2. **Entonnoir d'abandon AVEC cause** (`point_origine_refuse.raison`, etc.), pas juste des comptes.
   *Transforme « X% abandonnent à l'étape 2 » en « bloqués car point hors emprise » → actionnable
   produit.*
3. **Bandeau d'honnêteté sur le dashboard** : chaque estimation badgée ≈, chiffre-titre « visites »
   annoté de la part bots filtrée. *Empêche d'induire un fondateur non-technicien en erreur (cœur R4).*
4. **Frontière M2↔M3 formalisée** : garantir qu'aucun événement M2 ne porte jamais l'identité
   nominative (email de la demande d'estimation). *La demande d'estimation finit le tunnel = donnée
   personnelle → M3 ; M2 ne doit jamais l'aspirer.*
5. **Alerte d'anomalie** (pic de trafic, bascule du ratio verdicts). *Cheap une fois les événements en
   place ; transforme un tableau passif en signal.*

---

## 10. Conformité (rappel)
- Aucun code, aucune migration, aucun DDL, aucune dépendance ajoutée dans ce lot (étude seulement).
- Aucun fichier moteur touché ; golden hors de portée (l'instrumentation, quand elle sera codée, sera
  hors du chemin pur — §7).
- Fichiers Gemini jamais touchés. Aucun commit.
