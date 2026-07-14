# PLAN — Module Internaute : moteur de recherche de contacts (LOT A) + bouton « Test » vers le Banc (LOT B)

> Mode PLANIFICATION SEULE (`/svav-build --plan-only`). Aucun code produit. Ce document est le seul livrable écrit.
> Golden `29.107259068449615` : à re-jouer en conformité sur tout lot approchant le moteur (LOT B), attendu inchangé.

## 1. Recon lecture seule (état actuel, fichier:ligne)

### Statuts F (multi-sélection ET) — SOURCE DE VÉRITÉ actuelle
- État : `const [statuts, setStatuts] = useState<Set<CleFinalite>>` — `InternautesVue.tsx:277` (défaut `{F1}`).
- Toggle : `toggleStatut` `:359-367` ; `aucunStatut = statuts.size === 0` `:368` ; `statutsCoches` `:371`.
- Rendu des 3 boutons : `STATUTS_EXPORT.map` `:528-535` (`coche = statuts.has(s.statut)`, rouge plein si coché).
- Garde-fous : fail-closed + étanchéité par statut portés CÔTÉ SERVEUR par `clauseStatuts` (`extraction.ts:68-82`) + court-circuit repo (`extractionRepo.ts:46,69`). Le front n'est qu'un reflet.

### Liste de résultats + tri + pagination
- Fetch : effet `[applique, page, statuts]` — `InternautesVue.tsx:315-341` (POST `page`/`taille`/`statuts` + filtres).
- Rendu liste : `etat.lignes.map` `:739` ; compteur `:733` ; pagination Précédent/Suivant `:763-767` (`TAILLE` par page).
- **Tri actuel = `ORDER BY i.cree_a DESC`** (`extractionRepo.ts:60` liste, `:76` export). PAS alphabétique.
- **Recherche nom/prénom : INEXISTANTE.** `construireFiltres` (`extraction.ts`) ne filtre que commune/score/verdict/dates ; aucun `ILIKE` sur `prenom`/`nom`. `lireFiltres` ne parse aucun `q`.
- `LigneProfil` expose `prenom`, `nom`, `email`, `telephone`, `commune_insee`, `verdict`, `score`, `consenti_le` (`extraction.ts:207-221`).

### Fiche détail (où irait le bouton « Test »)
- Composant partagé `FicheDetail({ detail, actions })` `InternautesVue.tsx:843` — rend les analyses `detail.projets.map` (chaque projet = lat/lon/azimut/etage/hauteur/verdict/score/date). `lireProfilComplet` (`extractionRepo.ts:127-157`) renvoie `projets` triés `cree_a DESC` → **le chooser « plusieurs certificats » = cette liste déjà présente.**
- `internaute_projet` (migration 023 + 026) : `lat, lon, azimut_deg, etage, dernier_etage, hauteur_sous_plafond_m, commune_insee, payload, verdict, score, cree_a` — **AUCUNE colonne `mode`**.

