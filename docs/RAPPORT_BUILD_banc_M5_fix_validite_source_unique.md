# RAPPORT — fix « État de validation contradictoire (bandeau vert vs Lancer invalide) + dissociation étage/hauteur »

> BUG BLOQUANT : deux critères de validité divergents. Fix = source UNIQUE (client miroite la garde serveur).
> Front-only (BancSaisie.tsx seul), golden bit-identique. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE) — 4 points
1. **Deux sources DIFFÉRENTES** : bandeau = `pointValide = validation?.statut === "VALIDE"` (state posé par `/api/origine`,
   `BancSaisie.tsx:186/237`) ; « Lancer » invalide = message SERVEUR de `comparerProfils`→`construireEntree` (`runErreur`).
2. **Cycle de vie** : `validation` posée par l'effet `[point, mode]` (POST `/api/origine`, débounce 300 ms), remise à
   `null` si `point` devient `null`. Re-jouée sur changement de `point` (adresse / coords GPS / moveend→`setPoint`) ou de
   `mode`. `onMove`/zoom/`move` ne posent que `coordsLive` (affichage) — **pas `point`** → n'invalident pas `validation`.
3. **Hypothèse zoomend : ÉCARTÉE**. Un zoom (même ancré centre) ne change pas `point` → l'effet ne se re-joue pas avec un
   autre résultat → le bandeau ne flippe pas au zoom.
