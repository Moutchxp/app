# RAPPORT DE BUILD — Curation : toggle Historique franc + 4e famille « Manuel » (+ synchro des 2 cases Manuel)

> Chantier `/svav-build` — 3 corrections, **un seul fichier de code** touché :
> `app/(admin)/admin/(protected)/curation/CurationCarte.tsx`.
> **Non committé.** Arno décide du go — les 3 corrections seront committées ensemble.

---

## ⭐ ADDENDUM (chantier suivant) — CORRECTION 3 : synchro des DEUX cases « Manuel »

**Contexte** : après les corrections 1 & 2 (ci-dessous), il restait **deux cases « Manuel »** distinctes :
la nouvelle du bloc *Familles* (`manuelVisible`) et l'ancienne du bloc *Origine*
(`originesVisibles.manuel`, inerte sur la carte). Demande fondateur : les **lier** (un seul comportement
« voir les tags manuels », synchro dans les 2 sens).

**Changement** (bloc *Origine*, boucle `ORIGINES.map`) :
- L'item `'manuel'` lit/écrit désormais **`manuelVisible`** (`checked={estManuel ? manuelVisible : …}`,
  `onChange` → `setManuelVisible`). Il devient le **miroir exact** de la case *Familles* — **même état,
  donc synchro bidirectionnelle automatique, SANS `useEffect`** (aucun risque de boucle de rendu).
- L'item `'auto'` (« Automatique ») reste **strictement** sur `originesVisibles.auto` /
  `setOriginesVisibles` (branche `else`) — filtre auto **intact** (marqueurs + liste).
