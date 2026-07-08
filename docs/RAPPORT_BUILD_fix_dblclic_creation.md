# RAPPORT — fix « Double-clic sur polygone libre n'ouvrait plus la création »

> Régression du chemin double-clic → carte de création, masquée par une composition ouverte. Correctif
> minimal dans `ouvrirCreationCiblee`. **CHANTIER UI PUR, GOLDEN-SAFE.** **Non committé.**

## Cause (recon validée)
Le rendu de la carte de création est gardé derrière **`composition === null`** (`CurationCarte.tsx:1119`/`:1181`,
introduit par le chantier « flux création »). `ouvrirCreationCiblee` posait `setCreationOuverte(true)` **sans**
remettre `composition` à `null`. Dès qu'une composition restait ouverte (tag créé sans « Terminer »/« Abandonner »),
le double-clic n'affichait jamais le formulaire (la zone de composition en cours masquait tout) → « ne fait rien ».

## Correctif (1 fichier : `CurationCarte.tsx`)
Dans `ouvrirCreationCiblee`, **APRÈS** la garde anti-doublon (`return` sur `dejaManuel`) et **AVANT**
`setCleabsCible`/`setCreationOuverte` : ajout de **`setComposition(null)` + `setSelectionId(null)`**. Un double-clic
sur un polygone libre démarre donc TOUJOURS une création fraîche (formulaire affiché), quel que soit l'état précédent
(composition ouverte, fiche sélectionnée). `setSelectionId(null)` dégage en plus les emprises bleues candidates qui
intercepteraient le dblclic quand une fiche est sélectionnée.

## A. DÉCISIONS HORS-SPECS
- **A1 — Ordre des `setState`** : `setComposition(null)`/`setSelectionId(null)` placés **après** le `return` de la garde
  `dejaManuel` → un double-clic sur un bâtiment déjà taggé (manuel actif) part toujours en `editionProposee` sans
  toucher composition/sélection. La garde est strictement préservée (spec exigée).

## B. DOUTES
- **B1 (mineur)** — `setSelectionId(null)` ferme aussi une éventuelle fiche/volet A ouvert lors d'un double-clic de
  création. C'est le comportement voulu (nouveau contexte de création), cohérent avec OQ-6 (un nouveau contexte ferme
  la composition/sélection). Sans impact données.
- **B2 (mineur)** — pas de test unitaire : handler React pur (2 setState). Non-régression via suite existante (**423**)
  + golden (**15/15**) + tsc/eslint/build. La garde `dejaManuel` et le rendu conditionnel sont inchangés hors ces 2 lignes.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Correctif 100 % UI (2 setState client).
  - **Backend/endpoints/migration INCHANGÉS** ; `geom_point` non touché ; moteur non concerné ; `git status` =
    **`CurationCarte.tsx` seul**.
  - **Garde anti-doublon `dejaManuel` INCHANGÉE** (le fix est après son `return`).
  - **Non-régression** : auto-rattachement `cleabsCible` (soumettreCreation), liste des cleabs + ✕ détacher,
    scroll-haut à l'ouverture (l'effet `[composition]` se redéclenche bien puisque `composition` repasse `null→id`
    à la création), historique volet A/B, footer des fiches existantes — non touchés.
  - **Isolation dure** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, `cartesAnnee.ts`, Gemini,
    `partage.ts`, routes — intouchés.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **423** · `next build` **✓**.

## Vérification manuelle
- Double-clic polygone libre pendant une composition ouverte → la composition se ferme, le formulaire de création
  s'affiche (cleabsCible renseigné). « Créer » → auto-rattachement du polygone. ✓
- Double-clic sur un bâtiment déjà taggé manuel → toujours `editionProposee` (pas de création). ✓
- État propre (composition null, rien sélectionné) → double-clic ouvre le formulaire comme avant. ✓

## Verdict de conformité : livraison prête. Correctif ciblé de 2 setState dans `ouvrirCreationCiblee` ; garde
## anti-doublon préservée ; golden bit-identique ; un seul fichier front, aucun backend/endpoint/migration.
