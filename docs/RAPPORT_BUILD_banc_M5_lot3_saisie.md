# RAPPORT — build « Banc M5 · Lot 3 : saisie internaute »

> Formulaire FRONT-ONLY produisant les paramètres d'entrée d'une analyse de test (BE-30..BE-36).
> Moteur non touché → golden bit-identique. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Résumé
Composant client `BancSaisie.tsx` (rendu par `banc-test/page.tsx`) : adresse (AdresseAutocomplete réutilisé),
point d'observation sur carte (MapSelector/MapContent) avec validation live via `/api/origine` (validerOrigine,
bâtiment couvert LiDAR — PAS de bypass), azimut principal **360° LIBRE** (FaisceauMap + nouvelle prop
`margeRotDeg={180}` ; input numérique 0-359 synchronisé), étage + hauteur sous plafond (steppers, bornes/pas
centralisés dans `config.ts`) + dernier étage, hauteur de vision dérivée via `hauteurVision` (non réécrite). La
saisie assemble un objet `ParametresSaisie` (forme de `ParametresAnalyse`) affiché « prêt pour le Lot 5 ».
`test:integration` **20/20** (golden `29.107259068449615` inchangé) ; `npm test` **436** ; build ✓.

## Fichiers (1 neuf + 3 modifiés)
- `app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx` (NEW, client) — formulaire complet.
- `app/(admin)/admin/(protected)/banc-test/page.tsx` — rend `<BancSaisie/>` (placeholder remplacé).
- `app/FaisceauMap.tsx` — prop additive `margeRotDeg?: number` (défaut `MARGE_ROT_DEG` = ±30°, public INCHANGÉ ;
  banc = 180 → 360°). Clamp paramétré + `margeRotDeg` ajouté aux deps de l'effet de binding (pas de nouveau ref).
- `app/lib/svv/config.ts` — constantes `HAUTEUR_SOUS_PLAFOND_MIN_M`/`MAX_M`/`PAS_M` (centralisation des bornes
  [2,40 ; 4,50] pas 0,10, jusque-là littéraux dispersés dans `page.tsx`).

## A. DÉCISIONS HORS-SPECS
- **A1 — Périmètre : la saisie ASSEMBLE et VALIDE les paramètres, mais N'EXÉCUTE PAS l'analyse.** BE-30..36 décrivent
  la saisie ; l'exécution (double run actif/test + comparaison) est le **Lot 5**. Décision : produire l'objet
  `ParametresSaisie` (mêmes champs que `ParametresAnalyse`) + un état « prêt » affiché, sans appeler `analyserAdresse`.
  Alternative écartée : câbler un bouton « Lancer » → aurait anticipé le Lot 5 (BE-50). Impact : le bloc « Paramètres
  du test » montre le JSON prêt + une note « exécution = Lot 5 ».
- **A2 — Bornes/pas de la hauteur sous plafond CENTRALISÉS dans `config.ts`.** La SPEC/moteur ne définissait que le
  DÉFAUT (`HAUTEUR_SOUS_PLAFOND_DEFAUT_M = 2.50`) ; les bornes [2,40 ; 4,50] et le pas 0,10 étaient des LITTÉRAUX dans
  `app/page.tsx:1279`. Le prompt interdit les littéraux en dur (« lis la valeur source »). N'existant pas de source
  centrale, décision : créer `HAUTEUR_SOUS_PLAFOND_MIN_M`/`MAX_M`/`PAS_M` dans `config.ts` (cohérent avec l'invariant
  « centraliser les constantes »). **NON fait** : refactorer `app/page.tsx` (parcours public) pour consommer ces
  constantes → laissé tel quel pour ne pas toucher le public hors périmètre Lot 3. → **suggestion de nettoyage
  ultérieur** : aligner `page.tsx` sur ces constantes (les valeurs sont identiques, aucun changement de comportement).
- **A3 — Azimut 360° via `margeRotDeg` (prop) + input numérique.** BE-34 exige FaisceauMap 360° via prop sans toucher
  le clamp public. Fait : prop `margeRotDeg` (défaut 30 = public inchangé ; banc = 180). J'ai AUSSI ajouté un input
  numérique 0-359 comme contrôle fiable et synchronisé (le banc n'a pas d'azimut « capté » comme le téléphone). Le
  parent normalise l'azimut proposé sur [0,360[. Alternative écartée : refaire un sélecteur d'azimut spécifique → la
  prop additive est plus sobre et réutilise l'existant.
