# RECON — Corroboration des disparitions de polygones BD TOPO par les permis

> LECTURE SEULE. Aucune écriture en base, aucun moteur touché. Mesuré le 26/08/2026 sur les deux éditions
> BD TOPO présentes (mars 2026 D092 / juin 2026 courante 6 dép.). Chaque chiffre est accompagné de sa requête.

## Matériel vérifié (aucune supposition)

| Table | relkind | géom | SRID | volume |
|---|---|---|---|---|
| `batiment` (juin courante) | table | MULTIPOLYGON | 2154 | 3 075 383 (tous cleabs) |
| `batiment_2026_03_15` (mars, D092) | table | **MULTIPOLYGON présente** | 2154 | 697 886 (tous cleabs) |
| `parcelle` | table | MULTIPOLYGON | 2154 | 1 142 904 |
| `sitadel_dossier` | table | **aucune géométrie** | — | 30 035 |
| `commune` | table | MULTIPOLYGON | 2154 | 335 communes |
| `mns_lidar_brut` / `mnt_lidar_brut` | raster | — | 2154 | — |

`batiment_2026_03_15` **a bien sa géométrie** → M2/M3 mesurables. `sitadel_dossier` n'a **pas** de géométrie : le lien
permis↔parcelle passe par le **cadastre** (`code_insee` + `sec_cadastre`/`num_cadastre`), la table de liaison résolue
`permis_parcelle` étant **quasi vide (6 lignes, 2 dossiers)** donc inutilisable.

```sql
-- existence/géom/SRID : geometry_columns + raster_columns + pg_class.relkind (voir M0 ci-dessous)
SELECT f_table_name, f_geometry_column, srid, type FROM geometry_columns
 WHERE f_table_name IN ('batiment','batiment_2026_03_15','parcelle','commune');
SELECT count(*) FROM permis_parcelle;  -- => 6 lignes, 2 dossiers : INEXPLOITABLE
```

## Tableau récapitulatif des 9 mesures

| # | Mesure | Résultat |
|---|---|---|
| **M0** | Périmètre couvert | juin bbox `BOX(581535 6775073, 746042 6895304)` ⊃ mars bbox `BOX(632239 6842903, 656477 6877610)`. `bdtopo_edition` : juin = 6 dép. (75/77/78/92/93/94). ⚠️ `commune` ne couvre que **75/78/92/93** (pas 94, pas 77). |
| **M1** | Disparus (mars absent de juin) | **548** |
| **M2** | Re-numérotation vs vidée (seuil 0,5) | **6** re-numérotations / **542** vidées (distribution nette : 522 à <5 % de recouvrement) |
| **M3** | Vidées ∩ parcelle | **37** avec parcelle / **505 orphelines** (toutes hors des communes chargées) |
| **M4** | Permis disponibles | `type` : PC 19 469 / **PD 10 566 (démolir INGÉRÉS)**. Construction neuve = PC + `nature='1'` (9 940) |
| **M5** | **Croisement** (vidée-parcelle ∩ permis PD/neuve antérieur) | **11** corroborées / 37 = **30 %** (11/542 = **2 %** du brut) |
| **M6** | Sans ambiguïté (parcelle mono-polygone en mars) | **1** sur 11 |
| **M7** | Vidées sous couverture LiDAR | MNS = **1,000 km²** (1 tuile, Asnières). **0** vidée sous le MNS |
| **M8** | Sens inverse (polygones présents sur parcelle à PD) | **26 018** (parcelle-level, très sur-inclusif) |

## Détail et requêtes

### M0 — Périmètre
```sql
SELECT ST_Extent(geom) FROM batiment;              -- BOX(581535 6775073, 746042 6895304)
SELECT ST_Extent(geom) FROM batiment_2026_03_15;   -- BOX(632239 6842903, 656477 6877610)  (⊂ juin)
SELECT departement, millesime, courante, nb_objets FROM bdtopo_edition ORDER BY id; -- juin = 6 dép.
SELECT left(code_insee,2) dep, count(*) FROM commune GROUP BY 1;   -- 75(1) 78(259) 92(36) 93(39) — PAS 94, PAS 77
```
L'emprise de mars est **incluse** dans celle de juin (juin plus grande) → les disparitions ne sont pas un effet de
rétrécissement du périmètre. MAIS le paquet mars D092 débordait sur les départements limitrophes (94 surtout), non
couverts par la table `commune` → cf. M3.

