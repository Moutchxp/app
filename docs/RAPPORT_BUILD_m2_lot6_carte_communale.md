# RAPPORT DE BUILD — M2, Lot 6 : carte communale analytique + graphiques filtrables

> Chantier autonome `/svav-build`. Livraison remise à Arno **sans commit**. Se lit seul.

---

## Phase 0 — mini-recon bloquante (synthèse, chemins + preuves)

**0.1 — Cohabitation verdict × commune : OUI, elles cohabitent.**
`analytics_compteur_jour` porte une colonne `verdict` (`db/migrations/018_m2_analytics_fondation.sql:106`).
L'événement `resultat` est émis avec **verdict + score_tranche + commune sur la MÊME ligne** :
`await incrementerCompteur({ nom: "resultat", verdict, scoreTranche: tranche, communeInsee: commune })`
(`app/api/analyse/route.ts:80`). Le CHECK anti-fingerprint (`018:126-133`) interdit seulement de croiser le
groupe **géo/résultat** (verdict/score/commune) avec le groupe **acquisition** (source/medium/referer/device) —
verdict et commune sont dans le MÊME groupe → autorisés ensemble. ⇒ **les verdicts par commune sont
calculables** (Phase 2.3 / 3.1 activées). Nuance : `commune` peut être `NULL` (dérivation KNN best-effort) →
le scope ne capte que les `resultat` où la commune a été dérivée.

**0.2 — Granularité temporelle : per-bucket dispo pour le trafic seulement.**
`fenetre.ts` fournit `expressionBucket(grain)` (jour / lundi ISO / 1er du mois) et `filtreFenetre`
(`app/lib/analytics/lecture/fenetre.ts:68,80`). `traficParTranche` produit déjà une série par bucket
(`metriques.ts`), mais `repartitionVerdicts` / `comptesAnalyses` ne renvoient que des **totaux de fenêtre**.
⇒ une fonction **`serieParTranche`** (per-bucket, globale) a été ajoutée.

