# SPEC — Étape 9 : Carte de curation patrimoine (M4)

> Spec EARS. **Livrable = cette spec.** RFC 2119. Produite via `/svav-specs`. Pré-requis **Étape 8**
> (`patrimoine_entite` + `patrimoine_entite_batiment`, migration 009) **fait et prouvé invariant**.
> Chantier **data + UI admin**, **golden-adjacent partiel** (les liaisons alimentent le score). À valider
> par Arno avant `/svav-build`.

## Besoin
Une carte admin unique (Leaflet) pour **curer le rattachement** des 3 familles patrimoine : afficher tous
les points (filtres/couleurs d'état), **déplacer** un point mal géocodé (réversible, borné),
**rattacher/détacher/composer** des emprises `bdtopo_batiment` (`cleabs`) à la main. Objectif : corriger
les rattachements automatiques imparfaits, sans jamais perdre la donnée d'origine ni casser le golden.

## Recon / existant réutilisé (ne pas réinventer)
- **Leaflet** : `react-leaflet` déjà dépendance ; réutiliser le pattern `MapSelector.tsx` / `FaisceauMap.tsx`
  et le passage **2154 ↔ 4326** (`ST_Transform(geom,4326)` côté requête pour l'affichage).
- **Garde admin** : `proxy.ts` + session signée (en place). **Nav « Curation »** déjà présente
  (`Sidebar.tsx:13` → `/admin/curation`, placeholder à remplir).
- **Emprises** : `bdtopo_batiment(geom 2154, cleabs)` ; sélection = clic (pattern `check-building`).
- **Modèle (Étape 8)** : `patrimoine_entite(id, famille, ref_code, nom, statut, geom_point 2154, actif, meta)`
  + `patrimoine_entite_batiment(entite_id, cleabs, source auto|manuel, actif, dist_m, verifie_manuellement,
  created, PK(entite_id,cleabs))`.
- **⚠️ Fait moteur DÉCISIF** (recon Étape 8) : `enrichirFamilles` (`faisceaux.ts:100-121`) lit les familles
  **par `cleabs` (liaisons)**, **PAS par `geom_point`**. → **déplacer un point n'affecte PAS le score** ;
  seules les **liaisons** (rattacher/détacher) le font.

## Périmètre
**DANS** : (1) migration 010 additive (colonne `geom_point_corrige`, colonne `detache`, table
`curation_patrimoine_log`) ; (2) endpoints CRUD curation (déplacer/annuler point, rattacher/détacher,
marquer vérifié) ; (3) la carte + panneau latéral ; (4) un ajout **golden-safe** au moteur : exclure les
liaisons détachées.
**HORS** : le rattachement AUTO (import/parcours), le re-import (roadmap), le verdict, `config_scoring`, le
calcul du faisceau hors patrimoine, la précédence (moteur).

## Invariants SVAV (garde-fous durs)
- **DÉPLACEMENT RÉVERSIBLE** (décision Arno n°1) : `patrimoine_entite.geom_point` **n'est JAMAIS muté**. La
  correction vit dans une colonne dédiée `geom_point_corrige` (null = pas de correction). « Annuler » remet
  `geom_point_corrige = NULL`. L'original reste **toujours récupérable**.
- **RAYON BORNÉ** (n°2) : déplacement manuel limité à **`CURATION_DEPLACEMENT_RAYON_MAX_M` (défaut 150 m)**
  autour du `geom_point` d'origine ; distance en **Lambert-93/2154** ; au-delà → **refus 422**.
- **RÉATTRIBUTION MANUELLE** (n°3) : rattacher = clic sur une emprise → liaison `source='manuel'` (jamais de
  recalcul auto). **Le manuel prime et n'est jamais écrasé au ré-import** (`DELETE WHERE source='auto'`,
  manuel préservé). La **tolérance 15 m** concerne le rattachement AUTO, **PAS** la curation manuelle.
- **JOURNAL DÉDIÉ** (n°4) : table `curation_patrimoine_log` **append-only**, séparée de `config_edit_log`.
- **GÉOMÉTRIE** : tout en **2154** en base ; `ST_Transform(…,4326)` pour l'affichage ; **`ST_Force2D`**
  conservé sur toute lecture/écriture géométrique.
- **GOLDEN** : déplacer un point = **golden-safe** (moteur cleabs-only). Les **liaisons/détachements**
  touchent le score → **golden à RE-JOUER après curation lourde** (le golden lit le patrimoine en base).
- **MUST NOT** : verdict (100 % géométrique), `ST_Force2D`, Gemini, `config_scoring`, `PROFIL_GOLDEN_REF`,
  précédence mondial > MH > Inventaire (moteur), calcul du faisceau hors patrimoine.

---

## Modèle de données (migration 010, additive)
- **`patrimoine_entite`** : + `geom_point_corrige geometry(Point,2154)` (nullable). *Point effectif* =
  `COALESCE(geom_point_corrige, geom_point)`.
- **`patrimoine_entite_batiment`** : + `detache boolean NOT NULL DEFAULT false`. Une liaison AUTO « détachée
  manuellement » devient un **tombstone** (`detache=true`, `source='manuel'`) — préservée pour bloquer un
  ré-ajout au ré-import, mais **exclue du score**.
- **`curation_patrimoine_log`** (NEW) : `id bigserial PK`, `ts timestamptz NOT NULL DEFAULT now()`,
  `action text NOT NULL CHECK (action IN ('deplacement','annulation_deplacement','rattachement',
  'detachement','verification'))`, `entite_id integer NOT NULL`, `cleabs text` (null pour un déplacement),
  `avant jsonb`, `apres jsonb`. Append-only (aucun UPDATE/DELETE applicatif).

### Ajout moteur (golden-safe) — exclusion des détachés
Les 3 EXISTS de `faisceaux.ts:103-107` gagnent **`AND NOT peb.detache`**. **Golden-safe par construction** :
la donnée actuelle a `detache=false` partout → flags inchangés → **instrumentation `divergences=0` + golden
14/14** (à re-prouver au build). Le filtre ne « mord » que lorsqu'un détachement existe.

---

## Décisions / OQ — TRANCHÉS

- **OQ-A (stockage réversible) — TRANCHÉ : colonne `geom_point_corrige`** sur `patrimoine_entite` (pas de
  table séparée). Plus simple, 1 point corrigé par entité, `NULL`=aucune correction, « annuler »=`NULL`,
  original intact. *(Table de correction écartée : sur-ingénierie pour un point unique par entité.)*
- **OQ-B (rayon défaut) — TRANCHÉ : `CURATION_DEPLACEMENT_RAYON_MAX_M = 150 m`** (échelle d'un îlot),
  centralisé (aucune valeur magique dispersée), ajustable. Distance `ST_Distance` en 2154.
- **OQ-C (journal) — TRANCHÉ** : table `curation_patrimoine_log` ci-dessus (5 actions, `avant/apres` JSONB).
- **OQ-D (endpoints CRUD)** — TRANCHÉ (formes en §EARS) : server-only sous `proxy.ts`, écriture **atomique**
  (CTE : mutation + INSERT journal en un `query()`), validation applicative (rayon, existence, source).
- **OQ-E (effet du point corrigé sur le rattachement) — TRANCHÉ** : `geom_point_corrige` **n'est lu par le
  MOTEUR d'AUCUNE façon** (le moteur est cleabs-only) ; il sert à l'**affichage** et d'**aide à la
  réattribution manuelle** (recentrer la carte / proposer l'emprise la plus proche à cliquer). Il **ne
  déclenche AUCUN recalcul automatique** de rattachement et **n'écrit aucune liaison**. → **un déplacement
  seul est golden-safe.**
- **OQ-Détachement (soulevé) — TRANCHÉ** : détacher une liaison **`source='manuel'`** = `DELETE` simple
  (le manuel n'est pas ré-ajouté au ré-import). Détacher une liaison **`source='auto'`** = **tombstone**
  (`detache=true, source='manuel'`) pour durabilité ; le moteur l'exclut (`AND NOT detache`). Les deux
  journalisés.

---

## User stories
- **US1** — En tant qu'**opérateur (Arno)**, je veux **voir et filtrer** tous les points patrimoine par
  famille et par état, afin de repérer les rattachements à corriger.
- **US2** — Je veux **déplacer** un point mal géocodé (borné, réversible), afin de le recentrer sans perdre
  l'original.
- **US3** — Je veux **rattacher/détacher/composer** des emprises `cleabs` à la main, afin de corriger ou
  compléter le rattachement (grands monuments multi-polygones).
- **US4** — Je veux **marquer un rattachement auto comme vérifié** (→ vert), afin de valider sans changer la
  source.

## Exigences EARS

### Affichage / filtres (US1)
- **EX-1** [Ubiquitaire] La page `/admin/curation` DOIT afficher une carte Leaflet des entités patrimoine,
  le **point effectif** = `COALESCE(geom_point_corrige, geom_point)`, projeté en **4326** (`ST_Transform`).
- **EX-2** [Ubiquitaire] La carte DOIT offrir des **filtres par famille** (MH / Inventaire / Mondial,
  afficher/masquer indépendants).
- **EX-3** [Ubiquitaire] Chaque point DOIT être **coloré par état** : **rouge** = entité sans liaison active
  (à placer) ; **orange** = au moins une liaison `source='auto'` non vérifiée (aucune `manuel`/vérifiée) ;
  **vert** = au moins une liaison `source='manuel'` OU `verifie_manuellement=true`.
- **EX-4** [Ubiquitaire] Un **panneau latéral** DOIT lister les entités filtrées, un **compteur par état**,
  et une **recherche** par `nom`/`ref_code`.
- **EX-5** [Événementiel] QUAND l'opérateur sélectionne une entité, le système DOIT afficher ses liaisons
  (`cleabs`, `source`, `actif`, `detache`) et surligner les emprises `bdtopo_batiment` correspondantes.

### Déplacement du point (US2)
- **EX-6** [Événementiel] QUAND l'opérateur déplace le point d'une entité, le système DOIT écrire la
  nouvelle position dans **`geom_point_corrige`** (jamais dans `geom_point`).
- **EX-7** [Indésirable] SI la distance (2154) entre la position demandée et `geom_point` d'origine dépasse
  **`CURATION_DEPLACEMENT_RAYON_MAX_M`**, ALORS le système DOIT **refuser (422)** avec un message clair,
  sans rien écrire.
- **EX-8** [Événementiel] QUAND l'opérateur clique « annuler le déplacement », le système DOIT remettre
  `geom_point_corrige = NULL` (retour à l'original).
- **EX-9** [Ubiquitaire] Un déplacement (ou son annulation) NE DOIT modifier **aucune liaison** ni **aucun
  flag** lu par le moteur.

### Rattachement / détachement / composition (US3)
- **EX-10** [Événementiel] QUAND l'opérateur clique une emprise `bdtopo_batiment` pour rattacher, le système
  DOIT **insérer** (ou réactiver) une liaison `patrimoine_entite_batiment(entite_id, cleabs, source='manuel',
  detache=false)`.
- **EX-11** [Ubiquitaire] Une entité DOIT pouvoir porter **plusieurs `cleabs`** (composition multi-polygones)
  — chaque rattachement = une liaison, PK `(entite_id, cleabs)`.
- **EX-12** [Événementiel] QUAND l'opérateur détache une liaison `source='manuel'`, le système DOIT la
  **supprimer** (`DELETE`).
- **EX-13** [Événementiel] QUAND l'opérateur détache une liaison `source='auto'`, le système DOIT la marquer
  **`detache=true, source='manuel'`** (tombstone durable), et NON la supprimer.
- **EX-14** [Ubiquitaire] Le rattachement manuel NE DOIT PAS appliquer la tolérance 15 m (réservée à l'AUTO).
- **EX-15** [Ubiquitaire] Le moteur (`faisceaux.ts` 3 EXISTS) DOIT **exclure les liaisons `detache=true`**
  (`AND NOT peb.detache`) — golden-safe (données actuelles toutes `detache=false`).

### Vérification (US4)
- **EX-16** [Événementiel] QUAND l'opérateur marque une liaison auto « vérifiée », le système DOIT poser
  `verifie_manuellement = true` **sans** changer `source` (promotion orange → vert).

### Journal + écriture
- **EX-17** [Ubiquitaire] Chaque écriture de curation (déplacement, annulation, rattachement, détachement,
  vérification) DOIT être **journalisée** dans `curation_patrimoine_log` (`action`, `entite_id`, `cleabs`,
  `avant`, `apres`) — **append-only**.
- **EX-18** [Ubiquitaire] Chaque écriture DOIT être **atomique** (mutation + INSERT journal en un seul
  `query()` via CTE) et **server-only**, sous la garde `proxy.ts` (sans session → 401).
- **EX-19** [MUST NOT] Le build/l'agent NE DOIT JAMAIS déplacer/rattacher/détacher de façon **autonome** ;
  seule l'action de l'internaute admin déclenche une écriture (tests sur `query` mockée).

### Isolation / golden
- **EX-20** [Ubiquitaire] `patrimoine_entite.geom_point` (original) NE DOIT JAMAIS être écrit par la
  curation.
- **EX-21** [Ubiquitaire] Après le build (ajout `AND NOT detache`), `test:integration` DOIT rester **vert à
  `29.107259068449615`** (instrumentation flags `divergences=0` avec les données actuelles).
- **EX-22** [MUST NOT] Le chantier NE DOIT toucher ni le verdict, ni `config_scoring`, ni `ST_Force2D`
  (conservé), ni Gemini, ni `PROFIL_GOLDEN_REF`, ni la précédence (moteur), ni le calcul hors patrimoine.

---

## Découpe + conformité (vérifiable)
| Tâche | Contenu | Critère |
|---|---|---|
| T1 | Migration 010 (colonnes `geom_point_corrige`/`detache` + `curation_patrimoine_log`) | additive/idempotente ; sources conservées ; 2154 |
| T2 | Ajout moteur `AND NOT peb.detache` | **instrumentation `divergences=0`** + golden 14/14 (données actuelles) |
| T3 | Endpoints CRUD (déplacer/annuler/rattacher/détacher/vérifier) | validation rayon 422 ; atomiques CTE ; journal ; 401 sans session |
| T4 | Carte + panneau (Leaflet, filtres, couleurs, recherche) | affichage 4326 ; couleurs d'état ; responsive 375 px |
| Conformité | Non-régression | golden `29.107259068449615` · `geom_point` original jamais écrit · isolation |

## Cas de test explicites exigés
| Scénario | Attendu |
|---|---|
| Déplacer un point de 50 m (≤ 150) | `geom_point_corrige` écrit ; `geom_point` inchangé ; **golden inchangé** |
| Déplacer de 300 m (> 150) | **422**, aucune écriture |
| Annuler un déplacement | `geom_point_corrige = NULL` |
| Rattacher un `cleabs` (clic emprise) | liaison `source='manuel'` ; entité passe **vert** ; **golden à re-jouer** |
| Composer 3 `cleabs` sous une entité | 3 liaisons manuel |
| Détacher une liaison **manuel** | `DELETE` |
| Détacher une liaison **auto** | tombstone `detache=true, source='manuel'` ; moteur l'exclut |
| Marquer auto « vérifié » | `verifie_manuellement=true`, source inchangée, **vert** |
| `AND NOT detache` (données actuelles) | **instrumentation `divergences=0`**, golden **14/14** |
| Écriture sans session | **401** (proxy) |

---

## Statut : Spec **FIGÉE** (tous OQ tranchés)
Aucune question ouverte. *Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra sur
cette base.* **Séquencement** : T2 (moteur `AND NOT detache`) est **golden-adjacent** → instrumentation +
golden dans le même chantier ; le reste (déplacement/point) est **golden-safe** (moteur cleabs-only).
**Rappel** : re-jouer le golden après toute curation lourde (le golden lit le patrimoine live).
