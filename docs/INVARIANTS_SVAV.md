# INVARIANTS RÉELS — Sans Vis-à-Vis® (extraits du code)

> Relevé en **lecture seule** du code source, chaque point prouvé par `fichier:ligne`. Objet : alimenter
> la customisation d'un socle de skills de gouvernance avec les invariants **réellement en vigueur dans le
> code** (et non ceux de la documentation, qui peut être en retard). Racine du dépôt :
> `/Users/macbookprom4arnaud/sansvisavis/app` ; les fichiers TS de l'app vivent sous `app/…`. Daté du
> 2026-07-06.

---

## 1. GOLDEN de non-régression
- **Valeur exacte : `29.107259068449615`**, assertée `toBeCloseTo(…, 3)`.
  - Preuve : `app/lib/db/pipeline.itest.ts:42` → `expect(resultat!.score.total).toBeCloseTo(29.107259068449615, 3);`
- **Scellé dans** le test d'intégration `app/lib/db/pipeline.itest.ts` (lancé via
  `npm run test:integration`, motif `*.itest.ts`).
- **Point de référence rejoué** : **8 rue Denfert-Rochereau (Asnières)**, coordonnées
  **lat `48.90693182287072`, lon `2.269431435588249`**, azimut `90`, étage `2`.
  - Preuve : `app/lib/db/pipeline.itest.ts:20-25`.
- Grandeurs figées au même endroit : verdict `SANS_VIS_A_VIS` (`:34`), distance `42.100339602923526`
  (`:35`), source obstacle `LIDAR_HD` (`:36`), altitude terrain origine `41.57033157348633` (`:30`).
- ⚠️ **Portée** : Asnières est résidentiel et ne heurte probablement aucun bâti patrimonial → le golden
  est un oracle **faible** pour toute modification du chemin patrimoine (MH/Inventaire/mondial). À
  compléter par des cas scellés dédiés si l'on touche ce chemin.

## 2. VERDICT BINAIRE — 100 % géométrique
- **Seuil exact : `40 m`** (`THRESHOLD_M`).
  - Preuve : `app/lib/svv/config.ts:82` → `export const THRESHOLD_M = 40;`
- **Règle** : premier obstacle réel (sommet ≥ altitude fenêtre) à distance `≥ THRESHOLD_M` →
  `SANS_VIS_A_VIS`, sinon `VIS_A_VIS` ; hauteur inconnue (`NONE`) à `< 40 m` avant tout obstacle confirmé
  → `INDETERMINE`.
  - Preuve : `app/lib/svv/verdict.ts:103` (`premierObstacle`), comparaisons `:118`, `:131-140`. Module
    « LOGIQUE PURE, aucune BDD, aucune IA » (`verdict.ts:1-18`).
