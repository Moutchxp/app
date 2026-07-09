# RAPPORT — build « Lot 4 : baseM + p1AvantCapM dans le seam de ventilation »

> Ajout ADDITIF et DESCRIPTIF au seam (même patron que le Lot 1) : capture la distance retenue et la lecture
> dégagement AVANT son plafond `capP1M`, pour détailler l'intérieur de « Lecture dégagement » (doute B1 du Lot 3).
> Golden bit-identique. **Non committé.**
> Fichiers : `coucheDegagement.ts` (sensible), `EventailFaisceaux.tsx` (miroir + fixture test), `pipeline.itest.ts` (golden).

## Implémentation
### `app/lib/svv/coucheDegagement.ts`
- **Interface `VentilationFaisceau`** : 2 champs — `baseM: number`, `p1AvantCapM: number | null`.
- **`ventilerFaisceau` — CAPTURE (aucun recalcul)** :
  - `baseM = baseOrdinaireM` : la variable **déjà calculée en tête** (`Math.min(f.distanceObstacleM ?? profil.distanceMaxM, profil.distanceMaxM)`), qui EST le `base` de l'étape 1 de `distancePercueFaisceau` (expression identique). Rien de nouveau à calculer.
  - `p1AvantCapM = valeurClassique` : capturé dans le bloc `if (natureM > 0)`, la valeur **déjà calculée** passée au `Math.min(…, cumulNature.capP1M)` qui produit `p1M`. `null` partout ailleurs (donc ssi `p1M === null`).
  - Un seul `let p1AvantCapM` ajouté près de `p1M` ; deux champs ajoutés à l'objet retourné.

### `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.tsx`
- **Miroir `LigneVentil`** : `baseM: number`, `p1AvantCapM: number | null` (à l'identique du moteur). **Aucun rendu**,
  générateur et modale **inchangés** (c'est le Lot 5).
- **Fixture du test unitaire** (`EventailFaisceaux.calcul.test.ts`) : les 2 champs ajoutés aux défauts de `ligne()`
  (`baseM: 30`, `p1AvantCapM: null`) — conséquence NÉCESSAIRE de l'ajout de champs REQUIS au type mirroré (sinon tsc
  échoue). Aucune assertion existante touchée, aucun test du générateur modifié.

### `app/lib/db/pipeline.itest.ts` — assertions additives (boucle « seam ENRICHI »)
- `baseM ≤ distanceMaxM` sur les 61 faisceaux ;
- `p1AvantCapM === null` **ssi** `p1M === null` ;
- quand `p1AvantCapM !== null` : `p1M === Math.min(p1AvantCapM, cumulNature.capP1M)` (invariant exact, bit-identique).

## A. DÉCISIONS HORS-SPECS
- **A1 — `baseM` capté depuis `baseOrdinaireM` (variable existante), pas depuis le `base` local du bloc famille.**
  Les deux sont l'EXPRESSION IDENTIQUE (`base` du bloc famille = `min(dist, portée)` ; `baseOrdinaireM` =
  `min(dist ?? portée, portée)` ; égaux quand `dist` non-null, et `baseOrdinaireM` couvre AUSSI les cas mondial /
  dégagé). `baseOrdinaireM` est déjà calculé en tête et disponible partout → capture uniforme sans hoist ni recalcul.
  Alternative écartée : hoister le `base` du bloc famille (indisponible hors de ce bloc → aurait exigé un recalcul
  pour mondial/dégagé). Impact : nul (valeur bit-identique).
- **A2 — Fixture du test unitaire mise à jour** (défauts de `ligne()`). Non prévu explicitement par la consigne mais
  forcé par tsc (champs requis ajoutés au type). Ce n'est ni le générateur ni la modale. Alternative écartée : rendre
  les champs optionnels (`?`) — écarté pour rester « à l'identique » du moteur (requis) et cohérent avec le Lot 1.

## B. DOUTES
- **Aucun bloquant.** Le doute B1 du Lot 3 est LEVÉ : les deux valeurs manquantes (distance retenue, lecture
  dégagement avant cap) sont désormais exposées. Le rendu (détail de P1 dans la modale) reste au **Lot 5**.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` **bit-identique** (re-run ; pas de rescellage).
  - **`distancePercueFaisceau` STRICTEMENT INTACT — diff VIDE** : les 4 hunks sont dans l'interface
    (`@@ -269`) et dans `ventilerFaisceau` (`@@ -338/-365/-393`) ; `distancePercueFaisceau` (lignes 103-132) n'a AUCUN
    hunk (preuve : grep des lignes-clés de la fonction dans le diff = vide). Aucune valeur retournée par le moteur ne
    change. **`ventilerNote` non touché.**
  - **CAPTURE, PAS DE RECALCUL** : `baseM`/`p1AvantCapM` = variables déjà calculées, exposées ; aucun `min()`
    réimplémenté, aucun `base + boostF4 × natureM` réécrit.
  - **PARCOURS PUBLIC INCHANGÉ** : `page.tsx` ne consomme jamais le seam (0 occurrence) ; seam opt-in absent en prod.
  - **MIROIR / FORWARD** : `LigneVentil` aligné (tsc 0 sans cast) ; `bancEssai.ts` **NON modifié** (forward en bloc
    `ventilation: rActif.ventilation` suffit).
  - **VERDICT DÉCOUPLÉ** inchangé ; **aucune écriture DB, aucune migration** ; **Gemini** hors périmètre (intact).
  - **PILOTAGE SANS CODE** : aucune nouvelle variable de moteur (sorties descriptives dérivées) ; `config_scoring` inchangé.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **450** · `next build` ✓ · golden **23/23**.

## Recon de validation (Phase 8) → **VERDICT : VALIDER**
Additif, golden-safe par construction (chemin du score prouvé intact, golden bit-identique re-joué), invariant
`p1M === min(p1AvantCapM, capP1M)` vérifié bit-exact sur Asnières, miroir typé sans cast. Aucun doute bloquant.

## Fichiers touchés (livraison)
- `app/lib/svv/coucheDegagement.ts` — 2 champs `VentilationFaisceau` + capture dans `ventilerFaisceau`.
- `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.tsx` — 2 champs `LigneVentil` (miroir).
- `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.calcul.test.ts` — 2 défauts de fixture (tsc).
- `app/lib/db/pipeline.itest.ts` — 3 assertions additives.
- `docs/RAPPORT_BUILD_seam_base_p1avantcap.md` — ce rapport.

## Suite
- **Lot 5** — dans la modale, détailler « Lecture dégagement » (P1) : distance retenue (`baseM`) + bonus végétation →
  valeur avant cap (`p1AvantCapM`) → écrêtage `capP1M` → `p1M`. Générateur `construireEtapesCalcul` à étendre.
