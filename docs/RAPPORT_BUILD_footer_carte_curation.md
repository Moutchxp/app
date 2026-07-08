# RAPPORT — build « Footer de carte de curation (Sortir / Valider / Annuler) »

> Boutons de sortie en bas de chaque carte dépliée de `/admin/curation`, avec « Annuler = rollback
> vers l'état d'ouverture » (appelle l'endpoint existant `annuler-edition`). **GOLDEN-SAFE** (UI + lecture
> de journal ; hors chemin de score). **Non committé.**

## Résumé
À l'ouverture d'une carte, l'UI capture `borneOuverture = max(id)` du journal de l'entité (nouveau GET
`/entites/[id]/borne`). Un pied de carte affiche **« Sortir »** si rien n'a changé, sinon **« Valider »**
(confirmation, aucune écriture) + **« Annuler »** (rollback direct via `annuler-edition`, puis repli).
Repli **sans scroll**. Golden **15/15** (`29.107259068449615`). Endpoint `annuler-edition` **non modifié**.

## Fichiers (2 modifiés, 3 nouveaux)
- `entites/[id]/borne/route.ts` (**NEW**) : GET `max(id)` du journal de l'entité (0 si aucune ligne).
- `curationEdition.ts` (**NEW**) : helpers PURS `estCarteModifiee` + `modeFooter` (testables).
- `curationEdition.test.ts` (**NEW**) : 7 tests des helpers.
- `CurationCarte.tsx` : état (`borneOuverture`, `carteModifiee`, `creeeEnSession`, `confirmValider`) + capture de borne + drapeau « modifiée » dans les 6 handlers + `refermerCarte`/`annulerEdition` + footer + CSS.
- `curation.test.ts` : +3 tests du GET `/borne`.

## A. DÉCISIONS HORS-SPECS
- **A1 — Source de la borne = mini GET `/entites/[id]/borne`** (choisi « le moins invasif ») plutôt que
  d'ajouter `max(id)` à la liste `entites` (join/subquery sur CHAQUE chargement de liste). Le mini GET est
  à la demande, une fois à l'ouverture d'une carte, indexé (`curation_patrimoine_log_entite_idx`). Lecture seule.
- **A2 — `isDirty` suivi par un drapeau client `carteModifiee`** posé au succès des 6 handlers de mutation
  (+ `creeeEnSession`), plutôt que par un re-`fetch` de `max(id)` après chaque geste. **Équivalent** à
  « max(id) > borneOuverture » (chaque mutation ajoute ≥1 ligne au journal), sans round-trip additionnel.
  Tracé et testé via les helpers purs `estCarteModifiee`/`modeFooter`. La `borneOuverture` (fetchée à
  l'ouverture) reste la valeur envoyée au POST `annuler-edition`.
- **A3 — Carte fraîchement créée → `borneOuverture = 0` + `creeeEnSession=true`** : posés par `selectionner`
  (via `creationBorneRef`) ; l'effet d'ouverture NE fetch PAS (skip) pour ne pas écraser le 0. Ainsi
  « Annuler » sur une entité créée dans la session rejoue TOUT son journal (création incluse) → l'endpoint
  supprime l'entité (retour à « n'existait pas »). Conforme au comportement `creation_entite_manuelle` du rollback.
- **A4 — Resets d'état dans `selectionner` (handler), pas dans l'effet** : le lint `react-hooks/set-state-in-effect`
  interdit le set-state synchrone en effet. Les drapeaux (`carteModifiee`, `confirmValider`, `creee`, borne=0
  si création) sont reset dans `selectionner` (seul point d'ouverture d'une carte) ; l'effet ne fait que le
  fetch async de la borne. Alternative écartée : reset synchrone en effet (viole le lint).
- **A5 — « Valider » = fermeture pure, AUCUNE écriture** (tout est déjà persisté par le modèle immédiat) ;
  sa confirmation « Enregistrer les modifications ? » n'a qu'une valeur d'UX (rassurer l'opérateur). Tracé.
- **A6 — Repli sans scroll** : `refermerCarte` fait `setSelectionId(null)` (l'effet de scroll ignore `null`,
  ligne 749 pré-existante) sans passer par `selectionner` → aucun `flyTo`/`fitBounds`/`scrollIntoView`. L'ordre
  de la liste ne change pas (tri inchangé).
- **A7 — « Supprimer ce tag » NON touché** : le bouton + sa confirmation existaient déjà (fiche manuelle,
  `confirmSuppression`) ; laissé tel quel, indépendant du footer (il ferme la carte via `setSelectionId(null)`).
- **A8 — Comportement identique natif/manuel** : le footer dépend UNIQUEMENT de `estCarteModifiee`, jamais de `origine`.

## B. DOUTES
- **B1 (mineur)** : le drapeau `carteModifiee` se remet à `false` si l'opérateur ouvre une AUTRE carte sans
  passer par Sortir/Valider/Annuler (les gestes restent persistés — modèle immédiat). Cohérent avec l'existant,
  mais l'opérateur ne « valide » pas explicitement en changeant de carte. Sans impact données.
- **B2 (mineur)** : le footer (React) n'est pas testé au niveau DOM (pas d'infra RTL dans le repo) ; la logique
  décisionnelle est couverte par les helpers PURS (`curationEdition.test.ts`), la route borne par `curation.test.ts`.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Le footer/borne/rollback
    ne touchent NI le moteur NI le score ; `curation_patrimoine_log` reste hors chemin de score.
  - **ISOLATION** : modifiés = `CurationCarte.tsx` (UI) + `curation.test.ts` ; nouveaux = `curationEdition.ts`/
    `.test.ts` + GET `/borne`. Non touchés : endpoint `annuler-edition`, `client.ts`, moteur (`faisceaux`,
    `verdict`, `coucheDegagement`, `scoreDegagement`, `pipeline`, `obstacles`, `analyse`, `cartesAnnee`),
    `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini. **Aucune migration, aucun write DB** par le build.
  - **`prefers-reduced-motion`** : respecté (le repli ne déclenche aucune animation ; les scrolls existants
    gardent leur garde `matchMedia`).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **396** · curation+édition **54** · `next build` **✓**.

## Tests
- `estCarteModifiee` (4 cas : ni/mutée/créée/les deux) + `modeFooter` (sortir vs valider-annuler + composé).
- GET `/borne` : max(id) → nombre ; 0 si vide ; id invalide → 422.
- golden `score.total` **15/15** inchangé.

## Verdict de conformité : livraison prête. Footer Sortir/Valider/Annuler pilotant le rollback existant,
## borne capturée à l'ouverture, repli sans scroll, natif=manuel, bouton Supprimer préservé, golden
## bit-identique, isolation totale. Dernier lot de la feature « tag manuel / curation ».