**0.3 — Politique k existante (à répliquer À L'IDENTIQUE).**
- Comptes GLOBAUX / temporels (trafic, verdicts globaux, analyses, entonnoir) : **pas de k** (un total sans géo
  n'isole personne).
- Ventilation par dimension ré-identifiante (commune, provenance) : **`ventilerSous_k`** (`kAnonymat.ts:64`) =
  suppression primaire (< k) + secondaire (résidu masqué ≥ 2 cellules ET ≥ k, sinon `insuffisant`).
Le nouveau code applique EXACTEMENT cette règle : `serieParTranche` = globale, **pas de k** ; `verdictsCommune`
= ventilation scopée → **`ventilerSous_k`**.

**0.4 — Leaflet : déjà présent, aucune dépendance ajoutée.**
`leaflet ^1.9.4` + `react-leaflet ^5.0.0` + `@types/leaflet` (package.json). Motif `dynamic(() => import(...),
{ ssr:false })` (`app/MapSelector.tsx:22`), `CircleMarker`/`Popup` (`app/origine/Carte.tsx:66-89`), carte de
curation (`CurationCarte.tsx`). La carte du Lot 6 réutilise ce socle.

---

## Fichiers touchés

**Serveur (nouveau)**
- `app/lib/analytics/lecture/geo.ts` — référentiel cartographique `refCommunes()` (INSEE→{nom,centroïde}),
  dérivé de `adresse_ban`, mémoïsé, **hors k** (pure géo), READ ONLY.
- `app/(admin)/api/admin/geo/communes/route.ts` — endpoint géo (garde `perm_statistiques`).

**Serveur (étendu — couche de lecture Lot 4, extension autorisée par le cartouche)**
- `app/lib/analytics/lecture/metriques.ts` — `serieParTranche` (série globale per-bucket, sans k),
  `verdictsCommune` (verdicts d'une commune, `ventilerSous_k`), `statistiques(fenetre, commune?)` +
  types `SeriePoint`, `CelluleVerdict`, `FiltreCommune`.
- `app/(admin)/api/admin/statistiques/route.ts` — param optionnel `commune` (validé `^(2[AB]|[0-9]{2})[0-9]{3}$`).

**Client (nouveau)**
- `app/(admin)/admin/(protected)/statistiques/CarteCommunes.tsx` — carte Leaflet (dynamic ssr:false), bulles
  ROUGES ∝ √n, popup au tap.

**Client (étendu — dashboard Lot 5)**
- `affichage.ts` — types miroir (série, ref géo, filtre) + helpers PURS (`maxSerie`, `coordsSerie`, `polySerie`,
  `bulleRayon`, `joindreGeo`, `construireUrl(f, commune?)`, `URL_GEO`, `LIBELLE_VERDICT`).
- `tuiles.tsx` — `SerieTemporelle` (SVG maison), `VerdictsCommune` (verdicts scopés k-safe), `TuileCommunes`
  (carte + liste cliquable + sélection), `voile` (grisage des tuiles non ventilables).
- `page.tsx` — état filtre commune + série, 2 fetches (stats + géo), fetch scopé séparé, reduced-motion.

**Tests** — `affichage.test.ts`, `garde.test.ts`, `rendu.test.ts`, `metriques.test.ts`, `route.test.ts`
(statistiques), `geo/communes/route.test.ts` (nouveau), `lecture.itest.ts` (real-DB).

**Aucun** fichier moteur / writer / emission / migration / Gemini / proxy / garde touché.

---

## A. DÉCISIONS HORS-SPECS *(à contrôler en priorité)*

### A1 — Filtre commune via fetch SÉPARÉ (side-state), pas de rechargement total du dashboard
- **Trou de spec :** la cartouche dit « refetch ?commune=INSEE » sans préciser si tout le tableau se recharge.
- **Décision :** la sélection d'une commune déclenche un fetch `?...&commune=INSEE` **séparé** dont on n'utilise
  que `filtreCommune` (verdicts scopés k-safe), stocké dans un état à part (`filtreScope`). Le tableau global
  reste affiché (pas de retour à l'écran « Chargement… » à chaque clic). `page.tsx`.
- **Alternative écartée :** refetch qui remplace tout l'état → clignotement/blank à chaque sélection.
- **Impact :** léger surcoût serveur (le payload global est recalculé aussi, alors que seul `filtreCommune`
  est consommé) — négligeable (table agrégée minuscule, lectures séquentielles). Reste 100 % « consommation
  d'API » (aucun calcul client).

### A2 — Série temporelle GLOBALE (jamais scindée par commune)
- **Origine :** décision de la cartouche (3.2) pour éviter un masquage k massif jour × commune. **Appliquée**
  et **annoncée dans l'UI** (« Série GLOBALE — jamais scindée par commune »). `metriques.ts` (serieParTranche),
  `tuiles.tsx` (SerieTemporelle).

### A3 — Seule métrique réellement scopable = les VERDICTS ; le reste est grisé, jamais fabriqué
- **Trou de spec :** « recolore les tuiles géo-compatibles » sans lister lesquelles.
- **Constat :** seul `resultat` porte la commune. Donc **seuls les verdicts** sont scopables. Trafic, entonnoir,
  provenance (issus de `session_fin`, sans géo — anti-fingerprint) et « analyses lancées » (`analyse_lancee`,
  sans commune) ne le sont PAS.
- **Décision :** filtre actif → tuile Verdicts scopée (k re-passé) ; Trafic / Entonnoir / Provenance / Analyses
  **grisées + note** « non filtrable par commune ». `page.tsx`, `tuiles.tsx` (voile).
- **Alternative écartée :** fabriquer un scope pour ces métriques — impossible sans commune → aurait produit
  une donnée fausse. **Impact :** honnêteté préservée ; l'opérateur voit clairement ce qui est global.

### A4 — Carte à BULLES (centroïdes), pas choropleth
- **Trou de spec :** type de carte non imposé. **Décision :** bulles proportionnelles (rayon ∝ √n → aire ∝ n)
  sur les centroïdes, pas de polygones. **Raison :** aucune table de polygones communaux (déjà tranché au Lot 5) ;
  les centroïdes se dérivent de `adresse_ban`. `CarteCommunes.tsx`, `affichage.ts` (bulleRayon).

### A5 — Référentiel géo = endpoint séparé (pure géo, hors k), pas d'extension du contrat CelluleCommune
- **Trou de spec :** d'où viennent nom + centroïde des communes ?
- **Décision :** nouvel endpoint `GET /api/admin/geo/communes` (137 communes, nom + centroïde), joint côté
  client à `communes.visibles` (k-safe). **Alternative écartée :** ajouter nom+centroïde à `CelluleCommune`
  (Lot 4) — aurait couplé la géo dans le contrat analytique. **Impact :** contrat analytique inchangé ; la géo
  est un fond de carte non sensible (renvoyé quel que soit le trafic → n'expose rien).

### A6 — Centroïde = centre PONDÉRÉ PAR LES ADRESSES (≈ centre habité), pas le centroïde administratif
- `ST_Centroid(ST_Collect(adresse_ban.geom))` — assumé comme point d'ancrage de bulle, pas une frontière
  officielle. `geo.ts`. Suffisant pour situer une commune ; documenté.

### A7 — `prefers-reduced-motion` lu en initialiseur paresseux (pas de setState synchrone en effet)
- `page.tsx` : valeur initiale via `useState(() => matchMedia(...).matches)` (SSR → false), suivie ensuite sur
  l'événement `change`. Évite le mismatch d'hydratation ET le `react-hooks/set-state-in-effect`.

---

## B. DOUTES

### B1 — `verdictsCommune` retombe souvent en « insuffisant » avec peu de données (anonymat, pas un bug)
Scinder les résultats d'une commune en 3 verdicts crée facilement des cellules < k. `ventilerSous_k` les
masque/agrège. **Propriété démontrée** : pour une commune SÉLECTIONNABLE (donc VISIBLE, total ≥ k), le résultat
est toujours soit ≥ 1 verdict visible, soit un agrégat masqué sûr — jamais une valeur unique révélée. L'`insuffisant`
strict n'est atteignable que sur des entrées artificielles (< k au total), impossibles pour une commune visible.
À valider par Arno que ce comportement UX (souvent « détail par verdict : données insuffisantes ») convient.

### B2 — Le fetch scopé recalcule tout le payload pour n'en garder que `filtreCommune`
Léger surcoût (voir A1). Un endpoint dédié plus léger serait possible mais ajoute de la surface d'API — reporté.

### B3 — Fond de carte OSM = tuiles externes (tile.openstreetmap.org)
Même pattern que la carte de curation existante. Appel réseau externe sur un écran admin interne : accepté
(cohérent projet), mais noté. Les bulles/données restent locales ; seul le fond de plan est externe.

---

## C. ÉCARTS DE CONFORMITÉ (batterie Phase 6)

| Vérification | Résultat | Preuve |
|---|---|---|
| **Golden `29.107259068449615`** inchangé | ✅ PASS | Suite intégration **8 fichiers / 51 tests** verts (163,5 s), `pipeline.itest` inclus (11 assertions du golden). Chantier hors moteur/writer. |
| **k-anonymat re-appliqué aux tranches** | ✅ PASS | `verdictsCommune` → `ventilerSous_k` (même politique) ; unit (`metriques.test.ts`) + real-DB (`lecture.itest.ts`). |
| **Garde de visibilité serveur (faille R1 fermée)** | ✅ PASS (après correctif) | `statistiques()` : `filtreCommune` construit **ssi** commune ∈ `communes.visibles` → commune masquée / tirée-secondaire / sous k / 0 activité → `null`. Prouvé real-DB (4 cas, dont le scénario de suppression secondaire). |
| **XOR anti-fingerprint** | ✅ PASS | verdicts scopés lus sur `nom='resultat'` (groupe géo) ; provenance/trafic/entonnoir jamais scopés → grisés + note. |
| **Série sans k mais globale** | ✅ PASS | `serieParTranche` : aucune requête ne porte `commune_insee` (test dédié). |
| **Client pur (aucun accès base / import serveur)** | ✅ PASS | garde étendu (`garde.test.ts`) : seuls `fetch(construireUrl)` + `fetch(URL_GEO)` ; aucune table nommée (dont `adresse_ban`). |
| **Aucune dépendance npm** | ✅ PASS | `package.json`/lock inchangés. Série = SVG maison, carte = Leaflet déjà présent. |
| **Aucun `localStorage`/`sessionStorage`** | ✅ PASS | `garde.test.ts`. |
| **Aucun bleu (focus rouge)** | ✅ PASS | `garde.test.ts` (source) + `rendu.test.ts` (HTML produit). Bulles rouges, chips rouge contour. |
| **Intouchables byte-unchanged** | ✅ PASS | `git status` : moteur/writer/emission/migration/Gemini/proxy/garde absents du diff. |
| **tsc / eslint (lot) / next build** | ✅ PASS | tsc 0 erreur ; eslint 0 sur le lot ; `✓ Compiled successfully` ; routes `/admin/statistiques` + `/api/admin/geo/communes` OK. |
| **Unit / intégration** | ✅ PASS | unit **825 passés / 21 skipped** ; intégration **54/54** (dont 4 cas de garde k-anonymat). |

---

## Métriques & UX ajoutées

- **Carte communale** (bulles ∝ √n, rouges) sur les communes VISIBLES (k-safe) ; clic sur une bulle ou une ligne
  de liste → sélection. Communes masquées jamais tracées (note k conservée).
- **Série temporelle** (SVG maison) : chips Visites / Analyses / Verdicts (rouge contour = active). GLOBALE.
- **Filtre commune** : verdicts scopés k-safe ; métriques de session grisées + note.
- États Lot 5 conservés (chargement / vide / erreur / masqué / échantillon faible < 30).

---

## Évolutivité

- **Nouvelle métrique scopable par commune** : l'ajouter à `resultat` (émission) puis une fonction lecture
  k-safe + un champ de `FiltreCommune`.
- **Choropleth (polygones)** : brancher une source de polygones communaux ; le contrat client (INSEE→géométrie)
  et la jointure `joindreGeo` restent le point d'extension — aucun changement du contrat analytique.
- **Nouvelle courbe de série** : ajouter une clé à `SeriePoint` + une entrée `GROUPES_SERIE`.

---

## Séquence de test manuel pour Arno

1. `npm run dev` → admin avec `perm_statistiques` → `/admin/statistiques`.
2. Sans trafic/cron : « Aucune donnée » (normal). Avec données compactées : la **série** et la **carte** apparaissent.
3. **Série** : basculer les chips Visites / Analyses / Verdicts (rouge contour = actif) ; vérifier l'absence de bleu.
4. **Carte** : bulles rouges ∝ volume ; **tap** sur une bulle → popup (nom + n) ; la sélection **grise** Provenance /
   Trafic / Entonnoir / Analyses avec la note « non filtrable par commune », et **scope** la tuile Verdicts (k-safe).
5. « ← Toutes communes » réinitialise. Changer la fenêtre réinitialise aussi le filtre.
6. **375px** : 1 colonne, cibles ≥ 44px, carte tactile (pinch), aucune scrollbar horizontale.
7. Vérifier qu'une commune à faible volume **n'apparaît pas** sur la carte si elle est masquée (jamais un point isolé).

---

## Phase 5 — Revue adverse (R1–R4), arbitrage et CORRECTIFS

> 🔴 **ÉVÉNEMENT MAJEUR — faille k-anonymat trouvée puis corrigée.** La revue R1 a prononcé **REJETER** sur
> une vraie faille de ré-identification **côté serveur**. Elle a été **corrigée** (garde de visibilité) et la
> correction est **prouvée par test réel**. Détail ci-dessous — c'est le point à contrôler en priorité.

### R1 — Vie privée & ré-identification : **REJETER → CORRIGÉ**
- **Faille (bloquante) :** `GET /api/admin/statistiques?commune=INSEE` construisait `filtreCommune` pour
  **n'importe quelle** commune bien formée, **sans garde de visibilité serveur**. Comme `ventilerSous_k`
  préserve la somme, `?commune=X` recouvrait le **total exact** d'une commune que la **suppression secondaire**
  de M-7 venait de cacher (X tirée dans l'agrégat masqué pour protéger une voisine < k) → puis
  `masque.total − X = voisine < k` (dé-anonymisation). De plus, `insuffisant` (commune 1..k-1) vs absence de clé
  (commune à 0) étaient distinguables → **oracle de présence datée** (fenêtre d'un jour) sur une commune
  mono-foyer. Le garde client (sélection depuis `visibles`) ne protégeait pas : **le serveur est la frontière
  de confiance**.
- **Correctif appliqué :** garde serveur dans `statistiques()` (`metriques.ts`) —
  `filtreCommune` n'est construit **que si** `communes.visibles.some(c => c.commune_insee === commune)`. Une
  commune masquée / tirée en secondaire / sous k / à 0 activité → `filtreCommune: null`, **indistinguable de
  « pas de filtre »**. Ferme les deux canaux (recouvrement + oracle) d'un seul verrou.
- **Preuve (real-DB) :** `lecture.itest.ts` describe « GARDE k-anonymat SERVEUR » — 4 cas : k-visible → scope
  présent ; sous k → null ; 0 activité → null ; **≥ k mais tirée par suppression secondaire → null** (le cas
  exact de la faille : sans la garde, on recouvrait 12 → 15−12 = 3).
- Constats R1 mineurs corrigés : commentaire trompeur de `verdictsCommune` (disait « souvent insuffisant »),
  couverture de test (les tests n'exerçaient que des communes ≥ k). R1-C4 (série jour×verdict global peut isoler
  un verdict un jour à trafic 1) = **résiduel accepté**, identique à la politique existante `repartitionVerdicts`.

### R2 — Intégrité (XOR, golden, lecture seule) : **VALIDER**
Aucune faille. Le filtre commune ne scope QUE les verdicts (`nom='resultat'`, groupe géo) ; provenance/session
jamais scopées → grisées. Injection fermée (regex + param lié). Golden hors de portée (aucun fichier moteur).
Cache d'erreur géo évité. **Correctif retenu (O2) :** `verdictsCommune` utilise un index de paramètre **dérivé**
(`params.length + 1`) au lieu de `$3` figé (robustesse si la clause fenêtre évolue). O1 (double-fetch) = A1/B2 ;
O3 (voile `aria-hidden`) = accepté.

### R3 — Client pur / mobile 375px / anti-bleu / a11y : **CORRIGER → CORRIGÉ**
- **C1 (bloquante) corrigée :** chips de la série à **44px** (étaient `minHeight:36`, sous la cible tactile ;
  l'inline battait la règle CSS non-`!important`). `tuiles.tsx` (SerieTemporelle).
- **C2 corrigée :** test durci — un rendu SSR de `TuileCommunes` avec référentiel prouve désormais l'absence de
  `leaflet-container` (carte bien `dynamic(ssr:false)`) + garde anti-bleu **hex** (au-delà des mots). `rendu.test.ts`,
  `garde.test.ts`.
- C3/C4 (carte non focusable au clavier ; focus rouge non appliqué au conteneur Leaflet) = **acceptés** : la
  liste de communes parallèle (boutons ≥ 44px, `aria-pressed`, même nom/compte/sélection) est l'équivalent
  clavier/lecteur d'écran complet ; la carte est un enrichissement progressif. Points VALIDÉS par R3 : client pur,
  `dynamic(ssr:false)`, aucun bleu réel (tokens), reduced-motion, popups au tap, pas de débordement 375px.

### R4 — Honnêteté des métriques & tests : **CORRIGER → CORRIGÉ**
- **C1 (bloquante) corrigée :** la tuile/carte « Communes » comptait des `resultat` mais annonçait « analyses
  **lancées** » → libellés alignés sur « **résultats produits / abouti** » (`tuiles.tsx` aide, `CarteCommunes.tsx`
  aria-label, cohérents avec le popup).
- **C2 (bloquante) corrigée :** `TuileVerdicts` reçoit un `voile` « chiffres globaux » quand une commune est
  sélectionnée mais le scope pas encore revenu / en échec → plus jamais de verdicts globaux **muets** présentés
  comme scopés. `page.tsx` (`voileVerdicts`), `tuiles.tsx`.
- **C3 corrigée :** note « échelle Y commune — masque une courbe volumineuse pour lire les faibles volumes »
  (série). **C4 corrigée :** légende « taille des bulles ∝ résultats (repère relatif) » + commentaire `bulleRayon`
  adouci (aire APPROXIMATIVE). **C5 corrigée :** compte « N commune(s) sans localisation connue » (réconciliation
  carte/liste). **C6 corrigée :** `serieParTranche` filtre `verdict IS NOT NULL` → `resultats = sans+vis+ind` par
  construction. **C7 corrigée :** tests ajoutés (`coordsSerie` 1 point, fusion à buckets désordonnés, garde hex-bleu).
- R4 confirme : cœur dérivationnel **juste** (fusion série, k re-pass, géométrie SVG) — aucune métrique
  numériquement fausse ; aucun test tautologique.

### Arbitrage
Tous les constats **bloquants** (R1-C1/C2, R3-C1, R4-C1/C2) sont **corrigés et re-testés**. Constats mineurs :
corrigés (R1-C3, R2-O2, R4-C3→C7, R3-C2) ou **acceptés et tracés** (R1-C4 résiduel = policy existante ; R2-O1
= A1 ; R2-O3 / R3-C3/C4 = équivalents accessibles / enrichissement progressif). Le run se poursuit : aucun
défaut de fond non résolu.

## Phase 8 — Recon de validation indépendante → **✅ VALIDER**

Une recon LECTURE SEULE indépendante a re-confronté la livraison aux directives, en ciblant **la faille R1**.
Verdict : **VALIDER**. Points clés confirmés `fichier:ligne` :
- **La garde k-anonymat ferme intégralement la faille** : `filtreCommune` est lié au MÊME ensemble
  `communes.visibles` déjà publié dans le payload non-scopé → `?commune=X` ne donne **jamais plus
  d'information** que ce que `communes.visibles` révèle déjà (gain d'oracle = 0). Les 4 cas sont prouvés par
  tests d'intégration RÉELS, dont « ≥ k mais tirée par suppression secondaire → null » (double assertion :
  hors `visibles` ET `filtreCommune` null). `verdictsCommune` n'a qu'**un seul point d'appel prod**, sous la garde.
- Tous les correctifs R2/R3/R4 ont atterri (vérifiés un à un). Tous les invariants durs tiennent : golden
  inchangé, XOR (seuls les verdicts scopés), client pur, zéro bleu (mots + hex), zéro dépendance, zéro storage
  dashboard, intouchables byte-unchanged.
- **Observations mineures NON imputables au chantier (aucune action) :** (a) dérive doc — `CLAUDE.md`/
  `INVARIANTS_SVAV.md` citent le golden à `pipeline.itest.ts:42`, il est en réalité à `:88` (valeur inchangée,
  fichier hors diff, pré-existant) ; (b) `sessionStorage` subsiste dans `lib/analytics/mesureClient.ts`
  (instrumentation publique Lot 2, hors périmètre — le dashboard, lui, est propre et testé).

**Livraison prête pour Arno.** Aucun commit effectué.
