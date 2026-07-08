# RAPPORT — fix « Banc M5 · saisie : snap façade + adresse suit le point »

> Deux corrections UX de la saisie du banc (Lot 3). **UN seul fichier : `BancSaisie.tsx`.** `origine.ts` NON
> touché. Moteur intact → golden bit-identique. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE)
- **Snap façade absent** : le point d'observation est le CENTRE de la carte (`MapContent.tsx:263-272`, curseur
  central fixe) ; le snap façade se matérialise UNIQUEMENT par la prop **`pointSnappe`** → `MapContent` fait un
  `flyTo` dessus (`MapContent.tsx:156-174`, anti-boucle `programmaticTarget`). Le parcours public la câble
  `pointSnappe={mode==="manuel"?null:origine.resultat?.pointSnappeWgs84}` (`page.tsx:2503`). **`BancSaisie` (Lot 3)
  appelait `/api/origine` mais ignorait `pointSnappeWgs84` et ne passait PAS `pointSnappe`** → snap jamais exécuté.
  `/api/origine` renvoie bien `pointSnappeWgs84` (`app/api/origine/route.ts:62`).
- **Adresse ne suit pas le point** : le reverse-geocode BAN existe déjà côté public (`page.tsx:1358-1360` :
  `https://api-adresse.data.gouv.fr/reverse/?lat=&lon=`, MÊME service que l'autocomplete). `BancSaisie` ne l'appelait
  pas. Aucun endpoint interne à créer.
- **`origine.ts`** (snap façade métier) : réutilisé VIA `/api/origine` — **non modifié** (fichier sensible §4).

## Correctifs (1 fichier : `BancSaisie.tsx`)
### Fix 1 — « Façade (snap) » fonctionnel
- Nouvel état `snappe` : l'effet de validation capte `data.pointSnappeWgs84` de la réponse `/api/origine`.
- `MapSelector` reçoit `pointSnappe={mode === "manuel" ? null : snappe}` → `MapContent` `flyTo` sur la façade
  (exactement le pattern public). Le point (centre BRUT) reste inchangé ; `validerOrigine` re-snappe de toute façon
  à l'analyse (semi_auto). La validation reste la garde (aucune altération : même appel `/api/origine`).

### Fix 2 — Adresse suit le point (reverse au drag)
- Nouvel effet keyé `[point]` : reverse BAN direct (débounce **350 ms**, annulable via flag `annule` + `clearTimeout`
  → pas de course sur le label). Le label met à jour `adresse` ; le point reste AUTORITAIRE (le reverse ne déplace
  jamais le point, ne re-snappe pas, ne relance pas la validation).
- Anti-écrasement : `ignoreReverseRef` armé dans `onSelectAdresse` → saute UN reverse après une sélection d'adresse
  (garde le label choisi), comme `page.tsx:1382`.
- Échec réseau : `try/catch` silencieux → champ laissé inchangé, aucune exception propagée.

## A. DÉCISIONS HORS-SPECS
- **A1 — Point autoritaire = centre BRUT (comme le public), pas mis à jour vers le point snappé.** Le snap est
  purement visuel (flyTo) ; `analyserAdresse`/`validerOrigine` re-snappe en semi_auto. Alternative écartée : forcer
  `point = pointSnappeWgs84` → aurait recréé une boucle validation/flyTo et divergé du pattern public éprouvé.
- **A2 — Débounce reverse = 350 ms** (fourchette demandée 300-400). Effet séparé de la validation (concerns
  distincts) ; annulation par flag `annule` (cohérent avec l'effet de validation existant).
- **A3 — Deux sélecteurs de mode coexistent** (le mien, au-dessus de la carte, + celui interne à `MapContent`,
  bas-gauche) : les deux pilotent le même état `mode`. Laissés tels quels (hors périmètre des 2 fixes) →
  **nettoyage optionnel ultérieur** possible (retirer le toggle externe redondant).

## B. DOUTES
- **B1 (mineur, non-render)** — le flyTo de snap et le reverse au drag n'ont pas pu être vérifiés visuellement (pas de
  navigateur). Garanties : câblage identique au parcours public (mêmes props/URL), tsc 0, eslint 0, build ✓, golden
  20/20. À confirmer à l'œil sur `/admin/banc-test`.
- **B2 (mineur)** — annulation via flag `annule` + `clearTimeout` (pas d'`AbortController`) : suffit à éviter la course
  sur le label affiché (la requête stale n'écrit jamais l'état) ; cohérent avec l'effet de validation.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **`origine.ts` NON touché** — snap façade réutilisé via `/api/origine` (aucune réimplémentation). Isolation dure :
    moteur, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`, `pipeline.ts`, seam Lot 1,
    `profilTest.ts`, `MapContent.tsx`, `FaisceauMap.tsx` — **intouchés**. `git status` (hors docs) = `BancSaisie.tsx` seul.
  - **GOLDEN / moteur** : `test:integration` **20/20**, `29.107259068449615` inchangé (fix 100 % front).
  - **NO-WRITE** : aucune écriture DB, aucune migration ; appels réseau = `/api/origine` (validation lecture) +
    BAN reverse (lecture). Le point reste autoritaire (reverse = affichage seul).
  - **VALIDATION préservée** : le snap ne change pas la garde `/api/origine` (même appel, même statut).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **436** · `next build` ✓.

## Vérification manuelle attendue (Arno)
- Mode « Façade » : déplacer le point → il « tombe » sur la façade du bâtiment (flyTo). Mode « Libre » : reste posé.
- Déplacer le point → le champ adresse se met à jour (reverse) ; sélectionner une adresse → le label choisi n'est PAS
  écrasé. Réseau coupé → champ inchangé, pas de plantage.

## Verdict de conformité : livraison prête. Snap façade réutilise la logique existante via `pointSnappe` (origine.ts
## intact) ; l'adresse suit le point via le reverse BAN existant, point autoritaire préservé ; golden 20/20 ; un seul
## fichier front. À valider visuellement sur /admin/banc-test.
