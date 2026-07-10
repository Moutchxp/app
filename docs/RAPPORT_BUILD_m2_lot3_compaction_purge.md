# RAPPORT BUILD — M2 Lot 3 : compaction + purge + gestion des partitions

> Chantier autonome `/svav-build`. **Aucun commit effectué** (livraison remise à Arno).
> Le golden **29.107259068449615** est **inchangé** (23/23, re-joué — preuve §C).

---

## 0. Résumé exécutif

Le job de maintenance analytique est construit, testé et conforme. Il fait TROIS choses distinctes,
ordonnées, chacune idempotente :

1. **COMPACTION** — replie chaque session d'un **jour scellé** (`jour_paris < aujourd'hui_Paris`) en
   incréments `session_fin` sur `analytics_compteur_jour`, **puis la supprime, dans UNE seule instruction
   atomique** (CTE `lot … FOR UPDATE SKIP LOCKED` → `INSERT … ON CONFLICT DO UPDATE n = n + EXCLUDED.n`
   → `DELETE`). Il n'y a **pas** de colonne « compactée » : la session est comptée ET supprimée dans la
   même instruction → **double comptage et purge-sans-comptage sont structurellement impossibles**.
2. **PARTITIONS** — crée les partitions mensuelles à venir (config `partitions_mois_avance`), **DROP** les
   partitions passées **et vides** (housekeeping), jamais `_default` ni une partition non vide.
3. **PURGE** — supprime par lots bornés les lignes de compteurs hors rétention (`analytics_retention`).

**Déclenchement** : script CLI `npm run analytics:maintenance` (`tsx`), à lancer par un **cron système**.
→ **DÉCISION D'EXPLOITATION requise d'Arno** (§B-0) : aucun ordonnanceur n'existe, pg_cron indisponible.

**Deux vrais bugs ont été trouvés ET corrigés** pendant la revue (invisibles aux tests à `q` mocké,
révélés par des tests d'intégration à VRAI DDL) — voir §A-1. C'est le point le plus important de ce rapport.

### Fichiers livrés
| Fichier | Rôle | État |
|---|---|---|
| `app/lib/analytics/maintenance.ts` | Job (compaction/partitions/purge + orchestrateur verrouillé) | **neuf** |
| `app/scripts/analytics-maintenance.ts` | Entrée CLI observable (JSON + codes de sortie) | **neuf** |
| `app/lib/analytics/maintenance.test.ts` | Tests unitaires (SQL, boucles, isolation, classification d'erreurs) | **neuf** |
| `app/lib/analytics/maintenance.itest.ts` | Tests d'intégration (idempotence, concurrence, purge, **VRAI DDL de partition**) | **neuf** |
| `db/migrations/019_m2_maintenance_config.sql` | Config du job (mois d'avance + tailles de lot) — **non exécutée** | **neuf** |
| `package.json` | +1 script `analytics:maintenance` (0 dépendance) | modifié |

**Un seul fichier existant modifié** : `package.json` (le script). `vitest.integration.config.ts` avait été
touché en cours de route (alias `server-only`) mais, `maintenance.ts` n'important plus `server-only`
(§A-6), l'alias est devenu inutile → **rétabli à l'original** (itest vérifiée verte sans lui).

Intouchés (vérifiés byte-unchanged) : tout le moteur, `client.ts`, `pool.ts`, `writer.ts`, `emission.ts`,
`config.ts` (analytics), `eslint.config.mjs` (garde anti-couplage **intacte et verte**), `password.ts`,
`motDePasse.ts`, `proxy.ts`, `garde.ts`, les 2 fichiers Gemini, le golden `pipeline.itest.ts`,
`vitest.integration.config.ts`.

---

## A. DÉCISIONS HORS-SPECS (le plus important)

### A-1. ⚠️ DEUX BUGS RÉELS TROUVÉS ET CORRIGÉS dans la gestion des partitions (invisibles aux mocks)

La revue adversariale + un test d'intégration à VRAI DDL ont révélé que **la création de partition ne
fonctionnait PAS** telle qu'écrite initialement. Deux défauts, tous deux dans la même requête, tous deux
**impossibles à voir avec un test à `q` mocké** (le mock ne parle jamais à PostgreSQL) :

1. **Bornes de partition paramétrées** — `CREATE TABLE … FOR VALUES FROM ($1) TO ($2)` : PostgreSQL
   **interdit** les paramètres liés dans les bornes de partition (elles doivent être des **littéraux**).
   → **Corrigé** : les bornes sont calculées côté serveur au format texte `'YYYY-MM-DD'` (via `to_char`),
   **re-validées** par regex stricte `^\d{4}-\d{2}-\d{2}$`, puis **interpolées comme littéraux**.
2. **`text + integer`** — dans `to_char(… + ($2 || ' month')::interval …)`, l'usage `$2 || ' month'` fait
   inférer `$2` comme **texte**, donc `$2 + 1` (pour le mois suivant) échouait (`operator does not exist:
   text + integer`). → **Corrigé** : remplacé par `make_interval(months => $2::int)` / `… + 1)`, sans
   ambiguïté de type.

**Comment ça a été attrapé** : les tests unitaires (`q` mocké) passaient au vert en masquant ces deux
bugs. J'ai donc ajouté un **test d'intégration à VRAI DDL** (`maintenance.itest.ts`) qui exécute réellement
la création/suppression de partition **sur une table jetable** `zzz_maint_ddl_test` (jamais sur
`analytics_session`), DROP CASCADE avant/après. Ce test échouait tant que les bugs étaient là ; il passe
maintenant et **verrouille la non-régression**.

**Décision de conception associée (hors-specs)** : pour rendre ce DDL testable **sans toucher au schéma
réel**, `gererPartitions` prend un paramètre `parent` (défaut `'analytics_session'`, **surcharge réservée
aux tests**), protégé par un garde-fou de format d'identifiant (`^[a-z_][a-z0-9_]*$`, throw sinon). C'est
la seule concession de signature ; elle n'ouvre aucune surface d'injection (jamais d'entrée utilisateur).
Alternative écartée : dupliquer le SQL dans le test (fragile, ne teste pas le vrai code).

### A-2. Marquage « compactée » : AUCUNE colonne, AUCUN watermark — le design atomique rend la question caduque

Le cartouche demandait de trancher entre **colonne « compactée »** (UPDATE massif, coûteux) et
**watermark par partition** (léger mais suppose un ordre). **Décision : ni l'un ni l'autre.** La compaction
**compte ET supprime dans la même instruction** → une session compactée **n'existe plus**. Son absence EST
le marqueur. Éligibilité = `jour_paris < aujourd'hui_Paris` (jour **scellé** : plus aucune écriture
possible dessus, puisque le writer n'écrit que le jour courant — cf. Lot 1). Justification : supprime le
coût de l'UPDATE massif ET la complexité d'un watermark, tout en rendant le double comptage **structurellement**
impossible (pas seulement « évité par convention »). La revue R1 a **VALIDÉ** ce point (atomicité prouvée).

