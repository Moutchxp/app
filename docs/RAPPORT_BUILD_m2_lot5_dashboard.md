# RAPPORT DE BUILD — M2, Lot 5 : le tableau de bord Statistiques

> Chantier autonome `/svav-build`. Livraison remise à Arno **sans commit** (le commit reste manuel).
> Ce rapport se lit seul. Il est destiné au contrôle *a posteriori* : il n'a jamais interrompu le run.

---

## 0. Résumé exécutif

Le module Statistiques affichait « Module à venir ». Ce lot le remplace par le **tableau de bord réel**,
qui **CONSOMME l'API de lecture du Lot 4** (`GET /api/admin/statistiques`) et l'**AFFICHE**. Il ne calcule
aucune métrique, n'accède **jamais** à la base, ne **reconstitue jamais** une valeur masquée (k-anonymat).

- **Fichiers (6, tous sous `app/(admin)/admin/(protected)/statistiques/`) :**
  - `page.tsx` — MODIFIÉ (coquille : fetch de l'API, sélecteur de fenêtre, grille de tuiles, états).
  - `affichage.ts` — NEW (logique d'affichage **pure**, testable sans rendu ; types **miroir** de l'API).
  - `tuiles.tsx` — NEW (composants de présentation : cartes, barres CSS, tuiles, sélecteur).
  - `affichage.test.ts`, `garde.test.ts`, `rendu.test.ts` — NEW (33 tests).
- **Aucune dépendance ajoutée** (`package.json` / lockfile inchangés). Graphiques = **SVG/CSS maison**.
- **Aucun fichier sensible touché** (moteur, `proxy.ts`, `garde.ts`, couche Lot 4, Gemini) — prouvé §6.
- **Golden `29.107259068449615` bit-identique** (pipeline.itest passé). Lot 100 % client → moteur hors de portée.

**Verdicts de revue adverse :** R1 VALIDER (+ durcissement), R2 VALIDER (1 note LOW), R3 **CORRIGER** (corrigé),
R4 VALIDER (+ 2 corrections). Détail §5. **Recon de validation indépendante (Phase 8) : VALIDER** — détail §10.

---

## A. DÉCISIONS HORS-SPECS *(section prioritaire pour Arno)*

Chaque trou de spec comblé pour avancer, avec l'alternative écartée. Aucune ne touche un invariant.

### A1 — Carte communale = **liste classée**, pas de choropleth géographique
- **Ce que la spec laissait ouvert :** le cartouche autorise « une liste de communes classées » en repli si
  une carte est trop lourde, et demande de trancher. Le recon M2 notait « Leaflet présent (curation), aucune
  lib de charts ».
- **Décision :** liste de communes classées par volume (barres CSS), au **grain commune**, jamais de point ni
  d'adresse. `TuileCommunes`, `tuiles.tsx:181`.
- **Alternative écartée :** choropleth Leaflet. **Raison :** il n'existe **aucune table de polygones de
  communes** dans le projet (Leaflet n'a que des tuiles + le tracé de faisceau) ; un choropleth exigerait
  d'importer un GeoJSON communal (poids bundle, nouvelle donnée) — hors périmètre d'un premier dashboard, et
  la spec l'autorise en repli. **Impact :** aucune perte d'information (l'API ne renvoie de toute façon qu'un
  `commune_insee` + un compte k-supprimé, jamais une géométrie). Évolutif : brancher un choropleth plus tard
  ne change pas le contrat de données.

### A2 — Graphiques = **barres CSS/SVG maison**, zéro dépendance
- **Ce que la spec laissait ouvert :** « quelle lib de graphiques ? … demande-moi avant d'ajouter une dépendance ».
- **Décision :** composant `Barre` en pur CSS (`tuiles.tsx:53`), barre empilée de verdicts en `<div>` flex
  (`tuiles.tsx:134`). **Aucune** dépendance ajoutée.
- **Alternative écartée :** Recharts / Chart.js / visx. **Raison :** poids bundle (dizaines de Ko), surface de
  maintenance, et des barres simples suffisent pour ce premier dashboard. **Impact :** si un graphe complexe
  devient nécessaire (courbe multi-séries), il faudra revenir vers Arno pour l'accord dépendance — **non
  franchi ici**.

### A3 — Fenêtre par défaut = **30 derniers jours, grain jour**
- **Ce que la spec laissait ouvert :** la fenêtre est « librement choisie » mais aucune valeur d'ouverture n'est fixée.
- **Décision :** 30 jours glissants, grain jour (`fenetreDefaut`, `affichage.ts:93`), + presets 7j/30j/90j et
  plage libre (deux `<input type=date>`), fuseau **Europe/Paris** (cohérent Lot 4, `jourParis` `affichage.ts:75`).
- **Alternative écartée :** 7 jours (trop court pour un site à faible trafic) ou « tout » (fenêtre non bornée,
  coût de requête). **Impact :** cosmétique, l'opérateur re-choisit en un clic.

### A4 — L'étape « analyse » est **retirée de l'entonnoir affiché**
- **Ce que la spec laissait ouvert :** l'entonnoir liste des étapes ; « analyse » n'est **jamais instrumentée
  séparément** (modèle d'événements Lot 2 → toujours 0).
- **Décision :** `entonnoirCumule` **filtre** l'étape `analyse` de l'affichage tout en la **comptant dans le
  cumul suffixe** (elle vaut 0 → sans effet numérique) — `affichage.ts:185`. Afficher une étape à 0 suggérerait
  un point de mesure qui n'existe pas.
- **Alternative écartée :** l'afficher à 0. **Raison :** honnêteté des métriques (une étape « morte » induit en
  erreur). **Impact :** l'entonnoir montre les étapes réellement mesurées. Couvert par test (`affichage.test.ts:93`).

### A5 — Sous N < 30 verdicts : **comptes bruts, jamais de %** (ni barre proportionnelle)
- **Ce que la spec laissait ouvert :** SPEC §4 impose « échantillon faible » sous un plancher, sans dire ce qu'on
  affiche exactement.
- **Décision :** plancher d'**affichage** `PLANCHER_N = 30` (`affichage.ts:116`, **distinct** du seuil d'anonymat
  k=11 appliqué par l'API). Sous le plancher : comptes bruts + mention « échantillon faible », **et la barre
  empilée est masquée** (`tuiles.tsx:133`) car « deux tiers verts » se lit comme un %.
- **Alternative écartée :** afficher un % dès le premier résultat. **Raison :** un % sur 3 tests est trompeur.
  **Impact :** métrique honnête. Couvert (`affichage.test.ts:63`, `rendu.test.ts:45`).

### A6 — Système de design : suivi de la charte projet (skill design absent)
- **Ce que la spec demandait :** « avant toute UI, lis `/mnt/skills/public/frontend-design/SKILL.md` ».
- **Constat :** ce fichier **n'existe pas** dans cet environnement (`/mnt/skills` absent). Signalé comme trou.
- **Décision :** appliqué le système de design **du projet** — tokens de `app/globals.css`
  (`--color-svv-red/-ink/-muted/-green/-field/-line`, classes `.svv-card`, `.svv-label`) et le style des écrans
  admin existants (curation, comptes). **Impact :** cohérence visuelle avec l'admin existant ; aucune couleur
  inventée. À re-vérifier si la SKILL.md devient disponible.

---

## B. DOUTES *(points où l'agent a tranché sans certitude absolue)*

### B1 — `proxy.ts` ne mappe pas `/api/admin/statistiques` → `perm_statistiques` (note R2, LOW)
- **Doute :** la garde de permission fine est faite **dans le handler** de la route Lot 4
  (`exigerCompteActif(request, 'statistiques')`), pas par une table de mapping dans `proxy.ts`.
- **Pourquoi non corrigé :** `proxy.ts` est un **intouchable BYTE-UNCHANGED** explicite du cartouche, et c'est
  déjà le schéma retenu au Lot 4 (doute B-2 du rapport Lot 4). La barrière réelle **existe** (le handler refuse
  un compte sans la perm). Ce lot est **purement client** et ne peut pas — et ne doit pas — changer la garde serveur.
- **Impact :** nul sur la sécurité (le serveur reste la vraie barrière). À trancher globalement au niveau de
  `proxy.ts` si Arno veut centraliser le mapping — **hors de ce lot.**

### B2 — `aria-label` sur un `<p>` de note de masquage (note R3, INFO)
- **Doute :** `NoteMasque` porte un `aria-label` sur un `<p>` (`tuiles.tsx:80`). L'attribut est valide et lu par
  les lecteurs d'écran, mais un `<p>` n'est pas un rôle « nommable » canonique.
- **Décision retenue :** conservé — le texte visible **est** déjà l'information ; l'`aria-label` ne fait que
  préfixer « Masquage anonymat : ». Sans risque. **Impact :** négligeable ; à revoir lors d'un futur audit a11y global.

### B3 — Les tests de garde inspectent le **code source** (pas le DOM rendu)
- **Doute :** `garde.test.ts` prouve l'absence de bleu / d'accès base / de métrique refusée en **scannant les
  fichiers sources**, faute d'outil de rendu de composant dans le projet (environnement vitest = `node`, pas de
  jsdom/RTL).
- **Mitigation :** `rendu.test.ts` complète en rendant réellement le HTML via `react-dom/server`
  (`renderToStaticMarkup`, sans jsdom) et vérifie le **HTML produit** (masquage affiché, aucun bleu dans la
  sortie, états). La garde source + la preuve de rendu se couvrent mutuellement. **Impact :** faible ; c'est la
  meilleure couverture possible sans ajouter de dépendance de test.

---

## C. ÉCARTS DE CONFORMITÉ (batterie Phase 6)

| Vérification | Résultat | Preuve |
|---|---|---|
| **Golden `29.107259068449615`** inchangé | ✅ PASS | `pipeline.itest.ts` (11 assertions du golden) passé — suite intégration 8 fichiers / 47 tests verts, 154.79 s. |
| **Verdict découplé du score / photo** | ✅ N/A | Lot 100 % client ; ne touche ni moteur ni chemin de calcul. |
| **Config externalisée** (pas de constante moteur en dur) | ✅ N/A | Aucune variable de moteur introduite. `PLANCHER_N=30` est un **seuil d'affichage** (honnêteté), pas une variable de scoring. |
| **Aucune dépendance npm** | ✅ PASS | `package.json` / lockfile inchangés (git). Graphiques SVG/CSS. |
| **Aucun `localStorage`/`sessionStorage`** analytics | ✅ PASS | `garde.test.ts:37`. |
| **Aucun accès base / import serveur** côté client | ✅ PASS | `garde.test.ts:19` ; seule mention `analytics/lecture` = un **commentaire** expliquant pourquoi on ne l'importe pas (`affichage.ts:7`). |
| **Aucune métrique refusée** (visiteur unique, durée moyenne, page de sortie) | ✅ PASS | `garde.test.ts:45` ; toute occurrence de « unique » est une négation explicite. |
| **Aucun bleu** (couleur + focus) | ✅ PASS | `garde.test.ts:77` (source) + `rendu.test.ts:82` (HTML produit). Focus rouge `CSS_ECRAN`. |
| **Intouchables byte-unchanged** | ✅ PASS | `git status --porcelain` : seuls les 6 fichiers du lot changent (§6). |
| **Gemini hors staging** | ✅ PASS | Non touchés. |
| **tsc / eslint (fichiers du lot)** | ✅ PASS | tsc projet clean ; eslint sur le dossier du lot = 0 erreur. (Les 40 erreurs eslint projet sont **préexistantes**, dans `page.tsx` racine, `FaisceauMap.tsx`, `next.config.ts`… — aucune dans ce lot.) |
| **next build** (bundle client) | ✅ PASS | `✓ Compiled successfully` ; `/admin/statistiques` route dynamique, aucun `server-only` dans le bundle navigateur. |

### C1 — Signal transitoire : flake `maintenance.itest` (12 vs 10) au passage de minuit — **NON imputable à ce lot**
Lors d'un run d'intégration lancé **à cheval sur minuit** (la date système a basculé 2026-07-10 → 2026-07-11
pendant le run), `maintenance.itest.ts` a compté **12** sessions au lieu de 10. **Diagnostic :** `compacter`
compacte **tous** les jours scellés (`jour_paris < today`) ; `instrumentation.itest.ts` (Lot 2) écrit des
sessions datées en **Europe/Paris** (`jourParis`). Au basculement de minuit, les deux fichiers se retrouvent de
part et d'autre de la frontière de jour → 2 sessions d'`instrumentation` deviennent « passées » et sont
compactées par `maintenance`. **Preuves que ce n'est pas ce lot :** (a) `maintenance.itest` **passe en isolation**
(11/11) ; (b) **re-run** de la suite complète hors frontière = **8 fichiers / 47 tests verts** ; (c) le Lot 5 est
100 % client et **n'insère aucune session** (les seuls fichiers écrivant `analytics_session` sont
`instrumentation.itest` et `maintenance.itest`, tous deux **intouchables** ici). **Recommandation (hors périmètre
Lot 5, à instruire côté Lots 2/3) :** isoler les itests analytics sur des dates fixes très éloignées, ou faire
nettoyer `maintenance.itest` toute session passée avant de compter. **Aucune action prise** (fichiers intouchables).

