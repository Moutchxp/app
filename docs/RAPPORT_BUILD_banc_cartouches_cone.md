# RAPPORT — build « Cartouches de qualité de vue au banc + cône dérivé du profil + ajustements tableau »

> (a) forward pur des cartouches · (b) extraction `assemblerBadges` · (c) calque de cône profil-dérivé · +2 UI.
> Front + forward de données déjà calculées. Golden bit-identique. **Non committé.** Commit SÉPARÉ.

## (a) Élargir la réponse RunBanc — `bancEssai.ts`
`RunBanc` + les objets `actif`/`test` forwardent désormais, POUR CHAQUE RUN, `contexteDegagement`, `contexteVueNature`,
`contexteImmobilier`, `monumentsHistoriques` — **lus depuis `rActif`/`rTest` (ResultatComplet) déjà produits par
`analyser()`**. PUR FORWARD : aucune requête DB, aucun appel moteur, aucun recalcul. Route inchangée (lecture seule).

## (b) Extraction `assemblerBadges` — `libelles.ts` + `page.tsx`
- Nouveau helper PUR `assemblerBadges(r: EntreeBadges): string[]` dans `lib/libelles.ts`, **repris VERBATIM** de la
  logique inline de `page.tsx` (orientation + contexte dégagement/vue-nature/immobilier + monuments + Famille 2 masquée
  si `scorePartiel`, `filter(null)`). `EntreeBadges` = type structurel MINIMAL (satisfait par `ResultatComplet` ET par
  la réponse du banc → aucun couplage à `analyse.ts`).