### M1 — Disparus
```sql
SELECT count(*) FROM batiment_2026_03_15 m
 WHERE NOT EXISTS (SELECT 1 FROM batiment j WHERE j.cleabs = m.cleabs);   -- 548
```
Anti-jointure sur `cleabs` (identifiant national unique) contre **toute** la table juin (6 paquets) → un bâtiment passé
d'un paquet départemental à un autre garde son cleabs et n'est PAS compté disparu. La source (mars) est D092 → toutes
les disparitions proviennent du 92 par construction.

### M2 — Re-numérotation vs vidée
Seuil retenu : **0,5** de recouvrement surfacique du footprint disparu par le bâti courant (somme des intersections /
aire du disparu). Justification : la distribution est **bimodale** — 522 disparus à <5 % de recouvrement (footprint
réellement vidé) vs seulement 6 à ≥50 % (footprint toujours bâti = re-numérotation). Le seuil est donc peu sensible
(0,05 donnerait 522 vidées ; 0,5 en donne 542).
```sql
WITH disp AS (SELECT m.cleabs, m.geom, ST_Area(m.geom) a FROM batiment_2026_03_15 m
              WHERE NOT EXISTS (SELECT 1 FROM batiment j WHERE j.cleabs=m.cleabs)),
     r AS (SELECT COALESCE((SELECT sum(ST_Area(ST_Intersection(j.geom,d.geom))) FROM batiment j
                            WHERE j.geom && d.geom AND ST_Intersects(j.geom,d.geom)),0)/NULLIF(d.a,0) taux FROM disp d)
SELECT count(*) FILTER (WHERE taux>=0.5) renum, count(*) FILTER (WHERE taux<0.5) videe FROM r;  -- 6 / 542
-- distribution : <5%:522  5-50%:20  50-90%:3  >=90%:3
```

