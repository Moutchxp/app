# RAPPORT FINAL — build « Étape 8 : Migration patrimoine unifiée »

> Run `/svav-build` sur `docs/SPEC_migration_patrimoine_unifiee.md` (OQ1–OQ7 tranchés). **Chantier MOTEUR
> GOLDEN-ADJACENT. Non committé.** Catégories : A décisions hors-specs · B doutes · C écarts.

## Résumé
Les 3 familles patrimoine (MH, Inventaire, Mondial) sont unifiées dans `patrimoine_entite` +
`patrimoine_entite_batiment` (migration 009, gabarit du mondial), et `faisceaux.ts` lit désormais ce
modèle. **L'équivalence des flags `is_mh/is_inv/is_emblematique` a été PROUVÉE par instrumentation
(`divergences=0` sur les 401 cleabs) AVANT la réécriture**, puis confirmée par le golden. Golden
**15/15** (14 pré-existants dont `pipeline.itest` à `29.107259068449615` + 1 scellé). Sources **conservées**.

## Fichiers (1 modifié, 2 nouveaux)
- `app/lib/db/faisceaux.ts` : les **3 EXISTS** (`:103-107`) réécrits sur le modèle unifié (JSDoc à jour) ;
  **ligne année `:102` inchangée**, ossature (`unnest`, mapping, interface) inchangée.
- `db/migrations/009_patrimoine_entite_unifie.sql` (NEW) : tables + seed idempotent (appliqué).
- `app/lib/db/patrimoineFlags.itest.ts` (NEW) : jeu scellé (4 triplets réels, filet de régression).

## A. DÉCISIONS HORS-SPECS
- **A1 — Instrumentation par requête psql EXHAUSTIVE** (401 cleabs, `FULL JOIN` + `IS DISTINCT FROM`,
  univers = **sources ∪ `patrimoine_entite_batiment.cleabs`**) plutôt qu'un `.itest.ts` temporaire. Plus
  fort : couvre **tous** les cleabs (pas un échantillon) et détecte un cleabs rattaché **d'un seul côté**
  (le snippet inner-`JOIN` de la spec `:187-188` l'aurait masqué — correctif du plan-audit). Exécutée
  **avant** la réécriture (gate) **et après** (re-preuve) → `divergences=0` les deux fois.
- **A2 — `UNIQUE (famille, ref_code)`** ajouté sur `patrimoine_entite` (le modèle spec ne listait que des
  index non-uniques) : cible du `ON CONFLICT` (idempotence) + clé de mapping du seed liaison.
- **A3 — Colonne géométrie MH = `geom`** (pas `geom_point`) : mappée `mh.geom → pe.geom_point`, même SRID
  2154, `ST_Force2D`, sans reprojection.
- **A4 — Jeu scellé : 3 catégories IMPOPULABLES en données réelles** (mesuré) → « emblématique+MH » (0
  cleabs) remplacé par **« Mondial seul »** ; « `badge_actif=false` » (0 ligne) **non synthétisé** (documenté)
  ; « bornes 1900/1935 / flanc cumul / couloir » relèvent du **chemin SCORE** (hors des 3 EXISTS) →
  couverts par le golden. Le test scellé couvre les **4 catégories réelles** (bi-famille, MH pure, Inv pure
  active, Mondial seul). L'invariance des cas manquants est portée par l'instrumentation `divergences=0`.
- **A5 — `dist_m`** source (`numeric`) → liaison `double precision` (cast implicite PG) ; `source` mondiale
  **préservée** (`meb.source`).

## B. DOUTES
- **B1 — Trous de données du jeu scellé** (A4) : 3 catégories de la spec (EX-12) sans donnée réelle. **Non
  bloquant** : (i) la preuve porteuse = `divergences=0` sur les **401 cleabs réels** (couvre tout actif) ;
  (ii) le filtre `peb.actif` (Inventaire) est correct par construction et serait attrapé par toute future
  ligne inactive ; (iii) les cas score sont couverts par le golden. À rescanner si le patrimoine évolue
  (bi-famille/emblématique).
- **B2 — Migration one-shot** : `ON CONFLICT DO NOTHING` **ne met pas à jour** une liaison si `badge_actif`/
  `source` d'une source change entre deux rejeux. Documenté dans l'en-tête de 009. Acceptable (seed
  volontaire ; re-seed = action explicite). Pour la curation (M4), les écritures `source='manuel'` primeront.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV :
  - **INSTRUMENTATION (preuve porteuse)** : `divergences=0` sur les **401 cleabs**, **avant ET après** la
    réécriture (flags ancien-3-tables ≡ nouveau-unifié).
  - **GOLDEN** : `test:integration` **15/15** — les **14 pré-existants** verts (dont `pipeline.itest` :
    `29.107259068449615` **bit-identique**, verdict `SANS_VIS_A_VIS`, distance 42,10) + **1 scellé**.
    *(Le passage de 14 à 15 = ajout du filet scellé, PAS un mouvement du golden ; la valeur est inchangée.)*
  - **SEED conforme aux comptes** : 496 entités (176 mh + 306 inv + 14 mondial) · 416 liaisons (152 + 250 +
    14) · idempotent (rejeu = 0 ajout) · **8 bi-famille = 2 entités indépendantes** (`is_mh` ET `is_inv`).
  - **RÉÉCRITURE isolée** : diff limité aux 3 EXISTS + JSDoc ; **année `:102` intacte** ; MH sans filtre ·
    Inventaire `peb.actif` (LIAISON) · mondial `pe.actif` (ENTITÉ) — granularité identique à l'existant.
  - **MIGRATION additive** : `CREATE TABLE IF NOT EXISTS` + seed `ON CONFLICT DO NOTHING` ; **aucun
    DROP/DELETE/purge** ; **4 tables sources conservées** (OQ6). `geom_point` en 2154, `ST_Force2D` sur les
    copies géométriques du seed ; aucun `ST_Transform` en base.
  - **ISOLATION** : verdict (100 % géométrique), `PROFIL_GOLDEN_REF`, précédence mondial>MH>Inv (moteur),
    `config_scoring`, Gemini, calcul du faisceau hors patrimoine — **intouchés**. Non-régression `tsc` 0 ·
    `npm test` **342** · eslint 0.

---

## Verdict de conformité : livraison prête. Équivalence des flags PROUVÉE (divergences=0, 401 cleabs), golden
## bit-identique (29.107259068449615), migration additive (sources conservées), isolation totale. Pré-requis
## de la carte M4 (Étape 9) levé et prouvé invariant. Rappel séquencement : purge des 3 sources = commit
## séparé ultérieur ; M4 se construit désormais sur ce modèle unifié.
