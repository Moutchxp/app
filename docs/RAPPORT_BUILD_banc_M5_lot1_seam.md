# RAPPORT — build « Banc M5 · Lot 1 : seam verbeux moteur (ventilation par faisceau) »

> Ventilation par faisceau ADDITIVE et OPT-IN, par **extraction-délégation** (source unique de vérité).
> **GOLDEN-SAFE prouvé bit-identique.** **Non committé.** Commit SÉPARÉ (BE-87, fichier sensible).

## Résumé
`ventilerNote` devient la **source unique de l'agrégat** (l'ancienne formule de `noteDegagement`, verbatim) ;
`noteDegagement` **délègue** (`ventilerNote(...).total`). `ventilerFaisceau` expose la ventilation d'un faisceau,
sa valeur `distancePercueM` **déléguée** à `distancePercueFaisceau` (INCHANGÉ). La ventilation est un **champ
additif OPT-IN** de `ResultatComplet` (`analyser(entree, profil, { ventilation:true })`). Golden
`29.107259068449615` **bit-identique** (`ventilation.note.total === score.total`, `toBe`). `test:integration`
**17/17** (15 + 2 nouveaux). Aucune écriture DB, aucune migration.

## Fichiers (4 modifiés)
- `app/lib/svv/coucheDegagement.ts` (+184) : types `VentilationFaisceau/Couloir/Note/Analyse` + `FamilleFaisceau` ;
  fonctions `ventilerFaisceau`, `ventilerNote`, `ventilerAnalyse` ; **`noteDegagement` → wrapper** de `ventilerNote`.
  `distancePercueFaisceau` **NON modifié**.
- `app/lib/svv/analyse.ts` (+19) : `ResultatComplet.ventilation?` (SCORE-ONLY) + `OptionsAnalyse` ; `analyser(entree,
  profil, options?)` calcule `ventilation` **uniquement si demandé**.
- `app/lib/db/pipeline.ts` (+4) : `ParametresAnalyse.ventilation?` (opt-in) ; passé à `analyser` ; prod (`params.ventilation`
  absent) → `undefined` → chemin inchangé.
- `app/lib/db/pipeline.itest.ts` (+37) : test **BE-19** (Asnières via le seam → golden inchangé, 61 lignes,
  `ventilation.note.total === score.total`) + test **BE-19bis** (sans opt-in → `ventilation` absent, golden inchangé).