### A-3. `analytics_session_default` : conservée, drainée par la compaction (pas de DROP)

Argument POUR sa suppression : une partition par défaut masque une erreur de partitionnement.
Argument CONTRE : sans elle, une insertion dans un mois sans partition **échoue** — or le Lot 2 (émission)
est best-effort et ne doit jamais bloquer le tunnel ; une écriture perdue silencieusement vaut mieux qu'une
erreur. **Décision : garder `_default` comme filet.** Elle ne DROP jamais (garde explicite par nom).
Les lignes qui y atterrissent (mois sans partition nommée) sont **compactées** quand leur jour est scellé
(la compaction lit le PARENT, `_default` incluse) → `_default` se vide d'elle-même. Le job crée les
partitions **futures** en avance (config `partitions_mois_avance`, défaut 3) pour que ce cas reste rare.

### A-4. Compteur produit par la compaction = événement `session_fin` (grain jour × étape max × acquisition)

Les specs nomment l'événement de repli de session sans figer son nom. **Décision : `session_fin`** (déjà
au catalogue 018), dimensions = `etape` (= `etape_max`, « l'étape la plus loin atteinte » — métrique valide
même pour une session incomplète, comme demandé) + dimensions d'**acquisition** (source/medium/campagne/
referer_hote/device_type/navigateur_famille). **Aucune dimension géo/verdict** → passe le CHECK
anti-fingerprint du Lot 1 (acquisition XOR géo). Le booléen `complete` de la session **n'est pas projeté**
(le schéma `analytics_compteur_jour` n'a aucune colonne pour le porter) — voir §B-2.

### A-5. Tailles de lot & mois d'avance EN CONFIG (migration 019, non exécutée)

Créé `analytics_maintenance_config` (`cle`/`valeur`/`description`, `CHECK valeur > 0`) avec 3 réglages :
`partitions_mois_avance=3`, `compaction_taille_lot=1000`, `purge_compteur_taille_lot=5000`. Les **durées de
rétention** restent dans `analytics_retention` (018). Le job lit ces valeurs au runtime **avec repli sûr
codé** (`DEFAUTS`) : il **fonctionne même si 019 n'est pas appliquée** (comme `profilConfig` avec son
défaut). Migration **écrite, NON exécutée** (conforme au cartouche). Timeout de connexion du pool de
maintenance = constante **locale** (`CONNECT_TIMEOUT_MAINTENANCE_MS = 5 s`), pas tirée de `config.ts`
(cf. §A-6).

