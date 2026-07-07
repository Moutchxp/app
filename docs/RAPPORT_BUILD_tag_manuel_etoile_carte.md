# RAPPORT — build « Tag manuel : étoile carte + double-clics + recentrage »

> 4 évolutions carte de la curation manuelle. **Front + endpoint /entites (lecture).** GOLDEN-SAFE
> (affichage + interactions ; aucun chemin de score). Le build **n'écrit rien**. **Non committé.**

## Recon interne — ordre des liaisons
`patrimoine_entite_batiment.created timestamptz NOT NULL DEFAULT now()` **existe** (`\d`). Chaque
rattachement = un POST distinct → `now()` distinct → **`ORDER BY created, cleabs` est un ordre stable**.
Choix retenu : le **1er polygone** d'une entité = la liaison active la plus **ancienne** (`created` min).

## Résumé
- **(1)** Par entité `origine='manuel'` avec ≥1 liaison active (dans la bbox) : **UNE étoile jaune ★** au
  centre du **1er polygone** (created) + **VERT** sur ses polygones (couche persistante `coucheEtoilesRef`).
- **(2)** Double-clic **étoile** → `selectionner(entiteId)` (ouvre la fiche + scroll liste) ; `stopPropagation` → n'ouvre pas la création du fond.
- **(3)** Ouverture du formulaire « Nouveau tag » → **scroll auto** vers lui (`formulaireRef`, reduced-motion respecté).
- **(4)** Recentrage au clic liste : **déjà assuré** (vérifié) — aucun changement.
- Golden **15/15** (`29.107259068449615`).

## Fichiers (3 modifiés)
- `entites/route.ts` : liaisons `+ 'created'` et `ORDER BY peb.created, peb.cleabs` (lecture).
- `partage.ts` : `LiaisonDB.created` + mapping `versEntite`.
- `CurationCarte.tsx` : `Liaison.created`, `iconeEtoile()`, `coucheEtoilesRef` (entre fond et emprises),
  effet overlay tags manuels, `formulaireRef` + effet scroll-formulaire, CSS `.svv-cur-star-pin`.

## A. DÉCISIONS HORS-SPECS
- **A1 — Le 1er polygone est AUSSI peint en vert (pas seulement l'étoile)** : tous les polygones d'un tag
  manuel sont verts (monument composé) + **une** étoile sur le 1er. Alternative écartée : 1er polygone sans
  vert (étoile flottante sur un polygone incolore = incohérent visuellement).
- **A2 — Vert de l'overlay SAUTÉ pour l'entité SÉLECTIONNÉE** : son vert est déjà dessiné, **interactif**
  (détacher), par `coucheEmprisesRef`. L'overlay ne dessine alors que **l'étoile** (évite un double-tracé du
  vert). Les entités manuelles **non sélectionnées** : vert + étoile via l'overlay.
- **A3 — Couverture BBOX** (via `emprisesFond`, déjà chargé au `moveend`) : les étoiles/verts n'apparaissent
  que pour les polygones **dans la vue** (conforme spec, pas de nouvel endpoint global). Un polygone hors vue
  → pas dessiné (apparaît au pan).
- **A4 — Ordre exposé + trié côté front** : `created` ajouté au GET liaisons ; le front **re-trie**
  `actives` par `created` (puis `cleabs`) — robuste même si l'ordre d'agrégat changeait.
- **A5 — Z-order** : `coucheEtoilesRef` insérée **entre** `coucheFondRef` et `coucheEmprisesRef` ; les
  étoiles sont des `L.marker` (**markerPane**, toujours au-dessus) → le double-clic étoile est capté avant le
  fond. `stopPropagation` en garde-fou.
- **A6 — Point 4 (recentrage) : AUCUN changement** — `selectionner` recentre déjà les entités **avec point**
  (`:336`) et la **Correction A** ajuste (fitBounds) les entités **sans point** ; les deux chemins (clic liste
  ET double-clic étoile) passent par `selectionner`. Vérifié, rien à compléter.
- **A7 — Pas de test UI automatisé** (idem précédents : `CurationCarte.tsx` non montable en vitest/node). Le
  changement backend (ORDER BY created + champ) est couvert par `tsc` + le GET testé (query mockée).

## B. DOUTES
- **B1 (mineur)** : un cleabs partagé par **plusieurs** entités manuelles (rare) → il peut porter plusieurs
  verts superposés + une étoile par entité dont il est le 1er. Cohérent (chaque entité a son étoile) ; pas
  de dédoublonnage géométrique (visuellement identique). Non bloquant.
- **B2 (mineur)** : `created` égaux (2 rattachements dans la même milliseconde, très improbable via des POST
  séparés) → tiebreak `cleabs`. Déterministe.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Le GET `/entites`
    (admin) **n'est pas lu par le moteur** (qui passe par `faisceaux.ts enrichirFamilles`) → changement d'ordre golden-safe.
  - **INSTRUMENTATION** : le build **n'écrit rien** (tests mockent `query`, UI hors CI) — comptes DB
    inchangés par le build → **divergences=0**. **Garde-fou Asnières** : golden inchangé → aucun cleabs natif d'Asnières affecté.
  - **ISOLATION** : `faisceaux.ts`, `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `cartesAnnee.ts`,
    `PROFIL_GOLDEN_REF`, `liaisons/route.ts`, Gemini — **intouchés**. **Aucune migration** (`created` déjà existant).
  - **Réutilisation** : `selectionner`/effet scroll/Correction A/`emprisesFond`/style vert `emprisesLiees`/
    `iconePour` pattern — inchangés.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **374** · `next build` **✓**.

## Tests (manuels — UI non automatisable)
- (a) rattacher des polygones à un tag manuel → **1 étoile** sur le 1er + **vert** sur les autres.
- (b) double-clic **étoile** → sélectionne la fiche + scroll liste ; **pas** de formulaire création.
- (c) double-clic **polygone neutre** → formulaire ouvert à gauche + **scroll** vers lui.
- (d) clic **fiche liste** → carte recentrée (point ou emprises).
- (e) `doubleClickZoom` off inchangé. (f) golden 15/15.

## Verdict de conformité : livraison prête. Étoile unique par tag manuel (1er polygone, ordre created) +
## vert persistant, double-clics (étoile→fiche, neutre→formulaire+scroll), recentrage vérifié. GOLDEN-SAFE
## (build sans écriture, golden 15/15, isolation, aucune migration).
