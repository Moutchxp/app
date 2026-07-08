# RAPPORT — build « Banc M5 · Lot 5 : exécution ×2 (actif/test) + comparaison »

> Split `construireEntree` / `analyser` (build entree ×1, analyser ×2) + comparaison + route + UI.
> GOLDEN-SAFE PAR CONSTRUCTION (délégation bit-identique). **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE)
- **Frontière build/analyser** : dans `analyserAdresse` (`pipeline.ts`), les étapes **a→f (lignes 91-177)** =
  DB/LiDAR/géométrie (`validerOrigine`, `obstaclesSurAxe`, `faisceauxAmplitude`, `resoudre*`,
  `preparerPaysageGeometrique`, assemblage `EntreeComplete`) ; l'étape **g (183)** = `analyser(entree, profil)`,
  PUR (`analyse.ts` en-tête : « PURE ORCHESTRATION : aucune donnée IGN, aucune IA »). Le profil est injecté à la
  toute fin (`params.profil ?? chargerProfilDegagement()`). ⇒ `analyser` est **rejouable ×N sur la même entrée**
  sans round-trip DB. **Split faisable, le cœur du lot est réalisable proprement.**

## Implémentation
1. **`pipeline.ts` — split par extraction-délégation** : nouvelle `construireEntree(params): {validation, entree}`
   (étapes a→f, verbatim) ; `analyserAdresse` **délègue** (`construireEntree` puis `analyser`) → comportement
   **bit-identique** du chemin de prod (mêmes appels, même ordre, même résolution de profil).