## A. DÉCISIONS HORS-SPECS
- **A1 — `distancePercueFaisceau` conservé lean (non transformé en wrapper), `ventilerFaisceau` le DÉLÈGUE pour la
  valeur.** La SPEC BE-10 dit « distancePercueFaisceau devient un wrapper » ; la revue faisabilité (#1/#5) précise que
  « le seam ré-appelle distancePercueFaisceau (pur, bit-identique) » est le pattern SÛR, le vrai risque étant la
  duplication de l'AGRÉGAT. Choix : `distancePercueFaisceau` reste la **source unique de la valeur par faisceau**
  (INCHANGÉ, prod lean, bit-identique, appelé par `ventilerNote` ET `ventilerFaisceau`) ; les **extras descriptifs**
  (coeff, boostF4, diviseur, mode, cap, famille) sont re-dérivés dans `ventilerFaisceau` (ils ne feed NI score NI
  verdict). L'agrégat, lui, est mis en source unique (`ventilerNote`, `noteDegagement` délègue). Alternative écartée :
  faire de `distancePercueFaisceau` un wrapper de `ventilerFaisceau` → aurait recalculé les extras sur le chemin de
  prod (BE-19bis « perf inaltérée »).
- **A2 — `seuilBorneM`** (nommé ainsi plutôt que `seuilFranchi`) = la **borne du profil qui plafonne le faisceau**
  (base `distanceMaxM` / famille `distMaxM` / `mondialFaisceauM`), **dérivée du profil, aucun littéral** (BE-11a). Le
  banc (Lot 6) dérivera « quel arc franchi » en comparant `distancePercueM` à cette borne + aux bornes globales.
- **A3 — `facteurNormalisation` INDICATIF** : `(1/nb/distanceMaxM)×plafondDegagement` (affichage). La valeur EXACTE
  reste `noteAvantOrientation` (le float n'est pas associatif : `cumulNet × facteur ≠ note`). Tracé pour éviter que
  le banc l'utilise comme calcul officiel.
- **A4 — Opt-in threadé jusqu'à `analyserAdresse`** (`ParametresAnalyse.ventilation?`) en plus de `analyser` : permet
  au banc (Lot 5) d'appeler soit `analyser` pur, soit `analyserAdresse` end-to-end. Additif, rétro-compatible.

## B. DOUTES
- **B1 (mineur, perf)** — `noteDegagement` construit désormais un petit objet `VentilationNote` (intermédiaires) à
  chaque appel, même en prod. **Une** allocation par analyse (PAS 61 : les lignes ne sont bâties QUE sous opt-in via
  `ventilerAnalyse`). Coût négligeable, aucun round-trip DB, aucun réordonnancement → BE-18/BE-19bis respectés au sens
  algorithmique. La VALEUR de prod est bit-identique (prouvé BE-19bis + golden 17/17).
- **B2 (mineur)** — les extras de `ventilerFaisceau` recalculent coeff/valeurClassique/combine (déjà calculés dans
  `distancePercueFaisceau`) : redondance assumée, UNIQUEMENT sur le chemin opt-in (banc), jamais en prod.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **17/17**, `29.107259068449615` **bit-identique**. Preuve forte : BE-19 asserte
    `ventilation.note.total === score.total` (`toBe`, égalité stricte) → la reconstruction par la formule d'agrégation
    (normalisation + malus + orientation + **clamp**) est exacte, PAS une somme naïve (BE-16).
  - **Source unique** : `distancePercueFaisceau` INCHANGÉ (diff : aucune ligne supprimée dans son corps) ;
    `noteDegagement` = `ventilerNote(...).total` (agrégat écrit UNE fois). Aucune fonction jumelle recalculant l'agrégat.
  - **Prod inaltéré** : BE-19bis (sans opt-in → `resultat.ventilation` absent, golden inchangé) vert.
  - **VERDICT DÉCOUPLÉ** : `verdict.ts` non touché ; la ventilation est SCORE-ONLY (n'entre ni dans le score ni dans
    le verdict — c'est une lecture du calcul déjà fait).
  - **ST_Force2D / arrondi** : `coucheDegagement.ts` est PUR (aucune opération géométrique/raster) ; aucun arrondi
    ajouté ; aucun réordonnancement (formules copiées verbatim).
  - **ISOLATION** : `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, migrations — **intouchés**. `git status`
    = 4 fichiers (coucheDegagement, analyse, pipeline, pipeline.itest).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **423** (tests `distancePercueFaisceau`/combinaison inchangés
    verts) · `next build` **✓**.

## Ce que le seam expose (pour les Lots suivants)
- Par faisceau : `offsetDeg`, `distanceBruteM` (nullable), `distancePercueM`, `seuilBorneM`, `famille`
  (mh/inventaire/mondial/annee/null), `coeffApplique`, `boostF4AppliqueM`, `natureTraverseeM`, `diviseurCumulNature`,
  `modeCombinaison`, `capFamilleApplique`. **PAS** boostF2/forfait F3 (vestigiaux).
- Agrégat : `total`, `cumulPercuM`, `cumulBrutM`, `malusCouloir[]` (droite/gauche + indices), `malusTotalM`,
  `cumulNetM`, `noteAvantOrientation`, `facteurNormalisation` (indicatif), `orientation{secteur,points}`,
  `clamp{min,max,applique}`.

## Verdict de conformité : livraison prête. Seam additif opt-in par extraction-délégation (source unique de vérité) ;
## golden BIT-IDENTIQUE prouvé (`ventilation.note.total === score.total`) ; prod inchangé ; commit SÉPARÉ requis (BE-87).
