# RAPPORT — build « Lot 3/3 : modale explicative du calcul de la distance pondérée »

> Modale informative (lecture seule) décortiquant le calcul pas à pas, actif vs test, à partir des valeurs du
> seam — SANS jamais recalculer le barème. Golden bit-identique. **Non committé.**
> Fichiers : `EventailFaisceaux.tsx`, `BancSaisie.tsx` (2 props), `EventailFaisceaux.calcul.test.ts` (nouveau).

## Implémentation
### `EventailFaisceaux.tsx`
- **Générateur PUR `construireEtapesCalcul(l, profil): EtapeCalcul[]`** (exporté pour test) + `interface EtapeCalcul`
  + dictionnaire `LIBELLES_ETAPE` + helpers `contexteFamille`, `fmtMontant`. Dérive le récit du CAS RÉEL lu dans `l` :
  - `famille === 'mondial'` → 1 étape « Valeur fixe patrimoine mondial » ;
  - `famille === null` → ordinaire/dégagé : distance réelle (ou « distance retenue » si dégagé) ± « Bonus végétation traversée » ;
  - `famille ≠ null` & `natureTraverseeM === 0` → patrimoine seul : distance × « Multiplicateur patrimoine (axe/côté) » ;
  - `famille ≠ null` & `natureTraverseeM > 0` → cumul : « Lecture dégagement » (p1M) + « Lecture patrimoine » (p2M) +
    combinaison dont le libellé suit **le mode EFFECTIF** `l.modeCombinaison` (jamais présumé) ;
  - étape « valeur avant plafond » MISE EN ÉVIDENCE (valeur == `l.valeurAvantCapM`) ; étape finale « Plafond appliqué »
    (valeur = `l.distancePercueM`, note explicite) quand `capFamilleApplique` OU `valeurAvantCapM > seuilBorneM`.
  - **Aucune constante de barème** : tous les nombres viennent de `l` ou de `profil` (coeff = `l.coeffApplique`,
    borne = `l.seuilBorneM`, cap P1 = `profil.cumulNature.capP1M`, cône/flanc = `|offsetDeg| ≤ profil.coneFamilleDemiAngleDeg`).
    Opérations composées (`× {coeff}`, `+ {boost} m`, `÷ {diviseur}`) formées à l'exécution. Champ `null` → étape omise.
- **`ModaleCalcul` + `ColonneCalcul`** : modale centrée, overlay, `role="dialog"` `aria-modal`, fermeture par bouton /
  clic dehors / Échap, **focus piégé** (Tab cycle) + focus initial ; le focus est **rendu au picto** par l'appelant.
  Deux colonnes AUTONOMES (Actif vert / Test rouge), chacune via `construireEtapesCalcul` avec SON profil ; étape dont
  la valeur diffère entre colonnes discrètement soulignée (comparaison par position) ; récap par colonne (valeur avant
  plafond → plafond appliqué → distance perçue finale) ; note fixe rappelant que la valeur avant plafond n'entre pas
  dans le score. `prefers-reduced-motion` respecté ; colonnes empilées < 640 px (`flexWrap`).
- **Picto ▾** = `<button>` (aria-label explicite, `aria-haspopup="dialog"`, `aria-expanded`) sur la ligne « Distance
  pondérée (m) » du tableau existant (marquée `depliable`). `DetailFaisceau` reçoit `profilActif`/`profilTest`.
### `BancSaisie.tsx`
- Passe `profilActif={profilActif}` et `profilTest={profilTest ?? profilActif}` à `EventailFaisceaux` (le run de test
  utilise `profilTest ?? profilActif`, cohérent avec le reste du composant).
### `EventailFaisceaux.calcul.test.ts` (nouveau, unitaire)
- 8 tests : pureté (déterminisme), invariant « exactement une étape en évidence == valeurAvantCapM », les 4 cas,
  cap qui mord, mode `max`, mondial, dégagé.

## A. DÉCISIONS HORS-SPECS
- **A1 — Soulignement des différences par POSITION d'étape.** La spec dit « une étape dont la valeur diffère entre
  actif et test est soulignée » tout en interdisant un alignement ligne-à-ligne artificiel. Choix : comparer par index
  (une étape sans contrepartie compte comme différente), soulignement `underline dotted` DISCRET. Les chaînes restent
  autonomes (longueurs/cas différents autorisés) ; le soulignement n'est qu'un repère visuel, pas une contrainte de
  structure. Alternative écartée : appariement sémantique par libellé (fragile, cas divergents). Impact : cosmétique.
- **A2 — Base ordinaire reconstruite par soustraction d'affichage** `baseM = valeurAvantCapM − boostF4AppliqueM`
  (exact par construction du seam Lot 1). Toléré par la consigne (« additions/multiplications d'affichage entre champs
  du seam »). N'invente rien : c'est l'inverse exact de l'assemblage `valeurAvantCapM = base + boost`.
