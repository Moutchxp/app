# RAPPORT DE BUILD — Module Internaute : sélection MULTIPLE de statuts F1/F2/F3 en ET (intersection)

> Run `/svav-build` autonome. Aucun commit (livraison à Arno). Golden `29.107259068449615` NON concerné (module
> cloisonné, aucun fichier moteur/migration/ingestion/tunnel touché — vérifié `git diff --name-only`). Remplace le
> modèle « axe unique + restricteurs aF2/aF3 » (Lot 2) par une multi-sélection de statuts combinés en AND.

## Fichiers touchés (7 : 6 + 1 nouveau test)
- `app/lib/internaute/extraction.ts` — `clauseStatuts` (EXISTS en AND + fail-closed `WHERE false`), `exprConsentiLe`,
  `normaliserStatuts` (liste blanche + ordre canonique), `lireStatuts` (remplace `lireAxe`), `assertFinalite`,
  `STATUTS_EXPORT`/`FINALITE_F1` (remplacent `AXES_EXPORT`/`AXE_DEFAUT`) ; `aF2/aF3` retirés de `FiltresExtraction`,
  `construireFiltres`, `lireFiltres`.
- `app/lib/internaute/extractionRepo.ts` — les 3 fonctions prennent `statuts` + **court-circuit fail-closed** (vide →
  `{total:0,lignes:[]}` / `[]` SANS requête) ; SELECT `consenti_le` = `exprConsentiLe(statuts)` ; journal `statuts`.
- `app/(admin)/api/admin/internautes/route.ts` (liste) et `export/route.ts` — `lireStatuts` → passage aux fonctions repo.
- `app/(admin)/admin/(protected)/internautes/InternautesVue.tsx` — 3 toggles multi-sélection, `toggleStatut`, garde
  « aucun statut » (état `aucun_statut` + boutons export désactivés), picto « i » déplacé à droite de F3, légende ET.
- `app/lib/internaute/extraction.test.ts` — tests d'étanchéité réécrits pour le modèle multi-statuts.
- `app/lib/internaute/extractionRepo.test.ts` (**NOUVEAU**) — prouve la garde FAIL-CLOSED du repo (mock `query` :
  sélection vide → résultat vide, `query` jamais appelé). Répond à la recommandation du reviewer.

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno en priorité)

**A1 — `consenti_le` unifié en `max(horodatage)` sur les finalités de référence.** La spec dit « si F1 coché →
horodatage F1 ; sinon → le plus récent des cochés ». J'unifie en `SELECT max(horodatage) … WHERE finalite IN (ref)`
avec `ref = [F1]` si F1 coché, sinon les statuts cochés. Pour `{F1}`, `max` sur l'unique ligne F1 = l'horodatage F1
(exactement la spec). Alternative écartée : deux branches SQL distinctes (plus verbeux, même résultat). Impact :
affichage seulement (jamais d'étanchéité — c'est une colonne SELECT, pas un WHERE).

**A2 — Défaut UI = {F1} (au chargement).** La spec ne fixe pas l'état initial. Choix : la page charge avec F1 coché
(vue « recontactables », continuité avec l'existant) plutôt qu'une sélection vide (qui afficherait d'emblée le
message « cochez un statut »). Alternative écartée : démarrer vide. Impact : premier rendu = population F1 ; l'admin
décoche/recoche librement.

**A3 — `lireCommunesPresentes(statuts = [FINALITE_F1])` : défaut [F1], route `communes/` NON touchée.** La route du
picker géo n'est pas dans le périmètre ; elle appelle `lireCommunesPresentes()` sans argument → défaut [F1]
(comportement historique conservé). Le câbler sur les statuts cochés (+ re-fetch à chaque toggle) est un affinage
ultérieur, sans effet aujourd'hui (aucun profil F2-only). Alternative écartée : toucher `communes/route.ts` (hors
périmètre). Impact : le picker liste les communes F1 quel que soit l'ensemble coché — aucune fuite (filtre géo `AND IN`
restrictif ; l'export reste borné par `clauseStatuts`).

