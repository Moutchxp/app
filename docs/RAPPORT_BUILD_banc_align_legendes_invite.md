# RAPPORT — build « Banc M5 · alignement des 2 cartes + légendes en bas + moyennes 2 lignes + retrait invite azimut »

> 4 ajustements UI /admin/banc-test. Front-only. Golden bit-identique. **Non committé.**
> Fichiers de CE chantier : `EventailFaisceaux.tsx`, `BancSaisie.tsx`, `FaisceauMap.tsx` (prop additive).

## Recon (LECTURE SEULE) — verdict du point 1 : PAS de divergence, interprétation (a)
- **Éventail** (`EventailFaisceaux.tsx`) : `viewBox 0 0 360 196`, sommet à `OX = W/2 = 180` = **centre du viewBox** ;
  SVG `width:100% maxWidth:520 display:block` → **aligné à GAUCHE** dans son conteneur dès que le parent > 520px, donc
  le sommet n'est PAS au centre du bloc aujourd'hui.
- **Carte analysée** (`FaisceauMap.tsx`) : point rouge = `circleMarker([lat,lon])` (`:183`) ; la vue est centrée sur
  l'origine et la rotation `rot = -az` (`:323`) déplace l'offset `pxOffset` en VERTICAL uniquement → l'origine reste
  sur l'axe vertical central du cadre. Le `-mx-6` (`:326`) déborde symétriquement, clippé par le wrapper
  `overflow:hidden` → **origine = centre horizontal du wrapper = centre du parent**.
- **Convergence (a)==(b)** : centrer le SVG de l'éventail suffit pour que le sommet tombe au centre du bloc, donc sur
  le MÊME axe vertical que l'origine rouge (déjà centrée). Les deux interprétations donnent le même résultat →
  application de **(a)** (chaque origine centrée dans son bloc de même largeur/centre). **Aucun STOP.**
- **Invite azimut** = faisceau FANTÔME oscillant (`FaisceauMap.tsx:342-376`), piloté par `indiceRotationVisible`
  (défaut `true`, `:105`), rendu si `azDisp !== null && indiceRotationVisible`. **Partagé avec le public**
  (`page.tsx:2639`, aucune prop de désactivation). Non conditionnable sans nouvelle prop → prop additive.
- **Légendes/filtres** : filtres (`:173-182`) + moyennes (`:184-200`) rendus AU-DESSUS du SVG.

## Implémentation
### `EventailFaisceaux.tsx`
1. **Alignement (ajustement 1)** : SVG `style` gagne `margin: "0 auto"` (reste `display:block`, `maxWidth:520`) →
   centré dans son conteneur pleine largeur → sommet au centre du bloc = axe vertical de l'origine de la carte.
2. **Légendes/filtres EN BAS (ajustement 2)** : le graphe est rendu EN PREMIER ; les cases à cocher ET les moyennes
   passent SOUS le SVG (après le texte d'aide). Rapproche la carte analysée (au-dessus du composant) de l'éventail.
   Tabulation cohérente : le graphe (éléments non focusables) précède, puis les cases à cocher, puis les moyennes.
3. **Moyennes sur DEUX lignes (ajustement 3)** :
   - **Ligne 1** — les 3 COMPARABLES (sur 61, dégagés à la borne) : « Brut au sens du score » (gris, infobulle) ·
     « Moteur actif » (vert) · « Profil de test » (rouge).
   - **Ligne 2** — « Brut géométrique » (gris) SEULE, avec le compte « N/61 · M dégagé(s) exclu(s) » + mention
     « série géométrique, non comparable aux trois ci-dessus (profil-indépendante) ».
   Aucun recalcul : mêmes valeurs `moyBrutScore`/`moyActif`/`moyTest`/`moyBrut`, seule la disposition change.

### `FaisceauMap.tsx` (prop additive, ajustement 4)
- Nouvelle prop optionnelle **`inviteRotation?: boolean`**, **défaut `true`** ; garde de rendu de l'indice enrichie de
  `&& inviteRotation`. Pour le public (défaut `true`) la condition est `… && true` → **strictement identique**.

### `BancSaisie.tsx`
- La carte analysée passe **`inviteRotation={false}`** → plus de faisceau fantôme trompeur sur cette carte en lecture
  seule. Tout le reste inchangé (`margeRotDeg={0}`, montage à l'ouverture, pas de tuiles grises).

## A. DÉCISIONS HORS-SPECS
- **A1 — Ordre sous le graphe : cases à cocher PUIS moyennes.** La spec dit « déplacer les cases + tout ce qui est
  au-dessus vers le bas » sans fixer l'ordre relatif. Choix : conserver l'ordre vertical d'origine (filtres puis
  moyennes) → cohérence de tabulation et de lecture. Alternative écartée : moyennes puis filtres (romprait l'ordre
  historique sans bénéfice). Impact : cosmétique.
- **A2 — Nom de la prop = `inviteRotation` (booléen, défaut true).** La spec proposait `inviteAzimut`/`lectureSeule`.
  `lectureSeule` serait trompeur (la carte a déjà `margeRotDeg=0` pour le read-only ; ici on ne coupe QUE l'indice
  visuel). `inviteRotation` décrit exactement l'effet. Alternative écartée : `lectureSeule` (sémantique trop large).
- **A3 — Centrage via `margin:0 auto` sur le SVG plutôt que `text-align:center`/flex sur le conteneur.** Le SVG est
  `display:block` : `margin:0 auto` est la voie idiomatique, un seul point de changement, sans toucher le conteneur
  `overflowX:auto` (préserve le défilement mobile). Impact : nul hors centrage.

## B. DOUTES
- **B1 (mineur, non-render)** — rendu non vérifié en navigateur : superposition exacte des deux origines, position des
  légendes/moyennes sous le graphe, disparition de l'invite sur la carte analysée. Garanties : tsc 0, eslint 0 (mes
  fichiers), build ✓, golden 23/23, public FaisceauMap prouvé inchangé. À confirmer à l'œil.
