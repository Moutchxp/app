# RAPPORT — build « Tag manuel patrimonial 2/6 : UI création + composition »

> Sous-étape 2/6. **Front (CurationCarte.tsx)**, GOLDEN-ADJACENT (câble l'écriture de liaisons lues par
> le moteur). Le build **n'écrit rien en base** (tests mock, UI hors CI) → golden inchangé. **Non committé.**

## Résumé
UI de création d'une entité manuelle : bouton **« + Nouveau tag »** → formulaire (famille, statut, nom) →
`creerEntite()` (POST 1/6) → `recharger()` → `selectionner(nouvelId)` → composition **N polygones** via le
`rattacher` existant (clics emprises bleues). **`doubleClickZoom` désactivé**. Golden **15/15**
(`29.107259068449615`). Aucune route, aucune migration touchée.

## Fichiers (1 modifié)
- `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` : `doubleClickZoom:false` (map) ; helper
  `creerEntite()` ; état + formulaire « + Nouveau tag » ; callback `soumettreCreation` ; CSS du formulaire.

## A. DÉCISIONS HORS-SPECS
- **A1 — Double-clic de création OMIS ; bouton = déclencheur unique** (req 6 autorise ce choix : « privilégie
  le bouton »). `doubleClickZoom:false` rend le double-clic **inerte** (ne zoome plus — satisfait le test c),
  sans handler de création (un dblclick-créer serait ambigu : quelle famille/statut ?). Le simple-clic
  vert→détacher / bleu→rattacher est **intact**.
- **A2 — `statut` = champ texte libre REQUIS** : la colonne `statut` n'a **aucun enum** en base ; un select
  imposerait des valeurs qui diffèrent par famille. Champ texte requis + placeholder (« classé, inscrit,
  bâti patrimonial… »). Alternative écartée : select à enum inventé.
- **A3 — Pas de test UI automatisé** : `CurationCarte.tsx` (`'use client'` + `import leaflet`) n'est pas
  montable dans le harness vitest/node actuel (0 test existant sur ce composant). La logique serveur
  (POST création) est **déjà couverte** (tests 1/6). Vérification = `tsc` + `eslint` + `next build` + golden.
- **A4 — Pas de recentrage carte sur la nouvelle entité** : une entité manuelle naît **sans `geom_point`**,
  donc `selectionner` ne peut pas centrer (comportement existant `:307`, `e?.point` falsy). L'opérateur
  compose depuis la vue courante (les emprises candidates bleues de la bbox visible).

## B. DOUTES
- **B1 (À ARBITRER — conflit d'exigences)** : **`nom` est REQUIS dans le formulaire**, ce qui **contredit
  req 2/7** (« nom OPTIONNEL », « nom vide → création OK »). **Cause** : la route POST 1/6
  (`entites/route.ts:90`) **rejette le nom vide en 422**, et le MUST NOT de cette sous-étape **interdit de
  la modifier**. Les deux instructions d'Arno sont incompatibles en l'état. **Hypothèse retenue** : nom
  requis (respecte la route intouchable, UX non cassée — un nom optionnel côté UI 422erait au serveur).
  **Pour livrer req 7** (tags sans légende) : relâcher en **1 ligne** la validation `nom` de la route 1/6
  (accepter `nom` vide/`null` → insérer `nom=NULL`) — micro-chantier séparé, **à autoriser par Arno**.
  Le test (d) « nom vide → création OK » est **bloqué** tant que la route n'est pas relâchée.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique.
  - **INSTRUMENTATION (golden-adjacent)** : le build **ne crée aucune entité/liaison réelle** — mesuré
    `entités meta.origine='manuel' = 0`, `entités totales = 496` (inchangé depuis le seed 009). Les tests
    **mockent `query`** ; l'UI n'est pas exécutée en CI. → **aucune mutation de `patrimoine_entite_batiment`
    par le build → univers des cleabs inchangé → divergences = 0 par construction.**
  - **GARDE-FOU Asnières** : le rejeu golden (lat 48.90693182287072 / lon 2.269431435588249 / az 90 / étage 2)
    **passe à 29.107259068449615** → **aucun cleabs d'Asnières n'a reçu de liaison** du fait de ce chantier
    (une liaison manuelle sur un cleabs d'Asnières aurait déplacé le golden). *(Les 76 liaisons `source='manuel'`
    présentes en base sont PRÉ-EXISTANTES — curation antérieure — et n'affectent pas Asnières, sinon le golden
    aurait déjà bougé.)*
  - **ISOLATION** : `git diff --name-only` = **`CurationCarte.tsx` seul**. Non touchés : `faisceaux.ts`,
    `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `cartesAnnee.ts`, `PROFIL_GOLDEN_REF`,
    `liaisons/route.ts`, `entites/route.ts`, Gemini. **Aucune migration.**
  - **Réutilisation stricte** : `rattacher` (`:347`), `liaisons/route.ts` POST, `entites/route.ts` POST —
    **appelés tels quels**, non réécrits.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **367** · `next build` **✓** (route `/admin/curation`).

## Tests (manuels — décrits, UI non automatisable)
- (a) « + Nouveau tag » → formulaire → Créer → nouvelle entité sélectionnée + emprises bleues cliquables.
- (b) N clics d'emprises → N liaisons sous la même entité (via `rattacher` existant), **légende `nom` partagée** (portée par `patrimoine_entite`).
- (c) Double-clic sur la carte **ne zoome plus** (`doubleClickZoom:false`).
- (d) **Nom vide → BLOQUÉ** par la route 1/6 (cf. B1) — non livrable sans relâcher la route.
- (e) Simple-clic **vert→détacher / bleu→rattacher** existant **intact**.

## Verdict de conformité : livraison prête, GOLDEN-SAFE (build sans écriture DB, golden 15/15, isolation 1
## fichier). **Point d'attention prioritaire : B1** — `nom` requis contredit req 2/7 ; livrer les tags sans
## légende exige une relaxation 1-ligne de la route 1/6, à autoriser par Arno (micro-chantier).