### A-6. `maintenance.ts` volontairement autonome : PAS de `import 'server-only'`, PAS d'import de `config.ts`

Corrige le bug **C1** de la revue R2 (bloquant) : `import 'server-only'` **fait crasher le CLI à l'import**
sous `tsx` (la condition d'export `react-server`, posée par Next, ne l'est pas par Node/tsx → le module
`server-only` lève). Vérifié empiriquement. Comme `maintenance.ts` tourne **exclusivement** sous `tsx`
(jamais dans un bundle client ni le runtime Next), `server-only` y est à la fois **nuisible et redondant**
(la non-importation par le moteur est déjà garantie par la garde ESLint + test de graphe). **Décision** :
retirer `server-only` de `maintenance.ts` **et** ne pas importer `config.ts` (qui, lui, porte `server-only`
— légitimement, car il est importé par le runtime Next) ; d'où la constante de timeout locale (§A-5). Ainsi
**aucun fichier du Lot 1 n'est modifié**. Alternative écartée : forcer `NODE_OPTIONS=--conditions=react-server`
(fragile — changerait aussi la résolution de `react` vers son build serveur).

### A-7. CLI : `import 'dotenv/config'` + codes de sortie distincts

Corrige **C2** (R2) : le CLI n'importe pas `db/client` (isolation voulue), donc — contrairement aux autres
scripts `tsx` — il ne récupère pas `.env` transitivement. **Ajout de `import 'dotenv/config'`** en tête.
Corrige **R4-#1** : codes de sortie = **0** (run propre / no-op verrou), **2** (run terminé mais avec
erreurs de sous-étape — ex. purge en échec, enjeu rétention/RGPD), **1** (échec inattendu). Un cron qui
surveille le code de sortie est ainsi alerté ; le job ne « casse » jamais le tunnel pour autant.

### A-8. Classification fine des erreurs (R4-#2, R4-#3)

`gererPartitions` ne classe en « conflit » **que** l'erreur attendue `check_violation` (SQLSTATE `23514`,
= DEFAULT peuplée bloquant l'attache) ; **toute autre** erreur de CREATE (droits, disque…) est **re-levée**
(visible dans `res.erreurs`), jamais masquée en « conflit ». `lireEntier` ne retombe silencieusement sur le
défaut **que** si la table est absente (`42P01`) ou la clé absente/invalide ; toute autre erreur est
re-levée. Les lectures de config dans l'orchestrateur sont enveloppées : erreur inattendue → enregistrée
(observable) + repli sur TOUS les défauts, le run continue.

### A-9. Durcissement `WITH lot AS MATERIALIZED` (R1, préventif)

La sûreté « compter exactement ce qu'on supprime » repose sur le fait que le CTE `lot` est évalué **une
seule fois** (même ensemble vu par l'INSERT et le DELETE). C'est déjà garanti (`FOR UPDATE` + double
référence), mais j'ai rendu l'invariant **explicite** avec `AS MATERIALIZED` pour qu'aucun refactor futur
ne l'affaiblisse. Aucun changement de comportement, pure documentation exécutable.

---

## B. DOUTES (à trancher par Arno / hors périmètre de ce lot)

### B-0. ⚠️ DÉCISION REQUISE — comment déclencher le job ?

Le job est **construit, testé, appelable** (`npm run analytics:maintenance`). Mais **rien ne le déclenche
tout seul** : aucun ordonnanceur n'existe dans le projet, **pg_cron est indisponible** (vérifié), et
l'appel opportuniste depuis le writer est **exclu** (recouplerait l'analytics au chemin de requête — le
piège explicitement interdit par le cartouche, que le Lot 1 a travaillé à éviter). Options :

