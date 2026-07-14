# RAPPORT DE BUILD — Module Internaute, LOT C : accordéon « Voir » + compteur LIVE + texte descriptif

> Run `/svav-build` autonome. **Aucun commit** (livraison à Arno). Golden `29.107259068449615` **NON concerné**
> (aucun fichier moteur/score/pipeline/migration/ingestion touché ; `extraction.ts` NON modifié — ses builders
> `clauseStatuts`/`construireFiltres` sont RÉUTILISÉS tels quels). 3 évolutions front sur la page Internautes admin.

## Fichiers touchés (5)
- **`app/lib/internaute/extractionRepo.ts`** — nouvelle `compterProfils(filtres, statuts)` réutilisant EXACTEMENT
  `clauseStatuts` + `construireFiltres` + `clauseWhere` ; court-circuit fail-closed en tête (`normaliserStatuts([]) → 0`).
- **`app/lib/internaute/extractionRepo.test.ts`** — +4 tests `compterProfils` (fail-closed sans requête, réutilisation
  des builders / pas de FROM brut, coercition, forgé → 0).
- **`app/(admin)/api/admin/internautes/compte/route.ts`** (NOUVEAU) — GET, garde `exigerAdministrateur`, `lireFiltres` +
  `lireStatuts`, `compterProfils` → `{ total }`. Lecture seule, fail-closed hérité.
- **`app/(admin)/admin/(protected)/internautes/InternautesVue.tsx`** — (A) `Champ`/`labelPayload`/`LABEL_PAYLOAD`
  ré-introduits + composant `DetailAnalyse` (affichage complet depuis `p`) + état `analysesOuvertes: Set<string>` multi-ouvert
  dans `FicheDetail` + bouton « Voir » à gauche de « Tester » + dépliage inline dans le conteneur scrollable ; (B) états
  `compte`/`compteChargement`, effet débouncé 300 ms, compteur centré dans la barre.
