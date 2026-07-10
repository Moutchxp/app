# RAPPORT BUILD — M2 Lot 4 : couche d'agrégation & lecture (API de statistiques)

> Chantier autonome `/svav-build`. **Aucun commit effectué** (livraison remise à Arno).
> Golden **29.107259068449615** **INCHANGÉ** (23/23, re-joué — §C). 4 revues : R1 **CORRIGER→corrigé**,
> R2 **VALIDER**, R3 **CORRIGER→corrigé+documenté**, R4 **CORRIGER→corrigé+doute**.

---

## 0. Résumé exécutif

La couche qui LIT le grand livre agrégé (`analytics_compteur_jour`) et produit des métriques sur une
tranche temporelle libre, avec k-anonymat à la restitution. **N'affiche RIEN** (pas d'écran — Lot 5) :
expose une API GET protégée. Lecture SEULE structurelle, jamais les sessions brutes.

### Fichiers livrés (tous neufs)
| Fichier | Rôle |
|---|---|
| `app/lib/analytics/lecture/fenetre.ts` | Tranche temporelle (jour/semaine ISO/mois), validation, bornes date, GROUP BY |
| `app/lib/analytics/lecture/requete.ts` | Accès base LECTURE SEULE (`SET TRANSACTION READ ONLY` + `statement_timeout`), pool applicatif |
| `app/lib/analytics/lecture/kAnonymat.ts` | Seuil k lu au runtime (config 020) + suppression primaire **et secondaire** (anti-soustraction) |
| `app/lib/analytics/lecture/metriques.ts` | Les 6 métriques mesurables (orchestrateur `statistiques`) |
| `app/(admin)/api/admin/statistiques/route.ts` | GET protégé par `perm_statistiques` (révocation-effective) |
| + 5 fichiers de tests (fenetre, kAnonymat, metriques, route, lot4Lecture) + 1 itest (lecture.itest) | |

**Aucune migration** : l'index `analytics_compteur_jour_nom_jour_idx (nom, jour_paris)` (018) couvre déjà
les requêtes de fenêtre → aucun index manquant. Intouchés (byte-unchanged) : moteur, writer/pool/emission
(Lot 1), job (Lot 3), `eslint.config.mjs`/`gardeImports.test.ts` (garde), `garde.ts`/`proxy.ts`/`password.ts`/
`motDePasse.ts`, golden `pipeline.itest.ts`, fichiers Gemini.

