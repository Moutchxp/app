# RAPPORT — build « Tag manuel : étoile persistante + recentrage fiche »

> Corrige 2 bugs carte. **Front + endpoint lecture `tags-manuels`.** GOLDEN-SAFE (affichage/interaction ;
> aucun chemin de score). Le build **n'écrit rien**. **Non committé** (à grouper avec le build étoile précédent).

## Résumé
- **BUG 1 (étoile qui disparaît au dézoom)** → étoiles désormais tirées d'un **endpoint persistant**
  (`GET /tags-manuels`, centroïde du 1er polygone, **sans bbox ni LIMIT**), plus de `emprisesFond` (bbox +
  `LIMIT 500`). **Visibles à tout zoom.** Le vert de détail reste bbox.
- **BUG 2 (fiche manuelle ne recentre pas)** → recentrage **impératif** dans `selectionner` (comme le point) :
  fit immédiat au re-clic (emprises déjà chargées) sinon **fit armé** (`fitEnAttenteRef`) consommé à l'arrivée
  des emprises. La garde anti-re-fit `dernierFitRef` (qui bloquait le re-clic) est **remplacée**.
- Golden **15/15** (`29.107259068449615`).

## Fichiers (CE build : 2 ; + 2 cumulés du build étoile précédent non committé)
- `tags-manuels/route.ts` (**NEW**) : GET lecture, centroïde 4326 du 1er polygone par entité manuelle.
- `CurationCarte.tsx` : `TagManuel`/`tagsManuels`, `fetchTagsManuels`, `boundsEmprises`, `emprisesLieesRef`,
  `fitEnAttenteRef` (remplace `dernierFitRef`), recentrage impératif dans `selectionner`, effet Correction A
  révisé, overlay étoiles depuis `tagsManuels`.
- `curation.test.ts` : +2 tests (GET tags-manuels).
- *(cumulés du build précédent, non committés : `entites/route.ts` + `partage.ts` — `created` exposé.)*

## A. DÉCISIONS HORS-SPECS
- **A1 — Étoiles depuis un endpoint dédié `/tags-manuels`** (1 ligne/tag, sans bbox/LIMIT) — option la plus
  légère (recon §4). Alternative écartée : retirer le `LIMIT 500` du fond (au dézoom = milliers de polygones, coûteux).
- **A2 — Rafraîchissement des étoiles sur `[entites]`** : `entites` recharge après chaque écriture
  (`recharger`), donc les étoiles se rafraîchissent après création/suppression/rattachement/détachement. Simple, sans câblage supplémentaire.
- **A3 — `fitEnAttenteRef` = drapeau de DEMANDE (armé par `selectionner`, consommé par l'effet)**, en
  remplacement de `dernierFitRef` (drapeau de FAIT qui bloquait le re-clic). La composition (rattachements
  successifs) **ne réarme pas** le drapeau → aucun re-fit parasite (critère c). Le re-clic sur la fiche déjà
  sélectionnée (selectionId inchangé → l'effet ne re-tourne pas) est couvert par le **fit impératif dans `selectionner`**.
- **A4 — Vert de détail conservé bbox** (`emprisesFond`) : seule l'**étoile** devait être persistante pour la
  visibilité globale (spec). Le vert composé reste un détail de proximité.
- **A5 — 1er polygone = liaison `created` min qui A une emprise `bdtopo`** (JOIN LATERAL dans le SQL) : si le
  tout 1er cleabs n'avait pas d'emprise, on prend le suivant — évite une étoile fantôme.
- **A6 — Pas de test UI automatisé** (CurationCarte non montable en vitest). Endpoint `tags-manuels` **testé** (query mockée).

## B. DOUTES
- **B1 (mineur)** : le vert de détail (bbox) peut, lui, disparaître au dézoom (>500) — **voulu** (détail de
  proximité), l'étoile persiste et suffit à localiser le tag. Non bloquant.
- **B2 (mineur)** : entité manuelle dont le 1er polygone n'a **aucune** emprise `bdtopo` → pas d'étoile
  (JOIN inner). Cas très rare (rattachement = clic sur une emprise existante).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. `tags-manuels` (admin)
    n'est **pas lu par le moteur** → golden-safe.
  - **INSTRUMENTATION** : le build **n'écrit rien** (tests mockent `query` ; UI hors CI) → comptes DB
    inchangés → **divergences=0**. **Garde-fou Asnières** : golden inchangé.
  - **ISOLATION** : `faisceaux.ts`, `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `cartesAnnee.ts`,
    `PROFIL_GOLDEN_REF`, `liaisons/route.ts`, Gemini — **intouchés**. **Aucune migration** (`created` déjà présent, endpoint lecture).
  - **`ST_Force2D`** conservé (centroïde) ; géométrie 2154 → 4326 pour l'affichage seul.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **376** · curation **34/34** · `next build` **✓**.

## Tests (manuels — UI ; endpoint automatisé)
- (a) **Dézoom** → l'étoile reste visible à tout zoom (source persistante).
- (b) **1er clic** fiche manuelle → carte recentrée dès l'arrivée des emprises.
- (c) **Re-clic** après pan → recentre à nouveau (fit impératif).
- (d) **Composition** (rattacher) → pas de re-saut parasite (`fitEnAttenteRef` non réarmé).
- (e) Fiche **avec point** → recentre à chaque clic (`selectionner` inchangé). (f) golden 15/15.

## Verdict de conformité : livraison prête. Étoiles persistantes (endpoint dédié, tout zoom), recentrage
## fiche manuelle impératif (à chaque clic) sans re-saut de composition. GOLDEN-SAFE (build sans écriture,
## golden 15/15, isolation, aucune migration).