- **A3 — `construireEtapesCalcul` exportée** (tout en restant définie DANS `EventailFaisceaux.tsx`, « locale » au
  fichier) pour être testable unitairement sans la monter dans un composant. Alternative écartée : la garder privée
  (non testable en isolation). Impact : nul (export additif).
- **A4 — Étape « Distance retenue » affichée uniquement pour le faisceau DÉGAGÉ** (brute `null`) ; pour un obstacle,
  `base === distanceBruteM` (obstacle toujours ≤ portée) → on part directement de la distance réelle, pas de doublon.

## B. DOUTES
- **B1 (mineur) — la « Lecture dégagement » (P1) est présentée comme UN bloc** (`p1M`), sans détailler son propre
  contenu (distance retenue + bonus végétation, puis cap `capP1M`). Motif : le seam n'expose PAS `base` ni la valeur
  pré-cap-P1 côté cumul ; les décomposer exigerait de recalculer le barème (interdit). **Valeur intermédiaire
  manquante signalée** : pour narrer l'intérieur de P1, ajouter au seam (lot ultérieur) `baseM` et/ou la valeur
  classique avant `capP1M`. En l'état, P1 est honnête (montant réel + note du plafond `capP1M`).
- **B2 (mineur)** — rendu non vérifié en navigateur (centrage, empilement mobile, focus/Échap). Garanties : tsc 0,
  eslint 0, build ✓, 8 tests unitaires verts, golden 23/23.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` **bit-identique** (aucun fichier moteur/test golden touché).
  - **PURETÉ / ZÉRO BARÈME EN DUR** : grep des littéraux dans `construireEtapesCalcul` = seulement `0` (présence nature
    / index), `1` (index), `3` (décimales `toFixed`) — **aucune constante de barème** (200/400/800/2.5/1.5/60/30/25/5/0.1).
    Preuve jointe : `sed '/construireEtapesCalcul/,/^}/' | grep -oE '[0-9.]+' | sort -u → 0 1 3`.
  - **ZÉRO TEXTE EN DUR** : une seule phrase figée (autorisée) = la note « valeur avant plafond indicative ». Toutes les
    autres chaînes viennent du dictionnaire `LIBELLES_ETAPE` ; les opérations sont composées des valeurs réelles.
  - **AUCUN NOM TECHNIQUE À L'ÉCRAN** : dictionnaire humain uniquement (pas de `p1M`/`distanceMaxM`/nom de colonne).
  - **NE RECALCULE PAS LE BARÈME** : assemble depuis `l` (valeurs du moteur) ; seules des opérations d'affichage.
  - **PARCOURS PUBLIC INCHANGÉ** : `page.tsx` non modifié (0 occurrence) ; `FaisceauMap`/`MapContent`/`MapSelector`
    non touchés.
  - **PÉRIMÈTRE** : `coucheDegagement.ts`, `distancePercueFaisceau`, `ventilerNote`, `pipeline.itest.ts`,
    `bancEssai.ts`, `EditeurProfilTest.tsx` **NON touchés**. Aucun hoist, aucun refactor cosmétique.
  - **prefers-reduced-motion** respecté (animation désactivée sous la media query). A11y : dialog/aria-modal/Échap/
    clic dehors/focus piégé/retour focus au picto ; picto = vrai `<button>`.
  - **Aucune écriture DB, aucune migration** ; **Gemini** hors périmètre.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **450 passed** (dont 8 nouveaux) · `next build` ✓ · golden **23/23**.

## Recon de validation (Phase 8) → **VERDICT : VALIDER**
Modale purement informative, générateur pur prouvé sans littéral de barème (grep) et testé (8 cas), a11y complète,
golden intact, parcours public non effleuré. Seul point ouvert (B1) : détail interne de P1 nécessiterait un champ
seam supplémentaire (lot ultérieur) — sans blocage pour ce lot.

## Fichiers touchés (livraison)
- `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.tsx` — générateur + dictionnaire + modale + picto + props.
- `app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx` — 2 props (`profilActif`, `profilTest`).
- `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.calcul.test.ts` — 8 tests unitaires (nouveau).
- `docs/RAPPORT_BUILD_modale_calcul_distance_ponderee.md` — ce rapport.

## Valeur intermédiaire manquante pour un lot ultérieur (signalée)
- Pour détailler l'INTÉRIEUR de la « Lecture dégagement » (P1) en cumul — distance retenue, bonus végétation, puis
  écrêtage à `capP1M` — le seam devrait exposer `baseM` (min(brute, portée)) et/ou la valeur classique avant `capP1M`.
  Non ajouté ici (interdiction de toucher le moteur ce lot). Candidat pour un « Lot 4 » additif golden-safe.
