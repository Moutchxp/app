# RAPPORT — build « Seam Lot 2/3 : transit des champs valeurAvantCapM/p1M/p2M jusqu'au front »

> Transit de type UNIQUEMENT, aucun rendu. Golden bit-identique. **Non committé.**
> Fichier de CE lot : `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.tsx` (miroir de type).

## Implémentation
### `EventailFaisceaux.tsx` — miroir `LigneVentil` (1 edit)
Ajout des 3 champs, à l'identique de `VentilationFaisceau` (Lot 1) — mêmes noms, mêmes types, même
caractère requis/nullable :
```ts
valeurAvantCapM: number;
p1M: number | null;
p2M: number | null;
```
Aucun JSX modifié, aucune ligne ajoutée au tableau de détail (`construireLignes`/`DetailFaisceau` inchangés).
Les champs sont désormais disponibles et typés côté composant, prêts pour le rendu du Lot 3.

### `app/lib/db/bancEssai.ts` — NON MODIFIÉ (vérifié)
Le forward de la ventilation se fait **EN BLOC** : `ventilation: rActif.ventilation` / `rTest.ventilation`
(`:76`/`:81`), typé `RunBanc.ventilation: VentilationAnalyse` (`:21`). `VentilationAnalyse` référence
directement le type moteur enrichi au Lot 1 (`import type { VentilationAnalyse } from "../svv/coucheDegagement"`,
`:16`). Les 3 nouveaux champs transitent donc **sans aucune intervention**. Conforme à la consigne : aucun
mapping champ par champ n'existe → **rien modifié**.

## A. DÉCISIONS HORS-SPECS
- **Aucune.** Le périmètre était entièrement spécifié (3 champs à mirrorer, forward à vérifier). Rien à trancher.

## B. DOUTES
- **Aucun bloquant.** Note technique : `LigneVentil.modeCombinaison` reste `string | null` (plus lâche que le
  `ModeCombinaison | ModeRepli | null` du moteur) — PRÉEXISTANT, hors périmètre, non touché. Les 3 nouveaux champs
  sont, eux, strictement identiques au moteur. tsc 0 confirme l'assignabilité `VentilationFaisceau → LigneVentil`
  sans cast.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` **bit-identique** (aucun fichier moteur/test touché
    par ce lot).
  - **tsc 0** — le miroir type sans cast (juge principal du lot). **eslint 0** sur le fichier.
  - **`bancEssai.ts` intact** (forward en bloc suffit — vérifié, prouvé par `git diff --name-only`).
  - **PÉRIMÈTRE RESPECTÉ** : `coucheDegagement.ts`, `distancePercueFaisceau`, `ventilerNote`, `pipeline.itest.ts`
    **NON touchés par ce lot** (ils restent en `M` du Lot 1 non committé, hors de ce chantier). Aucun refactor
    cosmétique, aucun renommage, aucune réorg d'import.
  - **PARCOURS PUBLIC INCHANGÉ** : `page.tsx` ne consomme ni `LigneVentil` ni `EventailFaisceaux` (0 occurrence).
  - **AUCUN RENDU** : aucun JSX modifié, aucune ligne au tableau de détail.
  - **Aucune écriture DB, aucune migration** ; **Gemini** hors périmètre (intact).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **442 passed** · `next build` ✓ · golden **23/23**.

## Recon de validation (Phase 8) → **VERDICT : VALIDER**
Transit de type pur : miroir aligné sur le moteur, forward en bloc confirmé sans modification, aucun rendu.
tsc 0 sans cast prouve le typage bout en bout. Golden intact. Aucun doute bloquant.

## Fichiers touchés (livraison)
- `app/(admin)/admin/(protected)/banc-test/EventailFaisceaux.tsx` — 3 champs ajoutés au miroir `LigneVentil`.
- `docs/RAPPORT_BUILD_seam_transit_front.md` — ce rapport.
- (`bancEssai.ts` : vérifié, NON modifié.)

> ⚠️ **Working tree** : `coucheDegagement.ts` + `pipeline.itest.ts` (Lot 1) et leur rapport
> `RAPPORT_BUILD_seam_valeur_avant_cap.md` sont **non committés** (Lot 1 en attente de commit par Arno). Ce lot
> n'ajoute que `EventailFaisceaux.tsx` + ce rapport. Deux commits distincts recommandés (Lot 1, puis Lot 2).

## Suite
- **Lot 3** — rendre « Distance pondérée (m) » dépliable, afficher les strates en langage humain et mettre en
  évidence `valeurAvantCapM` (question ouverte B1 du Lot 1 à trancher : afficher « avant plafond » aussi pour les
  faisceaux ordinaires ou seulement pour les pondérés).
