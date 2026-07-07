# RAPPORT FINAL — build « Activation des 3 modes de combinaison nature (P1) + bâti (P2) »

> Run `/svav-build` sur `docs/SPEC_modes_combinaison.md` (OQ1–OQ4 tranchés). **Chantier MOTEUR le plus
> sensible. Non committé.** Catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
`mode_combinaison` est désormais **effectif** à `coucheDegagement.ts` via la fonction pure `combinerP1P2` :
`sequentiel` = `P1 + P2÷diviseur` (= comportement actuel), `addition` = `P1 + P2`, `max` = `max(P1,P2)` ;
gating par `cumul_seuil_min_m` ; sous le seuil, **repli configurable** `mode_combinaison_repli` (nouvelle
colonne, défaut `addition`). Défauts migrés `max`→`sequentiel` (`PROFIL_DEGAGEMENT_DEFAUT` + fixture
`PROFIL_GOLDEN_REF`) → **golden bit-identique** `29.107259068449615` (14/14). La ligne LIVE n'est **pas**
écrite (Règle dure) → **action Arno requise (EX-21)**.

## Fichiers (11 modifiés, 2 nouveaux)
- **Moteur** : `coucheDegagement.ts` (`combinerP1P2` exportée + refactor du bloc `natureM>0`, `:90-95`) ;
  `profilDegagement.ts` (`ModeRepli`, champ `modeCombinaisonRepli`, DEFAUT `sequentiel`+`addition`).
- **Golden** : `pipeline.itest.ts` (fixture `PROFIL_GOLDEN_REF` → `sequentiel`+`addition`).
- **Config** : `profilConfig.ts` (SELECT + mapping fallback `addition`) ; `db/migrations/005_config_scoring_mode_combinaison_repli.sql` (NEW, additive).
- **Admin** : `mappingConfig.ts` (`optionsEnum`, `mode_combinaison`→VIVE, entrée `mode_combinaison_repli`,
  infobulles réécrites, comptages 47) ; `validation.ts` (enum via `optionsEnum`) ; `route.ts` (GET SELECT) ;
  `page.tsx` (select via `optionsEnum` + avertissement golden sur VIVE).
- **Tests** : `coucheDegagement.combinaison.test.ts` (NEW), `mappingConfig.test.ts`, `route.test.ts`,
  `validation.test.ts`.

## A. DÉCISIONS HORS-SPECS
- **A1 — Champ `optionsEnum` sur `ColonneMeta`** (issu du plan-audit) : sans lui, `validation.ts` validait
  tout enum contre `MODES_COMBINAISON` en dur → `mode_combinaison_repli='sequentiel'` aurait été accepté par
  l'API puis rejeté par le CHECK DB (**503** disgracieux). `optionsEnum` (lu par la validation ET le
  `<select>`) impose la vraie liste fermée par colonne → **422 propre**. Nécessaire pour EX-19.
- **A2 — `combinerP1P2` exportée** pour test unitaire direct (fonction pure). Alternative écartée : la tester
  seulement via `distancePercueFaisceau`.
- **A3 — Mapping `modeCombinaisonRepli` (fallback `addition`) fait au pas 1** (solidaire de l'ajout du champ
  requis) pour garder le codebase **type-complet** à chaque étape (évite une fenêtre de non-compilation TS).
- **A4 — `MODES_COMBINAISON`/`MODES_REPLI` déclarés avant `META`** dans `mappingConfig.ts` (TDZ : `META` les
  référence désormais).
- **A5 — Régularisation LIVE NON exécutée** (Règle dure) : la valeur `config_scoring.mode_combinaison` reste
  `'max'` en base ; la migration n'écrit que la nouvelle colonne (DEFAULT `addition`). Passage à `sequentiel`
  = action Arno via l'admin (EX-21).

## B. DOUTES
- **B1 — Fallback repli non couvert par test unitaire direct** : le fallback `mode_combinaison_repli` invalide
  → `'addition'` (`profilConfig.ts:92`) n'a pas de test dédié (pas de `profilConfig.test.ts`). Faible risque
  (le CHECK DB empêche une valeur invalide d'exister ; la validation la rejette en amont en 422). *Suggestion
  post-livraison* : test mockant `query` renvoyant `mode_combinaison_repli:'sequentiel'`/`undefined` →
  `profil.modeCombinaisonRepli === 'addition'`.
- **B2 — Fenêtre de transition PROD (EX-21) — OPÉRATIONNEL, pas un défaut** : la prod lira la ligne live
  `mode_combinaison='max'` → pour les faisceaux exerçant P1+P2, elle appliquerait `max(P1,P2)` **au lieu de**
  `P1+P2÷diviseur`, **jusqu'à** ce qu'Arno règle la valeur via l'admin. Le golden (fixture découplée) **ne
  détecte pas** ce décalage. **Action requise d'Arno immédiatement après livraison.**

## C. ÉCARTS DE CONFORMITÉ
- **Aucun écart bloquant.** Batterie SVAV :
  - **GOLDEN** : `test:integration` **14/14**, `29.107259068449615` **bit-identique** (défaut `sequentiel` +
    fixture migrée reproduisent le calcul actuel ; `x/1.0 === x` pour le repli addition sous seuil).
  - **BIT-IDENTITÉ** : `sequentiel` = `p1 + (dist*coeff)/diviseur` — mêmes opérandes/opérations/ordre que
    l'ancien code (`coucheDegagement.ts:70,116-122`).
  - **ISOLATION** : exception mondiale (`:106`), cône/flanc (`:112`), chemin classique (`natureM=0`) —
    **inchangés** ; `repli.ts` inchangé ; `mode_combinaison_repli` **absent** des gardes de repli-profil-entier
    (fallback de champ seul) ; verdict / `ST_Force2D` / Gemini **intouchés**.
  - **MIGRATION** : 005 additive (`ADD COLUMN IF NOT EXISTS` + CHECK idempotent), **zéro** `UPDATE
    mode_combinaison` / `DROP` / `ALTER` destructif ; ré-application NO-OP ; ligne live `mode_combinaison='max'`
    **non écrite**.
  - **ENUM fermé** : `mode_combinaison_repli='sequentiel'` → **422** (testé) ; `mode_combinaison` accepte ses
    3 valeurs.
  - Non-régression : `tsc` 0 · `npm test` **309 passés / 21 skipped** (baseline 295, +14, zéro régression).
- **NOTE (dérive doc, hors périmètre build)** : le code passe à **47 colonnes** ; l'invariant **CLAUDE.md §0
  (« 46 colonnes »)** et quelques specs (`SPEC_M1_edition_config.md`, `SPEC_pilotage_lecture_seule.md`)
  restent à « 46 ». À corriger dans un **commit doc séparé** (l'invariant §0 notamment).

---

## Verdict de conformité : livraison prête. Golden bit-identique, isolation totale, migration additive, ligne
## live non écrite (Règle dure). **Action critique post-livraison — EX-21 : Arno règle `mode_combinaison =
## 'sequentiel'` (+ `mode_combinaison_repli='addition'`) via l'admin, sinon la prod bascule sur `max(P1,P2)`.**
