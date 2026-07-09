# RAPPORT — build « Seam Lot 1/3 : valeur AVANT PLAFOND (valeurAvantCapM + p1M + p2M) »

> Ajout STRICTEMENT ADDITIF et DESCRIPTIF au seam de ventilation. Golden bit-identique. **Non committé.**
> Fichiers de CE chantier : `app/lib/svv/coucheDegagement.ts` (sensible), `app/lib/db/pipeline.itest.ts` (golden).

## Implémentation
### `app/lib/svv/coucheDegagement.ts` — 4 edits additifs
1. **Interface `VentilationFaisceau`** : 3 champs — `valeurAvantCapM: number`, `p1M: number | null`, `p2M: number | null`.
2. **`ventilerFaisceau` — déclarations** : `baseOrdinaireM = min(distanceObstacleM ?? distanceMaxM, distanceMaxM)`
   puis défaut `valeurAvantCapM = baseOrdinaireM + boostF4AppliqueM` (cas ordinaire/dégagé = valeur avant le plafond
   de portée) ; `p1M = null`, `p2M = null`.
3. **Branche mondial** : `valeurAvantCapM = distancePercueM` (valeur fixe, aucun plafond ne mord).
4. **Branches famille** : avec nature → `valeurAvantCapM = combine` (la valeur DÉJÀ calculée à `:343`), `p1M = p1`,
   `p2M = p2` ; sans nature → `valeurAvantCapM = dist × coeffApplique` (hoisté `lecturePatrimoineM`, réutilisé aussi
   pour `capFamilleApplique`). Objet retourné : 3 champs ajoutés.

**Capture, jamais recalcul** : `combine`, `p1`, `p2`, `dist×coeff` étaient déjà calculés sur place dans
`ventilerFaisceau` ; on les expose. Le cas ordinaire (`baseOrdinaireM + boostF4AppliqueM`) est la valeur EXPLICITEMENT
spécifiée par le chantier, calculée à l'identique du barème classique (`base` capé portée + boost F4).

### `app/lib/db/pipeline.itest.ts` — 1 assertion additive (test « seam ENRICHI », boucle existante)
- `valeurAvantCapM >= distancePercueM` (le plafond ne peut qu'abaisser) ;
- **invariant exact** `distancePercueM === min(valeurAvantCapM, seuilBorneM)` (`.toBe`, bit-exact) — capture l'égalité
  stricte « quand aucun plafond ne mord » de façon universelle et dérivable ;
- `p1M`/`p2M` : soit les deux `null`, soit les deux `number` (cohérence cumul nature+bâti).
  Aucune assertion existante touchée.

## A. DÉCISIONS HORS-SPECS
- **A1 — Champs REQUIS (`valeurAvantCapM: number`, `p1M/p2M: number | null`), non `?`-optionnels.** Le prompt dit
  « trois champs optionnels » mais liste des types NON optionnels (`number`, `number | null`). `ventilerFaisceau` les
  renseigne TOUJOURS → les rendre requis évite un `| undefined` à gérer partout en aval et matche les types donnés.
  Alternative écartée : `?`-optionnels (forcerait des gardes `undefined` inutiles ; l'assertion golden a besoin de la
  valeur définie). Impact : nul sur le golden/behaviour ; sûr (aucun autre site ne construit `VentilationFaisceau` ;
  superset → toujours assignable au miroir front `LigneVentil`, tsc 0).
- **A2 — Assertion golden = invariant `min(valeurAvantCapM, seuilBorneM)` plutôt que la formulation littérale
  « égalité stricte si capFamilleApplique===false ET plafond de portée non mordu ».** L'invariant `min(...)` est
  exact, universel (mondial/famille/ordinaire), bit-dérivable et n'a pas besoin de reconstituer « le plafond de portée
  a-t-il mordu » (non exposé). Il IMPLIQUE la formulation demandée. `≥` conservé explicitement en plus.
- **A3 — Hoist `lecturePatrimoineM = dist × coeffApplique`** dans la branche famille sans nature (au lieu de
  recomputer `dist × coeffApplique` deux fois). Purement cosmétique, bit-identique, évite la duplication.

## B. DOUTES
- **B1 (mineur)** — le cas « ordinaire/dégagé » expose `baseOrdinaireM + boostF4AppliqueM` (valeur avant le plafond de
  PORTÉE), comme demandé. C'est la seule valeur du chantier reconstruite (et non capturée d'une variable préexistante),
  mais elle est explicitement spécifiée et prouvée bit-identique via l'invariant `min(...)` (test vert). À confirmer
  côté produit au Lot 3 : l'UI doit-elle afficher « avant plafond » aussi pour les faisceaux ordinaires (écrêtage 200 m)
  ou seulement pour les faisceaux pondérés (famille) ? (Question ouverte reportée du rapport de recon.)

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` **bit-identique** ; `note.total === score.total`
    (assertion stricte préexistante) toujours vert. **Le golden n'a pas bougé** (re-run effectué, pas de rescellage).
  - **CHEMIN DU SCORE INTACT** : `distancePercueFaisceau` et `ventilerNote` **0 ligne modifiée** (prouvé par diff).
    Aucune valeur retournée par le moteur ne change.
  - **ADDITIF & DESCRIPTIF** : 3 champs ajoutés au seam opt-in ; ne feed NI le score NI le verdict.
  - **VERDICT DÉCOUPLÉ** : inchangé (aucun couplage introduit).
  - **PARCOURS PUBLIC INCHANGÉ** : `page.tsx` ne consomme jamais la ventilation (0 occurrence) ; le seam est opt-in,
    absent en prod.
  - **AUCUNE ÉCRITURE DB** (grep INSERT/UPDATE/DELETE/TRUNCATE/DROP vide) ; **aucune migration**.
  - **GEMINI hors périmètre** (`adaptateurIaPhoto.ts`, `analyse-photo/route.ts` non touchés).
  - **PILOTAGE SANS CODE** : aucune nouvelle variable de MOTEUR (les 3 champs sont des SORTIES descriptives dérivées,
    pas des paramètres à externaliser). `config_scoring` inchangé.
  - Non-régression : `tsc` 0 · `eslint` 0 (2 fichiers) · `npm test` **442 passed** · `next build` ✓ · golden **23/23**.

## Recon de validation (Phase 8) → **VERDICT : VALIDER**
Modification strictement additive et golden-safe par construction (chemin du score prouvé intact, golden bit-identique
re-joué). Invariant `distancePercueM = min(valeurAvantCapM, seuilBorneM)` vérifié bit-exact sur les 61 faisceaux
d'Asnières. Aucun doute bloquant ; le seul point ouvert (B1) est un choix d'ergonomie du Lot 3, sans effet sur ce Lot.

## Fichiers touchés (livraison)
- `app/lib/svv/coucheDegagement.ts` — 3 champs `VentilationFaisceau` + capture dans `ventilerFaisceau`.
- `app/lib/db/pipeline.itest.ts` — 1 assertion additive (invariant + ≥ + cohérence p1M/p2M).
- `docs/RAPPORT_BUILD_seam_valeur_avant_cap.md` — ce rapport.

## Suite (rappel du découpage 1/3)
- **Lot 2** — répercuter les 3 champs dans le miroir front `LigneVentil` (`EventailFaisceaux.tsx`) + confirmer le
  forward `bancEssai.ts`.
- **Lot 3** — rendre « Distance pondérée (m) » dépliable (strates humaines), mettre en évidence `valeurAvantCapM`.