---

## 1. Les 6 métriques affichées et leurs sources (exactement ce que l'API expose)

| Tuile | Champ API (Lot 4) | Affichage | Source de données | Note |
|---|---|---|---|---|
| **Visites** | `trafic[]` | barres par bucket + total | `session_fin` (post-compaction) | badge « après compaction » |
| **Analyses** | `analyses{lancees,resultats}` | 2 KPI | grand livre (temps réel) | re-runs inclus |
| **Verdicts** | `verdicts{sans/vis/indét/total}` | barre empilée + légende %, ou comptes bruts si N<30 | grand livre `resultat` | 3 buckets ; jamais couplé au verdict binaire du moteur |
| **Entonnoir** | `entonnoir[]` | barres « atteint au moins » (cumul suffixe) | `session_fin` (post-compaction) | étape `analyse` retirée (A4) |
| **Communes** | `communes: VentilationSure` | liste classée, grain commune | grand livre `resultat` (KNN → INSEE) | k-supprimé par l'API ; jamais d'adresse |
| **Provenance** | `provenance{par_source_medium, par_referer}` | 2 listes classées | `session_fin` (post-compaction) | host référent absent → « Direct / inconnu » |

**Métriques refusées — jamais affichées :** visiteur unique, durée moyenne stricte, page de sortie
(décisions RGPD M2). Le type miroir `Statistiques` ne porte **aucun** de ces champs (`garde.test.ts:46`).

