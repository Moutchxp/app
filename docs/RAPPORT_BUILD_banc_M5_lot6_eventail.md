# RAPPORT — build « Banc M5 · Lot 6 : graphique en éventail (61 faisceaux, 3 séries) »

> VISUALISATION PURE : dessine la ventilation DÉJÀ calculée (seam Lot 1), aucun recalcul. Ne touche NI le
> moteur NI config_scoring. Golden bit-identique. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE)
- **`ResultatComplet.ventilation` (seam Lot 1, `coucheDegagement.ts:234-286`)** : `VentilationAnalyse = { lignes[61],
  note }`. Par faisceau : `offsetDeg`, `distanceBruteM` (null = dégagé), `distancePercueM`, `seuilBorneM`, `famille`,
  `coeffApplique`, `boostF4AppliqueM`, `natureTraverseeM`, `diviseurCumulNature`, `modeCombinaison`, `capFamilleApplique`.
- **`comparerProfils` (Lot 5)** renvoie `actif: {score, ventilation, verdict}` ET `test: {…, ventilation, …}` ; la route
  `/api/admin/banc-comparer` les sérialise → `data.actif.ventilation.lignes` / `data.test.ventilation.lignes` sont déjà
  dans le JSON (mon type `ComparaisonLite` ne les typait juste pas).
- **Série BRUT** = `distanceBruteM` (géométrique, IDENTIQUE actif/test car géométrie construite une seule fois, build×1)
  → profil-indépendante (CA-6.3).
- **Bornes des arcs** : `profilActif` est déjà en state (Lot 2b) → `distanceMaxM` (200), `max(mh.distMaxM, inv.distMaxM)`
  (400), `mondialFaisceauM` (800). Dérivées du profil, **aucun littéral**.
- **CONFIRMÉ** : les 3 séries viennent de données déjà calculées (aucun recalcul) ; l'éventail test lit `test.ventilation`.

## Implémentation (2 fichiers)
- **`banc-test/EventailFaisceaux.tsx` (NEW)** : SVG schématique (BE-60). 61 faisceaux tracés à `offsetDeg` réel
  (±90°, pas 3°). 3 séries (BE-63) filtrables (BE-64), défaut ACTIF+TEST, BRUT off (BE-64a), couleurs tokens SVAV.
  Arcs 200/400/800 = polylignes aux rayons `rayon(base/famille/mondial)`, libellés = bornes du profil (BE-61). Échelle
  radiale par PALIERS `r200<r400<r800` (CA-6.6) : un faisceau capé à une borne atterrit sur l'arc correspondant. Faisceau
  BRUT dégagé (`distanceBruteM null`) → cercle ouvert distinct (BE-63). Repos = tracés seuls ; survol/clic d'un faisceau
  → valeurs + tips agrandis (BE-65/65a). Guides radiaux plus marqués là où test ≠ actif, estompés sinon (BE-70/69). Clic
  → panneau détail `DetailFaisceau` : actif vs test en 2 colonnes, lignes de contribution surlignées si elles diffèrent,
  `distanceBruteM` en repère neutre (BE-66/66a). `prefers-reduced-motion` respecté ; `overflow-x:auto` + viewBox scalable
  (mobile, BE-68).
- **`banc-test/BancSaisie.tsx` (MODIFIÉ)** : type `RunLite.ventilation?` ajouté ; rend `<EventailFaisceaux>` sous le
  comparatif quand `comparaison.ok` + ventilations présentes, en passant les bornes dérivées de `profilActif`.

