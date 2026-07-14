# RAPPORT DE BUILD — Banc de test : bouton « Street View » au point snappé, orienté azimut

> Run `/svav-build` autonome. **Aucun commit** (livraison à Arno). Golden `29.107259068449615` **NON concerné** (aucun
> fichier moteur/pipeline/migration/ingestion/route touché ; `pipeline.ts` lu en LECTURE SEULE pour comprendre le snap).
> Périmètre : page Banc de test uniquement (`BancSaisie.tsx` + nouveau module pur `streetView.ts`).

## Fichiers touchés (3)
- **`app/(admin)/admin/(protected)/banc-test/streetView.ts`** (NOUVEAU, pur) — `urlStreetView(point, headingDeg)` → URL
  Google Street View pano (`viewpoint=lat,lon` + `heading` normalisé `[0,360)`), format officiel exact.
- **`app/(admin)/admin/(protected)/banc-test/streetView.test.ts`** (NOUVEAU, +4 tests).
- **`app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx`** — état `runSnappe` (point snappé figé au run) + capture
  dans `lancer()` succès + bouton « Street View » pleine largeur après les deux graphiques.

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — Point envoyé = `runSnappe` (SNAPPÉ, figé au run), jamais le brut — MAIS la carte affichée dessine le brut.**
⚠️ Nuance importante confirmée au recon : la carte « Vue de la map analysée » dessine le faisceau rouge sur
**`runParams.point` = le point BRUT pré-snap** (`BancSaisie.tsx:656-657`), et NON sur le point snappé. La prémisse de la
spec (« faisceau dessiné sur le point snappé ») ne correspond donc pas au code. Choix : envoyer à Street View le **point
SNAPPÉ** (`runSnappe` = `snappe` = miroir client de `validation.pointSnappeWgs84`), conformément à l'INTENTION explicite
de la spec (« le point RÉELLEMENT analysé »). Le point snappé n'est PAS renvoyé par `comparerProfils`/la route (grep vide) ;
son seul porteur client est `snappe` (issu de `/api/origine`, même `validerOrigine(point, mode)` que `construireEntree`).
Alternative écartée : envoyer `runParams.point` (brut — cohérent avec le faisceau AFFICHÉ, mais PAS le point analysé).
Impact : Street View ouvre au point façade réellement analysé (≤ quelques mètres du marqueur brut affiché). Voir doute **B1**.

**A2 — `runSnappe` FIGÉ au run (pas le `snappe` live).** Capturé dans `lancer()` succès (`BancSaisie.tsx:359`) en même
temps que `runParams` → cohérent avec l'analyse affichée. Si l'opérateur édite le point APRÈS le run (comparatif « périmé »),
Street View pointe toujours le lieu analysé. Alternative écartée : `snappe` live (dériverait après édition). Impact : robustesse.

**A3 — Bouton `svv-btn svv-btn-outline`, pleine largeur.** `.svv-btn` est déjà `width:100%` (`globals.css:30`) → le bouton
épouse la largeur de la section (= largeur des cartes). Variante `outline` (action auxiliaire, vs `primary` rouge du « Lancer
le test »). Alternative écartée : `primary`. Impact : cosmétique.

**A4 — Bouton HORS du bloc comparaison, tout en bas de la section.** Toujours visible, **désactivé** tant qu'aucune analyse
n'a produit de point snappé (`!runSnappe || !runParams`) → colle à « désactivé si aucune analyse rejouée ». Placé APRÈS le bloc
qui contient les deux graphiques. Alternative écartée : à l'intérieur du bloc (visible seulement après un run, jamais désactivé).

**A5 — URL en littéral (virgule NON encodée), pas `URLSearchParams`.** Respecte le format Google exact
`…viewpoint=LAT,LON&heading=…` (`URLSearchParams` encoderait la virgule en `%2C`). `lat`/`lon` sont des NOMBRES (état) →
aucune injection possible ; précision complète conservée. Heading normalisé `[0,360)`.

**A6 — RGPD (documenté, non bloquant) : lat/lon dans l'URL Google, AUCUNE donnée nominative.** L'URL Street View contient
forcément la coordonnée (fonctionnement Google, inévitable). Acceptable ici : le banc manipule un profil de TEST (clone du
profil actif), **pas la fiche nominative** ; on envoie une coordonnée de BÂTIMENT à Google, sans nom/email/téléphone, sans
pont vers l'identité. Le point est de surcroît le point snappé (façade), non une saisie personnelle persistée.

## B. DOUTES

**B1 — Divergence AFFICHAGE (faisceau sur brut) vs Street View (point snappé).** La carte « Vue de la map analysée » dessine
le faisceau sur `runParams.point` (brut) tandis que Street View ouvre au point snappé. C'est une incohérence PRÉ-EXISTANTE
d'affichage (le moteur analyse le point snappé, mais la carte trace le brut) que ce chantier ne crée pas et ne corrige pas.
Si Arno veut l'alignement complet, faire aussi dessiner la carte analysée sur le point snappé — HORS périmètre de ce lot.

**B2 — `runSnappe` null malgré un run ? (écarté).** Un run n'est possible que si `parametres` non-null → `pointAnalysable`
→ `snappe` non-null. Donc `runSnappe` est non-null dès qu'un run réussit. La double garde (`disabled` + garde onClick) couvre
le cas défensif ; aucune URL incomplète possible.