---

## 2. Preuve de non-contournement du masquage k-anonymat

Le masquage est fait par l'API (Lot 4, k=11 + suppression secondaire). Le dashboard l'**affiche tel quel** :

- `libelleMasque` (`affichage.ts:127`) n'affiche **jamais** une soustraction `total − visibles` : il ne rend que
  l'**agrégat fourni** par l'API (`masque.total`). Un `insuffisant` → « Données insuffisantes pour l'anonymat »
  (aucun chiffre). Un `masque` à **< 2 zones** → **refuse** de rendre sa valeur (durcissement R1, retombe sur
  « données insuffisantes »).
- Les tuiles Communes/Provenance affichent la note via `NoteMasque` ; un `insuffisant` masque **toute** la liste.
- **Tests :** `affichage.test.ts:39-59` (aucun chiffre reconstitué, agrégat = celui de l'API, garde < 2 zones) ;
  `rendu.test.ts:31-42` (HTML réellement produit : « Données insuffisantes » sans nombre ; « 2 zones masquées
  (total 13) » = l'agrégat, jamais une commune isolée).

---

## 3. Mobile-first 375px (exigence transverse)

- **Grille :** `repeat(auto-fit, minmax(min(100%, 300px), 1fr))` (`page.tsx:77`) → **1 colonne** à 375px, sans
  débordement horizontal ; 2–3 colonnes sur grand écran.
- **Cibles tactiles ≥ 44px :** `CSS_ECRAN` force `min-height:44px` sur boutons/inputs/select (`tuiles.tsx:24`) ;
  les puces et champs date portent aussi `minHeight:44` (`tuiles.tsx:242,259`).
- **Pas de hover seul :** toute l'interaction passe par des boutons/inputs cliquables (presets, grain, dates) ;
  les `title` ne sont qu'un complément, jamais l'unique canal.
- **Listes denses :** trafic, communes, provenance ont `maxHeight` + `overflow-y:auto` (`tuiles.tsx:100,192,210`)
  → défilement **maîtrisé** dans la carte, jamais un débordement de page.
- **`prefers-reduced-motion` :** `CSS_ECRAN` coupe transitions/animations (`tuiles.tsx:27`).

---

## 4. États de l'écran

| État | Rendu | Emplacement |
|---|---|---|
| Chargement | `Message` « Chargement… » (pas d'écran blanc figé) | `page.tsx:68` |
| Vide | `Message` « Aucune donnée sur cette période » + rappel cron | `page.tsx:70` |
| Erreur API | `Message` « Statistiques indisponibles » (aucune stack trace) | `page.tsx:69` |
| Masqué (k) | « Données insuffisantes » / note d'agrégat, **par tuile** | `tuiles.tsx:187,206` + `NoteMasque` |
| OK | grille des 6 tuiles | `page.tsx:76` |

**Rappel cron affiché :** `RAPPEL_CRON` en sous-titre permanent (`page.tsx:63`) + badge « après compaction » sur
les tuiles issues de `session_fin` (`tuiles.tsx:44`) : les métriques n'apparaissent qu'après passage du job de
maintenance (Lot 3). Piège d'exploitation signalé.

---

## 5. Revue adverse (4 sous-agents, R1–R4) et arbitrage

- **R1 — Vie privée & ré-identification : VALIDER (+ durcissement).** Le masquage est affiché tel quel, aucune
  reconstitution. *Durcissement appliqué :* `libelleMasque` refuse une valeur d'un groupe masqué à < 2 zones
  (défense en profondeur, même si le contrat Lot 4 le garantit déjà). `affichage.ts:133`.
- **R2 — Accès & isolation client : VALIDER (1 note LOW).** Aucun import serveur/`pg`/base ; seul point réseau =
  `fetch(/api/admin/statistiques)`. *Note LOW → B1* : `proxy.ts` ne mappe pas la perm (intouchable ; garde
  serveur dans le handler = barrière réelle, comme au Lot 4).
- **R3 — Accessibilité / mobile 375px : CORRIGER → corrigé.** Corrections : contraste du `.svv-label`
  (`--color-svv-muted`), `accent-color` rouge sur les `input[type=date]`, `overflow-y` sur les listes denses de
  provenance. `tuiles.tsx:25,26,210`. *Résidu INFO → B2* : `aria-label` sur `<p>` (sans risque).
- **R4 — Honnêteté des métriques : VALIDER (+ 2 corrections).** *C1* : la barre empilée de verdicts est masquée
  sous échantillon faible (une barre proportionnelle se lirait comme un %). `tuiles.tsx:133`. *C2* : l'étape
  « analyse » (toujours 0) est retirée de l'entonnoir. `affichage.ts:192`.

Tous les constats acceptés ont été corrigés ou versés en doute (B1/B2). Aucun défaut de fond → run poursuivi.

---

## 6. Périmètre exact des fichiers (git)

```
 M app/(admin)/admin/(protected)/statistiques/page.tsx        (placeholder → dashboard)
?? app/(admin)/admin/(protected)/statistiques/affichage.ts    (logique pure + types miroir)
?? app/(admin)/admin/(protected)/statistiques/tuiles.tsx      (composants de présentation)
?? app/(admin)/admin/(protected)/statistiques/affichage.test.ts
?? app/(admin)/admin/(protected)/statistiques/garde.test.ts
?? app/(admin)/admin/(protected)/statistiques/rendu.test.ts
```
Plus ce rapport (`docs/RAPPORT_BUILD_m2_lot5_dashboard.md`). **Aucun** autre fichier — vérifié :
`password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts`, moteur (`lib/svv/*`, `lib/db/pipeline.ts`…), couche Lot 4
(`lib/analytics/lecture/**`, `api/admin/statistiques/route.ts`), Gemini (`adaptateurIaPhoto.ts`,
`analyse-photo/route.ts`) sont **absents** du diff.

---

## 7. Évolutivité — ajouter une métrique sans refonte

La structure est en 3 couches découplées :
1. **Type miroir** dans `affichage.ts` (ajouter le champ que l'API renverra).
2. **Un composant Tuile** dans `tuiles.tsx` (props `{ data }` → JSX ; réutilise `Carte`, `Barre`, `Kpi`,
   `NoteMasque`, `libelleMasque`).
3. **Une ligne** dans la grille de `page.tsx` (`<TuileNouvelle data={etat.data} />`).

Aucune modification du fetch, du sélecteur, des états, ni des autres tuiles. Une métrique de plus = **+1 tuile,
+1 champ de type, +1 ligne de grille**. La grille `auto-fit` absorbe la tuile supplémentaire sans changer la mise en page.

---

## 8. Séquence de test manuel pour Arno

1. **Démarrer** : `npm run dev`, se connecter à l'admin avec un compte **ayant `perm_statistiques`**, ouvrir
   `/admin/statistiques`.
2. **Sans cron / sans trafic** : l'écran doit montrer « Aucune donnée sur cette période » + le **rappel cron** en
   sous-titre. C'est **normal** (les métriques `session_fin` n'existent qu'après compaction, Lot 3).
3. **Fenêtre** : cliquer 7j / 30j / 90j, changer le grain (jour/semaine/mois), saisir une plage libre → l'URL de
   l'API change et l'écran se recharge sans écran blanc.
4. **Accès refusé** : avec un compte **sans** la perm, l'API (Lot 4) répond 403 → l'écran montre « Statistiques
   indisponibles » (la garde serveur reste la vraie barrière).
5. **Mobile 375px** : réduire la fenêtre / DevTools iPhone → tout passe en **1 colonne**, boutons ≥ 44px, listes
   qui défilent dans leur carte, aucun débordement horizontal.
6. **(Optionnel) données réelles** : lancer le job (`npm run analytics:maintenance`) après du trafic pour voir les
   tuiles se peupler ; vérifier qu'une commune à faible volume apparaît **masquée** (« données insuffisantes »),
   jamais avec un chiffre.

---

## 9. Conformité finale

- ✅ Golden `29.107259068449615` **bit-identique** (Lot client ; moteur hors de portée).
- ✅ **0** dépendance ajoutée, **0** accès base, **0** métrique refusée, **0** bleu, **0** stockage local analytics.
- ✅ **0** fichier sensible touché (moteur, `proxy.ts`, `garde.ts`, couche Lot 4, Gemini).
- ✅ Unit **801 passés / 21 skipped** ; intégration **47/47** ; tsc clean ; eslint du lot clean ; `next build` OK.
- ⚠️ **Aucun commit effectué** — livraison remise à Arno pour validation et commit manuel.

---

## 10. Recon de validation indépendante (Phase 8) — **VERDICT : VALIDER**

Un sous-agent en **lecture seule** a confronté la livraison aux 10 directives dures du cartouche. Résultat :
**les 10 points PASS**, prouvés `fichier:ligne`, **aucun défaut bloquant**.

- Périmètre confirmé : `git status` = exactement 6 fichiers du lot, rien d'autre.
- **Contrat API vérifié champ-à-champ** : les types miroir `affichage.ts:12-71` correspondent à
  `lib/analytics/lecture/metriques.ts` et `kAnonymat.ts` — sans jamais importer le serveur.
- **k-anonymat** : aucune soustraction dans le code (la seule occurrence `points.length-1` est un index de
  boucle) ; l'agrégat « N zones masquées (total X) » est indécomposable (garanti ≥2 cellules ET ≥k par
  `kAnonymat.ts:75`) + double-garde client `< 2 zones` ; une soustraction inter-métriques ne révélerait que
  ce même agrégat déjà publié, jamais une cellule isolée.
- **Observations non-bloquantes** (n'affectent pas le verdict) : état « erreur » sans bouton « Réessayer »
  explicite (re-fetch via changement de fenêtre) ; pas de bouton secondaire rouge-contour (l'écran n'en a pas
  besoin — sélecteurs à sémantique toggle). Ces points sont notés pour un éventuel polish ultérieur, hors
  périmètre de la directive.

> Note : l'export inerte `SOURCES_COMPACTION`, signalé par la recon, a été **retiré** après coup (code mort,
> non consommé) — tsc/eslint/tests re-vérifiés verts.

**Conclusion recon (citée) :** « Client strictement consommateur de `GET /api/admin/statistiques` (un seul
`fetch`, zéro import serveur), k-anonymat affiché tel quel sans reconstitution ni soustraction, aucune métrique
refusée, aucun bleu (focus rouge), mobile-first 375px avec reduced-motion, rappel cron présent, 4 états rendus,
aucune dépendance/stockage ajouté, intouchables byte-unchanged, structure évolutive. »
</content>
</invoke>
