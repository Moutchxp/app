# RAPPORT — build « Tag manuel : corrections A+B (carte de curation) »

> Corrections A (détach visible) + B (dbl-clic création ciblée). **Front (CurationCarte.tsx)**,
> GOLDEN-ADJACENT. Le build **n'écrit rien en base** → golden inchangé. **Non committé.** À grouper avec 2/6.

## Résumé
- **A** : une entité **sans point** sélectionnée → la carte **s'ajuste (`fitBounds`) sur ses emprises
  rattachées** → les polygones **verts** entrent dans la vue et redeviennent **détachables**. Aide contextuelle complétée.
- **B** : **couche de fond** des bâtiments de la bbox (transparente au repos, **contour au survol**),
  **double-clic** → ouvre « Nouveau tag » **pré-armé sur ce cleabs** (mémorisé, PAS de rattachement auto).
- Golden **15/15** (`29.107259068449615`). 1 seul fichier. Aucune route, aucune migration.

## Fichiers (1 modifié)
- `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` : état `emprisesFond`/`cleabsCible`, refs
  `coucheFondRef`/`dernierFitRef`, `chargerEmprisesFond`, `ouvrirCreationCiblee`, effet **fit A**, effet
  **couche de fond B**, aide contextuelle, en-tête « bâtiment ciblé », resets, CSS.

## A. DÉCISIONS HORS-SPECS
- **A1 — `fitBounds` une seule fois par entité sans-point** (`dernierFitRef`) : évite un re-cadrage
  jarrant à **chaque** rattachement (l'effet dépend de `emprisesLiees` qui grossit à chaque liaison). Le
  cadrage se fait à l'arrivée des emprises pour une nouvelle sélection point-less ; pas de re-fit ensuite.
  Alternative écartée : fit à chaque changement d'`emprisesLiees` (sauts de carte pendant la composition).
- **A2 — Couche de fond SOUS les couches bleu/vert** (`coucheFondRef` ajoutée avant `coucheEmprisesRef`) :
  quand une entité est sélectionnée, les emprises bleu/vert (au-dessus) **interceptent** le clic → le
  simple-clic rattacher/détacher existant est **intact** ; le dbl-clic-créer du fond n'agit que là où
  aucune candidate ne le couvre (typiquement **hors sélection**). `doubleClickZoom` déjà off (2/6) → le dbl-clic ne zoome pas.
- **A3 — Fond transparent `fillOpacity:0` + `fill:true` interactif** ; survol → contour `#a30402` léger
  (`fillOpacity:0.06`), `mouseout` → retour transparent. Le fill invisible capte le pointeur (SVG
  `fill != none`). Aucun rendu permanent (respecte « visible uniquement au survol »).
- **A4 — `cleabsCible` mémorisé + affiché, PAS de rattachement auto** (conforme spec) : après
  `creerEntite → recharger → selectionner`, l'entité neuve n'a aucune liaison ; l'opérateur clique
  l'emprise **bleue** pour rattacher (flux 2/6 existant). Le cleabs ciblé sert d'indication (en-tête vert
  du formulaire) et la vue reste sur le bâtiment double-cliqué.
- **A5 — Pas de test UI automatisé** (idem 2/6 : `CurationCarte.tsx` non montable dans le harness
  vitest/node). Vérif = `tsc`/`eslint`/`next build`/golden + instrumentation DB.

## B. DOUTES
- **B1 (mineur)** : la détection de survol repose sur un fill `fillOpacity:0` interactif — robuste en SVG
  standard. Si un moteur de rendu exotique n'émettait pas `mouseover` sur un fill à opacité nulle, passer
  à `0.01` (« quasi », autorisé par la spec). Non bloquant.
- **B2 (rappel 2/6 non résolu)** : `nom` reste **requis** par la route 1/6 (hors périmètre ici) — sans effet sur A/B.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique.
  - **INSTRUMENTATION (golden-adjacent)** : le build **ne crée aucune entité/liaison** (tests mockent
    `query` ; UI hors CI). Mesuré : `entités meta.origine='manuel' = 1` — c'est l'entité **993
    (« Hotel de ville Asnières »)** créée **manuellement par Arno** lors d'un test antérieur, **PAS** par ce
    build. Le golden restant à `29.107259068449615` **prouve que ses cleabs ne sont PAS des faisceaux
    d'Asnières** (sinon le boost mh l'aurait déplacé) → **garde-fou Asnières respecté**, divergences=0
    (aucune mutation DB par le build).
  - **ISOLATION** : `git diff --name-only` = **`CurationCarte.tsx` seul**. Non touchés : `faisceaux.ts`,
    `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `cartesAnnee.ts`, `PROFIL_GOLDEN_REF`,
    `liaisons/route.ts`, `entites/route.ts`, Gemini. **Aucune migration.**
  - **Réutilisation stricte** : `rattacher`, `detacher`, `creerEntite`, `recharger`, `selectionner`,
    routes liaison/entités/emprises — **inchangés**.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **367** · `next build` **✓**.

## Tests (manuels — UI non automatisable)
- (a) Sélectionner une **entité manuelle sans point** → carte **s'ajuste sur ses bâtiments** → polygones **verts** visibles → **détach** possible (map + panneau).
- (b) **Double-clic** sur un bâtiment **hors sélection** → « Nouveau tag » s'ouvre, **bâtiment ciblé** affiché.
- (c) **Survol** d'un bâtiment → **contour léger** ; rien de permanent au repos.
- (d) Simple-clic **bleu→rattacher / vert→détacher** existant **intact** (les candidates interceptent).
- (e) Double-clic **ne zoome pas** (`doubleClickZoom:false`).

## Verdict de conformité : livraison prête. A rend le détach atteignable pour les entités sans point ; B
## ajoute le dbl-clic-créer ciblé sans casser l'existant. GOLDEN-SAFE (build sans écriture, golden 15/15,
## Asnières inchangé, isolation 1 fichier). À committer groupé avec la sous-étape 2/6.