- `originesVisibles.manuel` devient **vestigial** : plus jamais écrit, reste à `true` (défaut). Les clauses
  tertiaires `originesVisibles[origineDe(e)]` (marqueurs + liste) passent donc toujours pour une entité
  manuelle → **aucune contradiction** avec `manuelVisible` (la visibilité manuelle vient de `manuelVisible`
  via le prédicat d'axe famille). Laissée vestigiale volontairement (pas de sur-ingénierie).

**Confirmations livrable** :
- (a) Les 2 cases « Manuel » **partagent `manuelVisible`** et se reflètent dans les 2 sens ✓
- (b) « Automatique » **intact** (`originesVisibles.auto`, `setOriginesVisibles` en branche `else`) ✓
- (c) Toggle Historique **préservé** (`if (journalOuvert)`, `aria-expanded={journalOuvert}`, inchangés) ✓

**Conformité (re-jouée sur le cumul des 3 corrections)** : golden **54/54** inchangé · unit **912/0** ·
`tsc` propre · `eslint` propre · aucun bleu · aucun fichier gelé/Gemini/migration touché.

---

## Résumé des changements (fichier:ligne après édition)

### CORRECTION 1 — Bouton d'en-tête « Historique » : ouvre/ferme franc en 1 clic

| Avant | Après |
|---|---|
| `aria-expanded={journal?.mode === 'global'}` (désync en mode entité) | `aria-expanded={journalOuvert}` — reflète « un journal est ouvert » |
| Garde de fermeture `if (journal?.mode === 'global')` : en mode `'entite'`, le 1er clic tombait dans le `else`, remettait les filtres à zéro et basculait entité→global **sans fermer** (2 clics requis) | Garde `if (journalOuvert)` : **tout** journal ouvert (global OU entité) → `setJournal(null)` en **1 clic** |

- `journalOuvert` est le dérivé existant `journal !== null` (défini une seule fois au niveau composant), en portée au handler.
- Le bouton **par-entité** (`setJournal({ mode: 'entite', … })`) est **inchangé** : il continue d'ouvrir une entité précise.
- Effets connexes (`invalidateSize` sur `journalOuvert`, loaders global/entité, `selectionner`) vérifiés : aucun ne réintroduit de double-clic (les loaders sortent tôt quand `journal` est `null`).

**Comportement avant/après :**
- Avant : ouvert en mode `'entite'` → 2 clics d'en-tête pour fermer (1er = conversion en global, 2e = fermeture).
- Après : ouvert en mode `'entite'` **OU** `'global'` → **1 clic** d'en-tête ferme. Fermé → 1 clic ouvre en global. Toggle franc dans les deux sens.

### CORRECTION 2 — 4e item « Manuel » dans le bloc Familles (carte + liste)

- **État dédié** `manuelVisible` (booléen, défaut `true`), ajouté à côté de `famillesVisibles`. **`FAMILLES` non modifié** (le tableau sert aussi au sélecteur de création du formulaire — le polluer aurait ajouté « Manuel » comme famille créable).
- **4e case « Manuel »** rendue dans le `<fieldset>` « Familles », après les 3 familles, réutilisant le patron `.svv-cur-check` (cible ≥ 44 px) + étoile jaune `.svv-cur-star` (#e0a400) comme repère visuel identique aux tags de la liste.
- **Filtrage sur l'axe origine, pas la famille** — prédicat `origineDe(e) === 'manuel' ? manuelVisible : famillesVisibles[e.famille] !== false`, appliqué de façon cohérente sur **trois surfaces** :
  - marqueurs carte (`entitesAvecPoint`),
  - liste de gauche (`entitesFiltrees`),
  - compteurs latéraux (`compteurs`).
  → un tag manuel suit la case « Manuel » (indépendamment de sa famille mondial/mh/inventaire) ; une entité **auto** suit sa famille comme avant (**non cassé**).
- **Affichage carte des tags manuels au centroïde** : gouverné par la **couche étoiles EXISTANTE** (`coucheEtoilesRef` / `tagsManuels`, centroïde serveur = 1er polygone), désormais **gated sur `manuelVisible`** (`if (!manuelVisible) return;`). **Aucune duplication** dans la boucle des marqueurs (cf. Décision A-1).

**Comportement avant/après :**
- Avant : les tags manuels s'affichaient déjà comme étoiles (couche étoiles), mais **aucune case** ne les masquait/affichait en tant que groupe ; leur ligne de liste suivait leur famille.
- Après : la case « Manuel » masque/affiche **simultanément** les étoiles (carte) et les lignes de liste des tags manuels, quelle que soit leur famille.

---

## Confirmations demandées (livrable Phase 7)

- **(a)** Le toggle Historique ferme en **1 clic depuis le mode `'entite'` ET le mode `'global'`** — ✅ (garde `journalOuvert`).
- **(b)** La case « Manuel » filtre **carte (étoiles) + liste** (et compteurs) sur `origine='manuel'` — ✅.
- **(c)** Les tags manuels sans point apparaissent **au centroïde** des bâtiments rattachés — ✅ (via la couche étoiles existante, gated sur `manuelVisible` ; centroïde = 1er polygone rattaché, calculé côté serveur).

---

## A. DÉCISIONS HORS-SPECS (point d'attention prioritaire)

**A-1 — Centroïde via la couche étoiles existante, PAS via la boucle des marqueurs (écart au libellé du prompt).**
- Ce que le prompt demandait : ajouter, dans la boucle de rendu des marqueurs (`if (!e.point) continue`), un repli de position = centroïde des emprises rattachées (`boundsEmprises(e).getCenter()`) pour les tags manuels sans point.
- Ce que j'ai constaté à la relecture : le code affiche **déjà** les tags manuels au centroïde via une **couche « étoiles » dédiée** (`fetchTagsManuels` → `/api/admin/curation/tags-manuels` → `coucheEtoilesRef`), avec un centroïde **calculé côté serveur** (1er polygone). De plus, `boundsEmprises` opère sur des emprises **fetchées par entité de façon asynchrone** — elles ne sont pas présentes sur l'objet `Entite` du rendu synchrone des marqueurs.
- Décision prise : **brancher la case « Manuel » sur la couche étoiles existante** (gating `manuelVisible`) au lieu d'ajouter une logique de centroïde dans la boucle des marqueurs.
- Alternative écartée : ajouter des marqueurs-centroïdes dans la boucle → aurait produit un **double affichage** (une pastille-marqueur **ET** une étoile pour le même tag) et exigé un fetch asynchrone des emprises indisponible synchronement.
- Raison : respecte l'**intention** du fondateur (tags manuels visibles au centroïde, pilotés par la case « Manuel ») sans duplication ni nouveau flux de données. Impact : positif (plus simple, pas de double affichage, réutilise l'infra existante). **Aucune migration, aucun changement de route.**

**A-2 — Prédicat `manuelVisible` appliqué aussi aux COMPTEURS (au-delà de carte+liste).**
- Le prompt nommait explicitement « carte » et « liste ». J'ai étendu le même prédicat aux **compteurs latéraux** (`compteurs`) pour cohérence : un tag manuel est compté selon la case « Manuel », pas selon sa famille.
- Alternative écartée : laisser les compteurs sur `famillesVisibles[e.famille]` → incohérence (un tag manuel compté selon sa famille mais filtré selon `manuelVisible`).
- Raison : cohérence d'affichage. Impact : mineur (les compteurs reflètent désormais la case « Manuel » pour les tags manuels).

**A-3 — Prédicat appliqué aussi au filtre marqueurs (`entitesAvecPoint`), par symétrie.**
- Les tags manuels n'ayant jamais de point propre, ce routage est un **no-op** au niveau des marqueurs (ils restent exclus par `e.point !== null` et s'affichent via les étoiles). Appliqué quand même pour garder les trois filtres symétriques et l'intention lisible. Impact : nul sur le comportement observable.

