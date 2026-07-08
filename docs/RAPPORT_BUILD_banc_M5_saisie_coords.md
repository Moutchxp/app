# RAPPORT — build « Banc M5 · saisie : coords live + saisie GPS directe »

> Deux ajouts liés à la saisie du banc. Front-only. `origine.ts`/moteur intacts → golden bit-identique.
> **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE)
- **Chemin unique de validation** : tout `setPoint({lat,lon})` (`BancSaisie.tsx:55`) déclenche l'effet `[point, mode]`
  (`:70`) → `POST /api/origine` (validerOrigine) → `validation` + `snappe`. **Les deux ajouts n'ont qu'à appeler
  `setPoint` pour réutiliser exactement ce chemin** (aucune duplication de garde).
- **Format** : `point = {lat, lon}` WGS84 décimal (`ParametresSaisie.point`, `:139`).
- **« Temps réel »** : `point` n'est mis à jour qu'au `moveend` (débounce 500 ms interne à `MapContent.tsx:94-103`).
  Pour du vrai temps réel au drag, il faut l'event Leaflet **`move`**, non exposé → ajout d'une prop additive `onMove`.

## Ajouts (3 fichiers front)
### Ajout 1 — Coordonnées WGS84 live sous la carte
- `MapContent.tsx` : prop additive **`onMove?`** (event Leaflet `move`, temps réel, sans débounce ; ref `onMoveRef`
  mise à jour en effet, comme `onPositionChangeRef`). `MapSelector.tsx` : `onMove?` ajouté au type (forward via
  `{...props}`). **Défaut : rien passé → parcours public strictement inchangé.**
- `BancSaisie.tsx` : `handleMapMove` throttlé à **une frame** (`requestAnimationFrame`, pas un débounce — purement
  local, aucun réseau) → `coordsLive`. Affichage `Point (WGS84) : lat, lon` en `toFixed(6)` sous la carte.
  **WGS84 uniquement — aucun Lambert-93 exposé.**

### Ajout 2 — Saisie de coordonnées GPS (alternative à l'adresse)
- Champ « ou coordonnées GPS : 48.9044, 2.2701 » + bouton « Placer » (+ touche Entrée). `placerCoords` →
  `parseCoords` → `setPoint` (**MÊME chemin** : validation + snap façade via l'effet `[point,mode]`, aucun bypass).
- `parseCoords` (pur) : **point décimal EXIGÉ** ; séparateur virgule ou espace ; **piège FR** (virgule décimale
  `48,9044`) → ≥ 3 morceaux ou hors-borne → **rejet clair** (« utilisez le POINT décimal ») plutôt que deviner ;
  bornes de plausibilité France métropolitaine (attrape aussi une inversion lat/lon) ; entrée invalide → message FR,
  aucun `setPoint`, aucun crash. `validerOrigine` reste la garde réelle en aval (un point hors bâtiment → MÊME message
  d'invalidité que via adresse).
- Coexiste avec le champ adresse + le reverse-au-drag (Fix précédent) : après `placerCoords`, le reverse remplit le
  label adresse (l'adresse suit le point) — cohérent.

## A. DÉCISIONS HORS-SPECS
- **A1 — Ajout d'une prop `onMove` à `MapContent`/`MapSelector` (front, additif).** Le « temps réel au drag » exige
  l'event Leaflet `move` ; `point` (moveend, débounce 500 ms) ne suffit pas. Prop additive, défaut = comportement
  public INCHANGÉ (le parcours public ne passe pas `onMove`). Alternative écartée : afficher `point` (moveend) →
  ne serait PAS temps réel. `MapContent`/`MapSelector` ne sont pas dans la liste interdite du chantier.
- **A2 — Throttle `requestAnimationFrame` (≈ 60 fps), PAS un débounce.** L'affichage suit le centre en temps réel ;
  le rAF coalesce les frames pour ne pas re-rendre au-delà d'une fois par frame (perf des 2 cartes). Purement local,
  aucun réseau — conforme à « aucun appel réseau, aucun débounce ». Annulé au démontage.
- **A3 — Bornes de plausibilité = France métropolitaine** (`lat [41;52]`, `lon [-6;10]`). Attrape les inversions
  lat/lon et le gros hors-zone AVANT l'appel réseau ; `validerOrigine` reste la garde métier (couverture LiDAR/bâti).
  Alternative écartée : bornes monde `[-90;90]/[-180;180]` → laisserait passer une inversion (faux point plausible).
- **A4 — Saisie GPS n'arme PAS `ignoreReverse`** : après `placerCoords`, le reverse remplit l'adresse (cohérent avec
  « l'adresse suit le point »). Contrairement à `onSelectAdresse` qui préserve le label choisi.

## B. DOUTES
- **B1 (mineur, non-render)** — le temps réel (`move`) et le snap au drag n'ont pas pu être vérifiés à l'œil (pas de
  navigateur). Garanties : prop additive calquée sur `onPositionChangeRef`, tsc 0, build ✓, golden 20/20, et
  MapContent/MapSelector prouvés lint-neutres (5 problèmes pré-existants avant == après).
- **B2 (mineur)** — `parseCoords` accepte l'espace comme séparateur en plus de la virgule (robustesse) ; documenté.
  Une saisie « 48,9044 » seule (virgule décimale sans lon) → interprétée « 48 » / « 9044 » → rejet « hors zone »
  (lon 9044 invalide) : rejetée proprement, pas de faux point.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **`origine.ts` NON touché** ; garde `/api/origine` réutilisée à l'identique (aucun bypass — Ajout 2 passe par
    `setPoint` → même validation). Isolation dure : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`,
    Gemini, `verdict`, `pipeline.ts`, seam Lot 1, `profilTest.ts`, `FaisceauMap.tsx` — **intouchés**.
  - **GOLDEN** : `test:integration` **20/20**, `29.107259068449615` inchangé (front-only).
  - **WGS84 seul** : affichage lat/lon décimal ; aucun Lambert-93 exposé (2154 reste interne au moteur).
  - **NO-WRITE** : aucune écriture DB, aucune migration ; `onMove`/coords = lecture de state locale.
  - **`prefers-reduced-motion`** : aucune animation ajoutée (rAF = throttle de rendu, pas une animation visuelle).
  - **Lint-neutre sur fichiers partagés** : `MapContent`/`MapSelector` = **5 problèmes pré-existants avant == après**
    (prouvé par stash) ; `BancSaisie.tsx` = **eslint 0**. Public inchangé (prop `onMove` par défaut absente).
  - Non-régression : `tsc` 0 · `npm test` **436** · `next build` ✓.

## Vérification manuelle attendue (Arno)
- Déplacer la carte → les coordonnées WGS84 sous la carte défilent en temps réel.
- Saisir « 48.9044, 2.2701 » + Placer → le point se pose et se valide/snappe (comme via adresse). « 48,9044, 2,2701 »
  (virgules FR) → message d'erreur clair, aucun point posé. Coords hors bâtiment → même message d'invalidité que via adresse.

## Verdict de conformité : livraison prête. Coords WGS84 temps réel (prop `onMove` additive, public inchangé) ;
## saisie GPS via le MÊME chemin de validation/snap (aucun bypass) ; parsing FR robuste ; golden 20/20 ;
## origine.ts/moteur intacts. À valider à l'œil sur /admin/banc-test.
