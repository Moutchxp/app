# SPEC — Étape 8 : Migration patrimoine unifiée (`patrimoine_entite` + `patrimoine_entite_batiment`)

> Spec EARS. **Livrable = cette spec.** RFC 2119. Produite via `/svav-specs`. **Chantier MOTEUR GOLDEN-ADJACENT** :
> le golden lit le patrimoine **EN BASE** (pas via `PROFIL_GOLDEN_REF`) → toute divergence de flag casse
> `29.107259068449615`. Pré-requis de la carte de curation M4 (Étape 9). À valider par Arno avant `/svav-build`.

## Besoin
Unifier les 3 familles patrimoine (MH, Inventaire, Mondial), aujourd'hui dans 3 schémas hétérogènes, dans
un modèle **entité + liaison + source** (gabarit du mondial), et **réécrire le chemin de lecture du moteur**
(`faisceaux.ts:100-108`) pour lire ce modèle unifié — **en reproduisant à l'identique** les flags
`is_mh / is_inv / is_emblematique` de chaque `cleabs`.

## Recon confirmée (`fichier:ligne`, mesuré en base)
- **Lecture moteur actuelle** — `enrichirFamilles` (`faisceaux.ts:93-121`), un SELECT par lot de `cleabs` :
  - `is_mh` = `EXISTS(monuments_historiques WHERE cleabs=t.cleabs)` (`:103`) — **AUCUN filtre `actif`**.
  - `is_inv` = `EXISTS(inventaire_general WHERE cleabs=t.cleabs AND badge_actif)` (`:104`) — filtre **PAR-LIAISON** `(ref,cleabs)`.
  - `is_emblematique` = `EXISTS(monument_emblematique_batiment meb JOIN monuments_emblematiques me WHERE meb.cleabs=t.cleabs AND me.actif=true)` (`:105-107`) — filtre **ENTITÉ** mondial.
  - `impactAnnee` = `bdnb_annee_batiment` (`:102`) — **HORS PÉRIMÈTRE** (année ≠ patrimoine ; piloté par les cartes d'année).
- **Schéma réel** (mesuré) : `monuments_historiques(ref, geom Point 2154, cleabs varchar(24) nullable)` — 176 MH, **152** `cleabs NOT NULL` ; `inventaire_general(ref, cleabs, badge_actif bool, geom_point Point 2154, UNIQUE(ref,cleabs))` — **250** paires `(ref,cleabs)` `badge_actif=true` ; `monuments_emblematiques(id, geom_point Point 2154, actif bool)` + `monument_emblematique_batiment(monument_id, cleabs, source CHECK(auto|manuel), PK(monument_id,cleabs))` — **14** liaisons `actif`.
- **Cas de bord mesuré** : **8 `cleabs` bi-famille MH ∩ Inventaire** (INTERSECT).
- **Golden** : `analyserAdresse` construit `EntreeComplete` en lisant les tables **live** (`enrichirFamilles`), PUIS `analyser(entree, PROFIL_GOLDEN_REF)`. **Les flags viennent de la DB, pas du profil gelé** → non découplé.
- **Précédence réelle** : **mondial > MH > Inventaire > année > `null`** (mondial court-circuité
  `distancePercueFaisceau:110` AVANT `familleCoeff` ; MH `:47`, Inventaire `:48`). Vit dans le MOTEUR.

## Périmètre
**DANS** : (1) tables `patrimoine_entite` + `patrimoine_entite_batiment` (migration 009, `CREATE TABLE IF NOT
EXISTS` + seed) ; (2) réécriture des **3 EXISTS patrimoine** de `faisceaux.ts:103-107` sur le modèle unifié ;
(3) **instrumentation d'équivalence** des flags + jeu scellé.
**HORS** : la lecture `impactAnnee` (`faisceaux.ts:102`, inchangée), le **verdict**, `config_scoring`, le
calcul du faisceau hors patrimoine (base F1, F4 nature, cumul, couloir, orientation), et **la carte/curation
M4** (Étape 9 : écritures `source='manuel'`, déplacement de points — hors de cette migration). La **purge**
des 3 tables sources = **commit séparé ultérieur** (§OQ6).

## Invariants SVAV (garde-fous durs)
- **GOLDEN BIT-IDENTIQUE** : après build, `npm run test:integration` **14/14 à `29.107259068449615`**. Aucune
  divergence de flag admise. Golden bouge → **STOP, ne rien resceller, signaler (Phase 7)**.
- **`geom_point` = Lambert-93 / EPSG:2154** (jamais reprojeté en base ; affichage Leaflet ultérieur =
  `ST_Transform(…,4326)` **côté requête**, pas en base).
- **`ST_Force2D`** conservé sur **toute lecture géométrique** (rattachement KNN du seed, curation ultérieure).
- **Tolérance rattachement AUTO 15 m** verrouillée (KNN point→emprise).
- **Précédence mondial > MH > Inventaire** : dans le MOTEUR (`familleCoeff`/`distancePercueFaisceau`) — la
  migration **N'Y TOUCHE PAS** ; elle préserve seulement des **flags indépendants**.
- **MUST NOT** : verdict (100 % géométrique), valeur du golden, `ST_Force2D`, Gemini, `config_scoring`, et le
  calcul du faisceau hors patrimoine.

---

## Modèle de données cible

### `patrimoine_entite`
`id serial PK`, `famille text NOT NULL CHECK (famille IN ('mondial','mh','inventaire'))`, `ref_code text
NOT NULL`, `nom text`, `statut text` (`classe|inscrit|bati_patrimonial|mondial`), **`geom_point
geometry(Point,2154)`** (nullable pour Inventaire), `actif boolean NOT NULL DEFAULT true`, `meta jsonb`.
Index : `gist(geom_point)`, `(famille)`, `(ref_code)`.

### `patrimoine_entite_batiment` (liaison)
`entite_id integer NOT NULL REFERENCES patrimoine_entite(id)`, `cleabs text NOT NULL`, `source text NOT NULL
CHECK (source IN ('auto','manuel'))`, **`actif boolean NOT NULL DEFAULT true`** *(OQ1)*, `dist_m double
precision`, `verifie_manuellement boolean NOT NULL DEFAULT false`, `created timestamptz NOT NULL DEFAULT
now()`, **PK `(entite_id, cleabs)`**. Index : `(cleabs)` (jointure inverse faisceau→entité).

---

## Arbitrages (OQ1–OQ7 — TRANCHÉS)

### OQ1 (CRITIQUE golden) — TRANCHÉ : colonne `actif` PAR-LIAISON
`patrimoine_entite_batiment` reçoit une colonne **`actif boolean NOT NULL DEFAULT true`** qui porte le
`badge_actif` de l'Inventaire **au niveau liaison** (préserve la traçabilité des inactives pour la curation).
`is_inv` = `EXISTS(liaison famille='inventaire' AND liaison.actif)` → reproductible à l'identique
(250 paires actives → 250 liaisons `actif=true` ; les inactives → liaisons `actif=false`, présentes mais
non comptées). *(Écarté : ne seeder que les actives — perdrait la traçabilité pour la curation M4.)*
> Asymétrie assumée (= existant) : Inventaire filtre sur **`liaison.actif`** ; mondial filtre sur
> **`entite.actif`** ; MH ne filtre PAS.

### OQ2 — TRANCHÉ : entité par `ref`, liaison par `(ref,cleabs)`
**Une `patrimoine_entite` par `ref` distinct** (descriptifs dédupliqués une fois : `nom`, `statut`,
`geom_point`, `meta`). **Une `patrimoine_entite_batiment` par paire `(ref,cleabs)`** avec `cleabs NOT NULL`
(`entite_id` = entité du `ref`, `actif` = `badge_actif` de la paire, `source='auto'`, `dist_m` conservé si
disponible). Les paires `cleabs NULL` (non rattachées) → **aucune** liaison (entité « rouge »).

### OQ3 — TRANCHÉ : bi-famille = 2 entités indépendantes, aucune fusion
Pour les **8 `cleabs` MH ∩ Inventaire** : l'entité **`famille='mh'`** possède sa liaison vers ce `cleabs`,
ET l'entité **`famille='inventaire'`** possède la sienne — **indépendamment**. `is_mh` ET `is_inv` restent
**tous deux `true`**. **Aucune fusion d'entités entre familles** (les 3 EXISTS restent indépendants).

### OQ4 (CRITIQUE golden) — TRANCHÉ : équivalence de flags complète + jeu scellé + golden
Preuve d'invariance en **trois volets** (tous requis) :
1. **Équivalence de flags SUR TOUT L'ENSEMBLE** : pour **chaque `cleabs`** ayant une liaison patrimoine
   (union des 3 tables sources), comparer `(is_mh, is_inv, is_emblematique)` calculés par l'**ancienne**
   requête (3 tables) vs la **nouvelle** (modèle unifié) → **`divergences = 0`** (requête de comparaison,
   non un échantillon).
2. **Jeu de points SCELLÉS dédié** couvrant : un `cleabs` **bi-famille MH∩Inv**, un **emblématique+MH**, un
   bâti aux **bornes 1900** et **1935**, un **flanc en cumul-nature**, un **couloir**. Les triplets de flags
   attendus (et, si exécutable, le score) sont **capturés au build** et scellés.
3. **GOLDEN** : `test:integration` **14/14 à `29.107259068449615`**, bit-identique.

### OQ5 — TRANCHÉ : forme des 3 EXISTS unifiés
`faisceaux.ts:103-107` remplacé par (la ligne `:102` année **INCHANGÉE**) :
```sql
is_mh = EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                WHERE peb.cleabs = t.cleabs AND pe.famille = 'mh')
is_inv = EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                 WHERE peb.cleabs = t.cleabs AND pe.famille = 'inventaire' AND peb.actif)
is_emblematique = EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                          WHERE peb.cleabs = t.cleabs AND pe.famille = 'mondial' AND pe.actif = true)
```
Granularité **identique** à l'existant : MH sans filtre, Inventaire filtre **liaison** (`peb.actif`), mondial
filtre **entité** (`pe.actif`). Le SELECT reste **cleabs-only** (aucune géométrie) → pas de `ST_Force2D` dans
CETTE requête ; `ST_Force2D` s'applique au **seed** (rattachement KNN) et à la curation ultérieure.

### OQ6 — TRANCHÉ : sources conservées, purge en commit séparé
Les 3 tables sources (`monuments_historiques`, `inventaire_general`, `monuments_emblematiques` /
`monument_emblematique_batiment`) sont **CONSERVÉES en lecture** pendant la validation (rollback possible).
Leur **purge** = **chantier/commit SÉPARÉ ultérieur**, jamais dans cette migration.

### OQ7 — TRANCHÉ : mapping seed
| Famille | `statut` | `geom_point` (2154) | `meta` JSONB (descriptif) | `ref_code` |
|---|---|---|---|---|
| `mh` | `classe`\|`inscrit` (depuis `monuments_historiques.statut`) | `monuments_historiques.geom` | `{tico, deno, …}` | `ref` (PA…) |
| `inventaire` | `bati_patrimonial` | `inventaire_general.geom_point` (souvent NULL) | `{deno, nom, datation, adresse, cada_ref}` | `ref` (IA…) |
| `mondial` | `mondial` | `monuments_emblematiques.geom_point` | `{code, nom}` | `code` |
`geom_point` reste **Point 2154**, jamais reprojeté en base.

---

## User stories
- **US1** — En tant que **mainteneur**, je veux **un modèle patrimoine unifié** (entité + liaison + source)
  pour les 3 familles, afin de préparer la curation M4 **sans changer le score**.
- **US2** — En tant que **garant du golden**, je veux **prouver** que les flags patrimoine sont identiques
  avant/après migration, afin que `29.107259068449615` reste bit-identique.

## Exigences EARS

### Tables + seed
- **EX-1** [Ubiquitaire] La migration 009 DOIT créer `patrimoine_entite` et `patrimoine_entite_batiment` via
  `CREATE TABLE IF NOT EXISTS` (idempotent), avec les CHECK `famille`, `source`, et la colonne liaison `actif`.
- **EX-2** [Ubiquitaire] Le seed DOIT créer **une entité par `ref` distinct** pour MH et Inventaire, et
  copier les 14 entités mondiales.
- **EX-3** [Ubiquitaire] Le seed DOIT créer **une liaison `(entite_id, cleabs)`** pour chaque paire source à
  `cleabs NOT NULL` : 152 MH (`actif=true`), les paires Inventaire `(ref,cleabs)` (`actif=badge_actif`), 14
  mondiales.
- **EX-4** [Ubiquitaire] Le seed DOIT être **idempotent** (rejouable sans doublon — ex. `WHERE NOT EXISTS`).
- **EX-5** [Ubiquitaire] `patrimoine_entite.geom_point` DOIT être en **EPSG:2154**, copié sans reprojection.

### Moteur — réécriture équivalente
- **EX-6** [Ubiquitaire] `enrichirFamilles` DOIT calculer `is_mh` / `is_inv` / `is_emblematique` depuis
  `patrimoine_entite`/`_batiment` selon les 3 EXISTS d'OQ5.
- **EX-7** [Ubiquitaire] `is_mh` DOIT rester **sans filtre `actif`** ; `is_inv` filtré sur **`peb.actif`** ;
  `is_emblematique` filtré sur **`pe.actif`**.
- **EX-8** [Ubiquitaire] La lecture `impactAnnee` (`faisceaux.ts:102`, `bdnb_annee_batiment`) DOIT rester
  **inchangée**.
- **EX-9** [Ubiquitaire] Les **flags DOIVENT rester indépendants** par `cleabs` (un `cleabs` bi-famille porte
  plusieurs flags).
- **EX-10** [MUST NOT] La réécriture NE DOIT PAS modifier la précédence (mondial > MH > Inventaire), qui vit
  dans `familleCoeff`/`distancePercueFaisceau` (hors périmètre).

### Invariance (golden)
- **EX-11** [Ubiquitaire] Une instrumentation DOIT comparer, pour **chaque `cleabs`** lié au patrimoine, les
  triplets `(is_mh, is_inv, is_emblematique)` ancien vs nouveau → **`divergences = 0`**.
- **EX-12** [Ubiquitaire] Un **jeu scellé** (bi-famille, emblématique+MH, bornes 1900/1935, flanc cumul,
  couloir) DOIT être vérifié (triplets attendus).
- **EX-13** [Ubiquitaire] Après build, `test:integration` DOIT être **14/14 à `29.107259068449615`**.
- **EX-14** [Indésirable] SI le golden bouge OU une divergence de flag apparaît, ALORS le build DOIT
  **s'arrêter et le signaler**, jamais resceller.

### Géométrie / sources
- **EX-15** [Ubiquitaire] Toute lecture géométrique (rattachement KNN du seed) DOIT conserver `ST_Force2D`.
- **EX-16** [Ubiquitaire] Le rattachement AUTO DOIT conserver la tolérance **15 m** (KNN).
- **EX-17** [Ubiquitaire] Les 3 tables sources DOIVENT rester en base (lecture) — **aucune purge** dans cette
  migration.
- **EX-18** [MUST NOT] Le chantier NE DOIT toucher ni le verdict, ni `config_scoring`, ni `ST_Force2D`, ni
  Gemini, ni le calcul du faisceau hors patrimoine.

---

## Protocole d'instrumentation (EX-11/12 — détaillé)
Requête de comparaison (build-time, non committée ou committée en test) :
```sql
WITH src AS (   -- ancienne sémantique (3 tables)
  SELECT c.cleabs,
         EXISTS(SELECT 1 FROM monuments_historiques WHERE cleabs=c.cleabs) AS mh,
         EXISTS(SELECT 1 FROM inventaire_general WHERE cleabs=c.cleabs AND badge_actif) AS inv,
         EXISTS(SELECT 1 FROM monument_emblematique_batiment meb JOIN monuments_emblematiques me ON me.id=meb.monument_id
                WHERE meb.cleabs=c.cleabs AND me.actif) AS emb
  FROM (<union des cleabs des 3 sources>) c
), uni AS ( <mêmes 3 flags via patrimoine_entite/_batiment> )
SELECT count(*) FROM src JOIN uni USING(cleabs)
WHERE src.mh<>uni.mh OR src.inv<>uni.inv OR src.emb<>uni.emb;  -- DOIT = 0
```

## Cas de test explicites exigés
| Scénario | Attendu |
|---|---|
| Équivalence de flags sur **tous** les cleabs patrimoine | **divergences = 0** |
| `cleabs` bi-famille MH∩Inv (l'un des 8) | `is_mh=true` **ET** `is_inv=true` (indépendants) |
| MH `cleabs` (existence) | `is_mh=true` sans filtre `actif` |
| Inventaire paire `badge_actif=false` (inactive) | liaison présente `actif=false`, `is_inv=false` |
| Mondial `me.actif=true` | `is_emblematique=true` |
| Seed rejoué | idempotent (aucun doublon) |
| **GOLDEN** défaut | `test:integration` **14/14, `29.107259068449615`** bit-identique |
| Jeu scellé (5 catégories) | triplets attendus figés |
| Sources conservées | 3 tables sources toujours présentes après migration |

---

## Statut : Spec **FIGÉE** (OQ1–OQ7 tranchés)
Aucune question ouverte restante. *Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra
sur cette base — chantier **golden-adjacent** : instrumentation flags (divergences=0) + jeu scellé + golden
14/14 sont ce qui le sécurise. Ne pas enchaîner sur M4 (Étape 9) tant que l'invariance n'est pas prouvée.*