- **Option A (RECOMMANDÉE) — cron système** qui lance `npm run analytics:maintenance` **une fois par jour**
  (après minuit Europe/Paris, pour compacter le jour qui vient d'être scellé). Zéro dépendance, zéro
  surface réseau, observable (JSON + code de sortie). **Suppose qu'Arno crée l'entrée cron/launchd** sur
  la machine qui héberge la base.
- **Option B — route API protégée** (`perm_statistiques`) appelée par un cron externe. Ouvre une surface
  réseau à sécuriser ; utile seulement si le déclenchement doit venir d'ailleurs que la machine hôte.

Je recommande **A**. Je **n'ai pas** créé de cron ni ouvert de route (ce serait ta décision d'exploitation,
pas une décision de code). **Dis-moi laquelle tu veux** et je te fournis le cartouche correspondant.

### B-1. k-anonymat AU REPOS des compteurs `session_fin` (soulevé par R3 — CORRIGER)

La revue vie-privée note qu'à **faible trafic**, une ligne `session_fin` à **n=1** est l'image quasi-fidèle
d'une session supprimée (dimensions d'acquisition conservées). Ce **n'est pas un nouveau risque introduit
par ce lot** : c'est exactement la granularité d'acquisition que le **schéma du Lot 1** accepte déjà pour
tous les événements, et que son **CHECK anti-fingerprint** (acquisition XOR géo) borne. La généralisation
plus fine (bucketing des `campagne`/`referer_hote` rares vers « autre », seuil k) est **assignée par les
specs au Lot 2 (F2, instrumentation)** et au Lot 4 (affichage), **pas à la compaction**.

**Pourquoi je ne l'ai PAS fait ici** : ajouter un `HAVING count(*) >= k` à la compaction **détruirait** les
sessions sous le seuil (ni comptées ni conservées) = **perte de donnée** — ce qui contredit la garantie
« aucune session perdue » de ce lot, et flirte avec la règle dure anti-suppression. Un mécanisme de
report/généralisation est un **ajout de périmètre** qui relève d'une décision Arno + avis DPO.
**Frontière** : (Technique) une ligne n=1 n'est pas k-anonyme au repos ; un contrôle d'affichage ne la
supprime pas du disque. (Juridique/DPO) qualifier « anonyme vs pseudonyme » un singleton d'acquisition
**sans géo**, et fixer `k` — à demander à un professionnel. **À trancher avant d'ouvrir le Lot 2.**

### B-2. `complete` non projeté dans le compteur