**A4 — Convention du query param : `statuts=cle1,cle2` (CSV).** La spec ne fixe pas le format. Choix CSV (cohérent
avec le param `communes=…` existant). Alternative écartée : `statut` répété. Impact : nul (interne admin ; serveur
re-normalise).

**A5 — Journal : le champ `axe` du log (Lot 2) devient `statuts` (liste jointe).** Renommage d'accountability, toujours
dans le blob jsonb existant (aucune migration). `acces_profil` (qui ne passe pas de statuts) reste inchangé.

**A6 — `assertFinalite` conservé en défense en profondeur.** `normaliserStatuts` écarte déjà tout jeton hors liste
blanche → `assertFinalite` (regex `[a-z0-9_]+`) ne peut jamais throw pour un statut normalisé. Conservé comme garde
si un futur appelant bypassait `normaliserStatuts`. Impact : nul en usage normal ; filet anti-injection.

## B. DOUTES

**B1 — Preuve d'étanchéité au niveau CONSTRUCTION SQL (pas DB).** Aucun harnais d'intégration internaute n'existe (les
`*.itest.ts` couvrent svv/db/analytics). Les propriétés (zéro-OR, fail-closed, étanchéité croisée) sont prouvées par
tests PURS sur la chaîne SQL générée. La correspondance « EXISTS(finalité active) ⟺ appartenance à la population »
repose sur la vue `internaute_consentement_actif` (023 : 1 ligne par (internaute,finalité), `actif` = dernière
décision `accorde`). Un test DE DONNÉES exigerait un nouveau harnais internaute → recommandé pour un lot ultérieur.

## C. ÉCARTS DE CONFORMITÉ

Aucun. Batterie :
- GOLDEN : `npm run test:integration` → 8 fichiers / 54 PASS, golden `29.107259068449615` inchangé (aucun fichier
  moteur touché).
- RGPD : porte de CRÉATION inchangée (ingestion/socle non touchés → reste F1-only) ; effacement/purge non touchés
  (déjà agnostiques) ; **fail-closed** renforce la minimisation (une sélection vide ne peut PAS exporter la base) ;
  accountability des statuts au journal. Aucune donnée supprimée/écrasée.
- CONFIG EXTERNALISÉE / VERDICT DÉCOUPLÉ / GEMINI / fichiers gelés : n/a ou non touchés.

## Preuve ZÉRO-OR
`clauseStatuts([F1,F2,F3])` → `FROM internaute i LEFT JOIN LATERAL(...) p WHERE i.opposition_recontact = false AND
i.efface_a IS NULL AND EXISTS(ca_recontact_interne … 'recontact_interne' … actif) AND EXISTS(ca_email_marketing …) AND
EXISTS(ca_retargeting_tiers …)`. Les statuts sont joints par `'\n    AND '` (jamais OR) ; les filtres secondaires de
`construireFiltres` sont aussi en AND. Test : chaque cas asserte `not.toMatch(/\bOR\b/)` (« ORDER BY » ≠ OR).

## Preuve GARDE FAIL-CLOSED
Double barrière : (1) **repo** — `lireProfilsFiltres`/`lireProfilsExport` font
`if (normaliserStatuts(statuts).length === 0) return { total: 0, lignes: [] } / []` AVANT toute requête ; (2)
**builder** — `clauseStatuts([])` → `FROM_BASE + "  WHERE false\n"` (matche rien, aucune contrainte de finalité
manquante). `lireStatuts` ne retombe JAMAIS sur un défaut F1 pour une sélection vide/inconnue. Front (confort) :
`aucunStatut` → effet fetch court-circuité + boutons export sans `href` (non cliquables) — le serveur reste l'autorité.

## Preuve ÉTANCHÉITÉ CROISÉE
`clauseStatuts([F1])` ne mentionne QUE `recontact_interne` (EXISTS) → un F2-only (sans F1 actif) échoue l'EXISTS →
exclu. `clauseStatuts([F2])` ne mentionne QUE `email_marketing` → un F1-only (sans F2 actif) exclu. `{F1,F2}` exige
les DEUX EXISTS actifs. Tests dédiés (`ÉTANCHÉITÉ CROISÉE`, `{F1,F2,F3}` = 3 EXISTS).

