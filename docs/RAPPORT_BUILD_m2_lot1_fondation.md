# Rapport de build — M2 Lot 1 : FONDATION analytics

> Run `/svav-build` autonome. UN SEUL LOT, UN SEUL COMMIT (fait par Arno). **Aucune migration exécutée,
> aucun DDL joué, aucune écriture en base, aucun événement émis, aucune dépendance ajoutée, aucun fichier
> moteur/Gemini touché, aucun commit.** Le lot pose le canal d'écriture, l'isole, et PROUVE qu'il ne peut
> jamais bloquer une certification.

## 1. Synthèse

| Critère | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ **23/23** (migration NON appliquée, aucun fichier moteur touché) |
| `tsc` 0 · `eslint` 0 erreur (mes fichiers + moteur gardé) | ✅ |
| `npm test` | ✅ **684 passed / 21 skipped** (+36 analytics vs 648) |
| `next build` | ✅ Compiled successfully |
| `client.ts` + tous fichiers moteur + sensibles | ✅ INTACTS (diff vide) |
| `package.json` (dépendance) | ✅ inchangé (0 ajout) |
| Revues R1 / R2 / R3 / R4 | R1 **VALIDER** · R2 **CORRIGER→corrigé** · R3 **CORRIGER→corrigé** · R4 **VALIDER** |

