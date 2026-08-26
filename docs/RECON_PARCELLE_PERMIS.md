# RECON — Afficher les permis au niveau de la PARCELLE sur la carte existante

> LECTURE SEULE. Aucune écriture, aucun moteur touché. Mesuré le 26/08/2026. Chaque chiffre a sa requête.
> Cette recon localise l'existant et mesure l'affichable ; elle ne construit rien.

## A — Localiser l'existant

### A1 — L'écran carte à étendre (étages + année, polygone par polygone)
- **Écran** : `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` — carte **Leaflet** (onglet « Curation » de l'admin ; `'use client'`, `leaflet` importé dynamiquement). C'est **CET écran qu'on étendra**.
- **Source des polygones** : `GET /api/admin/curation/emprises?bbox=…` (route `app/(admin)/api/admin/curation/emprises/route.ts`) :
  ```sql
  SELECT b.cleabs, ST_AsGeoJSON(ST_Transform(ST_Force2D(b.geom), 4326)) AS geom,
         ba.annee_construction AS annee, b.nombre_d_etages AS etages
    FROM bdtopo_batiment b
    LEFT JOIN bdnb_annee_batiment ba ON ba.cleabs = b.cleabs
   WHERE b.geom && ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326), 2154)  -- index gist, LIMIT 500
  ```
- **Rendu** : polygones GeoJSON en Leaflet ; **bulle au survol/tap** (« Mode Infos bâtiment ») via `contenuBulleBatiment` (`curation/bulleBatiment.ts`) → `libelleAnnee` + `libelleEtages`. C'est **`bdtopo_batiment` uniquement**.

### A2 — La couche PARCELLE n'est PAS rendue
La route `/emprises` ne lit **que `bdtopo_batiment`** → seul le BÂTI est affiché, jamais la parcelle. Pour l'ajouter :
- Table **`parcelle`** : `1 139 944` lignes, **MULTIPOLYGON**, **SRID 2154**, index **gist `parcelle_geom_geom_idx`** + btree `id` (idu) + pkey `fid`. **Pas d'index cadastral composite** (commune/section/numero).
- Il faudrait un **nouvel endpoint bbox** (miroir de `/emprises`) renvoyant `ST_AsGeoJSON(ST_Transform(ST_Force2D(geom),4326))` + `id`/`commune`/`section`/`numero`, avec `LIMIT` (1,14 M polygones → borne obligatoire au zoom).

### A3 — Composants de dossier réutilisables (pas de rendu neuf)
- **`CaracteristiquesBloc`** (`permis/CaracteristiquesRendu.tsx`) : détail d'un dossier — **déjà réutilisé** dans `SuiviRattachementVue.tsx` (panneau latéral).
- **`CellulePieces`** (`permis/ArchivesRendu.tsx`) : liste des pièces jointes d'un dossier.
- **Ouverture d'une pièce** : action `url_piece` de `POST /api/admin/permis/reponses` (URL signée, la clé de stockage ne transite jamais) ; écrans `ArchivesVue`/`ArchivesRendu`.
→ Un survol/panneau peut réutiliser ces briques ; **aucun rendu neuf nécessaire**.

## B — Le lien parcelle ↔ dossier

| # | Mesure | Résultat |
|---|---|---|
| **B1** | `permis_parcelle` (table résolue) | **6 lignes / 2 dossiers** → quasi vide, **INEXPLOITABLE**. Le dossier n'a pas d'`idu` → le lien passe par le **cadastre textuel** (`code_insee` + `section` + `numero`). |
| **B2** | Rapprochement cadastral (périmètre courant) | 30 035 dossiers ; 28 931 avec réf. cadastrale (96 %) ; **18 927 matchent une parcelle (63 %)**. Échecs : **4 586 commune non chargée** + **5 430 commune OK mais parcelle introuvable**. |
| **B3** | Parcelles distinctes citées | **22 183** ; 19 834 par 1 dossier, 1 980 par 2, **369 par 3+**. |
| **B4** | Parcelles par dossier | 18 927 dossiers matchés ; 14 619 → 1 parcelle, 2 406 → 2, **1 902 → 3+**. |

```sql
-- B1
SELECT count(*), count(DISTINCT dossier_id) FROM permis_parcelle;        -- 6 / 2
-- B2 (via TEMP : clés parcelle distinctes indexées, refs dépliées ×3)
CREATE TEMP TABLE pk AS SELECT commune,section,numero FROM parcelle GROUP BY 1,2,3;  -- 1 139 944
CREATE INDEX ON pk(commune,section,numero); CREATE INDEX ON pk(commune);
CREATE TEMP TABLE refs AS SELECT id dossier_id, code_insee, sec_cadastre1 sec, num_cadastre1 num FROM sitadel_dossier WHERE sec_cadastre1 IS NOT NULL AND num_cadastre1 IS NOT NULL
  UNION ALL SELECT id,code_insee,sec_cadastre2,num_cadastre2 FROM sitadel_dossier WHERE sec_cadastre2 IS NOT NULL AND num_cadastre2 IS NOT NULL
  UNION ALL SELECT id,code_insee,sec_cadastre3,num_cadastre3 FROM sitadel_dossier WHERE sec_cadastre3 IS NOT NULL AND num_cadastre3 IS NOT NULL;
CREATE TEMP TABLE rm AS SELECT r.dossier_id,r.code_insee,r.sec,r.num,
  (pkm.commune IS NOT NULL) matched, EXISTS(SELECT 1 FROM pk c WHERE c.commune=r.code_insee) commune_ok
  FROM refs r LEFT JOIN pk pkm ON pkm.commune=r.code_insee AND pkm.section=r.sec AND pkm.numero=r.num;
-- => matchent 18927 | commune_non_chargee 4586 | commune_ok_mais_introuvable 5430
-- B3 : SELECT count(*), FILTER(nd=1/2/>=3) FROM (parcelles matched GROUP BY, count distinct dossier)  => 22183 / 19834 / 1980 / 369
-- B4 : idem GROUP BY dossier  => 18927 / 14619 / 2406 / 1902
```
Le cadastre couvre **75/78/92/93** (`parcelle` : 20/259/36/39 communes) — pas 94/77 : d'où les 4 586 « commune non chargée ».

## C — Ce que l'écran pourra afficher

| # | Mesure | Résultat |
|---|---|---|
| **C1** | Types ingérés (valeurs brutes) | `type` : **PC 19 469 / PD 10 566**. `nature_projet_completee` : vide 10 582 · `1` 9 940 · `5` 5 790 · `2` 1 639 · `3` 1 568 · `4` 291 · `6` 225. **Pas de libellé sûr** (nomenclature SDES non publiée dans le repo ; `LIBELLE_NATURE_PROJET` est une reconstruction — à ne PAS afficher nue). |
| **C2** | Remplissage des champs affichables | `type` **100 %** · `date_reelle_autorisation` **100 %** · `etat_dau` **99,5 %** (codes 2/4/5/6 ; '2'=29 394, '6'=226) · `nature` **64,8 %** (vide sur les PD). |
| **C3** | Dossiers avec pièces GED réelles | **2** dossiers avec `dossier_document` ; **0** pièce de réponse stockée → **la GED est quasi vide aujourd'hui** (elle se remplit au fil des réponses mairies). Route d'ouverture : `POST /api/admin/permis/reponses` action `url_piece`. |
| **C4** | Parcelles avec ≥ 1 permis de démolir | **8 031** parcelles (connues) portant ≥ 1 dossier `type='PD'`. |

```sql
-- C1
SELECT type,count(*) FROM sitadel_dossier GROUP BY 1;            -- PC 19469 / PD 10566
SELECT nature_projet_completee,count(*) FROM sitadel_dossier GROUP BY 1 ORDER BY 2 DESC;
-- C2
SELECT round(100.0*count(type)/count(*),1),
       round(100.0*count(nature_projet_completee) FILTER (WHERE nature_projet_completee<>'')/count(*),1),
       round(100.0*count(date_reelle_autorisation)/count(*),1),
       round(100.0*count(etat_dau) FILTER (WHERE coalesce(etat_dau,'')<>'')/count(*),1) FROM sitadel_dossier;
-- C3
SELECT count(DISTINCT dossier_id) FROM dossier_document;         -- 2
SELECT count(DISTINCT dd.dossier_id) FROM demande_dossier dd JOIN demande_reponse r ON r.demande_id=dd.demande_id
  JOIN demande_reponse_piece p ON p.reponse_id=r.id AND p.cle_stockage IS NOT NULL;   -- 0
-- C4 (TEMP pk + refs PD)
SELECT count(*) FROM (SELECT DISTINCT r.code_insee,r.sec,r.num FROM refspd r JOIN pk ON pk.commune=r.code_insee AND pk.section=r.sec AND pk.numero=r.num) t;  -- 8031
```

## D — Ce que l'écran NE DOIT PAS affirmer

La base montre de façon **FIABLE** les dossiers **rattachés** (matched) à une parcelle. Mais le **négatif est
AMBIGU** : une parcelle sans dossier affiché peut cacher un dossier dont le rapprochement cadastral a **échoué**
(**5 430 dossiers** en commune couverte mais parcelle introuvable → invisibles sur leur vraie parcelle, à cause d'un
écart de format section/numéro ou d'une lacune du cadastre). La base **ne permet donc PAS de prouver l'absence**.

**Formulation honnête** : sur une parcelle sans dossier, écrire **« Aucun dossier rattaché à cette parcelle »** (fait de
rapprochement), **jamais** « Aucun permis sur cette parcelle » (affirmation métier). Sur les parcelles matchées : afficher
les dossiers ; on peut ajouter, au niveau de la commune, le fait que 4 586 dossiers visent une commune hors cadastre chargé.

## Verdict (5 lignes)

Le chantier d'affichage est **faisable tel quel** : l'écran carte (`CurationCarte`), le patron d'endpoint bbox
(`/emprises`) et les composants de dossier (`CaracteristiquesBloc`, `CellulePieces`, action `url_piece`) **existent
déjà** ; il suffit d'ajouter une couche `parcelle` (nouvel endpoint bbox + `LIMIT`) et un join cadastral. **Le point dur
est le rapprochement cadastral : 63 % fiable seulement** (16 % communes hors cadastre, 19 % introuvables) → l'écran doit
afficher les rattachements et **ne jamais affirmer une absence de permis**. Le raccourci GED est **inerte aujourd'hui**
(2 dossiers avec pièces) : à câbler comme du future-proofing, pas comme une valeur immédiate.

## Non mesuré (et pourquoi)

- **La cause exacte des 5 430 « commune OK mais introuvable »** : je n'ai pas diagnostiqué la part récupérable par
  normalisation de la clé (zéros non significatifs, préfixe `000`, section 1 vs 2 caractères) vs vraie lacune du cadastre.
  → on ignore de combien le 63 % pourrait monter avec un rapprochement tolérant.
- **La performance de rendu d'une couche parcelle au zoom** (1,14 M polygones, quel `LIMIT`/simplification) : non testée.
- **La représentativité des 2 dossiers GED** : la GED se remplit via la veille (réponses mairies) — l'état actuel n'est
  pas un état stable.
