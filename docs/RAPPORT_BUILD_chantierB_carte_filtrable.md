# RAPPORT BUILD — Chantier B : carte communale filtrable + bulles colorées par verdict dominant

> Généré le 12/07/2026 à 02h21 — run autonome `/svav-build`. **Aucun commit effectué.** Livraison remise à Arno.

## ⚠️ À LIRE EN PREMIER — la revue adverse a REJETÉ la 1ʳᵉ implémentation (fuite k), corrigée depuis

La carte devait être filtrable **par verdict et par score en COMPTES**. Une **revue adverse k-anonymat a
démontré (chiffres à l'appui) une fuite de ré-identification** dans cette approche : le **filtrage serveur des
comptes par verdict/score ouvre une attaque par DIFFÉRENCIATION inter-vues** qui reconstruit une cellule
`(commune × verdict) < k`. C'est exactement l'attaque (a) que la cartouche demandait de bloquer, et l'invariant
« un filtre ne doit JAMAIS révéler une cellule sous k ».

**Exemple (k=11)** — commune X : SANS=11, VIS=1, total=12 :
- `?verdict=` (Tous) → X visible **n=12**
- `?verdict=SANS_VIS_A_VIS` → X visible **n=11**
- **12 − 11 = 1** → X a exactement 1 analyse non-SANS = **cellule < k reconstruite**.

→ J'ai **rejeté ma propre implémentation** (Phase 4) et **revu la conception** (retour Phase 3) vers une version
**prouvablement sûre** : **tout le filtrage carte passe CÔTÉ CLIENT sur l'UNIQUE payload k-safe non filtré** (une
seule vue serveur par période → il n'existe plus deux vues à soustraire → différenciation **structurellement
impossible**). **Contrepartie majeure — décision à valider par Arno (§A) :** le **filtre par SCORE est retiré**, et
le **filtre par verdict devient un filtre par verdict DOMINANT** (déjà anonymisé), pas par comptes.

- **Revue adverse finale (re-test)** → **FUITE FERMÉE / VALIDER**.
- **Golden `29.107259068449615`** : **inchangé** (intégration 8 fichiers / 54 tests, dont `pipeline.itest`).
- **Byte-unchanged** (`password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts`) : diff **vide**.
- **Aucune dépendance npm** (Leaflet déjà présent).

## Phase 0 — Confirmation + divergence trouvée

Confirmé : `repartitionCommune`/`verdictsCommune`/`statistiques`/garde `filtreCommune`, param `?commune=` existant,
`CarteCommunes` (center `[48.86,2.35]`, zoom 10, `scrollWheelZoom=false`, aucun maxBounds), CHECK anti-fingerprint
018:126-133. **Divergence majeure** : `scoreTranche` (contexte.ts:91) stocke des **QUARTILES** `<25/<50/<75/≥75`
(1-4) ; le score brut n'est jamais persisté (anti-ré-identification). Les bornes `<60/60-74/≥75` de la cartouche
sont **inexprimables** → cf. §A décision 2 (devenue caduque après retrait du filtre score).

## Fichiers touchés

