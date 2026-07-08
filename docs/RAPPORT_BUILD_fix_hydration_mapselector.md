# RAPPORT — fix « Erreur d'hydratation React sur /admin/banc-test »

> Cause racine dans `MapSelector.tsx` (anti-pattern `typeof window` + `require`). Correctif localisé (MapSelector
> seul, MapContent INTOUCHÉ). Front-only, golden bit-identique. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE)
1. **Cause = `MapSelector.tsx:18-21`** (PAS MapContent, dont le `return:191` rend le div inconditionnellement) :
   ```js
   let MapContent: any = () => null;
   if (typeof window !== "undefined") { MapContent = require("./MapContent").default; }
   ```
   - Serveur (`typeof window === "undefined"`) → `MapContent = () => null` → `<MapSelector>` rend **`null`** → le
     `<div className="relative mt-4 h-80 …">` **absent** du HTML serveur.
   - Client 1er rendu (hydratation) → `require(...).default` (vrai composant) → **rend le div**.
   - Serveur (∅) ≠ client (div) → **Hydration failed**. Anti-pattern `typeof window` + `require` module-scope.
2. **Div côté client seulement** : le composant réel n'est chargé qu'au client (`typeof window` vrai) ; au serveur, le
   stub `() => null` ne rend rien. C'est la condition `typeof window` qui produit deux sorties différentes.
3. **Parcours public NON affecté** : `page.tsx` rend `<MapSelector>` **uniquement à l'étape `"localisation"`** (état
   client `Etape`, défaut `"accueil"`, `page.tsx:28`). Au SSR de `/`, MapSelector n'est pas dans l'arbre → aucune
   hydratation à réconcilier ; il monte côté client après navigation (post-mount). Sur `/admin/banc-test`, `BancSaisie`
   rend `<MapSelector>` **dès le 1er rendu** → dans l'arbre SSR → mismatch. **Bug latent pré-existant, exposé par le banc.**
4. **Pré-existant (git blame)** : le pattern `typeof window`/`require` date de **`7c87f8c` (2026-06-17, « Mise à jour
   projet »)**, bien avant les chantiers banc. Les chantiers banc n'ont touché MapSelector que pour AJOUTER la prop
   `onMove?` (`d81445d`) → n'ont PAS introduit le mismatch. `onMove`/`pointSnappe` hors de cause.

## Correctif (1 fichier : `MapSelector.tsx`, MapContent INTOUCHÉ)
Remplacement du `require` sous `typeof window` par **`next/dynamic({ ssr: false })`** (`dynamic` était déjà importé) :
```js
const MapContent = dynamic(() => import("./MapContent"), { ssr: false });
```
`ssr: false` rend la MÊME chose (rien) au SSR **et** au 1er rendu client → serveur et hydratation concordent (∅=∅) →
plus de mismatch. Le composant se charge après le mount (client-only, post-hydratation) — permis. Correctif RACINE
(pas de masquage `suppressHydrationWarning`), localisé (3 lignes), sans restructurer MapContent.

## A. DÉCISIONS HORS-SPECS
- **A1 — `dynamic(ssr:false)` plutôt qu'un « gate monté » (`useState(false)` + effet).** Les deux corrigent le mismatch
  (rendre `null` au 1er rendu client). Choix `dynamic` : idiomatique Next 16, réutilise l'import `dynamic` existant, et
  **supprime au passage les erreurs lint pré-existantes** du fichier (`any`, `require` interdit, `dynamic` inutilisé →
  4→0). Alternative écartée (gate monté + garder `require`) : aurait conservé le `any`/`require` (lint) sans bénéfice.
- **A2 — Nuance de comportement public : chargement ASYNC du chunk** (au lieu du `require` synchrone). Sur le parcours
  public, MapSelector monte à l'étape localisation (client-only) : avec `dynamic`, le composant se charge en lazy import
  (même bundle) → 1 tick de rendu `null` avant le conteneur carte, imperceptible (l'init Leaflet est déjà async en
  `useEffect`). Le DOM final (le div MapContent + ses props) est IDENTIQUE. Alternative écartée : garder le require sync
  → ne corrige pas le mismatch.

## B. DOUTES
- **B1 (mineur, non-render)** — le fix n'a pas été vérifié en navigateur (pas de navigateur). Preuve indirecte : la
  logique `ssr:false` élimine par construction le mismatch (mêmes rendus serveur/1er-client) ; tsc 0, eslint 0, build ✓,
  golden 22/22. À confirmer à l'œil : plus d'« Hydration failed » en console sur `/admin/banc-test`, carte fonctionnelle
  sur le parcours public.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **MapContent INTOUCHÉ** : `git status` = `MapSelector.tsx` seul pour ce fix (les autres fichiers modifiés — BancSaisie,
    EventailFaisceaux — sont le Lot 6 non encore committé, hors de ce fix). MapContent/moteur intacts.
  - **GOLDEN** : `test:integration` **22/22**, `29.107259068449615` inchangé (fix 100 % front, aucun fichier moteur).
  - **PARCOURS PUBLIC — comportement préservé** : même wrapper, mêmes props forwardées, même DOM MapContent rendu ; seule
    la stratégie de chargement passe de require-sync à dynamic-async (imperceptible, cf. A2). Le rendu public reste, à
    l'affichage, inchangé.
  - **LINT — amélioration nette, 0 ajouté** : `MapSelector` **4 problèmes AVANT → 0 APRÈS** (stash) : le fix supprime les
    erreurs pré-existantes (`any`, `require` interdit, `dynamic` inutilisé) sans en introduire aucune.
  - **NO-WRITE** : aucune écriture DB, aucune migration, aucun endpoint.
  - **prefers-reduced-motion** : inchangé (fix sans animation).
  - **ISOLATION dure** : `coucheDegagement`, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`,
    `pipeline.ts`, seam Lot 1, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts`, `MapContent` — **intouchés**.
  - Non-régression : `tsc` 0 · `eslint` 0 · `next build` ✓ · golden **22/22**.

## Vérification manuelle attendue (Arno)
- `/admin/banc-test` : plus d'erreur « Hydration failed » en console ; la carte s'affiche et fonctionne (drag, snap,
  coords). Parcours public (étape localisation) : carte inchangée, aucune régression.

## Verdict de conformité : livraison prête. Cause racine (anti-pattern `typeof window`/require) corrigée par
## `dynamic(ssr:false)` dans MapSelector seul ; MapContent et le parcours public préservés (DOM identique) ;
## lint amélioré (4→0) ; golden 22/22. À confirmer à l'œil (absence d'erreur console).