- **N'entre JAMAIS dans le score** : le verdict est calculé en amont (`analyse.ts:79`) et le score total
  = uniquement `noteDegagement`, sans le verdict.
  - Preuve : `app/lib/svv/scoreTotal.ts:44` → `const total = noteDegagement(faisceaux, profil, azimutDeg);`
    et commentaire `scoreTotal.ts:40-43` (« Le VERDICT est calculé en amont … et n'entre jamais ici »).
- Corollaire : `famille1`/`famille2` sont calculées et conservées pour audit mais **n'alimentent pas** le
  total (`scoreTotal.ts:57`).

## 3. HAUTEUR DE VISION — formule exacte, ambiguïté 2,80 vs 2,90 levée
- **Formule réelle** : `hauteur_vision = etage × (hauteur_sous_plafond + dalle) + 1,65`.
  - Preuve : `app/lib/svv/config.ts:56-62` (`hauteurVision`) → `hauteurEtage = hauteurSousPlafondM + DALLE_M; return etage * hauteurEtage + EYE_HEIGHT_M;`
- **Constantes** :
  - Œil : **`1,65 m`** — `EYE_HEIGHT_M`, `config.ts:38` (« VALEUR DÉFINITIVE »).
  - Dalle/plancher : **`0,30 m`** — `DALLE_M`, `config.ts:32`.
  - Hauteur sous plafond : **CHOISIE par l'internaute** (stepper « infos logement », `app/page.tsx:2765`),
    **défaut `2,50 m`**, **fourchette [2,40 ; 4,50] m** par **pas de 0,10 m** (clamp `app/page.tsx:1280`) —
    `HAUTEUR_SOUS_PLAFOND_DEFAUT_M`, `config.ts:35`. Exemple de variable **pilotée au runtime**.
  - **`2,80 m` = coefficient par étage du SEUL cas par défaut** (2,50 + 0,30 = `FLOOR_HEIGHT_M`,
    `config.ts:42`) — **PAS une constante du calcul** : `hauteurVision()` recalcule `hauteur_etage` à
    partir de la valeur choisie (`config.ts:60`), donc 2,80 n'intervient plus dès qu'une autre valeur est
    saisie. Transit de la valeur : `page.tsx` (payload `:1932`/`:1961`) → `app/api/analyse/route.ts:39-47`
    → `app/lib/db/pipeline.ts:96` `hauteurVision(etage, hauteurSousPlafondM)`.
- ⚠️ **Ambiguïté 2,80 vs 2,90 — TRANCHÉE par le code** : la hauteur de vision est une **formule à
  paramètre variable** (sous-plafond choisi + 0,30 dalle), **ni un `2,90` ni un `2,80` figés**. Le
  `(étage × 2,90) + 1,65` de la doc historique est **périmé** (révision §4 du 28/06/2026 : la hauteur
  d'étage dérive du sous-plafond configurable, défaut 2,50 → 2,80 dans ce seul cas).
- **`FLOOR_HEIGHT_OBSTACLE_M = 2,90 m` est une constante DISTINCTE** : `config.ts:48`. Elle ne sert
  **qu'à estimer la hauteur d'un immeuble VOISIN** sans donnée BD TOPO (tier 3, `obstacles.ts`) ;
  indépendante de la hauteur de vision du demandeur ; conservée à 2,90 pour ne pas modifier le score
  d'amplitude existant (commentaire `config.ts:44-48`). **Ne jamais confondre les deux.**

## 4. CERTIFICAT — numérotation
- Format cible documenté : `SAVV-AAAA-NNNNNN` (spécifications `.md`), mais **NON IMPLÉMENTÉ dans le
  code** : `grep "SAVV" app/` = **0 occurrence** hors fichiers `.md`.
- La génération de certificat PDF et la numérotation **n'existent pas encore** (l'écran certificat est un
  formulaire de collecte aboutissant à un placeholder). Aucune dépendance PDF dans `package.json`.
- → Statut : **cible connue, non réalisée**. À traiter avec un compteur atomique (verrou transactionnel)
  le jour de l'implémentation.

## 5. TOLÉRANCE DE RATTACHEMENT
- **Rattachement patrimoine (monument → bâtiment/`cleabs`) : `15 m`.**
  - Preuve : `scripts/migration_monuments_emblematiques.sql:67` → `WHERE ST_DWithin(b.geom, me.geom_point, 15)`
    (bâtiment contenant le point, sinon le plus proche ≤ 15 m via KNN `<->`, `:68-70`).
- Tolérance DISTINCTE à ne pas confondre — **point d'origine hors emprise : `0,30 m`**
  (`ORIGIN_OUTSIDE_TOLERANCE_M`, `app/lib/svv/config.ts:123`), tolérance sortante max du point
  d'observation vers l'extérieur du polygone (façades/balcons).

## 6. ST_Force2D — jamais retiré des opérations distance/raster
- **Règle confirmée** : toutes les opérations métriques/raster du moteur forcent la 2D via `ST_Force2D`
  (les géométries `bdtopo_batiment` sont `…Z`, la 3D fausserait distances et échantillonnage raster).
- Preuves (runtime du moteur) :
  - `app/lib/db/obstacles.ts` : `:118`, `:296`, `:298`, `:485`, `:560`, `:567`, `:571`, `:573`, `:578`,
    `:583` (unions, intersections, distances, `ST_Value` raster, `ST_PointOnSurface`, buffers nature aux
    `:661-663`, `:720-725`).
  - `app/lib/db/hauteurLidar.ts:65` et `:97` (lecture hauteur LiDAR).
  - Également présent dans les scripts de diagnostic (`app/scripts/*-check.ts`).
- → À **ne jamais retirer** d'une opération de distance/raster sous peine de régression silencieuse
  (verdict et score).

## 7. CONFIG SCORING — variables de moteur externalisées, lues au runtime, repli défaut
- **Toutes les variables de pondération du moteur (Couche 1) sont externalisées** dans la table
  `config_scoring` (singleton `id = 1`), lue **une seule fois par analyse** au runtime puis passée en
  paramètre aux fonctions pures.
  - Preuve : `app/lib/db/profilConfig.ts:57` (`chargerProfilDegagement`), `SELECT … FROM config_scoring
    WHERE id = 1` (`:60-71`) ; appelée depuis `app/lib/db/pipeline.ts:174`.
- **Nombre de colonnes : 46** = **45 colonnes de configuration** listées au `SELECT`
  (`profilConfig.ts:60-71`, interface `:14-48`) + la clé **`id`** (`WHERE id = 1`).
- **Repli sûr sur le défaut** `PROFIL_DEGAGEMENT_DEFAUT` si la table est absente/vide/incohérente, si
  `mode_combinaison` est hors liste, ou si `distance_max_m > analysis_range_m` — aucune exception
  propagée.
  - Preuve : `app/lib/db/profilConfig.ts:74-78` et `:118-121` ; défaut défini
    `app/lib/svv/profilDegagement.ts:96-132`.
- Statuts internes (pour info) : ~38 variables VIVES ; 5 VESTIGIALES (`boost_f2`, `forfait_cone_central`,
  `forfait_extremites`, `cone_f3_demi_angle_deg`, `natures_remarquables`) ; 1 DE GARDE
  (`mode_combinaison`, liste fermée `MODES_VALIDES`, `profilConfig.ts:50,75`) ; 1 MIROIR
  (`analysis_range_m`, garde-fou seulement — l'extraction utilise la constante de code `ANALYSIS_RANGE_M`,
  `config.ts:25`).
- ⚠️ **Dette** : il n'existe **aucun `CREATE TABLE config_scoring`** dans le dépôt (table créée hors
  versioning ; seul un `ALTER` existe, `scripts/migration_config_scoring_orientation_annee_portee.sql:12-26`).