### Banc de test (M5) — cible du LOT B
- `banc-test/BancSaisie.tsx` : formulaire FRONT-ONLY produisant `ParametresSaisie { point{lat,lon}, azimutPrincipalDeg, etage, hauteurSousPlafondM, dernierEtage, mode }` (`:52-58`). **État 100 % interne, AUCUNE prop, AUCUN `searchParams`** (`:133+`). Monté nu : `page.tsx` = `<BancSaisie />` (`banc-test/page.tsx:4`).
- Rejeu moteur : `POST /api/admin/banc-comparer` (body point/azimut/etage/hauteur/dernierEtage/mode/profilTest?) → `comparerProfils` (`lib/db/bancEssai.ts:47`) → `construireEntree` + `analyser(entree, profil)` ×2. **GOLDEN-SAFE par construction** (`bancEssai.ts:4` : même `analyser` pur que la prod, aucun recalcul/round-trip). Gardé par permission **`banc_test`** (`banc-comparer` + `banc-profil-actif/route.ts:9`).
- **Constat majeur** : le Banc accepte DÉJÀ exactement les entrées d'un `internaute_projet` → LOT B = pré-remplir `BancSaisie`, PAS reconstruire un moteur. Mais il faut AJOUTER à `BancSaisie` un chemin d'initialisation (aujourd'hui absent).

### Point zéro
- LOT A ne touche NI le moteur NI la base (colonnes existantes) → golden hors sujet.
- LOT B ne modifie PAS le moteur (réutilise le banc golden-safe) mais CONNECTE le module internaute au banc → golden à re-jouer en filet, précision lat/lon à préserver (invariant « aucun arrondi »).

---

## 2. Découpage en LOTS committables

### LOT A — Moteur de recherche (aucun golden, aucune migration)

**A1 — Serveur : recherche nom/prénom (ordre libre) + tri alphabétique.**
- Objectif : ajouter un filtre texte `q` sur `prenom`/`nom` (ILIKE, tokenisé) + option de tri alphabétique, EN PRÉSERVANT fail-closed + étanchéité par statut.
- Fichiers : `app/lib/internaute/extraction.ts` (`construireFiltres` : clause `q` ; `lireFiltres` : parse `q`) ; `app/lib/internaute/extractionRepo.ts` (`ORDER BY` alphabétique) ; `app/lib/internaute/extraction.test.ts` (tests). Route liste `route.ts` : déjà transporte les filtres, rien ou presque.
- Base/migration : NON (colonnes `prenom`/`nom` existent).
- Dépendances : aucune (socle).
- Risque : **MOYEN** — SQL sur données nominatives ; le `q` DOIT être un paramètre LIÉ (`$n`, jamais interpolé) ; le `(prenom ILIKE $ OR nom ILIKE $)` est un OR INTERNE au filtre nom (ANDé avec l'intersection des statuts) → NE viole PAS l'invariant « zéro OR entre statuts ». Fail-closed inchangé (le court-circuit `statuts` vide reste en amont).
- ⚠️ **Correctif revue — tri STABLE** : `prenom`/`nom` sont NULLABLE et non uniques → `ORDER BY i.nom, i.prenom` seul est non déterministe (lignes qui migrent entre pages). Tri obligatoire : `ORDER BY i.nom, i.prenom, i.id` (départage stable). ⚠️ **Accents** : cf. arbitrage 10 (décision requise avant code).
- Vérif : tests purs — `q` produit `(i.prenom ILIKE $k OR i.nom ILIKE $k)` par token, tous ANDés ; `q` vide → aucune clause ; injection `q` → lié en paramètre ; la clause `q` n'apparaît JAMAIS sans le garde statuts (fail-closed) ; tri alphabétique STABLE (tiebreaker `i.id`). tsc/eslint/npm test.
- Golden : NON concerné.

**A2 — UI : champ de recherche unique + debounce + scroll interne 6 lignes.**
- Objectif : champ nom/prénom au-dessus de la liste ; requête serveur à chaque frappe (debounce) ; liste scrollable, 6 lignes max visibles (le bloc ne grandit pas).
- Fichiers : `InternautesVue.tsx` (état `q` + debounce + passage au fetch ; `maxHeight` + `overflow-y:auto` sur la liste).
- ⚠️ **Correctif revue** : au changement de `q`, faire `setPage(1)` (comme `filtrer`/`toggleStatut`, `InternautesVue.tsx:350,366`) ET ajouter `q` (débouncé) aux dépendances de l'effet de fetch (`:315-347`) — sinon rechercher depuis la page 3 renvoie une page 3 potentiellement vide.
- Base : NON. Dépendances : **A1**.
- Risque : **FAIBLE** (UI + wiring). Charte : cible ≥44px, focus rouge, pas de bleu.
- Vérif : manuel + tsc/eslint. (Debounce : pas de test unitaire trivial → vérif visuelle.)
- Golden : NON.

**A3 — UI : 3 boutons F « miroir » (sync à sens unique) + reset au toucher du bloc originel.**
- Objectif : 3 boutons miroir au-dessus de la liste, pilotés par `statuts` (source de vérité) — liseré GRIS inactif / liseré ROUGE actif, fond sans trame ; AUCUNE remontée (cliquer un miroir ne modifie pas `statuts`). Toucher le bloc originel RÉINITIALISE le nouveau bloc (miroirs re-synchronisés + champ recherche vidé) et rétablit l'affichage piloté par le haut.
- Fichiers : `InternautesVue.tsx` (rendu miroir dérivé de `statuts` ; `toggleStatut` (bloc originel) déclenche aussi le reset du champ `q`).
- Base : NON. Dépendances : **A2** (le bloc de recherche existe).
- Risque : **FAIBLE-MOYEN** — la logique « sens unique + reset » est le point délicat (ne pas créer de boucle de sync ; définir ce que « miroir actif » signifie s'il n'a aucune action propre — cf. arbitrage 4).
- Vérif : manuel (comportement de sync/reset) + tsc/eslint.
- Golden : NON.

### LOT B — Bouton « Test » → Banc de test (SENSIBLE, golden en filet)

**B1 — Banc : accepter une saisie initiale (pré-remplissage).**
- Objectif : permettre à `BancSaisie` d'être initialisé avec `{ point, azimut, etage, hauteurSousPlafondM, dernierEtage, mode }` fournis depuis l'extérieur, SANS rien changer au comportement par défaut (banc lancé nu = identique).
- Fichiers : `banc-test/BancSaisie.tsx` (lecture d'une saisie initiale + init des états) ; `banc-test/page.tsx` (transmet la saisie initiale selon le mécanisme retenu — cf. arbitrage 5). Éventuel petit module pur de parsing/validation de la saisie initiale (testable).
- Base : NON (sauf si arbitrage 6 = stocker `mode` → migration `internaute_projet` : lot séparé B0-migration).
- Dépendances : décision d'arbitrage 5 (mécanisme) + **6 (mode — défaut `semi_auto` recommandé, cf. arb. 6 corrigé)** + 7 (précision).
- Risque : **ÉLEVÉ** — modifie un fichier M5 sensible (état interne dense : ~15 `useState`, `useMemo parametres`, effets validation/reverse) ; ne doit PAS régresser le banc existant ni court-circuiter la validation `/api/origine` ; précision lat/lon EXACTE ; le point (logement) transite (RGPD, arb. 5).
- Vérif : tsc/eslint/npm test ; **test de NON-RÉGRESSION du banc lancé nu** (comportement identique sans saisie initiale) ; `npm run test:integration` (golden re-joué par prudence). ⚠️ **La vérif « lat/lon injectés = lat/lon stockés » est INSUFFISANTE** (le snap/mode change la géométrie, pas seulement lat/lon — la fidélité se mesure au VERDICT, cf. B2).
- Golden : re-joué en filet mais **NON porteur** (B1 front-only ; le moteur pur n'est pas importé → le golden ne peut structurellement pas bouger, et ne prouve PAS la fidélité du rejeu).

**B2 — Fiche internaute : bouton « Test » par analyse + handoff vers le banc.**
- Objectif : dans `FicheDetail`, un bouton « Test » par projet (analyse) ; au clic, transmettre les caractéristiques de CE projet au banc (via le mécanisme B1) + naviguer vers `/admin/banc-test`. Le « chooser » = la liste de projets déjà rendue (date/verdict/score visibles).
- Fichiers : `InternautesVue.tsx` (bouton + handoff + navigation) ; éventuel mapping `internaute_projet → ParametresSaisie` (module pur testable).
- Base : NON. Dépendances : **B1** (le banc doit accepter le handoff).
- 🔴 **Correctif revue — `FicheDetail` est PARTAGÉE** avec `PanneauVerification` « consultation SEULE » (rendue `InternautesVue.tsx:473` ET `:1059` ; les actions passent par la prop `actions` OMISE par la Vérification, contrat `:951-952`). Les projets sont rendus DANS `FicheDetail` (`:888`) → un bouton « Test » ajouté naïvement **FUITERAIT dans le panneau read-only** (violation d'invariant). ⇒ passer le bouton par une **prop dédiée `actionsProjet`** (ou équivalent) que la Vérification OMET, exactement comme `actions`.
- 🔴 **Correctif revue — coercition `numeric → number`** : `azimut_deg` et `hauteur_sous_plafond_m` sont pg `numeric` → renvoyés en **CHAÎNES** ; `lireProfilComplet` ne les coerce PAS (`extractionRepo.ts:141-147` ; seul `score` l'est). Or `banc-comparer` EXIGE des `number` (`route.ts:33` → 400 sinon). Le mapping DOIT faire `Number(p.azimut_deg)` / `Number(p.hauteur_sous_plafond_m)` depuis la valeur BRUTE — **jamais** depuis l'affichage `toFixed` (`:936-938`, invariant « aucun arrondi »).
- 🔴 **Correctif revue — projets pré-migration 026** : `azimut_deg`/`hauteur_sous_plafond_m` NULL sur les vieux dossiers → **désactiver** le bouton « Test » (plutôt qu'un défaut silencieux `Number(null)=0`/NaN qui fausserait le rejeu ou renverrait 400).
- Permissions : **aucun gating** (arbitrage 9 résolu : admin ⇒ `banc_test`).
- Risque : **MOYEN** — mapping + précision + FicheDetail partagée + coercition.
- Vérif : tsc/eslint/npm test (mapping pur : coercition, NULL→désactivé) ; **test de FIDÉLITÉ dédié** (rejouer un projet connu, comparer le VERDICT — pas seulement lat/lon) ; golden re-joué en filet (non porteur) ; manuel.
- Golden : filet de conformité (par prudence) — **mais NON porteur** (front-only ; ne valide pas la fidélité).

**Ordre recommandé : A1 → A2 → A3 → (arbitrages B) → B1 → B2.** LOT A entièrement avant LOT B (A = risque faible/moyen sans golden ; B = élevé, à traiter en dernier avec le filet golden).

---

## 3. POINTS D'ARBITRAGE (décision d'Arno — je ne tranche pas)

1. **Tri** : alphabétique TOUJOURS, ou seulement pendant une recherche (défaut = `cree_a DESC` conservé) ?
2. **Debounce + seuil** : délai (250–300 ms ?) et longueur minimale du terme avant d'interroger le serveur (≥2 car pour limiter les requêtes nominatives ?), ou requête dès le 1er caractère ?
3. **Tokenisation « ordre libre »** : chaque mot doit matcher (prénom OU nom), tous ANDés (« pierre thevenin » = « thevenin pierre ») — validé ? ou recherche plus simple (un seul token) ?
4. **Boutons miroir — sémantique exacte** : un bouton miroir est-il PUREMENT indicatif (aucune action au clic, reflet seul), ou cliquable avec une action définie ? Le « reset au toucher du bloc originel » vide-t-il le champ recherche À CHAQUE toggle du haut, ou seulement à certaines conditions ? Le champ recherche est-il partagé/visible aux deux endroits ?
5. **🔴 RGPD — Mécanisme de handoff vers le banc** : (a) URL `searchParams` (simple, mais lat/lon d'un LOGEMENT écrits dans l'historique navigateur) ; (b) `sessionStorage` (hors historique, mais persistant côté client jusqu'à fermeture) ; (c) handoff serveur éphémère. **Décision de minimisation à trancher.**
6. **🔴 Mode d'origine du rejeu — FIDÉLITÉ (CORRIGÉ après revue : l'ancienne formulation était INVERSÉE).** Le point stocké `internaute_projet.lat/lon` est le point **BRUT PRÉ-SNAP** : au tunnel, le centre de carte brut est figé (`page.tsx:2935`) et stocké tel quel (`useOrigineValidation.ts:57-64`) — PAS le point snappé. Or la prod analyse par DÉFAUT en **`semi_auto`**, qui **snappe la façade** (`pipeline.ts:103,119` : toute la géométrie est calculée sur `pointSnappeWgs84`). ⇒ **c'est `semi_auto` (re-snap déterministe du même brut) qui REPRODUIT l'origine réellement analysée ; `manuel` (point brut sans snap) DIFFÈRE** et peut même faire basculer le seuil 40 m (verdict 100 % géométrique). Le **mode n'étant pas stocké**, on ne peut certifier le replay fidèle. Décision : rejeu par défaut **`semi_auto`** (recommandé pour reproduire l'origine analysée), OU stocker `mode` à l'ingestion (option lourde : migration `internaute_projet` + modif ingestion, hors périmètre). Ne JAMAIS mapper depuis une valeur d'affichage arrondie (`toFixed`).
7. **Précision** : lat/lon transitent à PLEINE précision (aucun arrondi, invariant SVAV). Le round-trip `number→String→Number` (URL) est exact en IEEE754 ; le SEUL risque réel est de mapper depuis l'affichage `toFixed` (`InternautesVue.tsx:936-938`) au lieu de la valeur brute — à interdire explicitement (cf. correctif B2 en §5).
8. **Granularité du bouton Test** : par ANALYSE (un bouton par projet) ou un seul (dernier projet) ? (Recommandation : par analyse, car le chooser = la liste de projets existante.)
9. **Permissions — RÉSOLU par la revue (à retirer de la liste des décisions) :** un `administrateur` possède IMPLICITEMENT toutes les permissions dont `banc_test` (`garde.ts:11,110`), et la fiche internaute est réservée `administrateur` (`internautes/route.ts:22`). ⇒ **quiconque voit le bouton « Test » a toujours `banc_test`** ; un collaborateur `banc_test`-only ne voit jamais la fiche. **Aucun gating nécessaire** (sûr par construction). Pas un arbitrage.
10. **🔴 ACCENTS (ajouté après revue — conditionne « aucune migration » de LOT A) :** ILIKE gère la casse mais **PAS les diacritiques** (aucune extension `unaccent`/`pg_trgm`/`citext` en base ; seules `postgis`/`postgis_raster`). Sur des contacts FRANÇAIS, « Thévenin » ≠ « thevenin ». Décision : (a) recherche accent-SENSIBLE (aucune migration, UX dégradée) ; (b) `CREATE EXTENSION unaccent` + `unaccent(x) ILIKE unaccent($)` → **A1 devient un lot AVEC migration** (le « aucune migration » de A1 tombe).

---

## 4. Risques RGPD & golden par lot

| Lot | RGPD | Golden |
|---|---|---|
| A1 | Recherche nominative par nom (exploitation admin, déjà le cadre) ; `q` LIÉ (anti-injection) ; fail-closed + étanchéité PRÉSERVÉS (le `q` est un AND en plus du garde statuts). | Non concerné. |
| A2 | Requête nominative à chaque frappe (débounce + seuil = limitation) ; admin-only ; jamais toute la base (statuts vide → 0). | Non. |
| A3 | Aucun (reflet d'état). | Non. |
| B1 | Point d'un LOGEMENT transite vers le banc (arbitrage 5) ; aucune NOUVELLE persistance (banc = outil de test, n'écrit rien). | **Non concerné structurellement** (B1 est front-only ; le golden exerce le moteur pur qu'aucun composant front n'importe → ne peut PAS bouger). Filet re-joué par prudence, mais il **NE VALIDE PAS la fidélité du rejeu** (snap/mode, cf. arb. 6). |
| B2 | Coordonnées d'un logement passées du dossier internaute au banc (même arbitrage 5). Bouton toujours sûr côté permission (arb. 9 résolu). | **Idem B1** : golden non porteur. La FIDÉLITÉ exige un test DÉDIÉ (rejouer un projet connu et comparer le **verdict**, en tenant compte du snap/mode) — pas le golden. |

---

## 5. Verdict de la revue adversariale du plan → **CORRIGER LE PLAN** (corrections intégrées ci-dessus)

Le reviewer a confronté le plan au CODE RÉEL (chaîne tunnel → ingestion → stockage → rejeu). Verdict : **découpage bon,
recon fidèle, mais UNE erreur d'analyse centrale + 3 angles morts** qui casseraient l'implémentation ou un invariant.
**Toutes les corrections sont désormais intégrées aux sections 2–4.** Les invariants (fail-closed, étanchéité, golden
bit-identique) ne sont PAS menacés par la conception ; la faille était ailleurs (FIDÉLITÉ du rejeu + couplage front).

### Bloquants (corrigés dans le plan)
1. **Arbitrage 6 était FACTUELLEMENT INVERSÉ (corrigé).** Le point stocké est **BRUT PRÉ-SNAP** (`page.tsx:2935`,
   `useOrigineValidation.ts:57-64`) ; la prod snappe par défaut (`semi_auto`, `pipeline.ts:103,119`). ⇒ **`semi_auto`
   reproduit l'origine analysée, PAS `manuel`.** Mode non stocké → replay fidèle non certifiable. → arbitrage 6 réécrit.
2. **`FicheDetail` partagée avec le panneau lecture-seule (angle mort → corrigé B2).** Bouton « Test » à passer par une
   prop dédiée `actionsProjet` omise par la Vérification (sinon fuite d'action dans un panneau read-only).
3. **Coercition `numeric→number` (angle mort → corrigé B2).** `azimut_deg`/`hauteur_sous_plafond_m` = chaînes pg non
   coercées (`extractionRepo.ts:141-147`) → `Number(...)` obligatoire, jamais depuis `toFixed` → sinon 400 `banc-comparer`.
4. **Accents non gérés (angle mort → arbitrage 10 ajouté).** ILIKE ≠ diacritique ; `unaccent` invaliderait le « aucune
   migration » de A1. Décision requise avant code.

### Robustesse (corrigés)
5. **A1 — tri STABLE `ORDER BY i.nom, i.prenom, i.id`** (nom/prenom nullable, non uniques → sinon pagination cassée).
6. **A2 — `setPage(1)` au changement de `q`** + `q` dans les dépendances de l'effet de fetch.
7. **B2 — projets pré-026 (`azimut_deg` NULL) → bouton désactivé** (pas de défaut silencieux).

### Clarifications (intégrées)
8. **Permissions (arbitrage 9) — RÉSOLU, retiré des décisions** : admin ⇒ `banc_test` implicite (`garde.ts:11,110`) +
   fiche réservée admin ⇒ bouton toujours sûr, aucun gating.
9. **§4 golden reformulé** : B1/B2 front-only → le golden ne peut structurellement pas bouger ET **ne valide pas la
   fidélité** ; la fidélité exige un TEST DÉDIÉ (rejouer un projet connu, comparer le VERDICT).
10. **Effacés = hors sujet (énoncé)** : exclus par `efface_a IS NULL` (`extraction.ts:60,79`) ET projets supprimés à
    l'effacement (`cycleVie.ts:57`) → un effacé n'a aucun projet, donc aucun bouton « Test ».

### Ce qui tient sans correction
- Ordre A → B justifié ; B1 committable « latent » (banc nu strictement identique).
- `q` × fail-closed : garanti (court-circuit `statuts` vide en amont, `extractionRepo.ts:46`, avant `construireFiltres`).
- `q` LIÉ en `$n` (anti-injection) ; le `(prenom ILIKE $ OR nom ILIKE $)` est un OR INTERNE au filtre nom, jamais entre
  statuts.
- Debounce sur données nominatives : risque timing/DoS **négligeable** (admin unique authentifié qui peut déjà exporter
  toute la base en CSV).

### Cotation de risque (confirmée) : A1 MOYEN · A2/A3 FAIBLE · B1 ÉLEVÉ · B2 MOYEN. **Le vrai risque de B n'est pas le
golden (structurellement inatteignable) mais la FIDÉLITÉ du rejeu (snap/mode) et la coercition numérique.**
