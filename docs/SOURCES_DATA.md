# Registre des sources de données externes

> Inventaire des sources géo/data utilisées (ou candidates) par le moteur Sans Vis-à-Vis®.
> Statut, licence, projection, jointure et **limites connues** de chacune. Accompagne
> `CLAUDE.md` (principe du verdict) et `SPEC_score_qualite_vue.md` (usage dans le score).

## Tableau de synthèse

| Source | Donnée | Statut | Licence | SRID | Jointure | Limites connues |
|---|---|---|---|---|---|---|
| **BD TOPO® IGN** — `bdtopo_batiment` (vue), `bdtopo_eau_surface`, `bdtopo_eau_plan`, `bdtopo_vegetation` | Emprises bâti (+ `nature`/`usage`/`hauteur`/altitudes), surfaces d'eau, végétation | **En base** | Licence Ouverte Etalab | 2154 | Géométrique ; `cleabs` (bâti) | **Végétation = Haie / Bois / Forêt seulement → NE CONTIENT PAS les parcs/squares urbains.** Couverture dépt 92 (+ Paris/93/95/78 selon couche). |
| **LiDAR HD IGN** — `mns_lidar_brut` (toits), `mnt_lidar_brut` (terrain) | Altitudes absolues NGF, grille 50 cm | **En base** | Licence Ouverte Etalab | 2154 | Spatial (raster ∩ point/couloir) | Sert au **verdict**. Capte le bâti réel mais, dans le moteur d'obstacle, **filtré par l'emprise BD TOPO** → un ouvrage absent de BD TOPO est ignoré (cf. **limite « mur des tennis »** ci-dessous). |
| **BAN** — `adresse_ban` | Adresses (numéro, voie, `cle_d_interoperabilite`, `parcelles_cadastrales`) | **En base** | Licence Ouverte Etalab | 2154 | `cle_d_interoperabilite` ; géométrie | Points ~0,7 m hors emprise parcellaire (tolérance gérée). |
| **Cadastre** — `parcelle` | Parcelles (`id` 14 c, `commune`, `section`, `numero`) | **En base** | Licence Ouverte Etalab | 2154 | `parcelle.id` ; géométrie | — |
| **BDNB** — `bdnb_annee_batiment` | **Année de construction** par `cleabs` | **IMPORTÉE** (table dédiée, **191 262 lignes**, **~76 % année non-null**, jointure `cleabs` **99,65 %**, dédup **`MIN(annee)`**) | Licence Ouverte Etalab | 2154 | `cleabs` → `bdtopo_batiment.cleabs` | Millésime **2026-02.a**. **Année ≠ style ≠ beauté** ; année issue des **Fichiers Fonciers** (approximation, parfois prédite). Alimente la **Famille 2** (ancien < 1900). |
| **Parcs & jardins publics ouverts au public** (OCS GE, ministère de la Transition écologique / IGN) | Polygones de parcs, squares, jardins (`nature`, `date_ouv`…) | **GO — recon faite, IMPORT À FAIRE** | Licence Ouverte Etalab v2.0 | LAMB93 / 2154 *(attendu, à confirmer sur fichier)* | Géométrique (`ST_Intersection` faisceau ↔ polygone) | **Comble le trou parcs/squares urbains** de BD TOPO végétation (testé : **Square Gilbert-Thomain** près du parc Denfert à Asnières — **absent** de `bdtopo_vegetation`, **présent** ici). MultiPolygon **surfacique**. Millésime **2021-2023**. `data.geopf.fr` permet une **extraction par bbox** (extrait 92). Champ `nature` (parc/square/jardin…) + `date_ouv` (**bonus potentiel** score paysage). **À confirmer sur fichier réel : SRID + colonnes exactes.** Alimente la **Famille 4** (nature). |
| **Mérimée** (monuments historiques classés/inscrits) | Monuments protégés | **À EXPLORER** (recon faisabilité **non faite**) | À vérifier | À vérifier | À vérifier | Destiné à alimenter la **Famille 3** (remarquable/classé). Faisabilité, licence et format non encore évalués. |
| **OSM** | — | **Écartée** | Licence **incompatible** | — | — | Non utilisée (incompatibilité de licence avec un usage commercial propriétaire). |

## Détails par source en chantier

### BDNB — année de construction (importée)
- Table `public.bdnb_annee_batiment` : `cleabs` (PK), `annee_construction` (int, NULL autorisé),
  `source` (`'ffo'` si année présente).
- Chemin de construction : `batiment_groupe_compile.ffo_bat_annee_construction` →
  `batiment_groupe_id` → `rel_batiment_groupe_bdtopo_bat.bdtopo_bat_cleabs`.
- Dé-duplication : **`MIN(annee)`** par `cleabs` (déterministe ; plus ancienne année non-nulle).
- **Autonome** : aucune table existante modifiée ; jointure à la requête via `cleabs`.

### Parcs & jardins publics (OCS GE) — import à faire
- Source : data.gouv.fr / cartes.gouv.fr / `data.geopf.fr` (flux WMS/WMTS + GeoPackage en
  téléchargement ; **pas de WFS**).
- Schéma observé (via WMS GetFeatureInfo) : `nom`, `nature`, `ouverture`, `date_ouv`, `source`,
  `id`, `geom` (MultiPolygon). Seuil de représentation **500 m²**. Couverture métropole + Réunion
  + Martinique.
- Étape suivante : télécharger un extrait 92 (`data/parcs_jardins/`, **jamais committé**),
  confirmer SRID 2154 + types de colonnes, puis importer en table dédiée autonome.

## Limite générale du moteur de verdict (décidée)

Le **verdict binaire Sans Vis-à-Vis® est calculé à 100 % sur des données officielles IGN**
(MNT/MNS LiDAR pour les altitudes, BD TOPO pour les emprises bâties). **Le logiciel ne reconstitue
pas les données manquantes** : si un obstacle réel n'est pas présent dans les couches officielles,
il n'entre pas dans le verdict.

**Illustration — « mur des tennis »** : sur un faisceau, le MNS LiDAR capte un mur réel (~6-10 m,
toit nettement au-dessus de l'œil) à ~32-48 m, mais **aucune emprise `bdtopo_batiment`** n'existe
à cet endroit. Le moteur d'obstacle ne lisant le MNS **que sous les emprises BD TOPO**, ce mur est
**filtré** et le faisceau ne s'arrête qu'au premier bâtiment BD TOPO suivant (~77-90 m). C'est un
choix assumé d'**auditabilité** (verdict reproductible sur données officielles) plutôt que de
reconstruction heuristique. Les sources complémentaires (parcs/jardins, Mérimée, BDNB) n'alimentent
que le **score de qualité de vue** (Résultat B), **jamais le verdict**.