## 8. FICHIERS SENSIBLES — recon lecture seule obligatoire avant tout write
Chemins réels confirmés (relatifs à la racine du dépôt) :
- **Moteur pur (calcul)** :
  - `app/lib/svv/verdict.ts` — verdict géométrique binaire.
  - `app/lib/svv/coucheDegagement.ts` — note de dégagement /80 (`noteDegagement`, `distancePercueFaisceau`, couloir, cartouches).
  - `app/lib/svv/scoreDegagement.ts` — `FaisceauResultat`, Famille 1.
  - `app/lib/svv/scoreTotal.ts` — agrégation /100.
  - `app/lib/svv/analyse.ts` — orchestration Bloc A (`analyser`).
  - `app/lib/svv/profilDegagement.ts` — `ProfilDegagement` + `PROFIL_DEGAGEMENT_DEFAUT`.
  - `app/lib/svv/config.ts` — constantes métier (seuil, hauteurs, portée).
- **Accès données / pipeline** :
  - `app/lib/db/pipeline.ts` — pivot `analyserAdresse`.
  - `app/lib/db/profilConfig.ts` — chargement `config_scoring`.
  - `app/lib/db/faisceaux.ts` — 61 faisceaux + enrichissement familles patrimoine (`enrichirFamilles`).
  - `app/lib/db/obstacles.ts` — obstacles axe, nature, cartouches (opérations `ST_Force2D`).
  - `app/lib/db/origine.ts` — validation point d'origine.
  - `app/lib/db/hauteurLidar.ts` — lecture hauteur LiDAR.
- **Front sensible** :
  - `app/page.tsx` — SPA du parcours (machine à états, ~3080 lignes).
  - `app/MapContent.tsx`, `app/MapSelector.tsx`, `app/FaisceauMap.tsx`, `app/origine/Carte.tsx` — cartes.
- **Test golden** : `app/lib/db/pipeline.itest.ts`.

## 9. FICHIERS GEMINI — hors staging
Les deux fichiers d'analyse IA photo (Gemini), à **maintenir hors staging** :
- `app/lib/svv/adaptateurIaPhoto.ts` (confirmé présent).
- `app/api/analyse-photo/route.ts` (confirmé présent).

## 10. STACK — versions réelles (`package.json`)
- **Next.js `16.2.9`** (`package.json:28` ; `eslint-config-next` `16.2.9`, `:46`).
- **React `19.2.4`** et **React-DOM `19.2.4`** (`package.json:31-32`).
- **TypeScript `^5`** (`package.json:49`).
- **Tailwind CSS `^4`** (`package.json:47` ; `@tailwindcss/postcss` `^4`, `:37`).
- **Driver PostgreSQL** : `pg` (node-postgres) **`^8.21.0`** (`package.json:29`) ; connexion via `Pool`
  sur `DATABASE_URL` (`app/lib/db/client.ts:8`).
- Autres : `leaflet ^1.9.4` + `react-leaflet ^5.0.0`, `proj4 ^2.20.9`, `exifr ^7.1.3`,
  `libphonenumber-js`, `react-international-phone` ; tests `vitest ^4.1.9`.
- **Version du serveur PostgreSQL / PostGIS : NON CONFIRMÉ** depuis `package.json` (c'est le serveur, pas
  une dépendance npm ; la doc mentionne PostgreSQL 17 + PostGIS mais ce n'est pas prouvable dans le code —
  la route `app/api/sante` la reporte à l'exécution seulement).

---

### Notes de traçabilité
- Chemin absolu des fichiers TS = `…/sansvisavis/app/app/lib/…` (dossier `app/` imbriqué) ; les chemins
  ci-dessus sont **relatifs à la racine du dépôt** (`app/lib/…`, `app/page.tsx`).
- Docs en retard sur le code (non-invariants, à ne pas prendre pour argent comptant) : hauteur d'étage
  2,90 → réellement 2,80 dérivé (voir §3) ; `SPEC_ponderation_familles.md` marquée « non implémentée »
  alors que le barème familles est codé ; commentaires périmés `scoreDegagement.ts:74`
  (« emblématique toujours false ») et en-tête `coucheDegagement.ts` (« NON BRANCHÉ »).