### M3 — Rattachement à la parcelle
```sql
-- vidées (TEMP) ∩ parcelle
SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM parcelle p WHERE p.geom && v.geom AND ST_Intersects(p.geom,v.geom))) avec,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM parcelle p WHERE p.geom && v.geom AND ST_Intersects(p.geom,v.geom))) orph
  FROM vid v;   -- 37 / 505
-- répartition par département (via commune) :
--   HORS commune : 505   |   92 : 30   |   78 : 6   |   93 : 1
```
**505 des 542 vidées tombent HORS de toute commune chargée** (94/77 non chargés dans `commune`, ni dans `parcelle`).
Ce sont le **débordement du paquet mars D092** au-delà du périmètre opérationnel. Seules **37 vidées sont dans le
périmètre réel** (30 en 92, 6 en 78, 1 en 93) — la population réellement en jeu. Toutes les orphelines sont donc **hors
scope** (aucune adresse certifiée là où il n'y a ni commune ni cadastre ni LiDAR).

### M4 — Permis disponibles (valeurs brutes, sans table de correspondance)
```sql
SELECT type, count(*) FROM sitadel_dossier GROUP BY type;
-- PC 19469 | PD 10566   → les PERMIS DE DÉMOLIR SONT INGÉRÉS (type='PD'), nature vide
SELECT nature_projet_completee, count(*) FROM sitadel_dossier GROUP BY 1 ORDER BY 2 DESC;
-- '' 10582 | '1' 9940 | '5' 5790 | '2' 1639 | '3' 1568 | '4' 291 | '6' 225
```
Critère retenu pour M5/M8 : **démolir** = `type='PD'` ; **construction neuve** = `type='PC' AND nature_projet_completee='1'`.
(La reconstruction `LIBELLE_NATURE_PROJET` n'est PAS utilisée.)

### M5 — Le croisement
```sql
WITH vp AS (SELECT DISTINCT v.cleabs, p.commune, p.section, p.numero
            FROM vid v JOIN parcelle p ON p.geom && v.geom AND ST_Intersects(p.geom,v.geom))
SELECT count(DISTINCT cleabs) FILTER (WHERE EXISTS (
   SELECT 1 FROM sitadel_dossier d
    WHERE d.code_insee=vp.commune
      AND (d.type='PD' OR (d.type='PC' AND d.nature_projet_completee='1'))
      AND d.date_reelle_autorisation < DATE '2026-06-15'
      AND ((d.sec_cadastre1=vp.section AND d.num_cadastre1=vp.numero)
        OR (d.sec_cadastre2=vp.section AND d.num_cadastre2=vp.numero)
        OR (d.sec_cadastre3=vp.section AND d.num_cadastre3=vp.numero)))) FROM vp;   -- 11
```
**11 cleabs vidés** portent un permis PD ou construction-neuve autorisé avant la disparition (< juin), sur les communes
92063 / 92064 / 92071 / 78640. **⚠️ Plausibilité causale limitée** : dates 2019 (2), 2021 (5), 2023 (1), 2024 (5),
2025 (2). Un PC-neuve **2019** ne peut pas expliquer une disparition **2026** (le bâti aurait disparu dès 2020 et
n'aurait pas été dans l'édition mars 2026) → ces cas sont **coïncidents**, pas causaux. Le critère « antérieur à la
disparition » est trop lâche ; on ne peut pas le resserrer faute de date de démolition exacte (cf. limites).

### M6 — Ambiguïté
```sql
-- parmi les 11 : combien sur une parcelle qui n'avait QU'UN polygone en mars
... FILTER (WHERE (SELECT count(*) FROM batiment_2026_03_15 b
                   WHERE b.geom && vp.pgeom AND ST_Intersects(b.geom,vp.pgeom))=1) ...   -- 1 / 11
```
**1 seul cas sur 11** désigne le bâtiment sans arbitrage (parcelle mono-polygone). Les 10 autres reposent sur une
parcelle multi-polygones → le permis désigne la **parcelle**, pas le bâtiment précis.

### M7 — Couverture LiDAR
```sql
SELECT ST_Area(ST_Union(ST_Envelope(rast)))/1e6 FROM mns_lidar_brut;                 -- 1,000 km²  (BOX 645999..646999 / 6867000..6868000)
SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM mns_lidar_brut r
        WHERE ST_Intersects(r.rast, ST_PointOnSurface(v.geom)))) FROM vid v;          -- 0 / 542
```
Le MNS couvre **1 km²** (une tuile, Asnières). **AUCUNE** des 542 vidées n'y tombe → le LiDAR (seul juge physique
d'une démolition) ne peut corroborer aucune disparition aujourd'hui.

### M8 — Sens inverse
```sql
WITH pd_parc AS (SELECT DISTINCT p.geom FROM parcelle p JOIN sitadel_dossier d
   ON d.code_insee=p.commune AND d.type='PD' AND d.date_reelle_autorisation IS NOT NULL
      AND ((d.sec_cadastre1=p.section AND d.num_cadastre1=p.numero) OR (d.sec_cadastre2=p.section AND d.num_cadastre2=p.numero) OR (d.sec_cadastre3=p.section AND d.num_cadastre3=p.numero)))
SELECT count(DISTINCT b.cleabs) FROM pd_parc pp JOIN batiment b ON b.geom && pp.geom AND ST_Intersects(b.geom, pp.geom);  -- 26018
```
**26 018** polygones encore présents sont sur une parcelle portant un PD — MAIS c'est **parcelle-level et
sur-inclusif** : un PD ne démolit souvent qu'un bâtiment d'une parcelle qui en compte plusieurs, beaucoup de PD sont
anciens/non exécutés. Le chiffre est un **majorant grossier**, pas une liste d'obstacles qui tomberont.

## Verdict (3 lignes)

Le croisement est une **INDICATION partielle, ni un filet exploitable ni du pur bruit** : sur les **37** vidées
réellement dans le périmètre, **11 (30 %)** sont corroborées par un permis — mais le lien cadastral n'existe que pour
**7 %** des vidées brutes, la corroboration ne désigne le bâtiment **sans ambiguïté que dans 1 cas**, elle inclut des
permis **causalement invraisemblables** (2019 pour 2026), et **0 vidée** ne tombe sous le LiDAR (donc aucune n'est
pertinente pour un verdict aujourd'hui). Comme signal de **priorisation** d'une revérification, c'est utilisable ; comme
**preuve automatique** de démolition pour retirer un obstacle, non.

## Ce que je n'ai PAS pu mesurer (et pourquoi)

- **La date exacte de démolition** de chaque bâtiment : on n'a que la fenêtre mars→juin (l'absence est constatée à
  l'édition, pas datée). Impossible donc de resserrer le critère causal (un permis « antérieur » capte des permis
  anciens sans rapport).
- **Les 505 orphelines** (débordement 94/77) : ni `commune` ni `parcelle` ne couvrent 94/77 → aucun rattachement, aucune
  classification possible. On sait seulement qu'elles sont **hors périmètre opérationnel**.
- **L'exécution réelle d'un PD au niveau bâtiment** (M8) : le lien est parcelle-level ; sans géométrie de permis ni date
  de matérialisation, on ne peut pas dire lequel des 26 018 polygones tombera.
- **L'impact verdict** d'une vidée : 0 vidée sous le MNS (1 km²), et aucun certificat émis ne porte encore de cleabs
  d'obstacle capturé (la capture est récente) → aucun certificat vivant n'est concerné aujourd'hui ; non mesurable en
  l'état.
