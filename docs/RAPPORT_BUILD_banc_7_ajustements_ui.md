# RAPPORT — build « Banc M5 · 7 ajustements UI »

> Cône bleu FaisceauMap · coeffs 1 déc. · hv 2 déc. (affichage) · cartouches vertes · moyenne des faisceaux ·
> carte analysée repliable · liseré rouge persistant. Front-only. Golden bit-identique. **Non committé.**

## Recon (LECTURE SEULE) — 6 points
1. **Cône FaisceauMap** (`FaisceauMap.tsx:370`) : `fill="#3b82f6" fillOpacity={0.15} stroke="#60a5fa" strokeWidth={2}
   strokeDasharray="5 4"` — **valeurs HEX, aucun token bleu SVAV n'existe**.
2. **Badges publics** = classe **`svv-pill`** (`page.tsx:607` ; `globals.css:38` = `green-soft` bg / `green-ink` texte).
3. **Cône banc actuel** (`EventailFaisceaux:161`) : `fill="SteelBlue" fillOpacity={0.12} stroke="none"` (trop gris).
4. **`hv = hauteurVision(...)`** (`BancSaisie:267`) est **DISPLAY-ONLY** : `parametres` (`:272`) envoie
   `hauteurSousPlafondM` **BRUT**, JAMAIS `hv`. Le serveur recalcule `hauteurVision`. → formater hv = **sûr**.
5. **ChampScalaire** (`EditeurProfilTest:165`) : `modifie = String(valeur) !== String(valeurActive)` (dérivé chaque
   rendu → persiste tant que ça diverge). ● posé, mais **pas de liseré** sur le champ.
6. **`distancePercueM: number`** (jamais null) ; **`distanceBruteM: number|null`** (null = dégagé). → **pas d'ambiguïté** :
   Brut = moyenne sur les OBSTRUÉS (non-null, count reporté) ; Actif/Test = moyenne sur les 61.

## Implémentation (3 fichiers)
1. **Cône** (`EventailFaisceaux`) : consts `CONE_FILL="#3b82f6"` / `CONE_STROKE="#60a5fa"` (= valeurs `FaisceauMap:370`,
   documentées et centralisées) ; polygone `fillOpacity 0.15` + stroke pointillé « 5 4 ». Reste dérivé de
   `coneDemiAngleDeg` (adaptatif, aucun 60 en dur).
2. **Coeffs 1 décimale** : `fmtCoeff(v) = v.toFixed(1)` appliqué à « Coeff cône/flanc » + « Carte — coeff cône/flanc ».
   AFFICHAGE seul (valeurs calculées intactes).
3. **Hauteur de vision 2 décimales** : `{hv.toFixed(2)} m`. **La valeur transmise (`hauteurSousPlafondM` brut) est
   INCHANGÉE** ; `hv` n'alimente jamais `ParametresSaisie` (recon point 4).
4. **Cartouches vertes** : `CartouchesComparees` — base = classe **`svv-pill`** (même vert que le public) ; différences
   par la BORDURE : vert = ajouté (test), rouge + barré = retiré (actif). Tokens SVAV.
5. **Moyenne des faisceaux** : sous les filtres, au-dessus du graphe — Brut (gris) / Actif (vert) / Test (rouge).
   Brut sur `distanceBruteM` non-null avec `(N/61 · M dégagés exclus)` si exclusions ; Actif/Test sur `distancePercueM`
   (61). Purement descriptif (aucun recalcul).
6. **Carte analysée repliable** (`BancSaisie`) : `<details>` « Vue de la map analysée » (replié par défaut, `<summary>`
   accessible clavier), entre les cartouches et l'éventail. Réutilise **FaisceauMap en LECTURE SEULE** (`margeRotDeg={0}`,
   prop existante, sans `onAzimutChange`) sur `runParams` (paramètres FIGÉS au lancement). FaisceauMap **monté SEULEMENT
   à l'ouverture** (`onToggle` → état ; rendu conditionnel) → init correcte, **pas de tuiles grises** (aucun besoin de
   `invalidateSize`, aucune modif de FaisceauMap).
7. **Liseré rouge persistant** (`EditeurProfilTest`) : input/select d'un champ `modifie` → `borderColor` + `boxShadow`
   rouge (tokens). Dérivé de `modifie` → persiste tant que ça diverge ; « Réinitialiser » (clone actif) → 0 écart → liserés effacés.