La compaction projette `etape_max` mais pas le booléen `complete` (le schéma `analytics_compteur_jour` n'a
pas de colonne pour). `etape_max` subsume largement le signal (« jusqu'où la visite est allée »). Si tu
veux distinguer complète/incomplète à `etape_max` égal, il faudra une dimension dédiée **au Lot 2**.
Impact faible ; signalé pour contrôle.

### B-3. WAL / backups : la donnée « vraiment détruite » est une garantie LOGIQUE, pas physique

Honnêteté (question R3 du cartouche) : la compaction vide la table et les partitions passées sont
**DROP** (unlink de fichier). Mais on **ne peut RIEN garantir** sur : le **WAL** (l'INSERT puis le DELETE
d'une session sont journalisés — l'image pré-suppression est rejouable tant que les archives WAL vivent) ;
les **backups** (un dump pris pendant qu'une session vit ~1-2 j la capture). **Ce n'est pas un défaut de
code** — aucun code ne rend un backup atomique. Régularisation = **exploitation** : aligner la rétention
WAL sur le TTL de session si possible, restreindre l'accès aux backups, VACUUM régulier. À consigner dans
un runbook.

### B-4. `_default` : effacement par compaction (VACUUM), pas par unlink

Les lignes ayant transité par `analytics_session_default` sont retirées par **DELETE de compaction** (donc
espace récupéré au **VACUUM**), pas par unlink de fichier comme pour une partition nommée DROP. Edge ;
prévoir un `VACUUM` ciblé sur `_default` si un afflux y a transité (job longtemps arrêté).

### B-5. Famine de verrou consultatif (edge, atténué)

Si un run précédent restait bloqué en tenant le verrou, tous les runs suivants seraient des no-op
silencieux (apparence de santé). **Atténué** par `statement_timeout = 60 s` et
`idle_in_transaction_session_timeout = 60 s` (une session vraiment coincée meurt → Postgres relâche le
verrou de session). Amélioration possible : journaliser des no-op consécutifs. Non bloquant.

---

## C. CONFORMITÉ SVAV (batterie systématique)

| Vérification | Résultat | Preuve |
|---|---|---|
| **GOLDEN 29.107259068449615** | ✅ **INCHANGÉ** | intégration 34/34, dont golden 23/23 ; `pipeline.itest.ts` byte-unchanged |
| **Verdict découplé** | ✅ | job n'émet aucun événement, ne touche ni verdict ni score ; hors chemin de calcul |
| **Config externalisée (pilotage sans code)** | ✅ | mois d'avance + tailles de lot en `analytics_maintenance_config` (019) ; durées en `analytics_retention` ; repli codé sûr |
| **Garde anti-couplage (ESLint + graphe)** | ✅ **verte** | `gardeImports.test.ts` 8/8 ; `maintenance.ts` sous `analytics/**` → couvert ; n'importe rien du chemin de requête |
| **Aucun fichier moteur touché** | ✅ | 15 fichiers moteur/DB byte-unchanged (vérifié `git diff --quiet`) |
| **Isolation des pools** | ✅ | pool `svv_analytics_maintenance` dédié ; jamais `client.ts` ni `pool.ts` |
| **Gemini hors staging** | ✅ | `adaptateurIaPhoto.ts`, `analyse-photo/route.ts` intouchés |
| **Fichiers sensibles byte-unchanged** | ✅ | `password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts` intacts |
| **tsc / eslint / build** | ✅ | tsc OK ; eslint exit 0 ; `next build` ✓ |
| **Tests** | ✅ | unit **699 pass** / 21 skip ; intégration **34 pass** (golden 23 + maintenance 11) |
| **Migration non exécutée** | ✅ | 019 écrite, **non jouée** ; aucun DDL de schéma appliqué (voir note ci-dessous) |
| **RGPD** | ⚠️ voir §B-1, B-3 | k-au-repos (Lot 2/DPO) ; WAL/backups (exploitation) |

### Note de transparence — exécution accidentelle du job (sans dégât)

Pendant la vérification du correctif C1, j'ai lancé une sonde d'import qui, **par erreur**, a importé le
**script CLI** (`analytics-maintenance.ts`) au lieu de la **librairie** — or le CLI exécute `main()` à
l'import. Le job a donc **tourné une fois** contre la base réelle. **Conséquence : AUCUNE.** J'ai vérifié
l'état de la base **immédiatement** :
- `analytics_session` : 0 ligne (rien à compacter, rien perdu) ;
- compteurs : 0 purgé ;
- partitions : **inchangées** (`2026_07/08/09` + `_default`) — la création de partition **a échoué** (les
  deux bugs §A-1 encore présents à ce moment), donc **rien n'a été créé ni modifié dans le schéma**.

Autrement dit, cette exécution accidentelle fut un **no-op total** — et elle a **révélé les bugs §A-1**.
La sonde a ensuite été refaite **correctement** (import de la librairie, sans exécuter le job). Aucun DDL
de schéma n'a été appliqué à `analytics_session` ; les seuls DDL joués l'ont été par les tests
d'intégration sur la table **jetable** `zzz_maint_ddl_test` (DROP CASCADE après chaque test — vérifié : 0
résidu).

---

## D. Synthèse des 4 revues adversariales

| Revue | Axe | Verdict | Suite donnée |
|---|---|---|---|
| **R1** | Double comptage / perte | **VALIDER** | Atomicité prouvée. Durci par `AS MATERIALIZED` (§A-9). |
| **R2** | Le job peut-il nuire ? | **CORRIGER** | **C1** (server-only, bloquant) + **C2** (dotenv) **corrigés** (§A-6, A-7). Isolation/verrou/purge/non-recouplage validés. |
| **R3** | La donnée disparaît-elle ? | **CORRIGER** | Mécanique validée. k-au-repos → **doute B-1** (Lot 2 + DPO). WAL/backups → **B-3** (exploitation). Logs du job : propres. |
| **R4** | Exploitation / rattrapage | **CORRIGER** | Rattrapage prouvé. **#1** (code sortie), **#2/#3** (classification d'erreurs) **corrigés** (§A-7, A-8). |

Aucun constat de revue ne reste ouvert **côté code**. Les points restants (B-1 k-anonymat, B-3 WAL) sont
des **décisions Arno/DPO** ou des **limites d'infrastructure**, explicitement hors du périmètre « code » de
ce lot.

---

## E. Prochaine étape

1. **Trancher B-0** (déclenchement : cron système recommandé) — je fournis le cartouche.
2. Appliquer **019** (`psql … -f db/migrations/019_m2_maintenance_config.sql`) — optionnel, le job marche
   sans (repli). Rejouable/idempotente.
3. **Avant le Lot 2** : trancher **B-1** (k-anonymat au repos) avec avis DPO — c'est le vrai point de fond.
4. Ce lot étant le **GATE**, le Lot 2 (instrumentation) peut être planifié une fois B-0 et B-1 arbitrés.