- **`app/(admin)/admin/(protected)/internautes/page.tsx`** — texte descriptif (`:25`, occurrence unique).

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — Compteur = filtres LIVE (`filtres`) + statuts SOURCE (`statuts`), pas `applique`.** La spec veut un compteur
DÉBOUNCÉ « à chaque changement de filtre ». Choix : suivre `filtres` (édités en direct) + `statuts` (source) → le compteur
**prévisualise** ce que l'export CSV sortira, et **coïncide exactement avec « Exporter (CSV) » une fois « Filtrer » cliqué**
(l'export CSV utilise `applique`). Alternative écartée : suivre `applique` (égalité permanente au bouton export, mais plus de
mise à jour live pendant l'édition). Impact : pendant l'édition des filtres, le compteur montre le résultat des filtres EN
COURS ; ils convergent au clic « Filtrer ». Sémantique OPTION 1 respectée (source + filtres secondaires, `q` ignoré).

**A2 — Le compteur suit `statuts` (SOURCE), jamais `statutsMiroir`.** Cohérent avec l'export (piloté par la source) et avec
OPTION 1. `toggleMiroir` (liste) ne recompte pas ; `toggleStatut` (source) recompte. Alternative écartée : suivre le miroir
(ce serait « == liste », pas « == export »). Impact : le compteur reflète l'export, pas la liste affichée.

**A3 — Centrage du compteur via `margin:'0 auto'` + retrait du `marginLeft:auto` de « Exporter (CSV) ».** Le compteur absorbe
l'espace libre des DEUX côtés → centré entre « Réinitialiser » et les exports. Alternative écartée : layout grid/absolu.
Impact : centrage vrai en une ligne (desktop) ; en `flexWrap` mobile, best-effort (repli propre quand la barre passe sur
plusieurs lignes).

**A4 — Libellé compteur « N internaute(s) extractible(s) » ; bouton « Voir » ↔ « Masquer ».** Spec : « N internaute(s) » ou
« N résultat(s) extractible(s) ». Choix : « internaute(s) extractible(s) » (clair) ; « Masquer » à l'état ouvert (lisibilité).
Impact : cosmétique.

**A5 — Clé d'ouverture de l'accordéon = id d'analyse (`String(p.id ?? idx)`), `Set<string>` multi-ouvert.** Spec autorisait
`Set<idx>` OU id. Choix : l'id (stable, robuste au ré-ordonnancement). État LOCAL à `FicheDetail` → remis à zéro quand la
fiche remonte (changement d'internaute) → pas de fuite d'état entre profils. Impact : none.

**A6 (C) — Coquille d'Arno corrigée.** Chaîne appliquée : « Base des internautes ayant consenti **à au moins un des trois
consentements RGPD** de l'application publique — réservé aux administrateurs. » (Arno avait écrit « à au moins » + « consentement »
au singulier ; correction FR appliquée avec son accord explicite). Voir doute **B1** pour la version littérale.

**A7 — Pas de `SET TRANSACTION READ ONLY`.** Conforme à la consigne (count non-mutant ; absent du repo → ne pas l'introduire).
Le `SELECT count(*)` est intrinsèquement lecture seule ; le helper `query` mono-instruction suffit.

## B. DOUTES

**B1 — Texte : version corrigée vs littérale.** J'ai appliqué la version corrigée (A6). Si Arno préfère sa formulation
littérale exacte, c'est un changement d'UNE ligne (`page.tsx:25`).

**B2 — Compteur « live » vs « appliqué ».** Le compteur prévisualise `filtres` (live) ; il n'est identique au bouton
« Exporter (CSV) » (qui lit `applique`) qu'après « Filtrer ». Si Arno veut une égalité PERMANENTE au bouton export, basculer
la dépendance de l'effet de `filtres` vers `applique` (perte de la prévisualisation live). Retenu : live (conforme à la
demande de débounce à chaque changement).

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Batterie de conformité (Phase 6) :
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier
  du chemin de calcul touché ; `extraction.ts` NON modifié — `git diff` vide).
- **FAIL-CLOSED RGPD (verrou du chantier)** : **double barrière** prouvée — (1) `compterProfils` court-circuite à `0` SANS
  requête si statuts normalisés vides (`extractionRepo.ts`, même patron que `:46,69,129`) ; (2) `clauseStatuts([])` → `WHERE
  false` (`extraction.ts:70`). Le COUNT passe UNIQUEMENT par `clauseStatuts` (aucun `FROM internaute` brut). Côté front,
  court-circuit à 0 si `statuts.size === 0` → aucun appel serveur. Route COUNT **admin-gated** (`exigerAdministrateur`).