2. **`app/lib/db/bancEssai.ts` (NEW) — `comparerProfils(params, profilTest?)`** : `construireEntree` **UNE fois**,
   puis `analyser(entree, profilActif, {ventilation:true})` ET `analyser(entree, profilTest, {ventilation:true})`
   (seam Lot 1 activé pour les DEUX runs). Retourne `{actif, test, delta, verdictIdentique, ecarts}`. `profilTest`
   absent → `clonerProfil(profilActif)` (source minimale ; l'éditeur = Lot 2b).
3. **Route `POST /api/admin/banc-comparer` (NEW)** — gardée par `proxy.ts` (matcher `/api/admin/:path*`) ; valide
   les entrées, appelle `comparerProfils`, renvoie le JSON. `profilTest` optionnel dans le corps (forward-compatible 2b).
4. **`BancSaisie.tsx` — UI** : bouton « Lancer le test » (gaté sur paramètres valides) → POST → deux scores CÔTE À
   CÔTE (`score.total` /100 + libellé, BE-51) + delta `test − actif` signe+valeur (BE-52, couleur NEUTRE CA-5.5) +
   récap des écarts (BE-53, sans attribution par variable BE-53a) + assertion verdict identique (BE-56) + `famille1/2`
   étiquetés « détail interne — non sommé » (BE-51a). Péremption « relancez » si les paramètres changent (CA-5.4).
   Échec de run → message, pas de comparatif partiel (BE-55).

## A. DÉCISIONS HORS-SPECS
- **A1 — `analyserAdresse` refactoré en wrapper de `construireEntree`.** BE-50bis impose « un point de découpe additif
  dans pipeline.ts ». Choix : extraction-délégation (comme le seam Lot 1) → `analyserAdresse` inchangé en comportement
  (prouvé golden 22/22). Alternative écartée : dupliquer les étapes a→f dans bancEssai → deux sources de vérité de la
  géométrie, risque de divergence.
- **A2 — BE-80 (session read-only) : LECTURE SEULE PAR CONSTRUCTION, pas d'enforcement `SET TRANSACTION READ ONLY`.**
  `comparerProfils`/`construireEntree`/`chargerProfilDegagement` ne font QUE des SELECT (grep INSERT/UPDATE/DELETE =
  vide). L'enforcement au niveau session PG exigerait de threader un client read-only dédié à travers TOUTE la couche
  DB (`obstaclesSurAxe`, `faisceauxAmplitude`, `resoudre*` prennent leur propre `pool`), soit un refactor lourd de
  fichiers sensibles, hors périmètre Lot 5. → **garantie pratique tenue** (aucune écriture) ; l'enforcement session-level
  est une tâche d'infra séparée (à planifier). Alternative écartée : `SET default_transaction_read_only` sur une
  connexion poolée → affecterait d'autres requêtes (dangereux).
- **A3 — `profilTest` optionnel côté route (défaut = clone de l'actif).** Le prompt/SPEC prévoit une source minimale
  tant que l'éditeur (Lot 2b) n'existe pas. La route accepte déjà un `profilTest` dans le corps → quand 2b enverra un
  profil édité, le même chemin marche (délta ≠ 0). Aujourd'hui : délta = 0 (démontre CA-5.2).
- **A4 — `famille1/famille2` exposés comme « détail interne » (F1 /50, F2 /50, non sommés).** BE-51a demande de les
  étiqueter sans les rendre additionnables. Affichés en petit, libellés « non sommé ». Score officiel = `score.total`.
- **A5 — UI « Lancer le test » livrée avec délta systématiquement nul** (pas d'éditeur). Choix : livrer le flux
  end-to-end complet (build×1 → analyser×2 → comparatif), qui vaut CA-5.2 out-of-the-box et se remplira dès le Lot 2b.
  Alternative écartée : différer toute l'UI → aurait laissé le mécanisme non démontré.

## B. DOUTES
- **B1 (mineur, non-render)** — le comparatif côté UI (fetch route + affichage) n'a pas pu être vérifié à l'œil (pas de
  navigateur). Le BACKEND est prouvé par tests d'intégration (golden 22/22, CA-5.2/5.3/BE-56). À valider sur `/admin/banc-test`.
- **B2 (flaky, non lié)** — `npm test` a montré **1 échec** sur `session.test.ts > jeton falsifié (dernier caractère
  altéré)` (JWT/auth admin) au 1er run ; **436/436 au re-run** et **8/8 en isolé**. Aucun fichier auth touché → flake
  probabiliste connu (classe d'équivalence base64url du dernier char de signature), SANS rapport avec le Lot 5.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **22/22** (20 + 2 nouveaux), `29.107259068449615` **bit-identique** VIA le nouveau
    chemin. Preuves : BE-50/50bis+CA-5.2 (`comparerProfils`, profil test = clone → `actif.total == test.total ==
    29.107`, delta 0, verdict identique, `ecarts.total == 0`, 61 lignes de ventilation ×2) ; CA-5.3+BE-56 (variable
    VIVE `plafondDegagement×2` → test ≠ 29.107, actif = 29.107, verdict identique, écart tracé).
  - **BIT-IDENTITÉ du refactor** : `analyserAdresse` délègue à `construireEntree` (même ordre a→f) puis `analyser`
    (g) → le golden existant (inchangé) passe → aucune dérive.
  - **PROD inaltérée** : le split est transparent pour `analyserAdresse` (public) ; aucune option de ventilation
    activée hors banc.
  - **NO-WRITE** : `bancEssai.ts` + route = grep INSERT/UPDATE/DELETE/TRUNCATE **vide** ; aucune migration ; aucune
    persistance de résultat.
  - **VERDICT DÉCOUPLÉ** : `verdict.ts` non touché ; BE-56 assure même l'assertion que le verdict est identique
    actif/test (garde anti-couplage).
  - **COMPARAISON = présentation** : `delta`/`ecarts` sont des différentiels calculés APRÈS coup ; les scores
    (`analyser`) ne sont jamais altérés.
  - **ISOLATION dure** : `coucheDegagement`, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`,
    seam Lot 1, `profilTest.ts`, `origine.ts`, `MapContent`, `FaisceauMap` — **intouchés**. `git status` = `pipeline.ts`
    (split), `bancEssai.ts` (new), route (new), `BancSaisie.tsx` (UI), `pipeline.itest.ts` (tests).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **436** (hors flake auth) · `next build` ✓ (routes
    `/admin/banc-test` + `/api/admin/banc-comparer`).

## Vérification manuelle attendue (Arno)
- Saisir un point valide + azimut/étage → « Lancer le test » → deux scores identiques côte à côte (délta 0, verdict
  identique, « profil de test identique »). Modifier un paramètre → bandeau « relancez ». Point invalide → pas de
  comparatif. (Le délta ≠ 0 apparaîtra quand l'éditeur de variables — Lot 2b — enverra un profil de test modifié.)

## Verdict de conformité : livraison prête. Split build×1/analyser×2 bit-identique (golden 22/22), comparatif
## actif/test complet (côte à côte + delta + écarts + verdict identique), read-only par construction, moteur/seam/
## profilTest intacts. Délta nul jusqu'au Lot 2b (éditeur). À valider à l'œil sur /admin/banc-test.
