# RAPPORT — build « Refonte du flux de création d'un tag manuel »

> Zone de composition en haut de colonne (remplace le formulaire), sélection SANS scroll, rattachement en
> direct, « Terminer »/« Abandonner » cosmétiques. **CHANTIER UI PUR, GOLDEN-SAFE.** **Non committé.**

## Résumé
Après « Créer » (POST unique inchangé), la fiche-en-création s'affiche dans une **zone de composition** en
tête de colonne (hors liste triée), entité **sélectionnée** (pour rattacher par clic-emprise) mais **sans
`scrollIntoView`**. Les DEUX scrolls du parcours de création sont supprimés. « Terminer »/« Abandonner » =
fermeture cosmétique (aucune écriture, aucune suppression). Golden **15/15** (`29.107259068449615`). **Un
seul fichier front** modifié.

## Fichier (1 modifié : `CurationCarte.tsx`, +68/−15)
- State `composition: number | null` (id de l'entité en composition).
- `selectionner` : clic autre fiche pendant composition → `setComposition(null)` (OQ-6, fermeture implicite).
- `soumettreCreation` : après POST + `recharger`, **`setSelectionId(id)` DIRECT** (pas `selectionner` → pas de
  `flashId` → pas de scroll/surbrillance) + `setComposition(id)`. `selectionner` retiré des deps.
- Effet `[creationOuverte]` (scroll formulaire) **supprimé** (FC-60).
- `fermerComposition` : `setComposition(null)` + `setSelectionId(null)` + `clearLayers` (cosmétique, no-op DB, no scroll).
- `entitesFiltrees` : exclut `composition` (l'entité est dans la zone haute, hors liste) + dep ajoutée.
- JSX `.svv-cur-creation` : `composition !== null ? <zone compo> : (form/bouton)` — la zone montre puce + nom +
  badge famille + invitation + **compteur « n polygone(s) rattaché(s) »** + « Terminer »/« Abandonner ».
- CSS `.svv-cur-compo*` (tokens svv).

## A. DÉCISIONS HORS-SPECS
- **A1 — Exclusion de l'entité en composition de `entitesFiltrees`** (pas juste « <li> non déplié ») : évite
  la double-UI (zone haute + fiche+footer en bas) exigée par FC-74, et matérialise « hors liste triée » (FC-20).
  Après `Terminer`/`Abandonner`, `composition=null` → l'entité réapparaît à sa place (FC-41). Alternative écartée :
  rendre le `<li>` replié (laisserait un doublon visuel + un `itemActifRef`).
- **A2 — Sélection SANS `selectionner`** : `soumettreCreation` pose `setSelectionId(id)` **directement** (au lieu
  de `selectionner(id)`) pour n'émettre NI `flashId` (scroll+surbrillance, FC-14/FC-15/OQ-4) NI recentrage carte.
  Les emprises candidates se chargent via l'effet `[selectionId]` existant → rattachement opérationnel.
- **A3 — `creationBorneRef` n'est plus écrit** : l'ancien chemin « créée en session » du footer (Lot 2) devient
  **inerte** (`creee` toujours faux dans `selectionner`) car la création passe désormais par la zone de composition,
  pas par le footer. Code laissé en place (lu mais toujours null) pour ne PAS toucher la logique du footer des
  fiches existantes ; sans effet de bord (l'entité post-composition est traitée comme une fiche normale).
- **A4 — « Terminer » et « Abandonner » = même action** (`fermerComposition`) : OQ-1 impose qu'« Abandonner » ne
  supprime pas ; les deux boutons ferment donc sans écrire. Distinction purement lexicale (Terminer = fini /
  Abandonner = j'oublie), sémantiquement guidante. Aucune suppression autonome (Règle dure respectée).
- **A5 — Compteur pluralisé** « n polygone(s) rattaché(s) » calculé depuis `entiteSelectionnee.liaisons` (actives
  non détachées), rafraîchi via `recharger` après chaque rattachement (FC-26). `formulaireRef` conservé (encore
  lié en JSX) bien que son effet de scroll ait été retiré — sans impact.

## B. DOUTES
- **B1 (mineur)** — pas de nouveau test unitaire : le chantier est du **pur JSX/état React**, sans logique pure
  extractible et sans infra RTL dans le repo. Non-régression assurée par la suite existante (**423** verts) + golden
  (**15/15**) + `tsc`/`eslint`/`build`. Les comportements (scroll, zone, compteur) sont vérifiables manuellement
  (cf. CA de la SPEC).
- **B2 (mineur)** — après un rattachement, l'entité en composition acquiert une **étoile** (tagsManuels) sur la
  carte ; un double-clic sur cette étoile appelle `selectionner(id)` avec `id===composition` → la composition est
  conservée (`c===id`), aucun scroll (entité hors liste). Comportement cohérent, tracé.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Chantier UI, hors chemin de score.
  - **Backend/endpoints INCHANGÉS** : `POST /entites` et `POST/DELETE /entites/[id]/liaisons` réutilisés tels quels ;
    aucune route, `partage.ts`, migration, ou écriture DB nouvelle. `git status` = **`CurationCarte.tsx` seul**.
  - **Règle de puce inchangée** (FC-50/51) : même expression `etat==='rouge' && !point` ; aucune variante ajoutée.
  - **Non-régression features** : historique volet A/B, footer Valider/Annuler/Sortir des fiches existantes,
    rattachement/détachement classique, **scroll de sélection normale** (`[flashId]` intact hors création) — non touchés.
  - **Isolation dure** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, `cartesAnnee.ts`, Gemini — intouchés.
  - `prefers-reduced-motion` : aucune nouvelle transition introduite par la zone de composition.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **423** · `next build` **✓**.

## Vérification manuelle recommandée (CA de la SPEC)
CA-1 (ouverture form sans scroll), CA-3 (zone haute après Créer, sans scroll), CA-4 (clic emprise → puce rouge→vert +
compteur), CA-6/7 (Terminer/Abandonner ferment sans écrire ni scroll), CA-8 (tag sans liaison reste rouge « à placer »),
CA-9 (sélection normale scrolle toujours), CA-10 (features non cassées).

## Verdict de conformité : livraison prête. Zone de composition en haut (hors liste), sélection sans scroll, les
## DEUX scrolls de création supprimés, rattachement en direct, fermeture cosmétique sans suppression. Golden
## bit-identique, un seul fichier front, aucun endpoint/backend/migration touché.
