# PLAN DE BUILD — Module Internaute (base nominative évolutive)

> **Statut : PLAN — aucun code produit.** Déclinaison technique concrète des deux études
> (`docs/ETUDE_architecture_data_module_internaute.md` = ossature 3 blocs A/B/C ;
> `docs/ETUDE_module_internaute_rgpd.md` = cadrage RGPD, finalités, séquencement, loi démarchage).
> Ancré dans le code et le schéma RÉELS du repo (recon Phase A, `fichier:ligne` ci-dessous).
> **Développement 100 % LOCAL.** Chaque lot est committable seul. Le build réel sera lancé lot par
> lot, après validation d'Arno.
>
> ⚠️ **Ce plan n'est pas un avis juridique.** Les points « à confirmer avant mise en ligne » (juriste/DPO)
> sont listés par lot et ne bloquent PAS le build LOCAL, mais bloquent la mise en production.

---

## PARTIE I — RECON DE L'EXISTANT (Phase A, lecture seule)

### A.1 — Le tunnel public aujourd'hui : rien de nominatif n'est persisté

| Donnée | Saisie (fichier:ligne) | Transite vers | Persistée nominativement ? |
|---|---|---|---|
| Adresse / point d'origine (lat, lon) | écran localisation `app/page.tsx` | `POST /api/analyse` (payload `page.tsx:~1968` : `{lat, lon, azimut, etage, hauteurSousPlafondM, dernierEtage, mode}`) ; autocomplétion `/api/adresses-proches` | **NON** |
| Étage, dernier étage, hauteur sous plafond | écran infos logement `app/page.tsx` | `POST /api/analyse` | **NON** |
| Photo | écran photo `app/page.tsx` | `POST /api/analyse-photo` → Gemini, analysée « en vol » | **NON** (aucun S3) |
| Verdict, score | calculés serveur `app/api/analyse/route.ts` | renvoyés au client `{ ok, validation, resultat }` (`analyse/route.ts:89`) ; `resultat.verdict.verdict` + `resultat.score.total` (`:77-78`) | **NON** côté nominatif ; **ANONYME** côté M2 (verdict + tranche + commune INSEE, `:79-80`) |
| **Prénom, nom, email, téléphone** | `EcranCertificat` (`page.tsx:751-754`, champs requis dans l'UI) | **NULLE PART** — restent en state React ; **aucun `fetch`** ne les transmet | **NON** |

**Confirmé** : `EcranCertificat` (`page.tsx:737-1126`, rendu quand `etape==='certificat'`) collecte l'identité
(prénom `:751`, nom `:752`, email `:753`, téléphone E.164 `:754`) **ET ~9 champs projet supplémentaires déjà
saisis mais ORPHELINS** (type de bien `:759`, surface `:760`, pièces `:761`, époque `:762`, terrasse `:764`,
balcon `:765`, jardin `:766`, **résidence principale `:757`**, adresse de résidence `:758`). Le bouton « Valider »
ne fait que `setSoumis(true)` (`page.tsx:1103`) → **aucun `fetch`**. L'écran de confirmation est un **placeholder**
(« pas encore de PDF ni email — à l'étape suivante », `page.tsx:849,862-864`). Les CTA estimation/plus-value sont
des **no-op** (`todoEcranAVenir`, `page.tsx:133`). Les seuls appels réseau du parcours sont `/api/adresses-proches`,
`/api/analyse`, `/api/analyse-photo` (+ beacon anonyme `/api/mesure`) — **aucun** ne porte le nom/email/téléphone.
**Aucune** route `certificat`/`contact`/`lead`/`internaute`, **aucune** table nominative, certificat `SAVV-AAAA-NNNNNN`
**non implémenté**. → **On construit à partir de zéro, en « privacy by design ».**
> 💡 **Insight ingestion** : ces ~9 champs projet sont **déjà collectés côté UI** — ils alimenteront directement le
> **payload bloc C** (LOT 2) **sans nouvelle saisie**, juste un câblage. Seule la persistance manque.

### A.2 — Conventions DB / migrations (à respecter)

- **Répertoire** : `db/migrations/`, fichiers `NNN_slug.sql` (3 chiffres zéro-paddés + slug snake_case FR), séquence
  **contiguë 001 → 022**. **Prochain n° libre CONFIRMÉ : `023`.** Slugs récents préfixés module/lot (`018_m2_…`).
- **Application** : **100 % MANUELLE** (Arno), aucun runner (pas de `migrate` dans `package.json`, pas de knex/drizzle/prisma).
  En-tête type : `-- Application MANUELLE (Arno), arrêt au 1er échec : psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/NNN_slug.sql` (cf. `022:22-23`, `018:40-41`).
- **En-tête de commentaires standard** (à reproduire) : MOTIF + propriétés **ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE /
  REJOUABLE / TRANSACTIONNELLE**, mention **Golden-safe**, commande `psql`, procédure de **ROLLBACK non destructif** (DROP manuel).
- **Transaction** : convention récente (série M2) = envelopper `BEGIN;` … `COMMIT;` (018:47/212). Idempotence :
  `CREATE TABLE/INDEX IF NOT EXISTS`, seeds `ON CONFLICT DO NOTHING`.
- **Colonnes** : `CHECK (… IN (…))` pour enums fermés ; `jsonb` pour payloads/`avant`/`apres` ; horodatage **`timestamptz`**
  au **nommage FR** — `cree_a`, `maj_a`, `ts` (014:29,53), **jamais `created_at`** ; index nommés `<table>_<cols>_idx`.
- ⚠️ **Clé primaire — arbitrage à acter** : les tables app/admin utilisent `bigserial PRIMARY KEY` (014:16) ; **aucun
  `gen_random_uuid()`/pgcrypto/uuid-ossp** dans les migrations actuelles (le seul `uuid`, `analytics_session.session_id`,
  est généré **côté writer** et validé v4 par CHECK). L'étude archi (§2.2) impose une **clé UUID** pour le nominatif
  (rectification/effacement, jamais l'email). → **Décision LOT 1** : `id uuid` généré soit par `gen_random_uuid()`
  (**natif PostgreSQL 13+**, PG17 ici — aucune extension requise), soit côté application (patron writer analytics).
  C'est un **écart assumé** du `bigserial` habituel, justifié RGPD, à tracer.
- ⚠️ **Aucun schéma Postgres dédié** : tout vit dans `public`, cloisonnement par **préfixe de table** (`internaute_*`),
  jamais par `CREATE SCHEMA`. `CREATE EXTENSION` (postgis) uniquement en 001.
- **Accès DB** : `pool`/`query` de `app/lib/db/client.ts` (`process.env.DATABASE_URL`, `dotenv/config`). ⚠️ Le module
  nominatif utilise CE pool — **jamais** `poolAnalytics` (`app/lib/analytics/pool.ts`, isolé, réservé M2). PostGIS actif.

### A.3 — Cloisonnement M2 (invariant à préserver)

- Tables M2 (dans `public`, préfixe **`analytics_`**) : `analytics_catalogue_evenement`, `analytics_retention`,
  `analytics_compteur_jour`, `analytics_session` (+ partitions `analytics_session_*`), `analytics_admin_jour`,
  `analytics_maintenance_config` (019), `analytics_config` (020) — **PLUS ⚠️ `login_echec` (021, M2 Lot 7, SANS
  préfixe `analytics_`)** : piège à inclure explicitement dans la liste d'exclusion.
- **Structurellement anonyme** : `ip_hash` **INTERDIT** (`018:8`), aucune lat/lon ni `cleabs`, seule géo =
  `commune_insee` bornée **5 caractères par CHECK** (`018:108-110`), CHECK anti-fingerprint (`018:126-133`) ;
  `analytics_admin_jour` **sans `utilisateur_id`** (agrégé, `018:171-184`) ; session_id = UUID v4 éphémère jeté.
  k-anonymat **k=11** (`analytics_config`, `020:36` ; repli `K_DEFAUT=11` `app/lib/analytics/lecture/kAnonymat.ts:19`)
  appliqué **à la seule restitution**.
- `/api/analyse` dérive la commune puis **jette lat/lon** (`analyse/route.ts:72,79-80`).
- **Enforcement existant côté M2** : pool DÉDIÉ `poolAnalytics` (`app/lib/analytics/pool.ts:33`), qui **n'importe pas**
  `app/lib/db/client.ts`, + garde ESLint + **test de graphe d'imports** interdisant tout import croisé moteur↔analytics.
- **Invariant module internaute** : AUCUNE FK vers `analytics_*` ni `login_echec`, AUCUN UUID partagé, AUCUN flux
  M2↔nominatif. → prévoir une **garde de test dédiée** (analogue `app/lib/admin/garde.test.ts` / test de graphe M2)
  interdisant qu'un module nominatif importe `app/lib/analytics/*` (et réciproquement).

### A.4 — Données déjà calculées, rattachables à un profil (SANS toucher le moteur)

Le moteur produit, **et renvoie au front** dans la réponse `/api/analyse` (`{ ok, validation, resultat }`,
`analyse/route.ts:89`), les valeurs exploitables comme filtres commerciaux — donc **capturables à
l'ingestion depuis la réponse API existante**, sans modifier aucun fichier moteur gelé :

| Champ commercial | Disponible en fin de tunnel ? | Source | Action |
|---|---|---|---|
| **Verdict** (SANS/VIS/INDÉTERMINÉ) | ✅ | `resultat.verdict.verdict` (`analyse/route.ts:77`) | capture front |
| **Score /100** | ✅ | `resultat.score.total` (`analyse/route.ts:78`) | capture front |
| **Étage / dernier étage / hauteur sous plafond** | ✅ | saisis, dans le payload `/api/analyse` (`page.tsx:~1968`) | capture front |
| **Commune (INSEE)** | ✅ déjà captée front | état `communeInsee` (`page.tsx:1170,1412`, BAN `citycode` `AdresseAutocomplete.tsx:37`) ; ou serveur `communeDuPoint` (`analyse/route.ts:79`) | capture front (INSEE) ; le **nom** de commune n'est pas capté par le tunnel |
| **lat/lon origine (recalé)** | ✅ | réponse API `validation.pointSnappeWgs84` (`origine.ts:28`) (⚠️ position logement, sensible) | capture **sous consentement** |
| **Résidence principale** | ⚠️ **déjà en UI mais ORPHELINE** | `EcranCertificat` (`page.tsx:757`, rendu `:1075-1096`) — jamais postée ni persistée | **à CÂBLER** (capter + persister), **pas à créer** (LOT 2) |

> **Précision (agent recon)** : la **réponse `/api/analyse` seule** porte score/verdict/distance/coords/altitude, **mais
> PAS** étage/dernier-étage/hauteur-sous-plafond/commune/résidence-principale (ce sont des **entrées** ou des champs
> collectés ailleurs). Le **point de capture complet est donc le FRONT en fin de tunnel**, qui agrège (a) la réponse
> API + (b) les états de saisie (étage, dernier étage, hauteur, `communeInsee`) + (c) les champs `EcranCertificat`
> (résidence principale, détails projet). **Le moteur reste lu, jamais modifié — golden `29.107259068449615` intact.**
> ⚠️ `resultat` peut être `null` (point invalide → verdict effectif `INDETERMINE`, `route.ts:77`) : l'ingestion doit
> gérer ce cas.

### A.5 — Conventions admin (pour l'écran « Internautes »)

- **Permission `internautes` DÉJÀ déclarée** : `perm_internautes` (`014:26`), type `Module` (`session.ts:5`),
  tuile menu (`menuAdmin.ts:15`, `perm: 'internautes'`). Placeholder `internautes/page.tsx` (`intro="Module à venir."`).
- **Garde serveur** : `exigerCompteActif(request, 'internautes')` (`garde.ts:88`) sur chaque route admin ;
  `exigerAdministrateur(request)` (`garde.ts:56`) pour le réservé-administrateur.
- **Charte** : `EnTetePage` (`_composants/EnTetePage.tsx`) + classes `svv-page-*`, palette rouge/gris,
  **aucun bleu**, mobile-first 375px, focus rouge, `prefers-reduced-motion`. Journal append-only =
  patron `curation_patrimoine_log` (`utilisateur_id`, action CHECK, `avant`/`apres` jsonb).
- ⚠️ La base nominative étant **bien plus sensible que M2**, arbitrer (LOT 1) si l'**extraction/export** doit
  être **réservée au rôle administrateur** (comme « Audit »/« Administratif », non délégable) plutôt qu'à la
  simple `perm_internautes` délégable. → point à trancher, défaut prudent = extraction réservée administrateur.

---

## PARTIE II — ARCHITECTURE CIBLE (fusion des deux études)

**Trois blocs reliés par un UUID** (`internaute.id`), séparés pour être conformes ET évolutifs d'un même geste :

```
internaute (BLOC A — identité/contact, sensible, uuid)
   ├─1..N→ internaute_projet (BLOC C — résultat + réponses tunnel, JSON versionné + colonnes stables)
   │           └─ (futur) photo (URL S3) · certificat (SAVV-…, PDF S3)
   ├─1..N→ internaute_consentement (BLOC B — 1 ligne / finalité / décision, horodatée, versionnée) ← PREUVE
   │           └─ internaute_consentement_texte (versions des mentions affichées)
   └─1..1→ internaute_statut_commercial (suivi finalité 1)
```

- **Bloc A** = strict nécessaire minimisé (prénom, nom, email, téléphone). Clé = **uuid**, jamais l'email.
- **Bloc B** = **cœur de la conformité** : consentement **granulaire par finalité** (F1/F2/F3), **append-only**
  (un retrait = nouvelle ligne `accepte=false`, jamais d'écrasement), chaque preuve pointe la **version du texte**.
- **Bloc C** = **évolutif par conception** : **Approche 1 (payload JSON versionné)** au lancement, avec
  **promotion en colonnes** (glissement vers l'hybride, Approche 3) des champs stables et fréquemment filtrés
  (verdict, score, étage, commune…). Chaque enregistrement porte sa **version de tunnel/parcours** + horodatage.
- **Consentement = préalable structurel** : l'extraction pour une finalité JOINT la vue « consentement ACTIF »
  filtrée sur cette finalité → un profil non consentant est **structurellement absent** de l'extraction. La
  couche existe **dès le LOT 1** (en LOCAL on seed librement des données de test, mais la structure impose la règle).
- **Invariants transverses** : cloisonnement total M2 ; moteur/golden hors de portée ; fichiers gelés intouchés ;
  photo jamais en base (URL S3 le jour venu) ; effacement non destructif de la preuve B.

---

## PARTIE III — PLAN PAR LOTS

> Ordre **imposé par la conformité** (§8 étude RGPD) : on construit d'abord ce qui **protège**, puis ce qui
> **exploite**. Effort indicatif : **S** ≈ ½–1 j, **M** ≈ 1–2 j, **L** ≈ 3–5 j (build + tests).

### LOT 0 — Cadrage juridique (HORS CODE) — *bloquant avant mise en ligne, PAS avant build local*
- **Objectif** : obtenir les réponses DPO du §7 de l'étude RGPD (base légale par finalité, sort du téléphone,
  durées, AIPD, formulation des cases/mentions, F3). Rien ne se construit **en ligne** avant.
- **Livrable** : décisions consignées ; formulations de cases + mentions versionnées (alimentent `…_consentement_texte`).
- **Effort** : hors périmètre technique. **Le build LOCAL des LOTS 1-4 peut démarrer en parallèle** avec des
  valeurs « à confirmer » (finalités actives, durées) marquées comme telles.

### LOT 1 — Socle : schéma 3 blocs + consentement structurel + droits
- **Objectif** : poser A/B/C et la mécanique de consentement/preuve/effacement/opposition. **Aucune exploitation
  marketing.** À la fin : on collecte proprement (en test local) et on sait supprimer.
- **Tables / champs** (migration **`023_internaute_socle.sql`**) :
  - `internaute` (A) : `id uuid PRIMARY KEY` (génération `gen_random_uuid()` natif PG13+ **ou** app-side — cf. A.2,
    écart assumé du `bigserial`), `prenom`, `nom`, `email` (unicité applicative — cf. §7), `telephone` (E.164,
    **nullable**, minimisation), `source_collecte`, `opposition_recontact boolean DEFAULT false`,
    `cree_a`/`maj_a timestamptz DEFAULT now()`. *(Chiffrement au repos email/téléphone : cf. Risques + §7.)*
  - `internaute_consentement` (B, append-only) : `id`, `internaute_id → internaute(id)`,
    `finalite text CHECK (finalite IN ('recontact_interne','email_marketing','retargeting_tiers'))`,
    `accepte boolean`, `horodatage timestamptz DEFAULT now()`, `texte_id → internaute_consentement_texte(id)`,
    `canal text`. **Jamais d'UPDATE destructif.**
  - `internaute_consentement_texte` (B) : `id`, `finalite`, `version`, `texte`, `cree_le` — versions des mentions.
  - `internaute_projet` (C) : `id uuid`, `internaute_id`, `version_tunnel int NOT NULL`, `payload jsonb NOT NULL`
    (réponses brutes versionnées — **absorbe directement les ~9 champs `EcranCertificat` déjà collectés** : type de
    bien, surface, pièces, époque, balcon, terrasse, jardin… cf. A.1) + **colonnes stables promues** : `verdict text`,
    `score numeric`, `etage int`, `dernier_etage boolean`, `residence_principale boolean` (câblé depuis l'UI existante),
    `commune_insee char(5)`, `lat double precision`, `lon double precision` (⚠️ sensible), `adresse_saisie`,
    `adresse_normalisee`, `cree_a timestamptz DEFAULT now()`.
  - `internaute_statut_commercial` : `internaute_id`, `statut text CHECK (… IN ('nouveau','a_rappeler','rappele','pas_interesse','oppose'))`, `note`, `maj_le`, `maj_par uuid`.
  - `internaute_acces_log` (append-only, patron `curation_patrimoine_log`) : `id`, `utilisateur_id`, `action`
    (`consultation`|`extraction`|`rectification`|`effacement`|`export_personne`), `cible_internaute_id`, `finalite`,
    `nb_lignes`, `ts`, `details jsonb`.
  - **Vue/fonction `consentement_actif(internaute_id, finalite)`** = dernière ligne `accepte=true` par (personne, finalité) → **la porte structurelle**.
- **API** : aucune publique ce lot. Fonctions serveur internes (`app/lib/internaute/*`) : création profil, ajout
  consentement (avec preuve), état de consentement actif, effacement (retire A+C, **conserve** B), opposition.
- **Écrans** : aucun.
- **Tests** : schéma applique/rejoue ; append-only du consentement (retrait = nouvelle ligne) ; `consentement_actif`
  renvoie bien le dernier état ; effacement supprime A+C et **garde** B ; opposition pose le flag ; **garde de
  cloisonnement** (aucun import `analytics/*`). Golden rejoué **inchangé**.
- **Risques** : chiffrement au repos (choix pgcrypto vs applicatif — à cadrer) ; unicité email (doublons vs droit
  de rectification). **Points subordonnés** : durées (LOT 4), formulations de cases (LOT 0), nécessité téléphone.
- **Effort** : **L**. **Migrations** : `023`.

### LOT 2 — Ingestion depuis le tunnel (sous consentement)
- **Objectif** : un profil entre dans la base **quand l'internaute consent**, en capturant les champs déjà saisis +
  le résultat déjà calculé. Anticiper l'ajout futur de champs (parcours d'estimation) via le payload versionné.
- **Tables / champs** : aucune nouvelle table (réutilise LOT 1). Éventuelle migration `024` si ajustement.
- **API** : **`POST /api/internaute`** (route PUBLIQUE, hors `(admin)`) — appelée par `EcranCertificat` **seulement
  après consentement**. Body : identité (A) + **consentements par finalité avec version de texte** (B) + `version_tunnel`
  + `payload` (C, réponses brutes) + valeurs capturées (`verdict`, `score`, `etage`, `dernier_etage`,
  `residence_principale`, `commune_insee`/lat-lon, adresse). **Transaction atomique** (A+B+C d'un bloc). Ne throw
  jamais vers le tunnel (l'échec d'ingestion ne casse pas le parcours).
- **Front** (`app/page.tsx`, **sensible non gelé**) : câbler `EcranCertificat` (identité `page.tsx:751-754` + les ~9
  champs projet déjà saisis + `communeInsee` `:1170` + états étage/dernier-étage/hauteur + réponse `/api/analyse`
  mémorisée) → `POST /api/internaute` au clic « Valider » (`:1103`, aujourd'hui simple `setSoumis(true)`). **Résidence
  principale : déjà en UI (`:757`, `:1075-1096`) → juste la persister** (pas de nouvelle saisie). Ajouter les **cases de
  consentement** (une par finalité, **non pré-cochées**, **non couplées** au certificat). **Gérer `resultat===null`**
  (verdict `INDETERMINE`). Recon lecture seule obligatoire avant write (fichier sensible).
- **Écrans** : cases de consentement + mention d'information sur le formulaire (contenu = LOT 0).
- **Tests** : ingestion crée A+B+C ; **refus d'ingestion marketing sans consentement** ; idempotence/anti-doublon ;
  le tunnel n'est jamais bloqué par un échec d'ingestion ; **aucun** champ nominatif n'atteint M2.
- **Risques** : couplage interdit (le certificat doit s'obtenir **sans** cocher de case) ; capture front fidèle aux
  valeurs moteur (pas de recalcul). **Points subordonnés** : téléphone obligatoire ou non ; base légale F1.
- **Effort** : **M**. **Migrations** : `024` (si besoin).

### LOT 3 — Exploitation : extraction filtrée par consentement + écran admin « Internautes »
- **Objectif** : moteur de requête interne SVAV + écran admin homogène. **L'extraction ne retourne QUE les profils
  dont le consentement à la finalité visée est ACTIF** (invariant structurel).
- **Tables / champs** : index de filtrage (migration `025_internaute_index.sql`) sur `commune_insee`, `score`,
  `dernier_etage`, `cree_le`, `verdict`, `residence_principale`, et sur l'état de consentement.
- **API** (sous `app/(admin)/api/admin/internautes/`, garde `exigerCompteActif('internautes')` — extraction
  possiblement **réservée administrateur**, cf. A.5) : liste filtrée + export.
  Filtres **a minima** : ville/commune, score (+ tranches), dernier étage, résidence principale (o/n), date de
  création, **finalité(s) consentie(s)**, statut commercial. **Filtres extensibles** (registre de filtres, pas de
  liste figée dans le code). Export **CSV** (usage interne), **calculé côté serveur**, **filtré par la finalité
  visée** — jamais « toute la base ». Chaque extraction **journalisée** (`internaute_acces_log`).
- **Écrans** : `internautes/page.tsx` (remplace le placeholder) — `EnTetePage`, classes `svv-page-*`, **aucun bleu**,
  mobile-first : consultation, filtres (repli en cartes/accordéons sur mobile), bouton d'extraction, gestion des
  demandes de droits (accès/rectification/effacement + journalisation). Homogène M1-M5.
- **Tests** : un profil **non consentant F_x est absent** de l'extraction F_x ; export CSV filtré serveur ;
  journalisation de chaque extraction (qui/quand/finalité/nb lignes) ; responsive 375px ; aucun bleu.
- **Risques** : fuite par filtre mal cloisonné (toujours re-filtrer côté serveur) ; volumétrie (index). **Points
  subordonnés** : périmètre exact des droits exposés à un collaborateur vs administrateur.
- **Effort** : **L**. **Migrations** : `025`.

### LOT 4 — Cycle de vie : rétention paramétrable + purge / anonymisation
- **Objectif** : durées de conservation **par bloc**, purge/anonymisation automatique à échéance, effacement sur
  demande (déjà structurel LOT 1) industrialisé. Cloisonné M2.
- **Tables / champs** : `internaute_retention` (config `cle`/`jours`/`description`, patron `analytics_retention`,
  migration `026_internaute_retention.sql`) — **durées paramétrables au runtime**, jamais en dur.
- **API / jobs** : job de purge (patron rétention M2) — anonymise/supprime A+C à échéance, **conserve la preuve B**
  pour la durée légale. **⚠️ Règle dure SVAV** : toute suppression est un **process explicitement validé** (migration/
  tâche approuvée par Arno), **jamais** une suppression autonome d'agent.
- **Écrans** : réglage des durées dans l'admin (si piloté au runtime).
- **Tests** : purge respecte les durées ; effacement cascade (A+C) **garde B** ; anonymisation irréversible testée ;
  **aucun** impact M2.
- **Risques** : destructif par nature → garde-fous stricts, dry-run, journalisation. **Points subordonnés** : durées
  exactes par finalité (**bloquant avant mise en ligne**), effacement S3 des photos le jour où S3 existe.
- **Effort** : **M**. **Migrations** : `026`.

### LOT 5 — API d'échange INTERNE (finalité F1, recontact SVAV)
- **Objectif** : usage **interne** (Arno/équipe) — le plus simple, aucune donnée ne sort vers un tiers.
- **API** : endpoint(s) admin dédiés, **auth `exigerCompteActif('internautes')`** (ou administrateur), qui ne
  renvoient que les profils **F1 actif ET non opposés** (`statut ≠ 'oppose'`, `opposition_recontact=false`).
  **Périmètre de champs = complet interne.** Séparé de tout usage tiers.
- **Tests** : F1 requis ; opposition bloque ; journalisation.
- **Risques** : loi démarchage (téléphone **opt-in prouvé** au 11/08/2026). **Points subordonnés** : base légale F1,
  frontière « contrat en cours » vs prospection.
- **Effort** : **M**. **Migrations** : aucune (réutilise LOT 1/3).

### LOT 6 — Relances email (finalité F2)
- **Objectif** : segments/export **uniquement opt-in email**, respect du retrait, désinscription.
- **API** : export email restreint à F2 actif ; lien de désinscription = retrait (nouvelle ligne B `accepte=false`).
- **Tests** : seuls les F2 actifs sortent ; retrait effectif ; journalisation.
- **Risques / points subordonnés** : opt-in ePrivacy/RGPD (acquis), mentions.
- **Effort** : **S–M**.

### LOT 7 — API TIERS / retargeting (finalité F3) — LE PLUS TARD, LE PLUS SENSIBLE
- **Objectif** : usage **tiers/partenaires** (Meta/Google) — **transfert vers des tiers**, régime le plus strict.
  **Strictement séparé** de l'usage interne (LOT 5) : **endpoint distinct, auth distincte, périmètre de champs
  MINIMISÉ** (un tiers ne reçoit pas tout — ex. email haché pour audiences, jamais l'identité complète).
- **API** : export/flux F3 **uniquement F3 actif ET non opposé**, mentions de transfert tiers, **traçabilité stricte**
  (journalisation renforcée). **Ne partage aucun endpoint avec l'usage interne.**
- **Tests** : seuls F3 actifs sortent ; périmètre minimisé (pas de champ hors nécessaire) ; journalisation renforcée.
- **Risques** : le plus sanctionné (CNIL) ; transfert hors UE selon l'outil. **Points subordonnés (BLOQUANTS avant
  activation)** : validation juridique spécifique F3, conditions de consentement/mentions, base de hachage des audiences.
- **Effort** : **M–L**. **À ne lancer qu'après validation juridique dédiée F3.**

### (Différé) Photo S3 + Certificat `SAVV-AAAA-NNNNNN`
Hors périmètre initial (aucun S3 aujourd'hui, certificat non implémenté). Le jour venu : tables `photo`
(URL+métadonnées, **jamais l'image**, CLAUDE.md §7) et `certificat` (numéro atomique, CLAUDE.md §6) rattachées à
`internaute_projet` ; l'effacement (LOT 4) devra alors purger **l'objet S3**, pas seulement l'URL. Le certificat
portera des **mentions/limites de portée** (fait géométrique, jamais conclusion juridique — étude RGPD §B) ; question
**assurance RC pro** tranchée au §7.

---

## SÉQUENCE RECOMMANDÉE

`LOT 0 (juridique, // build local)` → **`LOT 1 (socle)`** → `LOT 2 (ingestion)` → `LOT 3 (exploitation + écran)` →
`LOT 4 (cycle de vie)` → `LOT 5 (API interne F1)` → `LOT 6 (email F2)` → `LOT 7 (tiers F3)`.

- **Conformité d'abord** : 1 (collecter+supprimer proprement) avant toute exploitation.
- LOT 2 dépend de 1 ; LOT 3 dépend de 1-2 ; 5/6/7 dépendent de 1-3 ; 4 peut suivre 3.
- **Le premier lot à attaquer est le LOT 1 (socle)** — pas l'écran ni l'API : sans le schéma 3 blocs et la
  mécanique de consentement/effacement, tout le reste serait non conforme par construction.

---

## INVARIANTS & GARDE-FOUS (valables à CHAQUE lot)

- **Golden `29.107259068449615` intact** : le module ne touche **aucun** fichier moteur (`app/lib/svv/*`,
  `app/lib/db/pipeline.ts` — consommés en **lecture** via la réponse `/api/analyse`, jamais modifiés).
- **Fichiers gelés intouchés** : `password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts` (ce dernier est **importé**
  `exigerCompteActif`, jamais modifié). **Gemini** (`adaptateurIaPhoto.ts`, `analyse-photo/route.ts`) intouchés.
- **Cloisonnement M2 total** : aucune FK/UUID/jointure vers `analytics_*` ; garde de test dédiée.
- **Consentement = préalable structurel** dès le LOT 1 ; retrait non destructif (append-only).
- **Règle dure suppression** : toute purge = process prévalidé par Arno, jamais autonome.
- **Charte admin** : `EnTetePage` + `svv-page-*`, aucun bleu, mobile-first 375px, focus rouge, `prefers-reduced-motion`.
- **Migrations** : manuelles `psql … "$DATABASE_URL"`, idempotentes, numérotées à partir de **023**.

---

## POINTS SUBORDONNÉS À DÉCISION NON TECHNIQUE — « à confirmer avant mise en ligne »
*(n'empêchent PAS le build LOCAL ; empêchent la mise en production)*

| # | Point (étude RGPD §7 / Sections A-B) | Lot impacté | Effet si non tranché |
|---|---|---|---|
| 1 | Base légale de chaque finalité (F1 intérêt légitime / consentement / service) | 1, 2, 5 | forme des cases, obligation ou non |
| 2 | Téléphone : nécessaire au service ou consentement ? Opt-in **loi 30/06/2025 (11/08/2026), preuve obligatoire** | 1, 2, 5 | champ obligatoire ou non ; preuve téléphonique |
| 3 | Frontière « contrat en cours » vs prospection | 5 | légalité de l'appel |
| 4 | **Activation F3 (retargeting tiers)** | 7 | **bloquant** avant LOT 7 |
| 5 | **Durées de conservation par bloc/finalité** | 4 | **bloquant** avant purge en prod |
| 6 | AIPD/DPIA nécessaire ? | tous | conformité globale |
| 7 | Formulation exacte des cases + mentions (versionnées) | 0, 2 | contenu `…_consentement_texte` |
| 8 | Statut/conservation/effacement des photos (S3) | différé | schéma photo + purge S3 |
| 9 | Preuve de consentement **sans IP** (minimisation) ? granularité ? | 1 | colonnes B |
| 10 | Certificat à valeur juridique : mentions/limites + **assurance RC pro** | différé | contenu certificat |

---

## CE QUE CE PLAN NE FAIT PAS
Aucune ligne de code, aucune migration, aucune table créée, aucun fichier applicatif modifié. Seul livrable écrit =
ce document. Le build réel démarre au **LOT 1**, sur décision explicite d'Arno, lot par lot.
