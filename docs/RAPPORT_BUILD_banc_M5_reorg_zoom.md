# RAPPORT — build « Banc M5 · réorganisation saisie + repli + trame + fix zoom carte »

> Réorg UI de `/admin/banc-test` + params repliable + trame sous-cartouches + zoom ancré centre (banc).
> Front-only, golden bit-identique, parcours public inchangé. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic ZOOM (recon LECTURE SEULE — confirmé)
- **Leaflet 1.9.4** (`node -e require('leaflet/package.json').version`).
- `MapContent.tsx:78` : `L.map(mapRef.current, { center, zoom: 19, zoomControl: true })` — **aucune** option
  `touchZoom`/`scrollWheelZoom`/`doubleClickZoom` → défauts Leaflet (`true` = ancrage sur le pointeur). Pincement,
  molette et double-clic zooment sur le point de contact → **déplacent le centre**.
- **Le point d'observation EST le centre** : lu via `map.getCenter()` (`:102, :122, :145, :175`), PAS un marqueur
  draggable. Déplacer le centre = déplacer le point. Les boutons +/− (`zoomControl`) appellent `zoomIn/zoomOut` sur le
  centre → centre fixe → point fixe. **Diagnostic d'Arno EXACT.**
- **Fix Leaflet 1.9** : `touchZoom: 'center'` / `scrollWheelZoom: 'center'` / `doubleClickZoom: 'center'` → zoom ancré
  sur le CENTRE (point immobile), y compris le double-clic (couvert par la même valeur → cohérent).
- **Parcours public** : `page.tsx:2493` monte `<MapSelector>` (localisation) sans option de zoom → défaut pointeur.
  Il ne doit PAS changer → prop additive, défaut = actuel.

## Implémentation
### Fix zoom (prop additive, public inchangé)
- `MapContent.tsx` : prop `zoomAncreCentre?: boolean`. Quand VRAIE, ajoute `{ touchZoom:'center', scrollWheelZoom:
  'center', doubleClickZoom:'center' }` aux options de `L.map`. Quand ABSENTE (public), les options ne sont **PAS
  passées** → l'appel `L.map` est **byte-identique** à l'actuel (défauts Leaflet).
- `MapSelector.tsx` : `zoomAncreCentre?` ajouté au type (forwardé via `{...props}`).
- `BancSaisie.tsx` : passe `zoomAncreCentre` (VRAIE) à sa `MapSelector`.

### Réorganisation du rendu (BancSaisie.tsx)
Nouvel ordre : 1 Adresse · 2 Coordonnées GPS + Placer · **3 Étage + Hauteur sous plafond sur UNE ligne** (steppers
côte à côte, flex-wrap) · **4 Dernier étage + Hauteur de vision calculée sur UNE ligne** · **5 « Paramètres du test »
REPLIABLE** (`<details>/<summary>` natif — accessible, clavier, replié par défaut, pas de persistance) · **6 Cartes**
(point d'observation + mode Façade/Libre, MapSelector zoom-centre, validation, coords live, azimut + FaisceauMap) ·
7 reste inchangé (éditeur profil de test, exécution, comparatif, éventail).

### Trame sous-cartouches
- `EditeurProfilTest.tsx` : `background: var(--color-svv-field)` ajouté à CHAQUE `<fieldset>` (familles de variables +
  cartes d'année). Token SVAV existant (gris clair), **aucun hex en dur**.

## A. DÉCISIONS HORS-SPECS
- **A1 — Zoom activé via prop, options NON passées par défaut** (plutôt que `touchZoom: zoomAncreCentre ? 'center' :
  true`). Motif : ne rien passer = appel `L.map` strictement identique à l'actuel → preuve d'inchangé publique triviale.
  Alternative écartée : passer `true` explicitement → équivalent mais modifie l'appel (moins évident à prouver).
- **A2 — Repli via `<details>/<summary>`** (natif) plutôt qu'un `<button>` + état `useState`. Motif : accessibilité et
  clavier gratuits, pas de persistance (fermé à chaque montage), zéro état à gérer. Conforme à « button/summary, pas un
  div nu ». Alternative écartée : bouton + state → plus de code, même résultat.
- **A3 — Texte « Hauteur de vision » condensé** (valeur + formule en `title`) pour tenir sur une ligne avec « Dernier
  étage ». La formule complète reste accessible en info-bulle (survol). Aucune perte d'information.
- **A4 — `zoomAncreCentre` lu dans l'effet de montage** (deps `[]`, valeur statique côté banc) : capturé une fois, ce
  qui suffit (le banc passe une constante). N'ajoute aucun problème lint (cf. C).

## B. DOUTES
- **B1 (mineur, non-render)** — le comportement zoom-centre (pincement/molette/double-clic → point immobile) et la
  réorg n'ont pas été vérifiés en navigateur. `'center'` est la valeur documentée Leaflet 1.9 pour ces options ; tsc 0,
  eslint 0, build ✓, golden 22/22. À confirmer à l'œil.
- **B2 (mineur)** — la trame `--color-svv-field` sous les sous-cartouches suppose un gris clair lisible (token utilisé
  ailleurs comme fond de champ) ; contraste avec le texte `--color-svv-ink` conservé. À valider visuellement.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **PARCOURS PUBLIC INCHANGÉ** : `zoomAncreCentre` absent côté public → options de zoom NON passées → `L.map(...)`
    byte-identique à l'actuel (défauts Leaflet, ancrage pointeur). `MapContent`/`MapSelector` **lint-neutres** :
    **2 problèmes AVANT == 2 APRÈS** (stash) — mes ajouts n'en introduisent aucun.
  - **GOLDEN** : `test:integration` **22/22**, `29.107259068449615` inchangé (100 % front).
  - **NO-WRITE** : aucune écriture DB, aucune migration, aucun endpoint.
  - **DOUBLE-CLIC** : couvert par `doubleClickZoom:'center'` (cohérent avec pincement/molette) côté banc ; public
    inchangé.
  - **prefers-reduced-motion** : aucune animation ajoutée ; `<details>` sans animation.
  - **Pas de hex en dur** : trame = `var(--color-svv-field)` (token existant).
  - **ISOLATION dure** : `coucheDegagement`, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`,
    `pipeline.ts`, seam Lot 1, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts` — **intouchés**. `git status` =
    `BancSaisie.tsx`, `EditeurProfilTest.tsx`, `MapContent.tsx`, `MapSelector.tsx`.
  - Non-régression : `tsc` 0 · eslint (banc) 0 · `next build` ✓ · golden **22/22**.

## Vérification manuelle attendue (Arno)
- `/admin/banc-test` : pincer/molette/double-clic sur la carte → le point GPS reste immobile (comme les boutons +/−).
  Ordre : adresse → GPS → étage+hauteur (1 ligne) → dernier+vision (1 ligne) → « Paramètres du test » replié
  (clic/clavier déploie le JSON) → cartes point+azimut. Sous-cartouches du profil de test : léger fond gris.
- Parcours public (étape localisation) : zoom au pincement/molette INCHANGÉ (ancré pointeur comme avant).

## Verdict de conformité : livraison prête. Zoom banc ancré centre (point immobile) via prop additive, public
## byte-identique (lint-neutre prouvé) ; réorg + repli accessible + trame token ; golden 22/22. À valider à l'œil.
