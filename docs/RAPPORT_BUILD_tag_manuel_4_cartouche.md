# RAPPORT — build « Tag manuel 4/6 : légende dans le cartouche résultat + nom optionnel »

> Bascule `resoudreMonuments` legacy→unifié (cartouche résultat) + B1 (nom optionnel à la création).
> **GOLDEN-SAFE** (resoudreMonuments descriptif, hors score/verdict — prouvé). **Non committé.**

## Résumé
- Le cartouche vert du résultat lit désormais le **modèle unifié** (`patrimoine_entite`/`_batiment`) →
  les **tags manuels** (et la curation d'Arno) remontent, plus le legacy figé.
- Libellé : **nom saisi** si rempli, sinon **générique par famille** (mh → « Vue Monument historique »,
  inventaire → « Vue sur patrimoine », mondial → « Vue sur monument d'exception »).
- Précédence par cleabs : **manuel** d'abord, puis **mondial > mh > inventaire** (1 entité/faisceau).
- **B1** : création d'un tag **sans nom** → 201 (nom NULL), le générique famille prend le relais.
- Golden **15/15** (`29.107259068449615`) — `score.total` inchangé.

## Fichiers (5 modifiés)
- `obstacles.ts` : **`resoudreMonuments` UNIQUEMENT** (docstring + requête + mapping) → modèle unifié + précédence.
- `analyse.ts` : remplace `cartoucheMonuments` par `libellesPatrimoine` (local) ; import `CONE_VUE_NATURE_DEG`.
- `entites/route.ts` : POST nom **optionnel** (vide → NULL, plus de 422).
- `CurationCarte.tsx` : formulaire « Nouveau tag » — nom optionnel (validation retirée, label « (optionnel) »).
- `curation.test.ts` : test POST « nom vide → 201 » (était 422).

## A. DÉCISIONS HORS-SPECS
- **A1 — Contournement de `cartoucheMonuments` dans `analyse.ts`** (au lieu de le modifier) : `coucheDegagement.ts`
  est interdit (MUST NOT). Nouvelle fonction locale `libellesPatrimoine` qui **réplique** la logique de
  `cartoucheMonuments` (filtre cône ±`CONE_VUE_NATURE_DEG`, dédup par `ref` le plus central, tri) mais lit le
  **libellé déjà résolu** dans `nom`. `cartoucheMonuments` reste exporté (inutilisé) dans `coucheDegagement.ts`, intact.
- **A2 — 🔴 FIX de précédence SQL (bug attrapé au build)** : `(meta->>'origine'='manuel')` vaut **NULL** pour un
  natif → `ORDER BY … DESC` (NULLS FIRST par défaut) faisait passer les **natifs AVANT** le manuel. Corrigé en
  **`… IS TRUE DESC`** (natif → FALSE, jamais NULL). Vérifié : le cleabs partagé du tag 993 renvoie bien
  « Hotel de ville Asnières » (manuel) et non « Conciergerie » (mondial natif).
- **A3 — Libellé précalculé DANS `resoudreMonuments`** (champ `nom` de l'extraction) plutôt qu'un nouveau
  champ : le type `ExtractionMonuments` vit dans `coucheDegagement.ts` (interdit). `type`/`statut` mis à `null`.
- **A4 — Format du libellé = nom BRUT** (pas de préfixe « Monument historique : ») : conforme OQ1 (« le nom
  saisi »). Changement d'affichage assumé vs l'ancien cartouche (`Monument historique : {tico}` / statut).
- **A5 — Précédence manuel > mondial > mh > inventaire** (OQ2) ; source natifs + manuels (OQ3).

## B. DOUTES
- **B1 (affichage, intended)** : pour un **natif MH** nommé (ex. « Pavillon de Breteuil »), le cartouche
  affiche désormais **le nom brut** (via `pe.nom`, seedé depuis `mh.tico` en migration 009) au lieu de
  « Monument historique : Pavillon de Breteuil ». **Voulu** (OQ1) mais c'est un changement de wording visible
  sur TOUTES les fiches résultat, pas seulement les tags manuels. À valider par Arno si le préfixe « Monument
  historique : » lui manquait.
- **B2 (contenu Asnières, intended)** : la LISTE des badges pour Asnières **peut changer** (legacy figé vs
  unifié curé). Non testé (le golden n'asserte pas le cartouche) ; la **NOTE** est invariante (prouvée).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `score.total` **`29.107259068449615` bit-identique** + verdict
    inchangé. **Preuve que la bascule `resoudreMonuments` ne touche pas le score** : `score.total`
    (`analyse.ts:100`) = `scoreTotal(…entree.faisceaux…)`, jamais `extractionMonuments` ; `resoudreMonuments`
    n'alimente que `monumentsHistoriques` (descriptif, non asserté).
  - **INSTRUMENTATION** : le build **n'écrit rien** en base (SELECT-only + tests mockés) → **divergences=0**,
    garde-fou Asnières respecté. Le contenu du cartouche peut changer (voulu) ; la note ne bouge pas (golden).
  - **ISOLATION `obstacles.ts`** : `git diff` → **aucune signature de fonction modifiée** ;
    `obstaclesSurAxe`/`resoudreVueNature`/`resoudreEpoqueImmobilier` **intacts** (score/verdict-relevantes).
    `monuments_historiques` (legacy) retiré, `patrimoine_entite/_batiment` lu, `ST_Force2D` conservé.
  - **MUST NOT respectés** : `faisceaux.ts`, `verdict.ts`, `config_scoring`, `coucheDegagement.ts`,
    `cartesAnnee.ts`, `PROFIL_GOLDEN_REF`, Gemini — **intouchés**. **Aucune migration.**
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **376** · `test:integration` **15/15**.

## Tests
- (a)/(c) tag manuel « Hôtel de ville » (ou cleabs multi-entités) → précédence manuel, libellé remonte (SQL vérifié read-only).
- (b) tag sans nom → générique famille (SQL : `NULLIF(btrim(nom),'')` → générique).
- (d) POST nom vide → **201**, nom NULL (test unitaire).
- (e) golden `score.total` **inchangé** (test:integration 15/15).

## Verdict de conformité : livraison prête. Cartouche résultat sur le modèle unifié (tags manuels + curation
## remontent), précédence manuel corrigée (fix `IS TRUE`), nom optionnel. GOLDEN-SAFE (score bit-identique,
## resoudreMonuments seul touché dans obstacles.ts, aucune migration). Point Arno : B1 (nom brut sans préfixe « Monument historique : » pour les natifs).
