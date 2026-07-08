# RAPPORT — build « Journal d'audit curation : création / suppression / renommage »

> Ajoute les INSERT `curation_patrimoine_log` manquants dans 3 routes (POST création, DELETE suppression,
> PATCH renommage). **GOLDEN-SAFE** (journal jamais lu par le moteur). **Non committé.**

## Résumé
Les 3 mutations d'entité manuelle non tracées le sont désormais, **dans la même CTE atomique** que la
mutation (même transaction) : `creation_entite_manuelle`, `suppression_entite_manuelle`, `renommage`.
Golden **15/15** (`29.107259068449615`) inchangé. Pattern reproduit à l'identique des journaux existants
(point/liaisons). Aucune modif de logique de mutation.

## Fichiers (3 modifiés)
- `entites/route.ts` : POST → `WITH mut AS (INSERT … RETURNING …), jrnl AS (INSERT curation_patrimoine_log 'creation_entite_manuelle' … apres=famille/nom/ref_code FROM mut) SELECT … FROM mut`.
- `entites/[id]/route.ts` : DELETE → + CTE `snap` (snapshot AVANT delete : famille/nom/ref_code + `jsonb_agg(cleabs)` des liaisons) + `jrnl 'suppression_entite_manuelle'` (`avant`=snapshot) ; PATCH → + CTE `snap` (ancien nom) + `jrnl 'renommage'` (`avant={nom:ancien}` / `apres={nom:nouveau}`).
- `curation.test.ts` : +assertions de journal (action + payload) sur les 3 tests existants.

## A. DÉCISIONS HORS-SPECS
- **A1 — Snapshot AVANT mutation via CTE `snap`** (suppression & renommage) : en Postgres, toutes les CTE
  data-modifying d'un même `WITH` opèrent sur **le snapshot du début du statement** → `snap` (lecture) voit
  l'état **pré-DELETE / pré-UPDATE** même si `del_*`/`mut` s'exécutent dans la même requête. C'est la façon
  correcte de capturer `avant` atomiquement. Alternative écartée : SELECT séparé en amont (2 requêtes, non atomique).
- **A2 — `liaisons` = `jsonb_agg(cleabs ORDER BY cleabs)`** dans le `avant` de suppression (COALESCE `[]`
  si aucune) : trace les bâtiments qui étaient rattachés au tag supprimé (auditabilité). `NULLS`/vide → `[]`.
- **A3 — Journal conditionné par la mutation** : le `jrnl` fait `SELECT … FROM mut`/`FROM snap` → **0 ligne
  journalisée si la mutation ne matche rien** (entité inconnue/native → snap/mut vides → 404, aucun log).
  Reproduit le comportement des CTE existantes. Garde `origine='manuel'` héritée de la mutation.
- **A4 — `ts` jamais passé** (DEFAULT now()) ; `cleabs = NULL` (actions d'entité, pas de liaison) — conforme spec.

## B. DOUTES
- **B1 — 🔴 PRÉREQUIS : migration 011 NON détectée comme appliquée** sur la base locale inspectée
  (`postgresql://localhost:5432/sansvisavis`) : le `CHECK action` y montre encore **5 valeurs** (pas les 8).
  Le prompt indiquait « 011 appliquée en local », mais la base contredit. **Impact** : tant que 011 n'est pas
  appliquée, les 3 routes lèveront un **`23514` (check_violation)** sur les nouvelles actions → la CTE échoue →
  **création/suppression/renommage renvoient 503**. **Le code est CORRECT** ; c'est un **prérequis de déploiement**.
  → **Appliquer AVANT tout usage** : `psql "$DATABASE_URL" -f db/migrations/011_check_action_journal.sql`.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun écart de code.** Un **prérequis d'environnement** (B1) : migration 011 à appliquer.
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. `curation_patrimoine_log`
    n'est lu par **aucun** chemin de score (append-only, écrit par les routes admin) → golden-safe.
  - **INSTRUMENTATION** : le build **n'écrit rien** en base (tests mockent `query`). Aucune donnée touchée.
  - **ISOLATION** : `git status` = `entites/route.ts` + `entites/[id]/route.ts` + `curation.test.ts`.
    Non touchés : `faisceaux.ts`, `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `scoreDegagement.ts`,
    `pipeline.ts`, `obstacles.ts`, `analyse.ts`, `cartesAnnee.ts`, `PROFIL_GOLDEN_REF`, Gemini. **Aucune migration
    exécutée** par le build.
  - **AUCUNE logique de mutation ajoutée/modifiée** : le DELETE et l'UPDATE existants sont **inchangés** ;
    seuls les CTE `snap`/`jrnl` (journal) sont ajoutés autour.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **376** · curation **34** (+ assertions journal) · `next build` **✓**.

## Tests
- création → 201 + `INSERT patrimoine_entite` **+ journal `creation_entite_manuelle`** (apres famille/nom/ref_code).
- suppression → 200 + DELETE liaisons+entité **+ journal `suppression_entite_manuelle`** (snapshot avant).
- renommage → 200 + UPDATE gardé manuel **+ journal `renommage`** (avant/apres nom).
- golden `score.total` **15/15** inchangé.

## Verdict de conformité : livraison prête côté code. Les 3 actions manquantes sont journalisées atomiquement
## (CTE), snapshot `avant` correct, golden bit-identique, isolation totale, aucune logique de mutation touchée.
## ⚠️ PRÉREQUIS Arno : appliquer la migration 011 (sinon 503 sur ces 3 actions) — cf. B1.