- **B2 (mineur)** — l'alignement suppose que les deux blocs partagent le même parent pleine largeur (vérifié en recon :
  wrapper analysée et conteneur éventail sont tous deux pleine largeur du même `<div>` résultats). Si un padding
  asymétrique était introduit plus haut, l'axe se décalerait — non le cas aujourd'hui.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` inchangé (front-only, aucun chemin de score touché).
  - **PARCOURS PUBLIC INCHANGÉ** : `FaisceauMap` modifié par une **prop additive pure** (défaut `true` = comportement
    actuel) — prouvé par stash : eslint FaisceauMap **12 erreurs AVANT == 12 APRÈS** (dette pré-existante, hors de mes
    lignes), et `git diff` = 2 ajouts (prop + `&& inviteRotation`). Aucun caller public ne passe la prop (grep vide).
    `page.tsx`, `MapContent`, `MapSelector` **non modifiés**.
  - **eslint 0 sur le code écrit** : les 2 fichiers banc = 0 ; les 12 erreurs FaisceauMap sont **pré-existantes**
    (refs-in-render + `any` Leaflet, lignes 88-148 non touchées) — before==after prouvé.
  - **AUCUN HEX ajouté par ce chantier** (les `#3b82f6`/`#60a5fa` au diff sont les consts cône du chantier PRÉCÉDENT
    non committé, pas de celui-ci). Mes ajouts = tokens SVAV / layout.
  - **AUCUN LITTÉRAL d'angle/borne** ajouté ; moyennes toujours dérivées de `borneScoreM` (profil de test) ; arcs des
    bornes du profil ; cône de `coneDemiAngleDeg`.
  - **AUCUN ARRONDI sur valeur transmise** : moyennes = affichage (`toFixed(1)`), valeurs du seam intactes.
  - **VESTIGIAUX non exposés** ; **prefers-reduced-motion** : aucune animation ajoutée (l'invite retirée en RÉDUISAIT
    une sur la carte analysée).
  - **ISOLATION** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`, `pipeline.ts`,
    `faisceaux.ts`, `origine.ts`, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts` — **intouchés par ce chantier**.
  - Non-régression : `tsc` 0 · `eslint` (banc) 0 · `npm test` **442 passed** · `next build` ✓ · golden **23/23**.

> ⚠️ **Working tree** : `bancEssai.ts`, `libelles.ts`, `page.tsx`, `EditeurProfilTest.tsx`, `libelles.test.ts` et
> plusieurs `docs/RAPPORT_BUILD_*.md` sont des **chantiers précédents non committés**, PAS celui-ci. Fichiers de CE
> chantier UNIQUEMENT : **`EventailFaisceaux.tsx`, `BancSaisie.tsx`, `FaisceauMap.tsx`** (+ ce rapport). Stager ces
> trois-là seuls pour un commit isolé.

## Vérification manuelle attendue (Arno)
- Déplier « Vue de la map analysée » puis regarder l'éventail juste en dessous : le point rouge de la carte et le
  sommet de l'éventail sur le MÊME axe vertical (empilables). Cases à cocher + moyennes SOUS le graphe (graphe collé à
  la carte). Moyennes : ligne 1 = trois valeurs comparables (gris/vert/rouge), ligne 2 = « Brut géométrique » seule
  avec compte + mention non-comparable. Plus d'animation d'invite à pivoter sur la carte analysée (elle reste sur la
  carte d'orientation de la saisie). Parcours public : invite azimut toujours présente.

## Verdict de conformité : livraison prête. Alignement (a) sans divergence, légendes/moyennes réorganisées, invite
## retirée par prop additive (public prouvé inchangé) ; golden 23/23 ; tsc 0 ; build ✓.