| Fichier | Modification |
|---|---|
| `app/lib/analytics/lecture/metriques.ts` | `dominantKSafe` (pur, k-safe) + `communesDominant` (verdict dominant par commune, non filtré) + `CelluleCommune.dominant`. `repartitionCommune`/`verdictsCommune`/`statistiques` restent **non filtrés** (post-revue). |
| `app/(admin)/api/admin/statistiques/route.ts` | **Aucun** param de filtre géo (post-revue) — seuls fenêtre + commune. |
| `app/(admin)/.../statistiques/affichage.ts` | `couleurDominant`, `DEPARTEMENTS_IDF`, `FiltresGeo` (client : verdict+dept), `filtrerCommunesClient` (filtre d'affichage pur), `joindreGeo` transporte `dominant`. |
| `app/(admin)/.../statistiques/CarteCommunes.tsx` | Bulles colorées par dominant, navigation libre (center IdF z11, `scrollWheelZoom`, `minZoom 5`, pas de maxBounds), bouton « Recentrer », popup avec dominant. |
| `app/(admin)/.../statistiques/tuiles.tsx` | `TuileCommunes` : barre de filtres CLIENT (verdict-dominant + département + commune), légende des couleurs, note de masquage rouge (compte, sans identité). |
| `app/(admin)/.../statistiques/page.tsx` | État `filtres` **client-only** (aucun refetch) passé à `TuileCommunes`. |
| Tests | `metriques.test.ts`, `affichage.test.ts`, `rendu.test.ts`, `route.test.ts` |

## Conception SÛRE (post-revue) — pourquoi la fuite est fermée

1. **UNE vue serveur par période.** `statistiques(fenetre, commune?)` appelle `repartitionCommune(fenetre, k)`
   (non filtré, k-safe) + `communesDominant(fenetre, k, visibles)` (dominant k-safe). La route n'accepte AUCUN
   param de filtre géo. → pour une période, l'API produit **exactement une** ventilation. **Il n'existe plus deux
   vues à soustraire** → différenciation inter-vues **impossible**.
2. **Filtrage CLIENT sur données déjà k-safe.** `filtrerCommunesClient(visibles, {verdict?, departement?})` est un
   `.filter()` pur sur `data.communes.visibles` (verdict via le `dominant` déjà anonymisé, dept par préfixe INSEE).
   Aucun refetch (les `useEffect` de fetch ont pour deps `[fenetre]` / `[communeSel, fenetre]`, jamais `filtres`).
   Un filtre client **ne révèle rien de plus** que le JSON déjà publié → inoffensif pour le k.
3. **Couleur = verdict dominant k-safe.** `dominantKSafe(cells, k)` = `ventilerSous_k` puis **argmax des seules
   cellules VISIBLES** ; `null` (bulle NEUTRE gris clair) si le split est `insuffisant`/sans visible. La couleur ne
   révèle jamais un verdict que `ventilerSous_k` n'aurait pas déjà déclaré restituable. Calculé sur la vue non
   filtrée → invariant aux filtres d'affichage. Cas {SANS:12, VIS:2} k=11 → `insuffisant` → dominant `null` → neutre.
4. **Score retiré.** Un filtre score aurait exigé des comptes par commune×tranche → même vecteur de différenciation.

## Navigation (Phase 3bis)

`CENTRE_IDF=[48.85,2.35]`, `ZOOM_IDF=11` (cadre 75+92+93+94), `scrollWheelZoom` **activé**, `minZoom=5` (France
entière), `maxZoom=18` (rue), **aucun `maxBounds`** → dézoom/scroll libres. Bouton **« Recentrer Île-de-France »**
(rouge contour, ≥44px) → `setView(CENTRE_IDF, ZOOM_IDF)`. Dézoomer montre une carte vide hors IdF (aucune donnée
ailleurs — **attendu**, périmètre réel 75/92/93 + couronne).

## Revue adverse (Phase 4) — 2 passes

- **Passe 1 → REJETER** : CONSTAT 1 (différenciation verdict, chiffré), CONSTAT 2 (score amplifie), CONSTAT 3 (dept
  rouvre la suppression secondaire). Points b/c/e/g tenaient. → correction (client-only, score retiré).
- **Passe 2 (re-test) → VALIDER (FUITE FERMÉE)** : plus de 2ᵉ vue serveur ; filtrage client pur sans refetch ;
  dominant k-safe invariant ; score absent ; XOR provenance intacte ; validation commune (param lié).

## Tests (Phase 5)

| Test | Résultat |
|---|---|
| `metriques.test.ts` (dominantKSafe k-safe : argmax visibles / null si insuffisant ; repartitionCommune non filtrée) | **PASS** |
| `affichage.test.ts` (`filtrerCommunesClient` verdict-dominant+dept ; `couleurDominant` aucun bleu ; `joindreGeo` dominant) | **PASS** |
| `rendu.test.ts` (barre de filtres client, légende, note masquage rouge « sur la période », pas de score) | **PASS** |
| `route.test.ts` (params de filtre géo ignorés serveur → 200, jamais transmis) | **PASS** |
| Suite unitaire complète | **PASS** — 76 fichiers, **912 passés**, 21 skipped, 0 échec |
| `tsc --noEmit` | **PASS** (0 erreur) |
| **Golden + intégration** | **PASS** — 8 fichiers / 54 tests ; `29.107259068449615` inchangé |

## Phase 6 — Conformité SVAV

| Vérif | Résultat | Preuve |
|---|---|---|
| **k-anonymat** | **PASS** | UNE vue serveur/période ; `repartitionCommune`/`verdictsCommune`/`communesDominant` via `ventilerSous_k` ; filtrage client sur données k-safe ; dominant k-safe |
| **Golden** | **PASS (inchangé)** | `pipeline.itest` vert ; aucun fichier moteur touché |
| **Byte-unchanged** | **PASS** | diff vide sur les 4 fichiers gelés |
| **XOR géo ⊥ acquisition** | **PASS** | `provenance` globale (non filtrée) ; CHECK 018:126-133 ; tuile Provenance non filtrable par la géo |
| **Aucune dépendance npm** | **PASS** | `package.json`/`lock` inchangés |
| **Gemini hors staging** | **PASS** | `adaptateurIaPhoto.ts`, `analyse-photo/route.ts` non touchés |
| **Mobile / no-blue / reduced-motion** | **PASS** | chips ≥44px, focus rouge, couleurs = tokens svv + `#c9c9c9` (aucun bleu), popup au tap, `zoomAnimation={!reducedMotion}` |

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno — PRIORITAIRE)

