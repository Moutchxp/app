# RAPPORT — build « Auto-rattachement du polygone au double-clic (création de tag) »

> Créer un tag par double-clic rattache désormais le polygone double-cliqué (via la route `/liaisons`
> existante), d'où puce verte + compteur=1 + étoile en temps réel. **CHANTIER UI PUR, GOLDEN-SAFE.**
> **Non committé.**

## Résumé
`soumettreCreation` capture `cleabsCible` avant reset et, après le `POST /entites`, enchaîne un
**`POST /entites/{id}/liaisons { cleabs }`** (route existante, source manuel) quand une cible existe,
puis `recharger()`. Tout le reste (vert, compteur, étoile, puce verte) **dérive automatiquement** du
rattachement via les refetch déjà en place. `geom_point` reste NULL. Golden **15/15**
(`29.107259068449615`). **Un seul fichier front** ; **aucun endpoint/backend/migration**.

## Fichier (1 modifié : `CurationCarte.tsx`)
- `soumettreCreation` : capture `const cible = cleabsCible` ; après création, si `cible !== null` →
  `ecrire('/entites/{id}/liaisons', 'POST', { cleabs: cible })` (rattacheOk) ; `recharger()` ; messages
  adaptés (rattaché / échec rattachement / sans cible). Dep `cleabsCible` ajoutée.
- Invitation de la zone de composition : **adaptative** selon le compteur `nb` (≥1 → « Tag créé et
  rattaché… ajoute d'autres polygones ou Terminer » ; 0 → « Sélectionne un ou plusieurs polygones… »).

## Tâches 2 & 3 — VÉRIFICATIONS (aucun code ajouté, dérivé de l'existant)
- **Polygone vert** : après le rattachement auto + `recharger()`, l'effet `[selectionId, entites]`
  refetch `emprisesLiees` → l'emprise `cleabsCible` entre dans les LIÉES → dessinée **VERTE** (`#2e9e5b`,
  calque `coucheEmprisesRef` existant, `:976-981`). Aucun style ad hoc. Le polygone est vert dès
  l'ouverture de la zone (pas bleu).
- **Compteur = 1** : `nb = entiteSelectionnee.liaisons.filter(actif && !detache).length` (`:1095`) → 1
  après l'auto-rattachement, sans code supplémentaire.
- **Étoile immédiate** : l'effet `[entites]` (`:367-376`) refetch `tagsManuels` après `recharger()` →
  l'étoile (centroïde du polygone lié, `tags-manuels`) apparaît **dès l'auto-rattachement**, avant
  « Terminer ». Aucun refetch dédié au Terminer.
- **Puce verte** : `etatEntite` (règle INCHANGÉE) → `vert` dès ≥1 liaison manuelle → puce verte pleine
  (plus le cas `rouge && !point`).

## A. DÉCISIONS HORS-SPECS
- **A1 — Deux appels distincts (client), pas de modif backend** : `POST /entites` puis `POST /liaisons`
  (option b de la recon), au lieu d'enrichir la route `/entites` pour créer la liaison dans sa CTE
  (option a). Raison : « aucun endpoint modifié », réutilisation stricte de l'existant. Impact : non
  atomique (voir B1).
- **A2 — `cleabsCible` capturé AVANT le reset** (`const cible = cleabsCible`) : nécessaire car
  `setCleabsCible(null)` intervient plus loin ; la valeur au moment du submit est figée. Alternative
  écartée : réordonner les resets (plus fragile).
- **A3 — Messages `signaler` adaptés à 3 cas** (rattaché OK / échec rattachement / sans cible) : la spec
  imposait un message sobre en cas d'échec ; j'ai décliné les 3 situations pour la clarté. Le message
  d'échec invite à cliquer l'emprise bleue (repli manuel), l'entité persiste.
- **A4 — Invitation pilotée par `nb`** (≥1 vs 0) plutôt que par « la cible était renseignée » : robuste
  au cas où le rattachement auto a échoué (nb resterait 0 → invitation « sélectionne un polygone »),
  cohérent avec l'état réel affiché.

## B. DOUTES
- **B1 (mineur, tracé A1)** — **non-atomicité** : création (POST /entites) et rattachement (POST
  /liaisons) sont 2 requêtes. Si la 2e échoue, l'entité existe avec 0 liaison (puce rouge « à placer »),
  l'opérateur rattache manuellement (message dédié). Pas de suppression autonome (Règle dure). Acceptable
  et explicitement demandé par la spec (robustesse).
- **B2 (mineur)** — pas de nouveau test unitaire : pur flux React/fetch, sans logique pure extractible ni
  infra RTL. Non-régression via suite existante (**423**) + golden (**15/15**) + tsc/eslint/build. Les
  effets dérivés (vert/étoile/compteur) sont ceux, déjà couverts, du rattachement classique.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. `geom_point` reste
    NULL ; le moteur ne le lit jamais pour un tag manuel (score par `cleabs`). Chantier hors chemin de score.
  - **Backend/endpoints/migration INCHANGÉS** : `POST /entites` et `POST /entites/[id]/liaisons`
    réutilisés tels quels ; `git status` = **`CurationCarte.tsx` seul**.
  - **Règle de puce INCHANGÉE** (aucune modif de l'expression `etat==='rouge' && !point`).
  - **Non-régression** : historique volet A/B, footer Valider/Annuler/Sortir, rattachement/détachement
    classique, zone de composition + absence de scroll (chantier précédent), anti-doublon
    `ouvrirCreationCiblee` — non touchés.
  - **Isolation dure** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, `cartesAnnee.ts`,
    Gemini, `partage.ts`, routes — intouchés.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **423** · `next build` **✓**.

## ⚠️ Note de livraison
Le working tree **cumule ce chantier ET le précédent** (« flux de création de tag », `RAPPORT_BUILD_flux_
creation_tag.md`) **non encore committé** (dernier commit = `a8390b2` historique volet B). À committer
séparément (un chantier = un commit) : d'abord le flux de création, puis cet auto-rattachement.

## Verdict de conformité : livraison prête. Le polygone du double-clic est rattaché (route existante),
## d'où vert + compteur=1 + puce verte + étoile en temps réel, sans toucher `geom_point` ni le backend.
## Golden bit-identique, un seul fichier front.
