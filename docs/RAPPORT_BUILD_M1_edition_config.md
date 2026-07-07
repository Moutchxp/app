# RAPPORT FINAL — build « Étape 4 : M1 édition de config_scoring »

> Run `/svav-build` sur `docs/SPEC_M1_edition_config.md` (OQ1–OQ5 tranchés). **PREMIER chantier qui écrit
> dans config_scoring. Non committé.** Catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
Les variables **VIVE** de `config_scoring` sont désormais **éditables** depuis l'admin (écriture directe),
avec **validation server-side stricte** et **garde anti-repli**. L'écriture est un **`UPDATE id=1`** atomique
(CTE mono-`query()`) + **journal append-only** (`config_edit_log`, migration 004). Golden **inchangé**
(`29.107259068449615`, `test:integration` vert) grâce au découplage acquis. Zéro opération destructive.

## Fichiers (livraison)
- **`mappingConfig.ts`** (MOD) : `ColonneMeta` étendue (`type/editable/min/max/pas/aide`), 46 entrées, helper
  `metaParColonne` (allowlist). + `mappingConfig.test.ts`.
- **`api/admin/config/validation.ts`** (NEW, `server-only`) : `validerPatch` — ordre strict (body vide →
  colonne inconnue → non éditable → NOT NULL → type → plage → **anti-repli sur ligne résultante**), jamais
  de clamp. + `validation.test.ts`.
- **`api/admin/config/route.ts`** (MOD) : `PATCH` ajouté (GET intact) — SELECT ligne → `validerPatch` →
  **CTE `UPDATE config_scoring … WHERE id=1 RETURNING *` + `INSERT config_edit_log`** en un seul `query()`.
  + `route.patch.test.ts`.
- **`pilotage/page.tsx`** (MOD) : UI d'édition (VIVE inputs typés, `mode_combinaison` select fermé,
  VESTIGIALE grisées + légende, `analysis_range_m` note garde-fou, **paire groupée**, erreur 422 au champ,
  bandeau golden informatif, aucun brouillon, responsive 375 px).
- **`db/migrations/004_config_edit_log.sql`** (NEW) : `CREATE TABLE IF NOT EXISTS` append-only, idempotent.

## A. DÉCISIONS HORS-SPECS
- **A1 — Bornes = vrais garde-fous moteur (au-delà de « type + plage »)** : `distance_max_m`, `cumul_pas_m`,
  `cumul_base_m`, `cumul_plafond`, `plafond_couche1`, `plafond_degagement` → **`min ≥ 1`**. Raison
  (plan-audit) : ce sont des **dénominateurs/multiplicateurs** dans `coucheDegagement.ts` → une valeur ≤ 0
  produit `NaN`/`Infinity` **sans déclencher le repli** (le repli ne couvre que 2 conditions). `distance_max_m=0`
  est le piège : `0 ≤ analysis_range_m` passe l'anti-repli mais casse le moteur. Chaque `[min,max]` contient
  le défaut du seed (testé). Alternative écartée : bornes cosmétiques larges (auraient laissé passer 0).
- **A2 — Typage strict → toujours 422, jamais 500** : `Number.isInteger` pour les 5 colonnes `integer`
  (sinon PG 500) ; rejet `NaN`/`Infinity`/string numérique `"85"`/body vide. La spec disait « validation de
  type » sans détailler ; ce durcissement garantit qu'aucune entrée invalide ne fuit en 500.
- **A3 — Atomicité par CTE mono-`query()`** : `client.ts` n'expose que `query()` sur un **pool** → deux
  `query()` (UPDATE puis INSERT journal) pourraient tomber sur deux connexions = non atomiques. Retenu : une
  seule requête `WITH upd AS (UPDATE … RETURNING *), jrnl AS (INSERT …) SELECT * FROM upd`. Une CTE
  data-modifying s'exécute **inconditionnellement** (garantie PG), même non référencée → journal toujours écrit.
- **A4 — Journal « avant » depuis le SELECT préalable** (paramétré), pas d'`OLD` SQL (indisponible avant PG 18).
- **A5 — Champ vidé ≠ 0** (post-revue) : un input numérique vidé bloque l'enregistrement (« valeur requise »)
  au lieu de coercer `Number("") = 0`. Évite d'écrire 0 par erreur (orientations `min:0`) ou un 422 déroutant.