4. **PRÉ-EXISTANT (pas une régression du réorg)** : `git diff` du réorg non committé ne touche NI `pointValide` NI
   l'effet de validation ; `git show HEAD:` (avant le réorg) contient déjà `pointValide = validation?.statut ===
   "VALIDE"`. Le bug date de Lot 3 (affichage) + Lot 5 (garde serveur).

### CAUSE RACINE
Critères de validité DIVERGENTS :
- **`/api/origine`** pose `statut = "VALIDE"` dès `v.valide` (`route.ts:32-33`), **sans exiger l'altitude terrain** (il
  renvoie `altitudeTerrainOrigineM`, qui peut être `null` → message « altitude terrain non disponible »).
- **`construireEntree`** (serveur, `pipeline.ts:107,111`) exige EN PLUS `altitudeTerrainOrigineM !== null` (+ bâtiment +
  snap) → sinon `entree: null` → « Point invalide ».
Un point **dans un bâtiment mais hors couverture MNT LiDAR** (ex. `48.857451, 2.358980`) passe le test client (VERT) mais
échoue le run serveur — cas domaine **INDÉTERMINÉ** (hors LiDAR = pas de certificat), que le client n'affichait pas.

## Correctif (1 fichier : `BancSaisie.tsx`)
### Bug — source UNIQUE de validité
- `ValidationPoint` porte désormais **`analysable: boolean`**, calculé dans l'effet de validation comme **MIROIR EXACT
  de la garde de `construireEntree`** depuis la réponse `/api/origine` :
  `statut==="VALIDE" && altitudeTerrainOrigineM != null && batimentOrigine != null && pointSnappeWgs84 != null &&
  pointSnappeL93 != null`.
- **`pointAnalysable`** remplace `pointValide` partout : la garde « Lancer » (`parametres`) ET la couleur/le message du
  bandeau lisent la MÊME dérivée. Fini le vert + « Point invalide » simultanés.
- Message dédié pour le cas VALIDE-mais-non-analysable : « Point dans un bâtiment mais hors couverture LiDAR (altitude
  terrain indisponible) — analyse impossible ici. » (rouge, plus de vert trompeur).
- Le serveur (`comparerProfils`/`construireEntree`) reste le garde final (BE-55) : un point réellement hors bâtiment
  bloque toujours (`statut !== "VALIDE"` → `analysable=false`). **Pas de découplage point/centre** (non nécessaire).

### Layout — dissociation étage/hauteur
- Chaque paire label+stepper (« Étage » / « Hauteur sous plafond ») est désormais dans son **propre bloc bordé**
  (`border var(--color-svv-line)`, radius, padding) avec une **gouttière** plus large (gap 20). Ordre conservé (Étage à
  gauche). Tokens SVAV, aucun hex.

## A. DÉCISIONS HORS-SPECS
- **A1 — Miroir de `construireEntree` côté client** plutôt que d'ajouter un nouveau statut serveur. La réponse
  `/api/origine` expose déjà tous les champs de la garde (altitude, bâtiment, snap) → le client peut refléter EXACTEMENT
  le critère serveur sans toucher `origine.ts` ni le pipeline. Alternative écartée : assouplir `construireEntree` →
  interdit (garde métier ; hors LiDAR = INDÉTERMINÉ).
- **A2 — Message rouge (bloquant) pour VALIDE-hors-LiDAR** plutôt qu'ambre. Motif : l'analyse est IMPOSSIBLE ici (comme
  hors bâtiment) → un signal « bloqué » clair évite l'ambiguïté. Le texte précise la raison (hors couverture LiDAR).

## B. DOUTES
- **B1 (mineur, non-render)** — non vérifié en navigateur (pas de navigateur). Logique : `analysable` reproduit
  littéralement la garde serveur ⇒ bandeau et « Lancer » ne peuvent plus se contredire. tsc 0, eslint 0, build ✓,
  golden 22/22. À confirmer à l'œil sur le point problématique.
- **B2 (mineur)** — je suppose que `/api/origine` renvoie bien `batimentOrigine`/`pointSnappeL93` non nuls quand
  `statut==="VALIDE"` (le cas divergent observé = altitude nulle) ; le check les inclut par prudence (miroir complet).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **SOURCE UNIQUE** : `pointAnalysable` alimente bandeau ET garde « Lancer » ; plus aucune occurrence de `pointValide`.
  - **GARDE PRÉSERVÉE (BE-55)** : le serveur reste le garde final ; un point hors bâtiment ou hors LiDAR est
    `analysable=false` → « Lancer » désactivé + message clair ; `origine.ts`/pipeline **non touchés**.
  - **ZOOM n'invalide pas** : `validation` ne dépend que de `point`/`mode` ; un zoom ne change pas `point`.
  - **GOLDEN** : `test:integration` **22/22**, `29.107259068449615` inchangé (100 % front).
  - **ISOLATION** : ce fix ne touche QUE `BancSaisie.tsx`. `MapContent.tsx`/`MapSelector.tsx` apparaissent `M` dans
    `git status` mais UNIQUEMENT à cause du chantier réorg précédent NON committé (`+9`/`+1` = zoomAncreCentre) — ce fix
    n'y a rien ajouté (tous les Edits ont ciblé BancSaisie). `origine.ts`, moteur, config, Gemini, `pontProfil`,
    `bancEssai`, `profilTest` — intouchés.
  - **prefers-reduced-motion** : aucune animation ajoutée. Trame/blocs en tokens SVAV (pas de hex).
  - Non-régression : `tsc` 0 · `eslint` 0 · `next build` ✓ · golden **22/22**.

## Vérification manuelle attendue (Arno)
- Point dans un bâtiment hors couverture LiDAR (ex. `48.857451, 2.358980`) → bandeau ROUGE « hors couverture LiDAR —
  analyse impossible » (plus de vert), bouton « Lancer » désactivé (plus de « Point invalide » après clic). Point
  normal → bandeau vert + Lancer actif → exécution OK. Zoom/dézoom → le bandeau reste stable. Ligne étage/hauteur : deux
  blocs bordés distincts, séparés.

## Verdict de conformité : livraison prête. Source unique de validité (client miroite la garde serveur `construireEntree`) ;
## bandeau et « Lancer » ne se contredisent plus ; garde serveur préservée ; zoom n'invalide pas ; étage/hauteur dissociés ;
## golden 22/22 ; BancSaisie.tsx seul. À valider à l'œil.