1. **🔴 MAJEUR — Le filtrage par COMPTES (verdict/score) demandé par la cartouche a été REMPLACÉ par un filtrage
   d'AFFICHAGE k-safe.** La cartouche voulait filtrer la carte par verdict et par score sur les **comptes** par
   commune. La revue adverse a prouvé que c'est une **fuite de ré-identification** (différenciation inter-vues,
   attaque (a) que la cartouche exigeait pourtant de bloquer). *Décision* : filtrage CLIENT sur l'unique payload
   k-safe → **verdict = filtre par verdict DOMINANT** (déjà anonymisé), **score = RETIRÉ**. *Alternative écartée* :
   (i) garder le filtrage serveur (= livrer une fuite, exclu) ; (ii) k-anonymat JOINT sur le treillis de filtres
   (masque une commune si une seule de ses cellules verdict×score est sous k → carte quasi vide au volume réel,
   inutilisable). *Impact* : on ne peut plus « voir les communes qui ont N analyses SANS » ; on voit « les communes
   où SANS domine » (k-safe) + le dominant en couleur. **À arbitrer par Arno** : accepter ce périmètre réduit
   (recommandé — c'est le seul sûr **et** utilisable), ou investir dans une anonymisation plus lourde (bruit /
   confidentialité différentielle) pour un filtrage par comptes.
2. **Bornes de score `<50/50-74/≥75` (au lieu de `<60/60-74/≥75`) — devenue CADUQUE.** J'avais d'abord mappé les
   bornes sur les quartiles stockés (le score brut n'est jamais persisté → « 60 » inexprimable). Le filtre score
   ayant été **retiré** (décision 1), ce point n'a plus d'objet, mais la contrainte demeure pour tout futur filtre
   score : impossible sans réexposer le score brut (ce que le design k interdit).
3. **Département = filtre d'AFFICHAGE client (préfixe INSEE), pas un filtre serveur.** *Raison* : un filtre dept
   serveur changeait l'ensemble soumis à `ventilerSous_k` → rouvrait des cellules masquées par suppression
   secondaire (CONSTAT 3). *Impact* : le dept filtre l'affichage de communes déjà k-safe → sûr.
4. **Bouton « Recentrer », `minZoom=5`, `maxZoom=18`, `height 340` — valeurs choisies** (cartouche : « à ajuster »).
   *Raison* : voir la France sans se perdre, cadrer la petite couronne à l'ouverture. Sans impact k.

## B. DOUTES

1. **Différenciation TEMPORELLE (réserve orthogonale, PRÉEXISTANTE — signalée par la revue).** Le fenêtrage libre
   (`filtreFenetre`, toute plage) permet, en théorie, de soustraire deux fenêtres chevauchantes (`[J1,J31]` n=12 vs
   `[J1,J30]` n=11 → 1 résultat isolé sur le jour delta d'une commune). C'est une **limite générique des systèmes
   k-anon à fenêtre libre**, **présente depuis le Lot 6**, **NON introduite** par ce chantier, et elle ne révèle
   qu'un **COMPTE** (jamais le verdict — la couleur reste un agrégat k-safe sur toute la fenêtre — ni l'identité).
   *À décider par Arno, hors périmètre* : durcir (buckets temporels fixes non chevauchants, audit de requêtes,
   bruit) ou accepter (posture actuelle du module depuis le Lot 6).

## C. ÉCARTS DE CONFORMITÉ

- **Fuite k CRITIQUE détectée en Phase 4 (CONSTAT 1-3) puis CORRIGÉE** (retour Phase 3 : filtrage client, score
  retiré). Re-test adverse : **fuite fermée**. Tracé ici car c'est un écart majeur rencontré pendant le run, même
  s'il est résolu et que la livraison finale est sûre.
- **Golden** : PASS (inchangé, prouvé par re-run). Aucun fichier moteur touché.
- Tous les autres invariants : **PASS**.

## Recon de validation indépendante (Phase 8)

⚠️ La 1ʳᵉ recon indépendante avait conclu VALIDER **à tort** (elle a vérifié le k *par vue* mais **manqué** la
différenciation *inter-vues*) — c'est la revue ADVERSE qui a trouvé la fuite. Après correction, la re-vérification
adverse conclut **FUITE FERMÉE / VALIDER**. Leçon : le k-anonymat exige de raisonner sur le **croisement de vues**,
pas seulement sur chaque vue isolée.

## Confirmation finale

Aucun commit. Golden inchangé. Byte-unchanged sur les 4 gelés. Aucune dépendance npm. La carte filtrable livrée est
**prouvablement k-safe** (une vue serveur/période, filtrage client sur données k-safe, couleur = dominant k-safe),
au prix d'un **périmètre réduit** (verdict = dominant, score retiré) que **Arno doit valider** (§A décision 1).