- **A4 — `mode` d'origine exposé (Façade snap / Libre)** par un toggle, défaut `semi_auto` (comme le public).
  `validerOrigine` en tient compte (tolérance de snap). Trou de spec mineur comblé (bonne pratique : refléter le
  comportement public).
- **A5 — Centre carte par défaut = Paris** tant qu'aucun point n'est choisi (jamais le point de calcul, juste le
  cadrage initial ; cohérent avec l'usage du GPS photo « pour centrer » du parcours public).

## B. DOUTES
- **B1 (mineur, non-render)** — le rendu Leaflet (recentrage MapContent, rotation FaisceauMap 360°) n'a PAS pu être
  vérifié visuellement (pas de navigateur dans l'environnement). Garanties apportées autrement : composants réutilisés
  À L'IDENTIQUE du parcours public (mêmes props/patterns), tsc 0, build ✓, et FaisceauMap prouvé lint-neutre
  (12 erreurs pré-existantes avant == après, 0 ajoutée). Vérification visuelle à faire par Arno sur `/admin/banc-test`.
- **B2 (mineur)** — `arrondi1` (Math.round(v×10)/10) sur le stepper hauteur = MÊME snapping que `app/page.tsx:1278`
  (pas de 0,10). C'est un pas d'incrément UI, PAS un arrondi de score (la valeur sert telle quelle à `hauteurVision`) →
  l'invariant « aucun arrondi » (calculs de score) est respecté.
- **B3 (mineur)** — pas de test unitaire : chantier front-only (maps impératives + formulaire) ; la logique pure se
  limite à `norm360`/`arrondi1` (triviales). Non-régression couverte par golden 20/20 + `npm test` 436 + build.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN / moteur** : `test:integration` **20/20**, `29.107259068449615` inchangé. Le lot ne touche PAS le moteur
    (isolation : `coucheDegagement`, `scoreTotal`, `pipeline.ts`, `PROFIL_GOLDEN_REF`, `profilTest.ts`, seam Lot 1 —
    intouchés). `git status` = `BancSaisie.tsx` (new), `banc-test/page.tsx`, `FaisceauMap.tsx`, `config.ts`.
  - **NO-WRITE** : `BancSaisie.tsx` n'émet aucune écriture (grep INSERT/UPDATE/DELETE/pool/query = vide) ; seul appel
    réseau = `POST /api/origine` (validation LECTURE, endpoint existant du parcours public). Aucune migration.
  - **HAUTEUR DE VISION** : réutilise `hauteurVision(etage, hauteurSousPlafondM)` de `config.ts` (non réécrite,
    paramètre variable préservé) ; bornes/pas centralisés (pilotage sans code), aucun littéral dispersé ajouté.
  - **VERDICT DÉCOUPLÉ** : rien touché côté verdict ; aucun couplage introduit.
  - **CONTRAINTE GPS RESPECTÉE (BE-32)** : le point doit être VALIDE au sens `validerOrigine` (pas de bypass) ; point
    invalide → message FR + paramètres non assemblés (`ParametresSaisie = null`) → pas d'analyse possible (BE-33).
  - **FaisceauMap public INCHANGÉ** : prop `margeRotDeg` défaut = `MARGE_ROT_DEG` (±30°) ; `app/page.tsx` ne passe rien
    → comportement public strictement identique. Lint-neutre (12 pré-existants avant == après ; mes fichiers neufs = 0).
  - **Responsive / mobile (§15)** : max-width, flex/grid, steppers 40×40 px (cibles tactiles), pas d'interaction
    hover-only. **prefers-reduced-motion** : aucune animation ajoutée par le composant.
  - Non-régression : `tsc` 0 · eslint (fichiers neufs) 0 · `npm test` **436** · `next build` ✓ (route `/admin/banc-test`).

## Verdict de conformité : livraison prête. Saisie internaute complète (adresse, point validé, azimut 360°, étage/
## hauteur), paramètres assemblés pour le Lot 5 ; moteur intact (golden 20/20) ; FaisceauMap public inchangé ;
## bornes centralisées. À vérifier visuellement sur /admin/banc-test (rendu Leaflet non testable hors navigateur).