**B3 — Snap CLIENT figé vs re-snap SERVEUR (fenêtre de re-validation).** `runSnappe` fige le `snappe` CLIENT (issu de
`/api/origine`) au clic « Lancer », alors que l'analyse re-snappe `parametres.point` côté serveur (`banc-comparer`). Nominalement
IDENTIQUES (même `validerOrigine(point, mode)` déterministe). Deux réserves étroites : (a) fenêtre de débounce — si l'opérateur
clique « Lancer » dans les ~300 ms + fetch en vol suivant un changement de point, `snappe` peut refléter le point PRÉCÉDENT
alors que `parametres.point` porte le nouveau → Street View ouvrirait à l'ancien point snappé ; (b) toute divergence future
d'implémentation de snap entre `/api/origine` et `banc-comparer`. Impact faible (cas nominal identique). **NON corrigeable dans
ce lot sans faire renvoyer le point snappé par la route `banc-comparer` (fichier INTERDIT au périmètre)** ; documenté comme
limitation du modèle de validation client (qui affecte aussi la carte analysée). À traiter, si souhaité, en régularisant la
route pour renvoyer `validation.pointSnappeWgs84` (lot séparé, hors périmètre).

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Batterie de conformité (Phase 6) :
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier
  du chemin de calcul touché — `git status` = `BancSaisie.tsx` + 2 fichiers `streetView`).
- **VERDICT DÉCOUPLÉ** : le bouton est une NAVIGATION (window.open) ; aucun calcul de verdict/score, aucune photo/IA. N/A.
- **RGPD** : lat/lon (bâtiment) vers Google, AUCUNE donnée personnelle identifiante ; profil de TEST ; pas de pont identité (A6).
- **CONFIG / ST_Force2D / HAUTEUR / GEMINI** : non concernés.
- **PÉRIMÈTRE** : moteur/pipeline/migration/ingestion/extraction/`pontProjetBanc`/`banc-comparer`/`bancEssai` INTACTS.

## Preuves
- **Point SNAPPÉ (pas brut)** : `onClick` → `urlStreetView(runSnappe, …)` (`BancSaisie.tsx`), `runSnappe` figé au run =
  `snappe` (`:359`) = `validation.pointSnappeWgs84` (miroir /api/origine `:218`). JAMAIS `runParams.point` (brut).
- **Heading = azimut du run** : `runParams.azimutPrincipalDeg` (number).
- **URL (4 tests)** : format Google exact ; heading normalisé (`450→90`, `-10→350`, `360→0`) ; lat/lon pleine précision
  (`48.90693182287072,2.269431435588249`).
- **Nouvel onglet** : `window.open(url, "_blank", "noopener")` dans un `onClick` (geste utilisateur).
- **Désactivation** : `disabled={!runSnappe || !runParams}` + garde `if (!runSnappe || !runParams) return` dans le onClick.
- **Pleine largeur** : `className="svv-btn svv-btn-outline"` (`.svv-btn` = `width:100%`, `globals.css:30`), placé après le bloc
  des deux graphiques.
- **Aucun fichier interdit** : `git status` = `BancSaisie.tsx` (M) + `streetView.ts`/`.test.ts` (new) uniquement.

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` (3 fichiers) : **PASS** (0 problème ; aucun `disable`).
- `npm test` : **PASS** — 85 fichiers, **1021 tests** (+4 `streetView`), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden `29.107259068449615` bit-identique**.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue adversariale indépendante (sous-agent, 6 outils, diff + CSS + périmètre re-vérifiés) → **VALIDER**. Invariants A→G tous
TENU (prouvés fichier:ligne) ; H aucun défaut produisant une URL incomplète/malformée ni un mauvais point en nominal. Module
`streetView.ts` pur et testé (format exact, précision préservée, normalisation `[0,360)`).

**4 constats du reviewer — traités :**
1. **(Risque mineur) Bouton persistant après un run EN ÉCHEC** — sur échec, `setComparaison(null)` masquait les graphiques mais
   `runParams`/`runSnappe` restaient sur le run précédent → bouton Street View encore actif, incohérent. **CORRIGÉ** : les deux
   branches d'échec (`data.ok===false` et `catch`) réinitialisent `setRunParams(null)` + `setRunSnappe(null)` → carte analysée
   ET bouton invalidés ensemble.
2. **(Risque étroit) Snap client figé vs re-snap serveur / fenêtre de débounce** — documenté en **B3**. Non corrigeable sans
   modifier la route `banc-comparer` (INTERDITE) ; impact faible (cas nominal identique).
3. **(Cosmétique, hors périmètre) Origine affichée (brut) ≠ origine Street View (snappé)** — = doute **B1** (choix d'affichage
   pré-existant, hors périmètre).
4. **(Cosmétique) Bouton toujours monté (désactivé avant tout run)** — conforme à la spec.

Corrections re-vérifiées : `tsc` 0, `eslint` 0 (changement = 4 `setState` de reset sur échec, aucune logique nominale touchée
→ `npm test` 1021 et golden 54/54 inchangés). Doutes non bloquants restants : B1 (affichage brut vs snappé), B3 (fenêtre snap
client/serveur) — régularisables en lot séparé si Arno le souhaite.