**A-4 — Affordance étoile dans le libellé de la case (cosmétique).**
- La case « Manuel » affiche une petite étoile jaune (`.svv-cur-star`, #e0a400) devant son libellé, pour le même repère visuel que les tags dans la liste. Choix cosmétique, aucun impact fonctionnel.

## B. DOUTES

**B-1 — La couche étoiles ne respecte QUE `manuelVisible`, pas les filtres pré-existants « Origine » / « Statut ».**
- Il existe déjà une case « Manuel » dans le fieldset **« Origine »** (`originesVisibles['manuel']`), cumulative sur marqueurs/liste/compteurs. Deux cases « Manuel » coexistent donc (le fondateur a explicitement demandé de **conserver le bloc Origine** et **assume ce doublon**).
- Conséquence : décocher « Origine › Manuel » (ou un statut) masque les tags manuels dans la **liste/compteurs**, mais **laisse les étoiles sur la carte** (l'effet étoiles n'a **jamais** honoré les filtres statut/origine — comportement **pré-existant** au chantier ; ma correction n'y a ajouté que le gating `manuelVisible`).
- Décision retenue : conforme à la spec (« un tag manuel suit la case Manuel »). À signaler au porteur pour un **arbitrage UX futur** (faut-il que les étoiles honorent aussi Origine/Statut ?). Non bloquant, hors périmètre des 2 corrections.

## C. ÉCARTS DE CONFORMITÉ

**Aucun.** Batterie de conformité — tous PASS :

| Vérification | Résultat | Preuve |
|---|---|---|
| GOLDEN 29.107259068449615 | ✅ inchangé | `test:integration` **54/54 vert** (échouerait si le golden bougeait) |
| Suite unitaire | ✅ | `vitest run` **912 passed / 0 failed** (21 skipped, baseline) |
| Typecheck | ✅ | `tsc --noEmit` exit 0, 0 erreur |
| Lint | ✅ | `eslint` sur le fichier : 0 warning (dont `react-hooks/exhaustive-deps`) |
| Verdict découplé | ✅ N/A | aucun code moteur/verdict/score touché (diff 100 % UI) |
| Config externalisée | ✅ N/A | `manuelVisible` = état d'affichage éphémère, pas une variable de moteur |
| ST_Force2D | ✅ N/A | aucune opération distance/raster touchée |
| Hauteur de vision | ✅ N/A | non touchée |
| RGPD | ✅ N/A | aucune donnée personnelle manipulée (filtre d'affichage) |
| Fichiers gelés | ✅ intouchés | password/motDePasse/proxy/garde absents du diff |
| Gemini hors staging | ✅ intouchés | adaptateurIaPhoto / analyse-photo absents du diff |
| Nouvelle migration | ✅ aucune | `origine='manuel'` existe déjà dans `meta` |
| Charte (aucun bleu) | ✅ | étoile jaune #e0a400 ; aucun bleu ajouté ; cibles ≥ 44 px (`.svv-cur-check`) ; aucune animation nouvelle |

---

## Verdict recon de validation (Phase 8, indépendante, lecture seule)

**VALIDER.** Les deux corrections sont implémentées comme spécifié, cohérentes sur carte/liste/compteurs/étoiles, sans double affichage, sans régression sur les entités auto, sans stale-closure sur le toggle. Aucun invariant SVAV violé. Unique point relevé (double case « Manuel » + étoiles ignorant statut/origine) = **pré-existant**, hors périmètre, non bloquant (cf. B-1).