- `page.tsx` : la liste inline (l'array + `f1`/`f2`) est remplacée par `const badges = assemblerBadges(resultat);` ;
  imports ajustés (retrait des 4 `libelle*` devenus inutiles, ajout `assemblerBadges`). **Diff = extraction verbatim.**
- **Rendu public INCHANGÉ** : prouvé par stash (**page.tsx 26 problèmes lint AVANT == 26 APRÈS** → 0 ajouté) + diff
  verbatim + test unitaire `assemblerBadges` (3 cas : ordre + filtrage null + gating scorePartiel).

## Rendu des cartouches au banc — `BancSaisie.tsx`
- `RunLite`/`ScoreLite` étendus pour porter les 4 cartouches + `famille1.detail.secteurOrientation` +
  `famille2.{strate1,strate2,malusProprete,scorePartiel}` (déjà dans le JSON forwardé).
- Composant `CartouchesComparees` : deux colonnes **Moteur actif | Profil de test** (via `assemblerBadges` sur chaque),
  différences matérialisées — badge présent d'un seul côté → **« retiré » (actif, rouge doux + barré)** / **« ajouté »
  (test, vert)** ; commun = neutre. Listes identiques → **« Cartouches identiques entre les deux runs. »**. Tokens SVAV
  + `color-mix` (rouge doux), aucun hex.

## (c) Calque de cône central profil-dérivé — `EventailFaisceaux.tsx` + `BancSaisie.tsx`
- Prop additive `coneDemiAngleDeg?: number` ; `BancSaisie` la fournit depuis **`(profilTest ?? profilActif).coneFamilleDemiAngleDeg`**
  (LA variable, `profilDegagement.ts:82`, défaut 60). **Aucun 60 en dur** ; **s'adapte** quand la valeur est éditée dans
  le profil de test (dérivée du profil affiché, re-render).
- Calque = polygone-secteur (origine + arc échantillonné de −demi à +demi au rayon extérieur), **bleuté doux, DERRIÈRE
  les tracés** (`fill="SteelBlue" fillOpacity={0.12}`), discret (ne masque pas les 3 séries). Non dessiné si la prop est
  absente/≤ 0.

## Ajustements du tableau de détail — `EventailFaisceaux.tsx`
1. Libellé UI « Distance perçue (m) » → **« Distance pondérée (m) »** (UI SEULEMENT ; `distancePercueM`/
   `distancePercueFaisceau` inchangés dans le code).
2. « Distance brute (m) » et « Nature traversée (m) » : **même valeur dans les 3 colonnes** (Brut, Actif, Test) au lieu
   d'un tiret — ces quantités sont géométriques et profil-indépendantes (recon confirmée), la répétition est exacte.

## A. DÉCISIONS HORS-SPECS
- **A1 — `EntreeBadges` = type structurel minimal** (au lieu de typer le param `ResultatComplet`). `page.tsx` utilise un
  MIROIR local de `ResultatComplet` ; un type minimal est satisfait par les deux (banc + public) sans couplage ni risque
  d'assignabilité. Logique 100 % identique. Alternative écartée : importer `ResultatComplet` d'`analyse.ts` → couplage +
  risque de divergence des miroirs.
- **A2 — Cône = `fill="SteelBlue"` (mot-clé CSS), pas un token.** Aucun token SVAV « bleu » n'existe et la consigne veut
  un « bleuté » ; SteelBlue est un mot-clé CSS (**pas un hex**), avec `fillOpacity` pour la discrétion. Alternative
  écartée : ajouter un token `--color-svv-*` à `globals.css` (fichier partagé, hors périmètre front-only du banc).
- **A3 — Cône alimenté par `profilTest` (sinon `profilActif`).** Arno veut qu'il s'adapte à l'éditeur du profil de test →
  valeur LIVE du profil de test. Si absent, repli `profilActif`.
- **A4 — Diff des cartouches = « ajouté / retiré » (pas « modifié »).** Les badges sont des chaînes indépendantes ; un
  libellé qui change se lit comme un retrait + un ajout. « Modifié » comme catégorie n'est pas apparentable de façon
  fiable ; ajouté/retiré couvre tous les cas visuellement.

## B. DOUTES
- **B1 (mineur, non-render)** — le rendu (cartouches côte à côte, calque de cône, tableau) n'a pas été vérifié en
  navigateur. Preuves : extraction verbatim + stash lint-neutre + test unitaire badges (3/3) + tsc/eslint 0 + golden
  23/23 + build ✓. À confirmer à l'œil.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` inchangé (aucun fichier moteur touché ; forward pur).
  - **RENDU PUBLIC INCHANGÉ** : extraction verbatim (diff) + `page.tsx` **26 == 26** (stash) + test unitaire
    `assemblerBadges` (3/3) prouvant l'ordre/filtrage/gating.
  - **FORWARD PUR / LECTURE SEULE** : `bancEssai.ts` ne fait que copier des champs de `ResultatComplet` ; aucune requête
    DB nouvelle, aucun appel moteur. Route inchangée.
  - **CÔNE DÉRIVÉ DU PROFIL** : `coneFamilleDemiAngleDeg` (jamais `coneF3DemiAngleDeg` vestigial ni `CONE_VUE_NATURE_DEG`) ;
    aucun littéral d'angle ; s'adapte à l'éditeur.
  - **VESTIGIAUX non exposés** ; **aucun hex** (tokens SVAV + `color-mix` + mots-clés `white`/`SteelBlue`).
  - **prefers-reduced-motion** : aucune animation ajoutée.
  - **ISOLATION** : `coucheDegagement`, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`,
    `pipeline.ts`, `faisceaux.ts` (pas de SQL élargi), `origine.ts`, `profilTest.ts`, `pontProfil.ts` — **intouchés**.
    `git status` = `page.tsx`, `libelles.ts` (+ test), `bancEssai.ts`, `BancSaisie.tsx`, `EventailFaisceaux.tsx`.
  - Non-régression : `tsc` 0 · `eslint` 0 (touchés) · `npm test` **442** (+3 badges) · `next build` ✓.

## Vérification manuelle attendue (Arno)
- Lancer un test : cartouches côte à côte (actif | test) ; en modifiant une variable de test qui change une cartouche
  (ex. couloir → `contexteDegagement`), la différence s'affiche (ajouté/retiré). Calque de cône bleuté ±demi-angle ; en
  changeant `coneFamilleDemiAngleDeg` dans l'éditeur → le cône s'élargit/rétrécit. Tableau : « Distance pondérée » ;
  brute & nature répétées dans les 3 colonnes. Parcours public (page résultat) : badges INCHANGÉS.

## Verdict de conformité : livraison prête. Forward pur des cartouches + helper extrait (public verbatim, prouvé) +
## comparatif visuel + cône profil-dérivé (adaptatif) + 2 ajustements tableau ; golden 23/23 ; moteur/faisceaux intacts.