- **COUNT == EXPORT** : le compteur envoie `versParams(filtres)` (qui n'ajoute JAMAIS `q`) + `statuts` (source) → mêmes
  critères que l'export CSV, `q` ignoré. Prouvé : `versParams` (`:81-92`) sans `q` ; l'effet compteur ne `set('q', …)` jamais.
- **VERDICT DÉCOUPLÉ** : aucun calcul de verdict/score ; le compteur COMPTE des lignes déjà persistées, l'accordéon AFFICHE
  des données déjà chargées. Aucun couplage introduit. Aucun pont M2.
- **RGPD** : le panneau « Vérification » reçoit toujours `actionsProjet` (Test + Voir) mais **JAMAIS `actions`** (Rectifier/
  Effacer) — inchangé. L'accordéon n'expose que les analyses DÉJÀ chargées de la personne (route détail admin-gated) ; aucune
  requête ni persistance nouvelle ; aucune suppression.
- **CONFIG / ST_Force2D / HAUTEUR / GEMINI** : non concernés (aucune constante moteur, aucune opération distance/raster, aucun
  fichier Gemini).

## Preuves
- **`compterProfils` fail-closed & builders partagés (4 tests)** : `compterProfils({}, [])` → `0`, `query` JAMAIS appelé ;
  statuts forgés (normalisés vides) → `0` sans requête ; statuts valides → SQL contient `count(*)` **et**
  `internaute_consentement_actif` (preuve : passe par `clauseStatuts`, pas un FROM brut), **zéro `OR`**, filtre secondaire LIÉ
  en paramètre ; `rows: []` → `0` (jamais `NaN`).
- **Compteur front** : effet `:376-402` — court-circuit `statuts.size===0 → setCompte(0)` sans fetch ; tous les `setState`
  DIFFÉRÉS dans le `setTimeout` (aucun `set-state-in-effect`) ; garde `annule` ; deps `[filtres, statuts]`.
- **Accordéon** : `analysesOuvertes: Set<string>` (multi-ouvert) ; ligne + `{ouvert ? <DetailAnalyse p={p}/> : null}` DANS le
  conteneur `maxHeight:5*60 / overflowY:auto` (plafond 5 lignes inchangé, le scroll absorbe) ; `DetailAnalyse` réaffiche
  bien + payload résiduel + lat/lon/azimut/hauteurs + verdict/score/date, TOUT depuis `p` (aucune requête).
- **Vérification étanche** : `<FicheDetail detail={detail} actionsProjet={…} />` (Vérification) — pas de prop `actions`.
- **Texte** : `page.tsx:25` remplacé (occurrence UNIQUE, grep confirmé au recon).
- **Builders intacts** : `git diff app/lib/internaute/extraction.ts` = vide.

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` (5 fichiers) : **PASS** (0 problème ; **aucun** `eslint-disable` ; effet compteur sans `set-state-in-effect`).
- `npm test` : **PASS** — 84 fichiers, **1017 tests** (+4 `compterProfils`), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden `29.107259068449615` bit-identique**.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue adversariale indépendante (sous-agent, 14 outils, périmètre re-vérifié par `git`) → **VALIDER**. Les 8 invariants
TENU, prouvés fichier:ligne : fail-closed du COUNT (court-circuit `→0` sans requête + `WHERE false`, jetons forgés vidés par
`normaliserStatuts`), `q` non transmis, suit `statuts` source (pas le miroir), route GET admin-gated non-mutante (import
5 niveaux correct), effet sans `set-state-in-effect` (tout différé) + garde anti-course, accordéon multi-ouvert dans la zone
scrollable réaffichant tout `p` sans requête et sans fuite entre profils, étanchéité Vérification préservée, `extraction.ts`/
moteur/golden intacts, pluriel/coercition/centrage corrects.

**3 constats du reviewer — traités :**
1. **(Risque moyen) Commentaires « == l'export » trompeurs hors état appliqué** — le compteur suit `filtres` (live), l'export
   lit `applique` : égalité seulement après « Filtrer ». **CORRIGÉ** : commentaires `:306` et `:372` reformulés (« coïncide
   avec l'export une fois Filtrer cliqué »). Le COMPORTEMENT (live) reste la décision A1/B2 tranchée par Arno (bascule d'UNE
   ligne `filtres`→`applique` s'il veut l'égalité permanente). Ni fuite ni régression d'étanchéité (l'export reste borné par
   les statuts + fail-closed).
2. **(Défense en profondeur) Reset de `analysesOuvertes` implicite** — reposait sur le démontage via `detail=null`.
   **CORRIGÉ** : `key={detailId}` / `key={ouvert}` ajoutés aux 2 appels de `FicheDetail` → reset explicite et immunisé contre
   une refacto future. Aucun bug actuel.
3. **(Cosmétique) « — » bref avant le 1er comptage** (300 ms de débounce) — noté, acceptable, non corrigé.

Corrections re-vérifiées : `tsc` 0, `eslint` 0 (changements = commentaires + `key`, aucune logique touchée → `npm test`
1017 et golden 54/54 inchangés). Doutes non bloquants restants : B1 (texte corrigé vs littéral), B2 (compteur live vs appliqué).
