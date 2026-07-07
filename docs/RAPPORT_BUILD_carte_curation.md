# RAPPORT FINAL — build « Étape 9 : Carte de curation patrimoine (M4) »

> Run `/svav-build` sur `docs/SPEC_carte_curation.md`. **Chantier MIXTE : golden-SAFE (carte, déplacement,
> journal) + un point golden-ADJACENT (`AND NOT peb.detache`). Non committé.** Catégories : A · B · C.

## Résumé
La carte `/admin/curation` (M4) est construite : migration 010 additive (`geom_point_corrige`, `detache`,
`curation_patrimoine_log`), filtre moteur `AND NOT peb.detache` (**golden-safe prouvé**), endpoints CRUD
server-only atomiques + journal, carte Leaflet + panneau. **Golden 15/15** (`29.107259068449615` inchangé).
**`geom_point` original jamais muté.** Isolation totale (moteur = 3 lignes).

## Fichiers (2 modifiés, 4+ nouveaux)
- `app/lib/db/faisceaux.ts` (M) : **+`AND NOT peb.detache`** sur les 3 EXISTS (`:105-110`) — rien d'autre.
- `app/(admin)/admin/(protected)/curation/page.tsx` (M) : placeholder → wrapper `dynamic(ssr:false)`.
- `db/migrations/010_curation_patrimoine.sql` (NEW, appliqué) : 2 `ADD COLUMN IF NOT EXISTS` + table log.
- `app/lib/admin/curation.ts` (NEW) : `CURATION_DEPLACEMENT_RAYON_MAX_M = 150` + messages.
- `app/(admin)/api/admin/curation/` (NEW) : `partage.ts` + `entites/route.ts` + `entites/[id]/point/route.ts`
  + `entites/[id]/liaisons/route.ts` + `emprises/route.ts` + `curation.test.ts` (20 tests).
- `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` (NEW) : carte Leaflet + panneau.

## A. DÉCISIONS HORS-SPECS
- **A1 — Journal `cleabs` nullable** : un (dé)placement de point n'a pas de `cleabs` → colonne nullable
  (null pour `deplacement`/`annulation_deplacement`, renseignée pour les actions liaison). Bonne pratique.
- **A2 — `cleabs` dans le CORPS des requêtes liaison** (pas en segment d'URL) : évite l'encodage d'URL et
  reste paramétré (`$n`, anti-injection). Alternative écartée : `.../liaisons/[cleabs]` (encodage fragile).
- **A3 — Endpoint `emprises` (aide UI)** : GET `bdtopo_batiment` par bbox (non listé en EARS) pour permettre
  le clic-rattachement ; `ST_Force2D` (la vue est **MultiPolygonZ**), `LIMIT 500`. Lecture seule.
- **A4 — Marqueurs `divIcon` HTML** (au lieu d'icônes image Leaflet) : évite les 404 d'assets d'icônes ;
  couleurs par état via tokens SVAV (`#a30402` rouge, orange, vert). Bonne pratique Leaflet.
- **A5 — Constante rayon dans `app/lib/admin/curation.ts`** (pas `config.ts` moteur) : isolation de la config
  moteur ; `app/lib/admin/` existe déjà. Cohérent « pilotage sans code » (valeur centralisée, ajustable).
- **A6 — Détachement d'une liaison MANUEL = `DELETE`** (action internaute) : c'est une suppression pilotée
  par l'opérateur admin via l'UI, jamais par l'agent au build/test (testée sur `query` **mockée**). Conforme
  à la Règle dure (l'agent ne supprime pas de façon autonome).

## B. DOUTES
- **B1 — `FINDING` hors-scope : second chemin MH legacy** (`obstacles.ts:~828`, cartouche `resoudreMonuments`)
  lit encore la table LEGACY `monuments_historiques` par `cleabs`, **PAS** le modèle unifié → un détachement
  MH (tombstone) **n'y serait pas répercuté**. **Sans impact verdict/score/golden** (cartouche descriptif,
  hors des 3 EXISTS). À planifier hors chantier (généraliser la lecture unifiée aux cartouches descriptifs).
- **B2 — 82 entités sans `geom_point`** (496−414) : sans ancre → non affichables/déplaçables. Traité :
  endpoints gardent `NULL geom_point` (PATCH point → 422 « pas d'ancre »), l'UI les liste (« à placer »)
  sans marqueur. Non bloquant.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV :
  - **INSTRUMENTATION `AND NOT peb.detache`** : flags SANS vs AVEC filtre sur les 401 cleabs → **`divergences=0`**
    (416/416 `detache=false`) — exécutée **avant** l'édition du moteur (gate).
  - **GOLDEN** : `test:integration` **15/15** (14 pré-existants dont `pipeline.itest` `29.107259068449615`
    bit-identique + 1 scellé Étape 8). *(15 = présence du filet scellé, PAS un mouvement du golden.)*
  - **DÉPLACEMENT GOLDEN-SAFE** : le moteur (`faisceaux.ts`, cleabs-only) ne lit NI `geom_point` NI
    `geom_point_corrige` → déplacer un point n'affecte pas le score. Vérifié (aucun lecteur runtime).
  - **`geom_point` ORIGINAL jamais muté** : grep — aucun `SET geom_point =` dans les routes ; seul
    `geom_point_corrige` est écrit ; un test transverse le garantit.
  - **MIGRATION additive** : `ADD COLUMN IF NOT EXISTS` ×2 + `CREATE TABLE IF NOT EXISTS` ; idempotente ;
    **aucune op destructive** ; 6 tables patrimoine (4 sources + 2 unifiées) intactes.
  - **CRUD sûr** : validation stricte → **422/404 jamais 500** ; écriture **atomique** (CTE mutation+journal
    en un `query()`) ; server-only sous `proxy.ts` (401 sans session) ; params `$n` ; `ST_Force2D` partout ;
    `ST_Transform(…,4326)` **affichage seulement** ; détach auto = **tombstone** (jamais DELETE).
  - **ISOLATION** : verdict, `config_scoring`, `PROFIL_GOLDEN_REF`, précédence mondial>MH>Inv, Gemini, calcul
    hors patrimoine — **intouchés** ; aucun import `app/lib/svv` dans curation. `tsc` 0 · `npm test` **362** ·
    eslint 0 · `next build` exit 0.

---

## Verdict de conformité : livraison prête. Point golden-adjacent (filtre `detache`) prouvé golden-safe
## (`divergences=0`, golden 15/15) ; déplacement réversible golden-safe (moteur cleabs-only) ; `geom_point`
## original préservé ; migration additive ; CRUD atomiques sous garde ; isolation totale. Les 5 modules de
## l'interface interne sont couverts. Rappel : re-jouer le golden après toute curation lourde (rattachements
## manuels / tombstones réels), car le golden lit le patrimoine en base. À planifier hors chantier : le
## second chemin MH legacy (`obstacles.ts`, cartouche descriptif) à basculer un jour sur le modèle unifié.
