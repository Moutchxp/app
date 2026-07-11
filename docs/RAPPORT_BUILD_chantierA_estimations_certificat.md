# RAPPORT BUILD — Chantier A : isoler `clic_plusvalue` + compteurs & ratios (certificat, estimations)

> Généré le 12/07/2026 — run autonome `/svav-build`. **Aucun commit effectué.** Livraison remise à Arno.

## Résumé exécutif

Deux boutons du tunnel émettaient le **même** événement `clic_estimation` (« Calculer la plus-value » sur
écran certifié, `page.tsx:694` ; « Estimation immobilière » sur écran vis-à-vis, `page.tsx:712`) → impossibles
à distinguer. Ce chantier :
1. **Isole** le CTA plus-value sous un événement DÉDIÉ `clic_plusvalue` (le second garde `clic_estimation`).
2. **Expose** dans le module Statistiques 4 compteurs globaux : certificat, plus-value, estimation immo, et
   **total estimations = plus-value + estimation immo** (sommé à la lecture).
3. **Affiche** ces compteurs en séries (tuile « Activité dans le temps ») et en KPI + 2 **ratios** (estimations/
   visites, certificats/visites) dans la carte « Analyses », en GLOBAL.

Ces événements sont des lignes **NEUTRES** (ni commune, ni verdict, ni acquisition) → compteurs temporels
globaux, **HORS k-anonymat** (même politique que `traficParTranche`/`comptesAnalyses`).