## A. DÉCISIONS HORS-SPECS
- **A1 — Cône = hex `#3b82f6`/`#60a5fa` (valeurs FaisceauMap réutilisées à l'identique).** La consigne « réutiliser
  EXACTEMENT le même calque » + « mêmes tokens » se heurte au fait que **FaisceauMap n'utilise PAS de token** (hex en
  dur). Priorité à la consigne SPÉCIFIQUE (identique à FaisceauMap) : consts documentées pointant `FaisceauMap:370`
  (non dispersées). Alternative écartée : créer un token `--color-svv-*` bleu dans `globals.css` (fichier partagé,
  hors périmètre banc + duplication de la valeur).
- **A2 — Moyenne en gris/vert/rouge** (`muted`/`green-ink`/`red`), comme demandé et cohérent avec les en-têtes du
  tableau de détail (Chantier B : Actif=vert). ⚠️ La légende des séries du GRAPHE utilise encore `actif=ink` (encre,
  pré-existant, non modifié ici) — léger écart de teinte actif entre graphe et moyenne, hors périmètre.
- **A3 — Carte analysée : FaisceauMap `margeRotDeg={0}` (lecture seule) + montée à l'ouverture du `<details>`.** Évite
  toute modif de FaisceauMap (prop existante) ET le bug Leaflet des tuiles grises (monté quand visible → taille correcte).
  Alternative écartée : ajouter un `invalidateSize` à FaisceauMap → toucherait un fichier partagé au public.
- **A4 — Carte analysée sur `runParams` (snapshot au lancement)**, pas sur le point/azimut LIVE → montre « les
  paramètres de l'analyse lancée » même après édition ultérieure.

## B. DOUTES
- **B1 (mineur, non-render)** — rendu non vérifié en navigateur (cône, moyenne, carte analysée dans `<details>`,
  liserés). Garanties : tsc 0, eslint 0, build ✓, golden 23/23, FaisceauMap non modifié. À confirmer à l'œil,
  notamment que la carte analysée s'initialise correctement à l'ouverture.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` inchangé (front-only).
  - **AUCUN ARRONDI SUR VALEUR TRANSMISE** : `hv.toFixed(2)` est un AFFICHAGE ; `ParametresSaisie` envoie
    `hauteurSousPlafondM` BRUT (le serveur recalcule `hauteurVision`) — la valeur transmise/calculée n'est jamais
    arrondie. `fmtCoeff`/moyenne `toFixed(1)` = affichage pur (valeurs du seam intactes).
  - **PARCOURS PUBLIC INCHANGÉ** : `FaisceauMap`, `MapContent`, `MapSelector`, `page.tsx` **NON modifiés par ce
    chantier** (git status : hors périmètre). FaisceauMap réutilisé via une prop EXISTANTE (`margeRotDeg`).
  - **AUCUN HEX ajouté** hors les 2 consts cône (prouvé par diff) = valeurs FaisceauMap réutilisées ; le reste en
    tokens SVAV / `svv-pill` / `color-mix`. Les hex `#b45309`/`#fff` détectés sont PRÉ-EXISTANTS (non touchés).
  - **AUCUN LITTÉRAL D'ANGLE** : le cône reste dérivé de `coneDemiAngleDeg` (profil).
  - **MOYENNE descriptive** : aucun recalcul de score, null (dégagés) exclus et comptés (jamais comptés 0 en silence).
  - **VESTIGIAUX non exposés** ; **prefers-reduced-motion** : aucune animation ajoutée.
  - **ISOLATION** : moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`, `pipeline.ts`,
    `faisceaux.ts`, `origine.ts`, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts` — **intouchés par ce chantier**.
    `git status` (ce chantier) = `EventailFaisceaux.tsx`, `BancSaisie.tsx`, `EditeurProfilTest.tsx`.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **442** · `next build` ✓.

## Vérification manuelle attendue (Arno)
- Cône : bleu vif comme la carte d'orientation, transparent, s'élargit quand `coneFamilleDemiAngleDeg` change. Coeffs
  à 1 déc. dans le détail. Hauteur de vision à 2 déc. (le score ne bouge pas). Cartouches vertes (comme la page
  publique) + ajouté/retiré. Moyenne gris/vert/rouge sous les filtres (dégagés exclus indiqués). « Vue de la map
  analysée » repliée → dépliée = carte non grise, faisceau au bon azimut. Liseré rouge sur chaque variable de test
  modifiée, effacé par « Réinitialiser ».

## Verdict de conformité : livraison prête. 7 ajustements UI purs ; cône = valeurs FaisceauMap (identiques), affichage
## arrondi sans toucher la valeur transmise (prouvé), public + FaisceauMap intacts ; golden 23/23.