- **A6 — `INSERT` journal vs EX-2 littéral** : EX-2 dit « aucun INSERT » ; l'`INSERT` dans `config_edit_log`
  est explicitement voulu par EX-24/25 (journal). L'interdiction d'INSERT ne visait que `config_scoring`.
- **A7 — Légende VESTIGIALE rendue une fois** sous la famille « Héritage » ; `id` (famille Technique) est
  grisé/non éditable mais ne reprend pas la phrase « sans incidence sur le score ». Cosmétique.
- **A8 — Écriture réelle sur `config_scoring id=1` NON exécutée en autonomie** : un `UPDATE` de la ligne
  existante est un **écrasement** proscrit par la **Règle dure** hors action déclenchée par Arno. Le cas
  « édition VIVE valide → persistée » est prouvé par **tests unitaires (query mockée)** ; Arno validera
  l'écriture live via l'UI. Aucune donnée de `config_scoring` modifiée par le run.

## B. DOUTES
- **B1 — TOCTOU (bénin)** : le `SELECT` de contexte et la CTE d'écriture sont deux `query()` sur le pool ;
  un write concurrent entre les deux rendrait l'anti-repli / le « avant » du journal légèrement obsolètes.
  Négligeable (singleton, admin unique) ; la spec n'exige pas de verrou transactionnel. Noté.
- **B2 — Journal CTE non prouvé par test d'intégration réel** : l'exécution de la CTE `jrnl` non référencée
  repose sur la sémantique PG (garantie) + un test qui vérifie que le SQL *contient* `config_edit_log` ;
  pas de test écrivant réellement (Règle dure, cf. A8). Limite acceptable, documentée.
- **B3 (garde-fou croisé `cumul_*`) — NON RETENU.** En usage normal le diviseur de cumulation est borné
  [1 ; `cumul_plafond`] : il ne se calcule que si nature ≥ `cumul_seuil_min_m` (30), toujours >
  `cumul_base_m` (25), donc (nature − base) > 0. Le seul cas produisant un diviseur ≤ 0 exige une inversion
  manuelle `cumul_base_m` > `cumul_seuil_min_m`, sans aucun sens métier, hors périmètre d'un outil
  mono-opérateur. Aucun garde-fou ajouté.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV verte :
  - **GOLDEN** : `test:integration` **14/14**, `29.107259068449615` **inchangé** (découplage préservé — le
    golden lit `PROFIL_GOLDEN_REF` ; la création de `config_edit_log` et la route d'écriture n'ont aucun effet).
  - **ÉCRITURE bornée** : route = `UPDATE config_scoring … WHERE id=1` + `INSERT config_edit_log` **seuls** ;
    **aucun** `DELETE/DROP/ALTER/TRUNCATE` ; migration 004 idempotente non destructive (ré-application = NO-OP).
  - **ANTI-REPLI** : validation de la ligne résultante via `evaluerRepli` (parité exacte avec les 3 conditions
    de `profilConfig.ts`) ; rejets 422 sans écriture prouvés (les tests assèrent `ecritureEmise() === false`).
  - **INJECTION** : noms de colonnes du SET issus de l'allowlist META (jamais des clés du body) ; valeurs
    paramétrées `$n` ; clé hors allowlist → 422 (testé).
  - **ISOLATION** : aucun import `app/lib/svv`/`profilConfig` dans route/validation/page ; `profilConfig.ts`
    (lecture prod), `pipeline.itest`, `PROFIL_GOLDEN_REF`, Gemini, `ST_Force2D` **intouchés**. `GET` inchangé.
  - Non-régression : `tsc` 0 · `npm test` **294 passés / 21 skipped** · route.patch/validation/mappingConfig
    tests probants (status 422 **ET** absence d'écriture).

---

## Verdict de conformité : livraison prête. Édition config_scoring sûre (UPDATE id=1 borné, anti-repli,
## allowlist, journal atomique), golden inchangé et découplé, isolation totale. Règle dure respectée
## (aucune écriture autonome sur la ligne live ; migration = CREATE TABLE non destructif). Note : le doute
## B3 (garde-fou croisé cumul_*) est **NON RETENU** — diviseur borné [1 ; cumul_plafond] en usage normal (§B).