- **Revue adverse** (8 vecteurs) → **VALIDER**, aucune faille.
- **Recon indépendante** (9 invariants) → **VALIDER**, 9/9 PASS.
- **Golden `29.107259068449615`** : **inchangé** (`pipeline.itest.ts` PASS ; aucun fichier moteur touché).
- **Byte-unchanged** : `password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts` → diff **vide**.
- **Aucune dépendance npm**. Migration 022 **additive, NON exécutée** (Arno l'applique).

## Phase 0 — Confirmation (lecture seule)

(a) `page.tsx:694`+`:712` émettaient `clic_estimation`, `:3088` émet `clic_certificat` — **confirmé**. (b) `NOMS_CLIENT`
(`mesure/route.ts`) — **confirmé**. (c) Catalogue = **FK** (`018:104`), seed par INSERT → ajout = simple INSERT,
aucun CHECK — **confirmé**. (d) patron série (serieParTranche/SeriePoint/GROUPES_SERIE/CleSerie) — **confirmé**.
(e) `TuileAnalyses` consomme `data.analyses` (`comptesAnalyses`, `IN ('analyse_lancee','resultat')`) — **confirmé**.
Aucune divergence.

## Fichiers touchés

| Fichier | Modification |
|---|---|
| `db/migrations/022_clic_plusvalue.sql` | **nouveau** — INSERT catalogue `clic_plusvalue` (FK, `ON CONFLICT DO NOTHING`) |
| `app/api/mesure/route.ts` | `clic_plusvalue` ajouté à `NOMS_CLIENT` + au `switch` (ligne neutre `{nom}`) |
| `app/page.tsx` | bouton 694 « Calculer la plus-value » : `mesure("clic_estimation")` → `mesure("clic_plusvalue")` (SEUL) |
| `app/lib/analytics/lecture/metriques.ts` | `comptesAnalyses` (+4 champs) & `serieParTranche` (+3 requêtes, +4 champs `SeriePoint`) |
| `app/(admin)/admin/(protected)/statistiques/affichage.ts` | miroirs `ComptesAnalyses`/`SeriePoint`, `CleSerie` (+4 clés), helper `ratioPct` (garde ÷0) |
| `app/(admin)/admin/(protected)/statistiques/tuiles.tsx` | `GROUPES_SERIE` (+4 chips), `TuileAnalyses` (KPI + 2 ratios) |
| Tests | `metriques.test.ts`, `affichage.test.ts`, `rendu.test.ts`, `api/mesure/route.test.ts`, `lecture.itest.ts` |

## Revue adverse (Phase 4) → VALIDER

8 vecteurs attaqués, tous neutralisés : (a) bascule sur le SEUL bouton 694, grep exhaustif = 3 émetteurs uniques,
`total = plusvalue + estimation` couvre exactement les 2 CTA sans double-compte ; (b) `clic_plusvalue` dans
`NOMS_CLIENT` ET le `switch`, ligne neutre `{nom}` (test prouve que commune/verdict parasites ne s'y glissent
pas) ; (c) aucun `ventilerSous_k` sur les compteurs neutres, métriques k-safe existantes intactes ; (d) `ratioPct`
→ `null`/« — » pour dénominateur ≤ 0 / num non fini, jamais NaN/Infinity ; (e) émission fire-and-forget inchangée
(pas d'await/throw) ; (f) ordre des 6 `lireGrandLivre` correct, `totalEstimations` dérivé APRÈS remplissage ;
(g) types serveur/miroir cohérents, littéraux de test à jour ; (h) migration additive.

## Tests (Phase 5)

| Test | Résultat |
|---|---|
| `metriques.test.ts` (comptesAnalyses conversions + série conversions + total = somme) | **PASS** |
| `affichage.test.ts` (`ratioPct` : %, garde ÷0, num non fini, 0/positif) | **PASS** |
| `rendu.test.ts`, `api/mesure/route.test.ts` (clic_plusvalue accepté, ligne neutre) | **PASS** |
| Suite unitaire complète `npm test` | **PASS** — 76 fichiers, **891 passés**, 21 skipped, 0 échec |
| `tsc --noEmit` | **PASS** (miroirs client alignés, littéraux de test complétés) |
| **`lecture.itest.ts`** (SQL RÉEL : conversions cert/estimation par bucket) | **PASS** — 15/15 (voir écart C ci-dessous) |
| **Golden `pipeline.itest.ts`** | **PASS** — golden `29.107259068449615` inchangé |

## Phase 6 — Conformité SVAV

| Vérif | Résultat | Preuve |
|---|---|---|
| **Golden** | **PASS (inchangé)** | `pipeline.itest.ts` PASS ; aucun fichier moteur dans le diff |
| **Byte-unchanged** (password/motDePasse/proxy/garde) | **PASS** | `git diff --stat` vide |
| **k-anonymat** | **PASS** | `comptesAnalyses`/séries clic_* = SUM directe, JAMAIS `ventilerSous_k` (lignes neutres) ; k-safe existants inchangés |
| **Pilotage sans code** | **PASS** | événement ajouté au CATALOGUE (FK), pas de CHECK figé → extensible sans DDL de contrainte |
| **Aucune dépendance npm** | **PASS** | `package.json`/`package-lock.json` inchangés |
| **Gemini hors staging** | **PASS** | `adaptateurIaPhoto.ts`, `analyse-photo/route.ts` non touchés |
| **Mobile / no-blue / reduced-motion** | **PASS** | chips/KPI = tokens `svv` (ink/red/muted/green), ≥44px, CSS reduced-motion existant |
| **Migration additive, non exécutée** | **PASS** | `022` = `INSERT … ON CONFLICT DO NOTHING`, aucun DROP/TRUNCATE/ALTER ; appliquée à la main par Arno |

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

1. **`totalEstimations` sommé CÔTÉ SERVEUR (à la lecture), pas au client.** Le total est calculé dans
   `comptesAnalyses` et par bucket dans `serieParTranche` (après remplissage des deux composantes). *Alternative
   écartée* : sommer au client. *Raison* : source unique de vérité, cohérence série/KPI, et une chip « Total
   estimations » qui est UNE courbe précalculée (jamais une addition à l'écran → pas de triple-compte). *Impact* : nul.
2. **Dénominateur des ratios = VISITES (session_fin, post-compaction).** *Raison* : « estimations/visites » et
   « certificats/visites » sont des taux de conversion rapportés au trafic. *Conséquence tracée* : les visites
   n'existent qu'après le cron de compaction (Lot 3) tandis que les clics sont temps-réel → le ratio affiche
   « — » (jamais NaN) tant qu'aucune visite n'est comptée ; une note explicite le dit sous les KPI. *Alternative
   écartée* : rapporter aux résultats (temps-réel) — écartée car « /visites » est la conversion demandée.
3. **Couverture d'intégration `clic_plusvalue` volontairement PARTIELLE.** `lecture.itest.ts` sème
   `clic_certificat`/`clic_estimation` (au catalogue depuis 018) et prouve leur lecture sur vraie base, mais **ne
   sème PAS `clic_plusvalue`** : sa ligne catalogue vient de 022, appliquée manuellement et non garantie sur la
   base dev → un INSERT violerait la FK. *Décision* : asserter `plusvalue: 0` en intégration + couvrir la requête
   `clic_plusvalue` par le test mocké (`metriques.test.ts`, SQL structurellement identique). *Impact* : la lecture
   plus-value est prouvée en unitaire ; en intégration réelle elle le sera une fois 022 appliquée.
4. **`estVide` NON étendu aux conversions.** *Raison* : les 3 CTA vivent sur l'écran résultat → un clic implique
   toujours un `resultat` (déjà compté par `estVide`) ; les ajouter serait redondant. *Impact* : nul en pratique.

## B. DOUTES

1. **Historique non ré-attribuable (limite ASSUMÉE).** Les `clic_estimation` émis AVANT ce déploiement incluent
   les anciens clics « plus-value » (bouton 694). Après la bascule, l'historique ancien reste compté en
   `estimation_immo` (sur-compte le passé) et `plusvalue` démarre à 0 au déploiement (sous-compte le passé). Les
   deux séries ne deviennent nettes qu'à partir de la mise en service. *À décider par Arno* : accepter la
   discontinuité (recommandé — pas de réécriture de données) ou afficher un marqueur « depuis le JJ/MM » sur ces
   séries. Aucune donnée n'a été modifiée (règle dure respectée).
2. **`clic_estimation` conserve son libellé historique** alors qu'il ne désigne plus que « Estimation immobilière »
   (vis-à-vis). Le libellé UI est « Estimation immo » (clair) ; le nom d'événement reste `clic_estimation` pour
   ne pas casser l'historique. Pas d'action requise ; noté pour cohérence.

## C. ÉCARTS DE CONFORMITÉ

- **`lecture.itest.ts` a ÉCHOUÉ au premier run d'intégration complet** (1/54) : la fixture `serieParTranche`
  figeait l'ANCIENNE forme `SeriePoint` (6 champs) ; ma série en compte désormais 10. **Écart détecté et CORRIGÉ
  DANS LE RUN** : fixture mise à jour + **couverture ajoutée** des conversions sur vraie base (cert/estimation).
  Re-run isolé : **15/15 PASS**. Ce n'était PAS le golden (`pipeline.itest.ts` est resté vert). Aucun mouvement
  du golden. Tracé ici par honnêteté même si résolu.
- Tous les autres invariants : **PASS**.

## Séquence de déploiement OBLIGATOIRE (Arno)

> ⚠️ **Ordre critique** : appliquer 022 AVANT de déployer le front. Sinon, entre le déploiement front et 022, le
> bouton 694 émet `clic_plusvalue` que la FK REJETTE (avalé best-effort) → clics plus-value **perdus** sur cette
> fenêtre (aucun crash, mais donnée manquante).

1. `psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/022_clic_plusvalue.sql`
   Vérifier : `SELECT * FROM analytics_catalogue_evenement WHERE nom = 'clic_plusvalue';`
2. Déployer le code (front bouton 694 + serveur `NOMS_CLIENT` + lecture + affichage).
3. Vérifier la voie : un clic « Calculer la plus-value » → une ligne `clic_plusvalue` dans `analytics_compteur_jour`.
4. **SEULEMENT ENSUITE**, committer (format SVAV : un chantier = un commit).

## Recon de validation indépendante (Phase 8) → **VALIDER**

9/9 invariants PASS (byte-unchanged, Gemini, moteur/golden, npm, migration additive, k-anonymat, catalogue/FK,
UI mobile/no-blue, instrumentation 1 bouton). Réserve opérationnelle unique, hors code : appliquer 022 avant mise
en service.

## Confirmation finale

Aucun commit. Migration 022 additive **non exécutée**. Golden `29.107259068449615` inchangé. Byte-unchanged sur
les 4 fichiers gelés. Aucune dépendance npm. Compteurs neutres restitués hors k-anonymat ; métriques k-safe
existantes intactes. Livraison prête — **appliquer 022 avant déploiement**.
