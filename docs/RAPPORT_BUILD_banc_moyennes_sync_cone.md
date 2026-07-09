# RAPPORT — build « Banc M5 · 2 moyennes brutes + couleurs/ordre + cône transparent + libellé 800 + sync cartes »

> 5 ajustements UI /admin/banc-test. Front-only (EventailFaisceaux + BancSaisie). Golden bit-identique. **Non committé.**

## Diagnostics (recon ciblée)
- **Couleurs** : `COULEUR.actif = ink` (≠ vert) ; ordre filtres `["actif","test","brut"]`.
- **Cône** : déjà dessiné EN PREMIER (`:187`, derrière arcs/séries) → il « masque » par opacité (`fillOpacity 0.15` +
  stroke `strokeWidth 2`).
- **Libellé « 80 »** : label arc R800 à `x = p.x + 2` (`pointFor(90, R800)` = `348+2 = 350`), ancrage à gauche →
  « 800 m » déborde le viewBox (`W=360`) → **clip → « 80 »**. CAUSE = clip d'affichage, pas une valeur à 80.
- **Cartes** : carte analysée dans un wrapper `padding: "0 12px 12px"` ≠ wrapper de la carte azimut
  (`border + overflow:hidden`) → largeurs différentes → non superposables.

## Implémentation (2 fichiers)
### `EventailFaisceaux.tsx`
1. **4 moyennes** (descriptif, aucun recalcul) : **(1) Brut géométrique** (⌀ `distanceBruteM` sur les OBSTRUÉS, compte
   « N/61 · M dégagés exclus ») · **(2) Brut au sens du score** (⌀ sur les 61 avec `distanceBruteM ?? borneScore`, où
   `borneScore = borneScoreM` = **`distanceMaxM` du profil de TEST**, adaptatif ; infobulle « non profil-indépendante ») ·
   **(3) Moteur actif** (⌀ `distancePercueM`/61) · **(4) Profil de test** (idem). Couleurs gris/gris/vert/rouge.
2. **Couleurs + ordre uniformisés** : `COULEUR = { brut: gray, actif: green-ink, test: red }` (= en-têtes du tableau
   de détail) ; `ORDRE_SERIES = ["brut","actif","test"]` pour les FILTRES ET les TRACÉS. Les lignes portent
   `COULEUR[s]` → couleurs = légende = tableau.
3. **Cône transparent** : `fillOpacity 0.15 → 0.09`, `strokeWidth 2 → 1` + `strokeOpacity 0.5` ; reste dessiné en
   premier (derrière arcs + séries) → TOUT visible. Toujours dérivé de `coneDemiAngleDeg`, couleurs FaisceauMap conservées.
4. **Libellé 800** : labels d'arc en `textAnchor="end"` à `x = p.x` → le texte croît vers la GAUCHE, ne déborde plus →
   « 800 m » complet. Libellés toujours dérivés des bornes du profil.

### `BancSaisie.tsx`
- Passe **`borneScoreM={(profilTest ?? profilActif).distanceMaxM}`** (borne du profil de test, adaptatif) pour la
  moyenne (2).
5. **Sync des cartes** : la carte analysée (`<details>`) utilise désormais le **WRAPPER IDENTIQUE** à la carte azimut
   (`<div borderRadius:12 overflow:hidden border>`, pleine largeur de section, sans padding horizontal décalant) → mêmes
   dimensions/centre/zoom → superposables. Paramètres FIGÉS du run (`runParams`), même azimut. FaisceauMap monté
   SEULEMENT à l'ouverture → init Leaflet correcte (pas de tuiles grises). FaisceauMap NON modifié (prop existante `margeRotDeg=0`).

## A. DÉCISIONS HORS-SPECS
- **A1 — Moyenne (2) : borne = `distanceMaxM` du PROFIL DE TEST** (`borneScoreM`), pas de l'actif. La consigne « si
  distanceMaxM change dans l'éditeur, cette moyenne doit suivre » → l'éditeur édite le profil de test → borne du test
  (LIVE, comme le cône). Repli `bornes.base` si absent. Alternative écartée : borne de l'actif → ne suivrait pas l'éditeur.
- **A2 — Cône : baissé l'opacité (0.09) + stroke plus fin (1, opacité 0.5) plutôt que retiré.** « conserve les valeurs
  de FaisceauMap » interprété comme « garder les COULEURS (#3b82f6/#60a5fa) » ; « baisser l'opacité » explicitement
  autorisé. Le cône reste identifiable mais laisse tout voir par transparence (déjà derrière tout).
- **A3 — Carte analysée : wrapper aligné sur la carte azimut + montée à l'ouverture (déjà en place).** Superposabilité
  = mêmes dimensions/centre/zoom via le MÊME composant FaisceauMap dans le MÊME conteneur ; l'`invalidateSize` évoqué
  est rendu inutile par le montage conditionnel à l'ouverture (conteneur visible → taille correcte). FaisceauMap intact.

## B. DOUTES
- **B1 (mineur, non-render)** — rendu non vérifié en navigateur (4 moyennes, couleurs, cône, label, superposition des
  cartes). Garanties : tsc 0, eslint 0, build ✓, golden 23/23, FaisceauMap non modifié. À confirmer à l'œil, surtout la
  superposition parfaite des deux cartes et l'absence de tuiles grises.
- **B2 (mineur)** — la superposition suppose que le point/azimut n'ont pas changé depuis le run (sinon `runParams` ≠
  état live) ; la péremption (« à relancer ») signale déjà cet écart.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` inchangé (front-only).
  - **MOYENNES descriptives** : aucun recalcul de score ; dégagés (1) exclus & comptés, (2) comptés à la borne et dit
    (infobulle) ; jamais un null silencieux.
  - **AUCUNE BORNE / ANGLE EN DUR** : (2) borne = `borneScoreM` (profil de test) ; cône = `coneDemiAngleDeg` ; arcs =
    bornes du profil. Aucun 200/60/800 littéral.
  - **PARCOURS PUBLIC / CARTE INCHANGÉS** : `FaisceauMap`, `MapContent`, `MapSelector`, `page.tsx` **non modifiés par ce
    chantier** (git : hors périmètre ; FaisceauMap réutilisé via prop existante). `git diff --stat` = `EventailFaisceaux.tsx`
    + `BancSaisie.tsx` uniquement.
  - **AUCUN HEX ajouté** (prouvé par diff ; cône = consts existantes).
  - **prefers-reduced-motion** : aucune animation ajoutée.
  - **ISOLATION** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`, `pipeline.ts`,
    `faisceaux.ts`, `origine.ts`, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts` — **intouchés par ce chantier**.
  - Non-régression : `tsc` 0 · `eslint` 0 · `next build` ✓ · golden **23/23**.

## Vérification manuelle attendue (Arno)
- 4 moyennes dans l'ordre (Brut géométrique · Brut au sens du score (→borne, infobulle) · Moteur actif · Profil de
  test), gris/gris/vert/rouge ; (2) suit `distanceMaxM` édité. Filtres+tracés Brut/Actif/Test aux mêmes couleurs que le
  tableau. Cône bleu discret laissant voir arcs+tracés. Arc externe légendé « 800 m » (plus « 80 »). « Vue de la map
  analysée » dépliée : carte parfaitement superposable à la carte d'orientation (même centre/zoom/azimut/dimensions),
  non grise.

## Verdict de conformité : livraison prête. 4 moyennes (dont brut-au-sens-du-score adaptatif), couleurs/ordre unifiés,
## cône transparent, libellé 800 (clip corrigé), cartes superposables ; golden 23/23 ; public/FaisceauMap intacts.