**Fichiers du lot** :
- `db/migrations/018_m2_analytics_fondation.sql` — **nouveau, NON appliqué** (Arno l'applique).
- `app/lib/analytics/{config,pool,writer,emission}.ts` — nouveaux (writer isolé + pool dédié).
- `app/lib/analytics/{writer,emission,migration,gardeImports,poolIsolation}.test.ts` — nouveaux.
- `eslint.config.mjs` — garde ESLint anti-couplage.

## 2. LE livrable : une écriture analytique ne peut PAS bloquer une certification (chemin par chemin)

1. **Émission hors du chemin de calcul.** Le writer (`app/lib/analytics/**`) n'est importé par AUCUN
   fichier moteur (garde §4). Le tunnel public (`analyse`/`origine`) reste en lecture seule ; le golden
   appelle `analyserAdresse` en direct, jamais le writer.
2. **Non bloquant (`after()`).** `emission.ts:emettreApresReponse` diffère l'écriture APRÈS la réponse
   via `after()` de Next 16. La réponse au tunnel part avant toute écriture. Prouvé :
   `emission.test.ts` — `construire`/`incrementerCompteur` ne sont pas appelés tant que le runtime
   n'exécute pas le callback ; un handler simulé renvoie `REPONSE_CERTIFICATION` même si le payload throw.
3. **Throw synchrone maîtrisé.** Le payload est construit DANS le callback `after`, sous `try/catch`
   (`emission.ts:26-31`). Un `void fn(construire())` aurait évalué l'argument en amont → 500 sur une
   certification réussie ; ici `construire()` ne s'exécute jamais avant `after`. `after()` lui-même, s'il
   throw hors requête, est avalé (`emission.ts:35-37`).
4. **Écriture faillible avalée.** `writer.ts:incrementerCompteur` enveloppe TOUT (construction params,
   `jourParis`, throw synchrone/async de `queryAnalytics`) dans un `try/catch` avaleur → **ne throw
   jamais**, résout toujours `void`. Prouvé : `writer.test.ts` (rejet / throw synchrone / hang → tous
   `resolves.toBeUndefined()`).
5. **Timeout dur.** `avecTimeout` (`writer.ts`) abandonne l'écriture après `ECRITURE_TIMEOUT_MS` ; le
   rejet tardif de la requête est neutralisé (`p.catch(()=>{})`) → pas d'unhandled rejection ;
   `clearTimeout` toujours atteint (`finally`). Prouvé par le test « hang → abandon » (fake timers).
6. **Pool dédié borné.** Aucune connexion analytique ne peut affamer le pool de calcul (§3). `max=2`,
   `connectionTimeoutMillis=2000` (échoue vite, jamais d'attente infinie contrairement au pool applicatif).
7. **Mono-instruction auto-commit.** `INSERT … ON CONFLICT` seul, jamais de transaction (qui épinglerait
   une connexion) ; `idle_in_transaction_session_timeout` en garde.

**Verdict R1 (le seam peut-il nuire ?) : VALIDER** — aucun chemin trouvé. Unique couplage résiduel
signalé par R1 : les deux pools visent le même serveur PostgreSQL (partage de `max_connections` global),
neutralisé par `POOL_MAX=2` ; ce n'est pas un défaut du code livré.

## 3. Pool distinct — valeurs et justification

`app/lib/analytics/pool.ts` crée une instance `Pool` PROPRE (jamais `db/client.ts`), `application_name =
svav_analytics`. Prouvé : source (`gardeImports.test.ts` : aucun module analytics n'importe `db/client`)
ET runtime (`poolIsolation.test.ts` : `poolAnalytics !== pool`, `max=2 < 10`, timeouts posés).

| Paramètre (`config.ts`, surcharge env) | Valeur | Justification |
|---|---|---|
| `POOL_MAX` (`ANALYTICS_POOL_MAX`) | **2** | Best-effort basse priorité ; ne peut jamais consommer les connexions du calcul LiDAR. |
| `CONNECT_TIMEOUT_MS` (`…_CONNECT_TIMEOUT_MS`) | **2000** | Échec RAPIDE si pool saturé (jamais l'attente infinie du pool applicatif, `connectionTimeoutMillis=0`). |
| `STATEMENT_TIMEOUT_MS` (`…_STATEMENT_TIMEOUT_MS`) | **3000** | Annulation serveur d'une requête pathologique ; une écriture normale < 10 ms. |
| `IDLE_TIMEOUT_MS` / `IDLE_IN_TX_TIMEOUT_MS` | 10000 / 3000 | Fermeture des connexions/transactions oisives. |
| `ECRITURE_TIMEOUT_MS` (`…_ECRITURE_TIMEOUT_MS`) | **2000** | Timeout dur JS : abandon de l'événement, jamais d'attente. |

**Où vivent les variables** (décision A — voir §7) : les **timeouts/pool = infrastructure** (module
`config.ts` + env, car le pool est créé à l'import, avant toute lecture base) ; les **durées de
rétention = comportement** → table `analytics_retention` (runtime-éditable, « pilotage sans code »),
consommée par le LOT 3, jamais dans le hot path.

## 4. La garde anti-couplage — le golden ne prouve rien, ces deux gardes oui

- **Règle ESLint** (`eslint.config.mjs`) : `no-restricted-imports` (statique, y compris via alias
  `@/…analytics/…`) + `no-restricted-syntax` sur `ImportExpression` (dynamique `import()`), sur la liste
  moteur **alignée sur CLAUDE.md §14** (svv/** + pipeline/obstacles/faisceaux/**profilConfig/origine/
  hauteurLidar**). Cible LE WRITER (`analytics/**`), **jamais `db/client`** (que `svv/**` importe
  légitimement) → aucun faux positif.
- **Test de graphe transitif** (`gardeImports.test.ts`) : parcourt les imports transitifs depuis 12
  points d'entrée moteur ; **détecte toute forme** (relative, alias `@/`, dynamique, require) via un flag
  de spécifieur brut + une résolution alias-aware. Indépendant d'ESLint (résiste à un `eslint-disable`).
- **Preuves d'échec (contrôles positifs)** : (a) un import INDIRECT `faux → intermédiaire → writer` est
  détecté ; (b) un `import()` DYNAMIQUE via alias `@/` est détecté ; (c) invocation **réelle** de `npx
  eslint` sur un import interdit → le lint échoue avec le message `COUPLAGE INTERDIT` ; (d) test de
  **complétude** : la liste ESLint contient chaque fichier moteur DB (verrou anti-dérive).

**Verdict R2 (la garde tient-elle ?) : CORRIGER → corrigé.** Constats acceptés & corrigés :
- **R2-C1** (angle mort `hauteurLidar`/`origine`/`profilConfig` hors liste) → **ajoutés** aux deux listes
  (ESLint + `MOTEUR`) + test de complétude.
- **R2-C2** (alias `@/` non suivi + `import()` non couvert par ESLint) → résolveur **alias-aware** + flag
  de spécifieur brut (toute forme) + règle `no-restricted-syntax` pour `import()`.
- R2-C3/C4/C5 (require via règle tierce ; extensions `.mjs` ; sur-capture de commentaire = sens sûr) :
  notés, non bloquants ; le flag de spécifieur brut couvre désormais require + alias.

## 5. Schéma colonne par colonne — pourquoi rien n'identifie une personne ou un logement

**5 tables autonomes** (aucun FK/trigger/colonne sur une table de calcul → golden hors de portée) :

- **`analytics_catalogue_evenement`** (`nom` PK, `portee`, `actif`, `description`) — catalogue des noms
  d'événements, **extensible au runtime** (un nouveau `nom` = INSERT, sans migration ; inconnu = rejet FK).
- **`analytics_retention`** (`cle` PK, `jours`, `description`) — durées de rétention, runtime-éditables.
- **`analytics_compteur_jour`** (public) — agrégat `(jour × nom × dimensions) → n`. Colonnes :
  - `jour_paris date` : le SEUL temps, au JOUR (jamais de seconde). Peuplé à l'écriture (`writer.jourParis`).
  - `verdict` (liste fermée), `score_tranche` (1..4, jamais le score exact), `commune_insee` (CHECK
    `^(2[AB]|[0-9]{2})[0-9]{3}$` : 5 car, **incapable de porter une lat/lon ou une adresse**).
  - `source`/`medium`/`campagne` (charset `^[A-Za-z0-9._-]{1,64}$` : bannit @, espace, '=' → **pas d'email
    smuggling**), `referer_hote` (hôte seul, pas de chemin/requête), `device_type` (liste fermée),
    `navigateur_famille` (charset).
  - `etape`/`raison` (listes fermées), `n` (compteur ≥ 0).
  - ⚠️ **CHECK anti-fingerprint (F1)** : une ligne NE PEUT PAS combiner le groupe ACQUISITION (device/
    navigateur/referer/utm) avec le groupe GÉO/RÉSULTAT (verdict/score/commune) → **impossible** de
    stocker « appareil+provenance × commune × verdict » = quasi-empreinte d'un foyer.
- **`analytics_session`** (public, ÉPHÉMÈRE, partitionnée mensuel) — parcours d'une visite en cours,
  **ACQUISITION UNIQUEMENT** (pas de commune, pas de verdict → jamais empreinte×lieu). `session_id uuid`
  contraint **v4 aléatoire** par CHECK (un UUID v1/v6/v7 encode un timestamp = seconde déguisée → REJETÉ).
  Aucun timestamp ; seul `jour_paris`. Compactée puis SUPPRIMÉE au LOT 3.
- **`analytics_admin_jour`** (interne) — `(jour × nom × module) → n`. **AUCUN utilisateur_id, AUCUNE IP,
  AUCUNE géo** : audit sécurité AGRÉGÉ (périmètre 1), pas de profilage individuel.

**Ce qui est STRUCTURELLEMENT impossible** (prouvé par `migration.test.ts` sur le DDL) : aucune colonne
`inet`/`ip_hash`/`ip_*` (IP), aucun `timestamp`/`timestamptz`/`time` (seconde), aucune `geometry`/
`geography`/`cleabs`/lat/lon (coordonnée/logement), aucun `email`/`utilisateur_id` (identité). Le writer
est paramétré (pas d'injection).

**Verdict R3 (le schéma fuite-t-il ?) : CORRIGER → corrigé.** Constats acceptés & corrigés :
- **F1 (fingerprint) HAUTE** → CHECK anti-fingerprint sur `compteur_jour` + retrait de `commune_insee` de
  `analytics_session`.
- **F2/F6 (CHECK texte trop faibles)** → charset allowlist sur source/medium/campagne/navigateur/module.
- **F3 (UUID horodaté)** → CHECK UUID v4 strict.
- **F4 (purge absente)** → gate dur documenté : le LOT 2 (écriture des sessions) NE DOIT PAS être livré
  avant le LOT 3 (compaction/purge). Voir §doute B1.
- F5 (ségrégation public/interne conventionnelle) : noté, non corrigé (inoffensif — le writer ne vise que
  `compteur_jour` ; ségrégation stricte = amélioration future).

## 6. Migration & exploitation — commande et vérifs pour Arno

**Verdict R4 : VALIDER** (saine, transactionnelle, idempotente pour l'application unique, non
destructive, aucun couplage). Points d'exploitation LOT 3 documentés (DEFAULT partition, ordre de
rollback, décompte de relations — cf. en-tête de la migration).

**Commande (Arno, manuelle) :**
```
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/018_m2_analytics_fondation.sql
```
**À vérifier après :** `\dt analytics_*` → **5 tables de base + 4 partitions** de `analytics_session`
(`…_2026_07/_08/_09` + `…_default`) = **9 relations** ; `\d+ analytics_session` (partitionnée) ;
`SELECT count(*) FROM analytics_catalogue_evenement;` (≥ 13) ; `SELECT * FROM analytics_retention;`.
Idempotente : rejouable dans le mois courant = no-op (⚠️ rejeu un mois ultérieur : cf. caveat DEFAULT en
en-tête). Rollback non destructif : DROP des tables `analytics_*` dans l'ordre FK (documenté en en-tête).

## 7. Rapport de doute — 3 catégories

**A. DÉCISIONS HORS-SPECS**
1. **Contrainte du `nom` par FK vers un catalogue (au lieu d'un CHECK figé).** Le cartouche disait « CHECK
   … nom d'événement » ; la SPEC (`SPEC_M2_evenements §8`) veut « catalogue en config, nouveau nom sans
   migration ». La FK satisfait l'INTENT du cartouche (valeur inconnue REJETÉE) ET la spec (extensible au
   runtime). **Écart signalé** : mécanisme FK au lieu de CHECK pour `nom` (les autres enums restent CHECK).
   Réconciliation, pas de contradiction d'intention → run poursuivi.
2. **Timeouts/pool en module de config (env), rétention en table DB.** La spec/cartouche disent « en
   config » ; le pool étant créé à l'import (avant toute lecture base), ses bornes ne peuvent pas venir de
   la base → module `config.ts` + env. Les rétentions (hot-path libre) vont en table `analytics_retention`.
3. **Session éphémère SANS aucun timestamp (plus strict que la spec).** La spec permettait des secondes
   « en vol » dans l'éphémère ; l'interdit ABSOLU du cartouche (« pas de seconde au repos ») prime → la
   session ne porte QUE `jour_paris` (date). Conséquence assumée : pas de timeout d'inactivité sub-jour ;
   les sessions sont scellées au changement de jour (compaction LOT 3).
4. **Anti-fingerprint par CHECK (au lieu de scinder en deux tables).** Suite à R3-F1, le CHECK
   « acquisition XOR géo/résultat » rend l'empreinte structurellement impossible **sans** casser le modèle
   à un seul compteur de la spec. Alternative écartée : deux tables (plus invasif).

**B. DOUTES**
1. **⚠️ GATE DUR (à respecter) : le LOT 2 (instrumentation, écriture des sessions) NE DOIT PAS être livré
   avant le LOT 3 (compaction + purge).** `analytics_session` retient des enregistrements individuels
   (acquisition + parcours) dont la sûreté au repos dépend d'une purge qui n'existe pas encore (rétention
   seedée mais non appliquée ; partition DEFAULT non vidée par un simple DROP). Tant que rien n'écrit
   (LOT 1), le risque est LATENT. Constat R3-F4 accepté ; à verrouiller dans l'ordonnancement.
2. **Rétentions (400 j) = valeurs de départ À CONFIRMER PAR DPO** (seeds annotés). Chiffres juridiques,
   hors périmètre technique.

**C. ÉCARTS DE CONFORMITÉ**
- Aucun. Golden 23/23 inchangé ; aucun fichier moteur/`client.ts`/sensible/Gemini touché ; aucune
  dépendance ; aucune écriture base ; migration non exécutée.

## 8. Confirmations finales
Aucune migration exécutée · aucun DDL joué · aucune écriture en base · aucun événement émis · aucun
fichier moteur · aucun fichier Gemini · aucune dépendance npm ajoutée · aucun commit.