## A. DÉCISIONS HORS-SPECS
- **A1 — Échelle radiale UNIQUE dérivée des bornes du profil ACTIF** (référence), pas une échelle par série. La SPEC
  (BE-61) veut « rayons dérivés des bornes du profil affiché » ; le graphe superpose 3 séries sur UN schéma. Choix : une
  échelle par paliers construite sur `profilActif` (base/famille/mondial) ; les 3 séries y plotent leurs distances. Comme
  le graphe est SCHÉMATIQUE (BE-60, « pas à l'échelle »), un faisceau test capé à une borne test différente plote sur
  l'échelle actif — la lecture reste comparative. Alternative écartée : 2 jeux d'arcs (actif/test) superposés → illisible.
- **A2 — Séries dessinées en POLYLIGNE des tips** (silhouette d'éventail) + tips, plutôt que 61 rayons pleins par série.
  Motif : lisibilité (3×61 rayons = illisible) ; les 61 directions sont rappelées par des guides radiaux faibles. Les
  rayons individuels restent la zone de survol/clic (lignes transparentes larges). Conforme à « éventail » + BE-65a.
- **A3 — Série BRUT lue depuis `actif.ventilation` (`distanceBruteM`)**, identique à `test.ventilation` (géométrie build×1).
  Un seul des deux suffit ; garantit l'invariance de BRUT au profil (CA-6.3).
- **A4 — Pas de test unitaire dédié** : chantier UI SVG ; la donnée (ventilation) est déjà testée (Lot 1 golden + Lot 5).
  La fonction `rayon()` est interne au composant. Tracé en doute B.

## B. DOUTES
- **B1 (mineur, non-render)** — le rendu SVG (éventail, survol, détail) n'a pas pu être vérifié à l'œil (pas de
  navigateur). Garanties : données déjà testées, tsc 0, eslint 0, build ✓, golden 22/22. À valider sur `/admin/banc-test`.
- **B2 (mineur)** — `rayon()` non extraite/testée unitairement (interne au composant). Le mapping par paliers est simple
  (lerp) et déterministe ; un faisceau à la borne atterrit sur l'arc par construction (CA-6.6).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **VISUALISATION PURE** : `EventailFaisceaux` ne fait QUE lire `ventilation.lignes` (déjà calculées) et les tracer ;
    aucun appel moteur, aucun recalcul de score, aucun accès DB.
  - **GOLDEN** : `test:integration` **22/22**, `29.107259068449615` inchangé (aucun fichier moteur touché).
  - **SÉRIE BRUT profil-indépendante** (CA-6.3) : lit `distanceBruteM` (géométrique) → ne change pas quand le profil de
    test change (seule `distancePercueM` de la série TEST bouge).
  - **ARCS dérivés du profil** (BE-61) : rayons/libellés depuis `profilActif.{distanceMaxM, mh/inv.distMaxM,
    mondialFaisceauM}` — aucun littéral 200/400/800 en dur.
  - **FaisceauMap NON réutilisé** (SVG autonome) → parcours public strictement inchangé (fichier non modifié).
  - **NO-WRITE** : aucune écriture DB, aucune migration ; le graphe ne consomme que le JSON du run existant.
  - **prefers-reduced-motion / mobile** : guard media-query + overflow-x auto + viewBox scalable.
  - **ISOLATION dure** : `coucheDegagement`, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`,
    `pipeline.ts`, seam Lot 1, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts`, `FaisceauMap`, `MapContent` — **intouchés**.
    `git status` = `BancSaisie.tsx` (M) + `EventailFaisceaux.tsx` (new).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **439** · `next build` ✓.

## Vérification manuelle attendue (Arno)
- Lancer un test avec un profil de test modifié → l'éventail montre 2 silhouettes (actif/test) distinctes ; cocher
  « Brut » → 3e série (inchangée si on remodifie le profil). Survoler un faisceau → 3 valeurs ; cliquer → détail actif/test
  avec les contributions divergentes surlignées. Faisceaux où test ≠ actif : guides plus marqués. Arcs = bornes du profil.

## Verdict de conformité : livraison prête. Éventail 61 faisceaux, 3 séries (actif/test/brut) tracées depuis la
## ventilation déjà calculée ; arcs dérivés du profil ; détail par faisceau avec écarts surlignés ; golden 22/22 ;
## FaisceauMap public intact. À valider à l'œil sur /admin/banc-test.
