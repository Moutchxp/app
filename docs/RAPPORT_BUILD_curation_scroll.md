# RAPPORT — build « Scroll auto vers l'entité sélectionnée (curation M4) »

> Chantier **front-only**, **1 seul fichier** (`app/(admin)/admin/(protected)/curation/CurationCarte.tsx`).
> **GOLDEN-SAFE** : aucun chemin de score touché. **Non committé.**

## Résumé
Au clic sur un marqueur (qui sélectionne déjà l'entité), la liste de gauche **scrolle** désormais jusqu'à
l'item sélectionné et le **surligne brièvement**. Rien d'autre n'est modifié (recentrage carte, vert
persistant, détail inline, dragend, candidats bleus inchangés). +24 / −1 ligne, additions pures.

## Changements (fichier:ligne)
- `:208` état `const [flashId, setFlashId] = useState<number|null>(null)`.
- `:218` ref `const itemActifRef = useRef<HTMLLIElement|null>(null)`.
- `selectionner` : `+ setFlashId(id)` (handler → cible du scroll + surbrillance).
- Nouvel effet `[selectionId]` : `null` → return (pas de scroll au montage) ; sinon
  `itemActifRef.current.scrollIntoView({ behavior: reduire ? 'auto' : 'smooth', block:'nearest', inline:'nearest' })`
  + `setTimeout(() => setFlashId(null), 1200)` (nettoyé au unmount / prochain changement).
- `<li>` : `ref={selectionne ? itemActifRef : undefined}` + `className` conditionnelle `svv-cur-item--flash`.
- CSS : `.svv-cur-item--flash{animation:svv-cur-flash 1.2s ease-out}` + `@keyframes` (fond
  `--color-svv-green-soft` → `#fff`) ; `@media (prefers-reduced-motion:reduce){ .svv-cur-item--flash{animation:none} }`.

## A. DÉCISIONS HORS-SPECS
- **A1 — `setFlashId` dans le handler `selectionner`, pas dans l'effet** : évite un `setState` synchrone en
  corps d'effet (règle stricte `react-hooks/set-state-in-effect` du projet). Le nettoyage (`setFlashId(null)`)
  vit dans le callback `setTimeout`. Alternative écartée : `setFlashId` en tête d'effet (aurait fait échouer eslint).
- **A2 — Couleur du flash = `--color-svv-green-soft`** (token existant, surbrillance « positive »), fond
  `→ #fff` (le fond réel de l'item). Aucune palette inventée. Alternative écartée : teinte neutre `--color-svv-field`
  (trop subtile pour signaler « la voici »).
- **A3 — `scrollIntoView` natif** (pas de lib), `block:'nearest'` pour ne pas sauter quand l'item est déjà visible.

## B. DOUTES
- **Aucun bloquant.** Cas limite tracé : si l'entité sélectionnée depuis la carte est **filtrée hors liste**
  (recherche/filtre famille actif), `itemActifRef.current` est nul → l'effet `return` sans scroller (pas de
  crash). Comportement raisonnable (impossible de scroller vers un item non rendu).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **ISOLATION** : `git status` = **1 seul fichier modifié** (`CurationCarte.tsx`). Aucun fichier interdit
    lu/écrit (`faisceaux.ts`, `verdict.ts`, `config_scoring`, `profilConfig`, `PROFIL_GOLDEN_REF`,
    `geom_point`/`geom_point_corrige`, routes API, logique liaisons, Gemini). Aucune migration.
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique (chantier UI, ne touche pas le score).
  - **prefers-reduced-motion** respecté : `behavior:'auto'` (scroll instantané) + `animation:none` (pas de flash).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **363** (inchangé).

## Test manuel (à faire par Arno)
- (a) Clic marqueur d'une entité **hors écran** dans la liste → la liste **scrolle** jusqu'à elle + **flash**.
- (b) Clic marqueur d'une entité **déjà visible** → **pas de saut** (`block:'nearest'`).
- (c) `prefers-reduced-motion: reduce` → scroll **instantané**, **aucune animation** de flash.

## Verdict de conformité : livraison prête. Ajout purement visuel (scroll + surbrillance), golden-safe,
## isolé à un fichier, reduced-motion respecté.