### Métriques PRODUITES (fiche spec → requête, toutes sur le grand livre agrégé)
| Métrique | Fiche | Source (nom d'événement) | k ? |
|---|---|---|---|
| `traficParTranche` — visites/tranche | M-2 | `session_fin`, SUM(n) GROUP BY bucket | non (compte temporel nu, n'isole personne) |
| `repartitionVerdicts` — 3 buckets | M-5 | `resultat`, GROUP BY verdict | non (global, sans géo) |
| `comptesAnalyses` — lancées/résultats | M-4 | `analyse_lancee` / `resultat` | non |
| `entonnoir` — étape la plus loin | M-6 (remplacement) | `session_fin`, GROUP BY etape | non (étape ≠ identité) |
| `repartitionCommune` — densité communale | M-7 | `resultat`, GROUP BY commune_insee | **OUI** (k-suppression + secondaire) |
| `provenance` — source/medium + referer | M-1 | `session_fin`, GROUP BY acquisition | **OUI** (campagne rare masquée) |

### Métriques REFUSÉES par l'étude — NON produites (aucune fonction ; test de non-existence `lot4Lecture.test.ts`)
- **« Visiteur unique / récurrent »** (M-3) : structurellement impossible sans identifiant persistant (Lot 2 =
  session éphémère jetée). On produit des **VISITES** (`session_fin`), jamais des visiteurs.
- **« Durée moyenne stricte »** (M-6) : aucune donnée de durée au repos (le grand livre n'a que `jour_paris`).
- **« Page de sortie »** (M-6) : aucun signal de sortie ; SPA sans pages.
- **« Adresses distinctes »** (M-4) : retiré de M2 (commune ≠ logement) — on ne produit pas de compte distinct.

---

## A. DÉCISIONS HORS-SPECS

### A-1. Emplacement `app/lib/analytics/lecture/` — sous analytics/, mais pool APPLICATIF en lecture
La couche de lecture vit sous `analytics/**` → **couverte par la garde anti-couplage** (le moteur ne peut
pas l'importer). Elle est en **sous-dossier** `lecture/`, non scanné par le test d'isolation du writer
(`gardeImports.test.ts`, `readdirSync` non récursif du top-level) : elle importe donc **légitimement**
`db/client` (pool applicatif en lecture), ce qui serait interdit pour un module d'ÉCRITURE (top-level). La
distinction est correcte : le WRITER (top-level) n'utilise jamais `db/client` ; la LECTURE (sous-dossier)
l'utilise, comme demandé (« réutilise le pool applicatif en lecture »). Prouvé par `lot4Lecture.test.ts`.

### A-2. Une seule route renvoyant le payload complet
`GET /api/admin/statistiques?debut&fin&grain` renvoie TOUTES les métriques de la fenêtre en un objet
(consommé plus tard par le Lot 5), plutôt qu'une route par métrique. Plus simple à consommer, une seule
garde de permission.

### A-3. Temps = arithmétique de DATES (DST non applicable)
Le grand livre est au grain JOUR (`jour_paris date`, Europe/Paris déjà gravé aux Lots 2/3). Le fenêtrage
est donc du calendrier PUR sur des dates → un changement d'heure **ne peut pas** l'affecter (une date n'a
pas d'heure). Les EARS-T1/T2 (bornes `timestamptz`, intervalle calendaire) visaient le chemin d'événements
BRUTS (voie B, non retenue). `date_trunc('week')` = **lundi ISO** (vérifié). Semaines ISO à cheval sur un
changement d'heure ou deux mois : correctes (testé, `2026-03-28/29` → même semaine ISO 13).

### A-4. k-suppression ciblée sur les dimensions ré-identifiantes
k=11 appliqué aux ventilations par **commune** et **provenance** (une commune/campagne rare peut isoler).
PAS aux agrégats non-géo (trafic/verdicts/analyses/entonnoir) : un compte faible y n'isole personne (pas
de géo, pas d'identité). Conforme à SPEC §A (mailles géo k-supprimées) et §B.5 (provenance).

### A-5. Verdict PAR COMMUNE non produit (l-diversité, §A.4)
`repartitionCommune` ventile par commune SEULE (densité), jamais par verdict — conforme à §A.4 (« jamais
le verdict par maille fine »). Le ratio de verdicts est **global** (sur toute la fenêtre, sans géo). Le
verdict-par-commune sous `k_attribut` + l-diversité relève du **Lot 6 (carte)**, pas de ce lot.

### A-6. Suppression SECONDAIRE renforcée (corrige R1) — mode `insuffisant`
Voir §D-R1. `ventilerSous_k` supprime la ventilation ENTIÈRE (`insuffisant`, ni cellules ni compte) dès
qu'un résidu masqué sûr (≥ 2 cellules ET ≥ k) ne peut être formé — sinon une métrique FRÈRE du payload
(total exact de la même population) permettrait la soustraction.

### A-7. Lectures séquentielles (corrige R4) — 1 connexion/requête
`statistiques()` lit les métriques SÉQUENTIELLEMENT (pas `Promise.all`) → une seule connexion du pool
applicatif détenue à la fois par requête, pour ne pas affamer le tunnel LiDAR (§D-R4).

### A-8. Deux fichiers EXISTANTS modifiés (tests d'infrastructure)
- **`app/lib/analytics/lot2Instrumentation.test.ts`** : le Lot 2 asserait « le seuil k n'est lu par AUCUN
  code ». Le Lot 4 APPLIQUE k (couche de lecture) → cette assertion est re-scopée en « k n'est lu QUE sous
  `app/lib/analytics/lecture/` » (jamais l'instrumentation ni le moteur). Évolution nécessaire, pas un
  affaiblissement.
- **`vitest.integration.config.ts`** : `fileParallelism: false`. Les itests frappent tous la MÊME base
  PostgreSQL de dev ; en parallèle (8 fichiers depuis ce lot), la contention du pool `db/client` partagé a
  fait apparaître une flakiness (fixtures concurrentes). Exécution SÉQUENTIELLE des fichiers d'intégration
  → base isolée par fichier, résultats stables. Coût mural NUL (le golden domine : 150 s en parallèle comme
  en séquentiel). Aucune modification du code produit ; test infra seulement.

---

## B. DOUTES (à trancher par Arno / DPO / Lot 5)

### B-1. (R4) Pool applicatif partagé avec le tunnel — dédier un pool de lecture ?
La lecture passe par le pool applicatif (`db/client`), PARTAGÉ avec les lectures LiDAR du tunnel public,
**comme le cartouche le demande** (« réutilise le pool applicatif en lecture »). Risque : sous forte charge
de tableaux de bord, les lectures stats pourraient concurrencer une certification (le pool applicatif a
`max=10`, `connectionTimeoutMillis=0` = attente infinie). **Atténué** : lectures séquentielles (1 connexion/
requête, A-7) + `statement_timeout=5 s`. **Résiduel** : un pool de lecture DÉDIÉ borné (comme celui du
writer au Lot 1) isolerait totalement, mais **dévie** de « réutilise le pool applicatif ». → **Décision
d'Arno** : garder le pool applicatif (suffisant à faible charge admin) ou dédier un pool de lecture borné.

### B-2. (R4) `proxy.ts` ne mappe pas `/api/admin/statistiques` → une perm
`proxy.ts` est **BYTE-UNCHANGED** (contrainte) : je ne peux pas y ajouter `['/api/admin/statistiques',
'statistiques']`. La route est donc gardée par SON PROPRE `exigerCompteActif('statistiques')` (serveur,
révocation-effective, testé) — ce qui **satisfait** l'exigence « permission vérifiée côté serveur ». La
double barrière du proxy (defense in depth, comme les routes sœurs) manque. → **Suivi Arno** : ajouter la
ligne à `proxy.ts` (1 ligne, hors contrainte byte-unchanged de ce lot).

### B-3. (R1) Ré-identification résiduelle par différenciation de requêtes
Le k est appliqué PAR FENÊTRE. La soustraction INTRA-requête (total frère − visibles) est **corrigée** (A-6).
Mais un attaquant pourrait différencier deux FENÊTRES ([jan 1-31] − [jan 1-30] = jour 31 seul) puis
ré-appliquer l'analyse sur le jour isolé. Parade complète = audit de requêtes / plancher de largeur de
fenêtre (lourd, hors périmètre). → **Doute DPO** : risque résiduel connu du *cell suppression* ; à consigner.

### B-4. (R1) Ratio de verdicts global à très faible volume
Quand une fenêtre ne contient qu'une commune active, le ratio de verdicts GLOBAL devient celui de cette
commune (divulgation par homogénéité, §A.4). Le mode `insuffisant` (A-6) masque le signal « 1 commune »,
mais le ratio global reste exposé. → **Lot 5** : badger « échantillon faible » sous un plancher N ; **DPO** :
qualifier le risque.

### B-5. (R3) Incohérence croisée session_fin (décalé) vs resultat (temps réel)
`session_fin` n'existe qu'après compaction (Lot 3) ; `resultat`/`analyse_lancee` sont temps réel. Pour les
jours récents (surtout si le **cron de maintenance n'est pas branché**, cf. RAPPORT lot 3 §B-0), les
visites/entonnoir/provenance sous-comptent → « 0 visite / N analyses », logiquement impossible. Les
métriques sont JUSTES (fidèles au grand livre), mais **le Lot 5 DOIT badger** les métriques session_fin
(« jusqu'à J-1 ») et ne jamais présenter visites et analyses comme comparables au jour même. Documenté en
tête de `metriques.ts`. → **Lot 5** + rappel : brancher le cron avant tout usage réel.

### B-6. (R3) trafic sans zero-fill / buckets de bord partiels
`traficParTranche` ne renvoie que les buckets présents (un jour à 0 = bucket absent) ; un bucket
semaine/mois de bord ne somme que les jours in-window (partiel, étiqueté par son lundi ISO). Arithmétique
correcte (aucun double comptage) ; **présentation** (zero-fill, marquage partiel) = **Lot 5**.

---

## C. CONFORMITÉ SVAV

| Vérification | Résultat | Preuve |
|---|---|---|
| **GOLDEN 29.107259068449615** | ✅ **INCHANGÉ (bit-identique)** | intégration re-jouée **8 fichiers / 47 tests** (dont golden 23/23), 150 s ; `pipeline.itest.ts` byte-unchanged ; aucun fichier moteur touché |
| **Lecture SEULE (aucun write)** | ✅ | `SET TRANSACTION READ ONLY` (`requete.ts`) → un INSERT via la couche LÈVE (itest) ; route n'exporte que GET (test) |
| **Jamais les sessions brutes** | ✅ | toutes les requêtes lisent `analytics_compteur_jour` (+ `analytics_config`) ; `analytics_session` absent du code (test source + SQL capturé) |
| **k=11 appliqué, lu de la config** | ✅ | `lireSeuilK` lit `analytics_config` (runtime) ; itest : commune 10 masquée / 11 visible ; unit : k=5 → 10 visible |
| **Suppression secondaire (anti-soustraction)** | ✅ | SPEC §A.5 prescrit ; `ventilerSous_k` : résidu masqué ≥2 cellules ≥k, sinon `insuffisant` (tout supprimé) — corrige R1 |
| **Pool isolé du writer** | ✅ | lecture via `db/client` ; jamais `poolAnalytics`/`queryAnalytics` (test) ; SELECT ne bloque pas un INSERT (MVCC) |
| **Garde anti-couplage** | ✅ **verte** | `gardeImports.test.ts` 8/8 inchangé ; `lecture/` sous `analytics/**` → moteur ne peut l'importer |
| **Permission serveur (révocation)** | ✅ | `exigerCompteActif('statistiques')` relit actif+perm en base → 403 immédiat ; test compte sans perm → 403 |
| **Fenêtre indexable** | ✅ | WHERE `jour_paris` colonne NUE → index `(nom, jour_paris)` ; EXPLAIN forcé (itest) = Index Scan ; amplitude ≤ 731 j ; timeout 5 s |
| **Métriques refusées absentes** | ✅ | test de non-existence (`lot4Lecture.test.ts`) : aucune fonction unique/durée/sortie |
| **tsc / eslint / build** | ✅ | tsc 0 ; eslint 0 (couche + route) ; `next build` ✓ ; `/api/admin/statistiques` routé (Node) |
| **Tests** | ✅ | unit **+35** ; intégration lecture **8** ; suite complète (§ ci-dessous) |
| **Aucun écran / migration / dépendance / Gemini / cron** | ✅ | aucune UI ; 0 migration ; 0 dépendance ; Gemini intouchés ; aucun cron |

### Coût d'une requête sur un an (EXPLAIN)
Sur la table actuelle (quasi vide), le planificateur choisit à raison un **Seq Scan** (0,03 ms — moins cher
qu'un index sur 0 ligne). L'itest force `enable_seqscan=off` et **prouve l'indexabilité** (Index Scan sur
`(nom, jour_paris)`). À volume réaliste, la fenêtre `WHERE nom=… AND jour_paris BETWEEN …` (colonne nue)
utilise l'index composite → coût borné, jamais un scan complet. Amplitude plafonnée à **731 jours**.

---

## D. Synthèse des 4 revues + arbitrages

| Revue | Verdict | Arbitrage |
|---|---|---|
| **R1 — ré-identification** | **CORRIGER → CORRIGÉ** | Défaut RÉEL : soustraction par total frère (trafic/analyses/verdicts exposent le total exact de la population k-ventilée) → cellule masquée déductible. **Corrigé** par le mode `insuffisant` (A-6). Résiduels (différenciation de requêtes B-3, verdict global B-4) documentés. |
| **R2 — lecture seule / isolation** | **VALIDER** | READ ONLY prouvé (itest INSERT rejeté), jamais de session brute, pool isolé du writer, non recouplable au moteur. LOW : chaîne de test morte (`'./pool'`) **corrigée** (`/pool'`) ; fan-out 6 connexions **corrigé** (A-7). |
| **R3 — justesse des métriques** | **CORRIGER → CORRIGÉ+DOC** | Métriques justes, bornes correctes, aucune refusée réintroduite. Défaut : incohérence croisée session_fin/temps réel → **documentée** en tête de `metriques.ts` + B-5 (Lot 5 badge). Zero-fill/buckets partiels → B-6 (Lot 5). |
| **R4 — perf / permission** | **CORRIGER → CORRIGÉ+DOUTE** | Perm SOLIDE (révocation-effective, serveur), indexable, entrée validée sans injection. Défaut : pool applicatif partagé avec le tunnel → **atténué** (lectures séquentielles A-7, timeout) + **doute** B-1 (pool dédié = décision Arno). `proxy.ts` non modifiable (byte-unchanged) → B-2. Try/catch de perm **corrigé** (503 uniforme). |

Aucun défaut de fond non traité. Les corrections claires (R1 soustraction, R2 fan-out/test, R4 try/catch)
sont **appliquées** ; les résiduels (B-1 à B-6) relèvent d'une **décision Arno/DPO** ou du **Lot 5**.

---

## E. Prochaine étape
1. **Trancher B-1** (pool applicatif partagé vs pool de lecture dédié) et **B-2** (ligne `proxy.ts`).
2. **DPO** : B-3 (différenciation de requêtes), B-4 (verdict global à faible volume).
3. **Lot 5 (dashboard)** : badger les métriques session_fin (B-5), zero-fill + buckets partiels (B-6),
   plancher N « échantillon faible », k-anonymat déjà appliqué côté lecture.
4. Rappel : **brancher le cron de maintenance (Lot 3 §B-0)** avant tout usage réel des visites/entonnoir.

### Confirmations
Aucun écran / dashboard / graphique. Aucune session brute lue. Aucun fichier moteur touché. Aucun fichier
Gemini touché. Aucun cron branché. Aucune dépendance npm. Aucune migration exécutée (aucune écrite : index
existant suffisant). **Aucun commit.**
