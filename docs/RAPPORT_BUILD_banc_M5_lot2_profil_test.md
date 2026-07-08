# RAPPORT — build « Banc M5 · Lot 2 : profil de test synchronisé »

> Fondation DONNÉES du profil de test (clone immuable + statut des variables + récap des écarts), module PUR.
> Décorrélation prouvée sur le golden. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Résumé
Nouveau module pur `app/lib/svv/profilTest.ts` : `clonerProfil` (snapshot profondément indépendant du profil
ACTIF), `STATUT_VARIABLE`/`VARIABLES_VESTIGIALES` (VIVE/VESTIGIALE/GARDE, BE-21a), `diffProfils` (récap des
écarts actif→test, scalaires + cartes ADD/DEL/MOD, BE-25/25a/25b), re-export `validerCartesAnnee` (chevauchement,
BE-24). Le profil de test s'injecte tel quel via `analyserAdresse({ profil })` → `config_scoring` live non lu
(décorrélation totale, sans fork moteur). Golden `29.107259068449615` **bit-identique** ; `test:integration`
**20/20** (+3) ; `npm test` **436** (+13). Aucune écriture DB, aucune migration.

## Fichiers (1 nouveau module + 2 tests)
- `app/lib/svv/profilTest.ts` (NEW, pur) — clone, statut, diff, re-export validation cartes.
- `app/lib/svv/profilTest.test.ts` (NEW) — 13 tests unitaires (immutabilité, statut, récap, chevauchement).
- `app/lib/db/pipeline.itest.ts` (+3 tests golden) — BE-20 (clone→même score + actif non muté), BE-20 (variable
  VIVE change le score, pas l'actif), CA-2.6 (variable VESTIGIALE `boostF2` sans effet).

## A. DÉCISIONS HORS-SPECS
- **A1 — PÉRIMÈTRE : fondation données PURE, PAS l'éditeur UI 38-champs.** ⚠️ **À arbitrer par Arno.** La SPEC Lot 2
  (BE-21/22/25) comporte une part UI (édition inline des 38 variables + CRUD cartes + rendu du récap). La section
  « Implémentation » du prompt décrit UNIQUEMENT le mécanisme backend (clone immuable, injection via `params.profil`,
  réutilisation du seam, « profil test == actif → même score ») et impose « ni plus ni moins » + « ne devine pas ».
  Décision : livrer la **fondation données** (clone + statut + diff + validation) — testable, golden-safe, consommable
  telle quelle par l'UI. **NON livré** : le composant React d'édition des 38 variables + le rendu visuel du récap
  (BE-21/22/25 UI), pour ne pas deviner une grosse surface d'interface non décrite. Alternative écartée : bâtir l'éditeur
  complet → aurait dépassé la section « Implémentation » et anticipé des choix d'ergonomie (groupement, layout mobile)
  non tranchés. → **Question ouverte pour Arno** : la suite (éditeur inline + récap visuel) est-elle un Lot 2b séparé, ou
  attendue maintenant ?
- **A2 — Split « build entree ×1 + analyser ×N » NON fait ici (= Lot 5, BE-50bis).** Le prompt le mentionne, mais la SPEC
  place le calcul unique de géométrie + double exécution + comparaison dans le **Lot 5** ; le prompt impose aussi « respecte
  le périmètre du Lot 2 borné par la SPEC ». Décision : la décorrélation du Lot 2 est prouvée en injectant le clone via
  `analyserAdresse({ profil })` (le point d'injection existant) ; le refactor de `pipeline.ts` exposant un `construireEntree`
  réutilisable pour N profils reste au **Lot 5**. Alternative écartée : splitter `analyserAdresse` maintenant → aurait
  anticipé le Lot 5 et touché un fichier sensible sans nécessité pour le Lot 2.
- **A3 — Clone via `structuredClone`.** `ProfilDegagement` est de la donnée pure (nombres/chaînes/tableaux/objets simples,
  aucune fonction/Date) → `structuredClone` garantit un clone profond sans référence partagée (vérifié par test : muter
  `mh.cone`, `orientationPts`, `famillesAnnee[i]` ne touche pas la source). Alternative écartée : deep-clone manuel
  (verbeux, risque d'oubli d'un champ imbriqué).
- **A4 — `diffProfils` : comparaison des cartes d'année POSITIONNELLE (par index).** Les cartes sont ordonnées et
  non chevauchantes ; ADD/DEL/MOD dérivés de la comparaison index à index. Alternative écartée : appariement par
  intervalle (plus lourd, non requis par BE-25b qui demande seulement ADD/DEL/MOD).
- **A5 — Statut des variables (`STATUT_VARIABLE`).** 4 VESTIGIALES (SPEC §0 : `boostF2`, `forfaitConeCentral`,
  `forfaitExtremites`, `coneF3DemiAngleDeg`) ; 2 GARDE (`modeCombinaison`, `modeCombinaisonRepli` = enums fermés) ;
  les 15 autres VIVES. Sert à griser l'UI (BE-21a) et le récap ; testé.

## B. DOUTES
- **B1 (mineur)** — `diffProfils` regroupe par CHEMIN de variable (dotted path) + statut, mais ne fait pas le
  regroupement visuel « par famille » de BE-25a (dégagement/cône, couloir, orientation, cartes…) : ce regroupement est
  une préoccupation de RENDU (UI), naturellement porté par le composant récap non livré (A1). Les données nécessaires
  (champ + statut) sont présentes.
- **B2 (mineur)** — `diffProfils` compare `naturesRemarquables` comme un seul écart (tableau entier), pas élément par
  élément. Suffisant pour le récap (BE-25 : « variable modifiée ») ; un diff fin par libellé serait cosmétique.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **20/20**, `29.107259068449615` **bit-identique**. Preuves : BE-20 (clone du profil
    de référence → même score) ; BE-20 (variable VIVE `plafondDegagement`×2 → score ≠ golden, MAIS actif reste 29.107) ;
    CA-2.6 (variable VESTIGIALE `boostF2=5` → score inchangé, confirme le statut vestigiale).
  - **DÉCORRÉLATION SANS FORK** : le profil de test s'injecte via le point `params.profil` existant ; aucun chemin de
    calcul dupliqué ; le seam Lot 1 (`ventilation`) reste la source de la ventilation (non retouché).
  - **NO-WRITE** : `profilTest.ts` est PUR (grep INSERT/UPDATE/DELETE/pool/query = vide) ; aucune migration ; le profil
    de test n'est jamais persisté (BE-27).
  - **IMMUTABILITÉ** : `clonerProfil` ne mute jamais la source (testé sur champs imbriqués + cartes) → le profil ACTIF
    (et `PROFIL_GOLDEN_REF`) restent intacts (BE-4).
  - **ISOLATION dure** : `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict.ts`, `coucheDegagement.ts`
    (seam Lot 1), `scoreTotal.ts`, migrations — **intouchés**. `git status` (hors docs) = `profilTest.ts` (new) +
    `profilTest.test.ts` (new) + `pipeline.itest.ts` (M, tests seuls).
  - **VERDICT DÉCOUPLÉ** : rien touché côté verdict ; le profil de test ne pilote que la note /80 (comme le profil actif).
  - **PILOTAGE SANS CODE** : `STATUT_VARIABLE` matérialise la distinction VIVE/VESTIGIALE/GARDE demandée par l'invariant.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **436** · `next build` **✓**.

## Verdict de conformité : livraison prête (fondation données du profil de test). Décorrélation prouvée sur le golden,
## immutabilité garantie, module pur sans écriture. **Point d'attention A1** : l'éditeur UI (BE-21/22/25) et le split
## Lot 5 (BE-50bis) ne sont PAS inclus — à cadrer avec Arno avant la suite.
