# RAPPORT FINAL — build « Découplage golden / config de référence »

> Run `/svav-build` sur `docs/SPEC_decouplage_golden_reference.md` (OQ1–OQ4 tranchés). **Non committé**.
> Catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
Le test golden est désormais **hermétique** à la config live : il injecte une **config gelée de
référence** (`PROFIL_GOLDEN_REF`) au lieu de lire `config_scoring id=1`. Éditer une variable depuis
l'admin **ne peut plus faire rougir le golden**. Valeur du golden **inchangée** (`29.107259068449615`),
**aucun rescellage** ; chemin de prod **inchangé**.

## Fichiers touchés (app/lib/db uniquement)
- `app/lib/db/pipeline.ts` : (1) `import type { ProfilDegagement }` ; (2) champ optionnel `profil?:
  ProfilDegagement` dans `ParametresAnalyse` ; (3) `const profil = params.profil ?? await
  chargerProfilDegagement();` (ex-`await chargerProfilDegagement()` seul).
- `app/lib/db/pipeline.itest.ts` : constante `PROFIL_GOLDEN_REF` (snapshot des valeurs de scellement) +
  injection `profil: PROFIL_GOLDEN_REF` dans le rejeu Asnières. **Assertion `:42` inchangée.**

## A. DÉCISIONS HORS-SPECS
- **A1 — `PROFIL_GOLDEN_REF` inline dans `pipeline.itest.ts`** (plutôt qu'un fichier `.fixture.ts` séparé,
  évoqué en OQ3). Raison : un fichier `.itest.ts` **n'est jamais embarqué dans le bundle de prod** →
  garantie « hors prod » maximale (satisfait EX-13 par construction) ; « co-localisé au test » au sens le
  plus strict. Alternative écartée : `app/lib/db/golden.fixture.ts` (fichier `.ts` importable par la prod,
  garantie « hors prod » seulement par grep).
- **A2 — `import type { ProfilDegagement }` ajouté à `pipeline.ts`** (depuis `app/lib/svv/profilDegagement`)
  pour typer le champ `profil?`. **Import de TYPE uniquement** (zéro runtime, aucune modification d'un
  fichier `app/lib/svv`) ; `pipeline.ts` (orchestrateur) référence déjà ce moteur. Conforme au garde-fou
  « ne pas MODIFIER `app/lib/svv` ».
- **A3 — Vérification « édition admin → golden reste vert » par preuve STRUCTURELLE (grep + logique), PAS
  par un test mutant la DB.** OQ4 rendait le test mutant optionnel/non bloquant ; surtout, un `UPDATE`
  (même temporaire) sur `config_scoring` serait un **écrasement de données** proscrit par la **Règle dure**
  (interdiction de modification/suppression autonome). Preuve retenue : le golden passe `profil:
  PROFIL_GOLDEN_REF` → `analyserAdresse` court-circuite `chargerProfilDegagement` (via `??`) → le score du
  golden est **structurellement indépendant** de `config_scoring`. Aucune écriture DB effectuée.

## B. DOUTES
- **B1 — Les 2 autres `it` du golden (négatif HORS_BATIMENT, INDÉTERMINÉ) n'injectent PAS `profil`** : ils
  lisent encore la config live via `chargerProfilDegagement`. **Sans impact** : ils assèrent uniquement la
  `validation`/le `verdict` (géométrie), **jamais `score.total`**. Si un jour on leur ajoute une assertion
  de score, il faudra leur passer aussi `PROFIL_GOLDEN_REF`. Noté pour mémoire.
- **B2 — `PROFIL_GOLDEN_REF` est un littéral copié à la main** (risque de faute de frappe). **Mitigé** : le
  re-run golden est le filet — toute divergence ferait échouer `toBeCloseTo(29.107…, 3)`. Ici : **vert**,
  donc snapshot exact.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV verte :
  - **GOLDEN** : `test:integration` **14/14**, `29.107259068449615` **reproduit** avec la ref injectée →
    **aucun mouvement, aucun rescellage** (EX-8/EX-10/EX-15).
  - **PROD INCHANGÉE** : aucune route (`/api/analyse*`) ne passe `profil` ; sans `profil` → lecture live
    via `chargerProfilDegagement` (comportement identique) — EX-5/EX-12.
  - **EX-13** : `PROFIL_GOLDEN_REF` présent **uniquement** dans `pipeline.itest.ts` (grep) — absent du prod.
  - **ISOLATION** : seuls `pipeline.ts` + `pipeline.itest.ts` (`app/lib/db`) modifiés ; **aucun**
    `app/lib/svv`, verdict, `ST_Force2D`, Gemini touché. `chargerProfilDegagement`/`profilConfig.ts`
    **inchangés** (EX-6). Non-régression `npm test` 263 passés.

---

## Verdict de conformité : livraison prête. Golden hermétique à la config live, valeur inchangée, aucun
## rescellage, prod inchangée. Aucune écriture/suppression de données (Règle dure respectée : test mutant
## DB volontairement évité).