## Non-régression mono-statut {F1} vs Lot 1/2
`{F1}` produit `EXISTS(recontact_interne actif) AND opposition_recontact = false AND efface_a IS NULL`. La vue ayant
1 ligne/(internaute,finalité), `EXISTS(finalité active)` sélectionne EXACTEMENT les mêmes internautes que l'ancien
`INNER JOIN … ca.finalite='recontact_interne' AND ca.actif` (pas de fan-out possible) → **population identique** ;
`consenti_le` = horodatage F1 (identique). La forme SQL change (JOIN→EXISTS, délibéré pour supporter N statuts) mais
le résultat est équivalent.

## Vérifications (les 4 exigées)
- `npx tsc --noEmit` : PASS (exit 0).
- `npx eslint` (7 fichiers) : PASS (0 problème).
- `npm test` : PASS — 82 fichiers, 983 tests, 21 skipped. (Un run a affiché un « 1 failed » TRANSITOIRE — flake
  d'un test unitaire pré-existant ; re-run propre à 983 passed, 0 échec ; le test ajouté passe 4/4 en isolation,
  aucune fuite de mock — isolation vitest par fichier.)
- `npm run test:integration` : PASS — 54 tests, golden `29.107259068449615` bit-identique.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue adversariale indépendante (sous-agent, analyse statique des 7 fichiers + vue SQL `023` + callers + git HEAD),
5 propriétés :
- **P1 ZÉRO-OR — SÛR** : EXISTS joints exclusivement par `AND` (`extraction.ts:78`) ; le seul `IN(...)` est dans la
  sous-requête SELECT `exprConsentiLe` (`:96`), jamais en FROM/WHERE.
- **P2 FAIL-CLOSED — SÛR** : garde primaire au bon endroit (repo, AVANT build/exec — `extractionRepo.ts:46,69`) +
  défense en profondeur (`clauseStatuts([]) → WHERE false`, `exprConsentiLe([]) → NULL`).
- **P3 ÉTANCHÉITÉ CROISÉE — SÛR** : vue à 1 ligne/(internaute,finalité) (`023:125-134`) ; `{F1}` exclut un F2-only,
  `{F2}` exclut un F1-only, `{F1,F2}` exige les deux.
- **P4 NON-RÉGRESSION {F1} — SÛR** : `EXISTS ⟺ INNER JOIN` sur la vue à ligne unique → population identique ;
  opposition + efface_a + `consenti_le` (horodatage F1) conservés.
- **P5 INJECTION — SÛR** : double garde (liste blanche `normaliserStatuts` + regex `assertFinalite` ; `$` sans flag
  `m` matche bien la vraie fin de chaîne). Aucun code mort de l'ancien modèle.

**Recommandations non bloquantes du reviewer, traitées :**
- (1) *Tester la garde primaire du repo (sans appeler `query`)* → **FAIT** : `extractionRepo.test.ts` (mock `server-only`
  + `../db/client`) prouve `lireProfilsFiltres/Export/CommunesPresentes([])` → vide, `query` JAMAIS appelé (4 tests).
- (2) *Court-circuit explicite dans `lireCommunesPresentes`* → **FAIT** (`extractionRepo.ts`, `if normaliserStatuts([]).length===0 return []`).
- (3) *Rendre `/\bOR\b/` insensible à la casse* → **DÉCLINÉ (justifié)** : notre SQL est généré avec des mots-clés
  TOUJOURS en MAJUSCULES → un `or` minuscule ne peut pas apparaître comme mot-clé. `/i` INTRODUIRAIT au contraire un
  risque de faux positif sur une sous-chaîne de données (« or » dans un identifiant futur). `/\bOR\b/` est correct et
  plus sûr pour nos chaînes.

**Rien à corriger** (verdict VALIDER ; les 3 recommandations étaient non bloquantes, 2 appliquées, 1 déclinée avec motif).
