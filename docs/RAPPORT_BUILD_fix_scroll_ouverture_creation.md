# RAPPORT — fix « Scroll haut manquant à l'ouverture du formulaire de création »

> Le scroll vers le haut ne se déclenchait qu'après « Créer » (state `composition`), pas à l'ouverture du
> FORMULAIRE (state `creationOuverte`). Déclencheur unifié. **CHANTIER UI PUR, GOLDEN-SAFE.** **Non committé.**

## Cause (recon validée)
L'effet de scroll (`CurationCarte.tsx:980-987`) était keyé sur **`[composition]`** avec garde
`if (composition === null) return`. Or le **formulaire** de création est piloté par **`creationOuverte`**
(`:288`), pas par `composition` (`:292`). Au double-clic / « + Nouveau tag », `creationOuverte` passe `true`
mais `composition` reste `null` → **aucun scroll** ; il ne se déclenchait qu'à « Créer » (`composition` null→id).
Le formulaire ET la zone de composition sont tous deux enveloppés par `formulaireRef` (`:1123`).

## Correctif (1 fichier : `CurationCarte.tsx`)
Introduction d'un booléen dérivé **`const zoneHauteOuverte = creationOuverte || composition !== null;`** ;
l'effet de scroll est keyé sur **`[zoneHauteOuverte]`** (garde `if (!zoneHauteOuverte) return`). Le scroll vers
`formulaireRef` (`block:'start'`) se déclenche donc dès que la zone haute s'ouvre (formulaire OU composition).
Comme `zoneHauteOuverte` **reste `true`** pendant la transition formulaire→composition (`creationOuverte` true puis
`composition` non-null), l'effet ne se re-déclenche PAS entre les deux → **pas de double scroll**.

## A. DÉCISIONS HORS-SPECS
- Aucune. Le correctif suit exactement la piste de la spec (booléen dérivé `zoneHauteOuverte`, keyage de l'effet).

## B. DOUTES
- **B1 (mineur)** — pas de test unitaire : effet React de scroll (jsdom ne rend pas la mise en page). Non-régression
  via suite existante (**423**) + golden (**15/15**) + tsc/eslint/build. Comportement vérifiable manuellement.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Correctif 100 % UI (keyage d'un effet de scroll).
  - **Déclenchement** : uniquement à l'**ouverture** de la zone haute (transition `false→true` de `zoneHauteOuverte`) ;
    **PAS** de re-scroll aux clics-emprise (liaisons/compteur hors deps) ; **PAS** de double scroll (booléen stable
    pendant formulaire→composition).
  - **Cible HAUT uniquement** : `formulaireRef` (`block:'start'`) ; **jamais** `itemActifRef`/`flashId` → ne ressuscite
    pas le scroll descendant supprimé, ne perturbe pas le scroll de sélection normale d'une fiche existante.
  - **Non-régression** : double-clic qui rouvre la création (fix précédent), auto-rattachement, liste des cleabs + ✕,
    historique volet A/B, footer des fiches existantes, règle de puce — non touchés.
  - **Isolation dure** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, `cartesAnnee.ts`, Gemini,
    `partage.ts`, routes — intouchés ; `git status` = **`CurationCarte.tsx` seul**.
  - `prefers-reduced-motion` respecté (`behavior` auto si réduit). Aucune migration, aucune écriture DB, aucun endpoint.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **423** · `next build` **✓**.

## Vérification manuelle
- Colonne scrollée en bas → double-clic polygone libre → la colonne remonte sur le formulaire. ✓
- « + Nouveau tag » (colonne en bas) → remonte sur le formulaire. ✓
- « Créer » (formulaire→composition) → reste en haut, **pas** de second saut. ✓
- Clic-emprise pendant la composition → **pas** de re-scroll. ✓

## Verdict de conformité : livraison prête. Déclencheur de scroll unifié sur `zoneHauteOuverte` ; ouverture du
## formulaire OU de la composition ramène en haut, sans double scroll ni régression ; golden bit-identique.
