# SPEC v3 — Détection du premier obstacle réel & résolution des hauteurs

> Application Sans Vis-à-Vis®. **Remplace les v1 et v2.** Version consolidée.
> Respecter `CLAUDE.md` : aucun arrondi, label binaire géométrique (premier
> obstacle réel ≥ 40 m), traçabilité/audit. L'analyse IA de la photo n'entre
> jamais dans ce calcul.

---

## 1. Objectif

Déterminer le **premier obstacle réel** dans l'axe de la vue : le premier
bâtiment, le long du faisceau, dont la **hauteur réelle de toit** (hors
superstructures techniques) atteint ou dépasse l'**altitude de la fenêtre**
d'observation. Sa distance horizontale donne le verdict.

- `distance >= 40 m` → ✅ Sans Vis-à-Vis
- `distance < 40 m` → ❌ Vis-à-vis détecté
- aucun obstacle dans la portée → ✅ Sans Vis-à-Vis

Deux modes selon la donnée :
- **Mode A — MNS LiDAR HD (primaire, zones couvertes : Paris + 92 pour démarrer).**
- **Mode B — BD TOPO® (fallback, hors couverture MNS).**

Source + confiance tracées par obstacle (audit, certificat).

---

## 2. Conventions (impératives)

- Altitudes en **NGF-IGN69** (RGE ALTI®, BD TOPO®, MNS LiDAR HD cohérents).
- CRS de travail **Lambert-93 (EPSG:2154)** ; origine GPS (4326) transformée à
  l'entrée.
- **Aucun arrondi** : `number` bruts sur toute la chaîne.
- Distances en mètres (EPSG:2154).
- Altitude de la fenêtre (point d'origine) :
  ```
  altitude_fenetre = altitude_terrain_origine + (etage × 2.90 + 1.65)
  ```

---

## 3. Mode A — méthode MNS (primaire)

### 3.1 Prétraitement — fabrication du « MNS bâti propre » (UNE fois par secteur)

Tout le travail lourd se fait ici, en amont, pour que les requêtes de verdict
soient triviales et illimitées (données en local).

Étapes :

1. **Charger** les dalles MNS LiDAR HD du secteur (50 cm, GeoTIFF, ~24 Mo/dalle ;
   Paris + 92 ≈ 280 dalles ≈ ~7 Go).
2. **Masquer par les emprises bâtiments BD TOPO®** : conserver les valeurs MNS
   uniquement à l'intérieur des polygones bâtiment. Hors-bâti (sol, rue,
   **végétation**) → `nodata`. (La végétation n'est jamais un obstacle.)
3. **Calculs *nodata-aware*** : aucune statistique ne doit compter un pixel
   `nodata` (jamais comme 0). En **bord de façade**, la fenêtre d'analyse est
   donc **asymétrique**, restreinte aux pixels bâtis (vers l'intérieur du
   bâtiment) — sinon la moitié « côté rue » fausserait le résultat.
4. **Rabotage anti-pic** (suppression des superstructures techniques) :
   - opération de type **ouverture morphologique** / **médian local**, noyau
     petit, **restreint à l'emprise bâtie** ;
   - discrimination par forme spatiale des points hauts :
     **plan** (toit plat) → conservé ; **ligne/crête** (faîtage d'un toit en
     pente) → conservée ; **point isolé de faible emprise** (cheminée, antenne)
     → ramené au niveau du toit environnant ;
   - critère « technique » = petite emprise isolée **ET** dépassement net du toit
     local (proxy géométrique, à calibrer ; ce n'est pas une info d'habitabilité
     directe).
5. (Optionnel, audit) Conserver un calque **« masque des pics »** : quels
   éléments ont été classés techniques, pour traçabilité au certificat.
6. **Stocker** le raster « MNS bâti propre » (COG / PostGIS raster) + index spatial.

> Conséquence clé : sur ce raster propre, chaque toit lit sa **vraie hauteur**
> (plat → plan, pente → faîtage, pics retirés). Toute la logique « exclure un pic
> et continuer » est déjà résolue en amont.

### 3.2 Requête de verdict (par test)

```
entrées : origine_2154, azimut, altitude_fenetre, mns_propre
couloir = bande de LARGEUR_COULOIR_M (≈ 2 m) le long de l'azimut depuis l'origine
         (ou 3 rayons parallèles : central + ±1 m)

pour chaque bâtiment B traversé par le couloir, du plus proche au plus loin :
    region = emprise(B) ∩ couloir
    h = MAX( mns_propre sur region )      # pics déjà retirés ; nodata ignoré
    si h >= altitude_fenetre :
        return {
          distanceM : distance(origine → bord proche de region),  # brut
          surfaceAltitudeNgf : h,
          buildingId : B.id,
          source : 'LIDAR_MNS',
          confidence : 'HIGH'
        }
    # sinon : seuls des pics techniques dépassaient (déjà rabotés) ou toit trop bas
    #         → on poursuit la marche
return null   # aucun obstacle réel → dégagement
```

Notes :
- **Décrochés** gérés nativement : si le couloir ne traverse qu'une aile basse,
  `region` ne couvre que cette aile → on évalue sa hauteur réelle, pas l'immeuble
  entier.
- **Distance retenue** = bord proche de la portion qualifiante (là où la masse
  commence à boucler). *Décision validée.*
- `LARGEUR_COULOIR_M` est un **paramètre** ; à distinguer plus tard de la
  « largeur de dégagement » (qui servira au score).

---

## 3 bis. Détermination de hauteur LiDAR (Mode A) — couloir principal uniquement

> Règle arrêtée. Les **seuils** marqués **« À CALIBRER »** sont les seules valeurs
> à ajuster ; la logique ci-dessous est figée.

1. **Zone d'analyse** = (emprise du bâtiment candidat **∩** couloir principal 2 m),
   **strictement confinée au POLYGONE D'ORIGINE** du candidat. Tous les pixels MNS
   **hors de ce polygone** sont exclus : sol, chaussée **ET** bâtiments voisins.
   L'**épicentre** des contrôles est défini dans cette zone (la portion réellement
   traversée par la ligne de vue), **jamais** au centre de toute la copropriété.

2. **Détection du type de toit** sur cette zone : altitudes ~constantes → **toit
   plat** ; pente régulière détectée → **toit en pente**.
   *Seuil de pente plat/pente : **À CALIBRER**.*

3. **Toit plat** : hauteur = **moyenne** des altitudes MNS d'une zone d'**environ
   10 m²** autour de l'épicentre, dans le polygone, en **excluant les pics
   d'artefacts** (cheminées, antennes, cages d'ascenseur).
   *Taille d'un point haut considéré comme artefact : **À CALIBRER**.*

4. **Toit en pente** : **cercle de diagnostic de 3 m de rayon** centré sur
   l'épicentre, **clippé au polygone** ; hauteur = altitude de l'**arête (faîtage)**
   déterminée dans cette zone.

5. **Confinement strict** : aucune zone de contrôle ne déborde hors du polygone
   d'origine ; si elle déborde (sol ou bâtiment voisin), les pixels extérieurs
   sont **ignorés** et la statistique ne porte **que sur les pixels intérieurs**.

6. La hauteur LiDAR ainsi obtenue alimente la **confirmation d'obstacle déjà
   verrouillée** : `hauteur ≥ altitude_fenetre` → obstacle réel, **on s'arrête** ;
   `< altitude_fenetre` → faux obstacle, **on continue**.

7. **Ne s'applique QU'AU couloir principal.** Les **61 faisceaux** d'amplitude
   restent en **BD TOPO** (Mode B).

> Récapitulatif des seuils **À CALIBRER** : (a) seuil de pente plat/pente,
> (b) taille d'un point haut considéré comme artefact (pic). Voir aussi §11.

---

## 4. Mode B — BD TOPO® par bâtiment (fallback hors MNS)

Pour chaque bâtiment intersecté (trié par distance), résoudre le sommet ; le
premier dont `sommet >= altitude_fenetre` est l'obstacle.

| Niveau | Calcul | `source` | `confiance` |
|--------|--------|----------|-------------|
| 1 | `altitude_maximale_toit` (BD TOPO®) | `BDTOPO_ROOF` | `MEDIUM` |
| 2 | `z_min_sol + hauteur` | `BDTOPO_HEIGHT` | `MEDIUM` |
| 3 | `z_min_sol + nombre_etages × 2.90` | `ESTIMATE_FLOORS` | `LOW` |
| 4 | `terrain + hauteur_estimée_IA` (phase 2) | `ESTIMATE_AI` | `LOW` |
| — | non résolu | `NONE` | `NONE` |

> Confiance `MEDIUM` : une hauteur unique par polygone rate décrochés et pics. Le
> MNS (mode A) reste la référence `HIGH`.

---

## 5. Détection toit plat / toit en pente (optionnel)

Le max anti-pic du §3 donne déjà automatiquement le bon point haut (plan pour
plat, faîtage pour pente). Une classification explicite n'est donc pas requise
pour le verdict, mais utile pour la robustesse et le score esthétique :
- *Pas cher* : BD TOPO® `altitude_maximale_toit − altitude_minimale_toit` ≈ 0 →
  plat ; écart significatif → pente.
- *Précis* : analyse de pente / détection de crête sur le MNS.

---

## 6. Cas « hauteur indéterminée » (mode B) — DÉFINITIF

> **Règle arrêtée (décision d'arbitrage).** Ne pas réinterpréter.

En parcourant l'axe **du plus proche au plus loin** : si on rencontre un bâtiment
situé à **moins de 40 m** dont la hauteur est inconnue (`source = NONE`) **avant**
tout obstacle réel confirmé, le verdict est **INDETERMINE** (« Indéterminé / non
certifiable ») — jamais un faux certifié.

- Un bâtiment de hauteur inconnue (`NONE`) situé à **≥ 40 m** ne déclenche **pas**
  INDETERMINE : sous le seuil il n'y a aucun obstacle inconnu, donc rien ne peut
  invalider le dégagement.
- Si un obstacle réel **confirmé** (sommet ≥ altitude_fenetre) est rencontré
  **avant** tout `NONE < 40 m`, le verdict est tranché normalement
  (`SANS_VIS_A_VIS` / `VIS_A_VIS`) : un `NONE` situé au-delà n'a plus d'effet.

### Analyse dégradée (axe principal uniquement)

Signalement **additif** qui ne modifie **jamais** le verdict. Il distingue un
résultat pleinement fiable d'un résultat certifiable mais incertain à cause d'un
bâtiment sans donnée de hauteur situé dans la ligne de vue ouverte.

- `NONE` **< 40 m** avant tout obstacle confirmé → **INDETERMINE** (cf. ci-dessus),
  pas une simple dégradation : le verdict n'est pas certifiable.
- `NONE` **≥ 40 m** dans la **ligne de vue ouverte** (devant l'obstacle confirmé,
  ou dans la portée d'analyse si la vue est dégagée) → verdict **SANS_VIS_A_VIS
  certifiable**, mais marqué **analyse dégradée** avec un **message citant la
  distance** du `NONE` le plus proche (et le nombre d'autres `NONE` pertinents).
- Un `NONE` **caché derrière** l'obstacle confirmé (distance ≥ celle de
  l'obstacle) **ne dégrade pas** : il n'est plus dans la ligne de vue ouverte.
- Cette règle s'applique **uniquement à l'axe principal**. Elle **ne s'applique
  pas aux 61 faisceaux** d'amplitude du score, qui ne consomment que la distance
  d'obstacle par faisceau.

Concrètement (`ResultatVerdict`) : champs `analyseDegradee: boolean` et
`messageDegrade: string | null`, calculés après le verdict, sans en altérer la
valeur.

---

## 7. Interfaces (TypeScript)

```ts
export type HeightSource =
  | 'LIDAR_MNS' | 'BDTOPO_ROOF' | 'BDTOPO_HEIGHT'
  | 'ESTIMATE_FLOORS' | 'ESTIMATE_AI' | 'NONE';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface FirstObstacle {
  distanceM: number;            // brut
  surfaceAltitudeNgf: number;   // brut
  buildingId?: string;
  source: HeightSource;
  confidence: Confidence;
}

export type Verdict = 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';

export interface ObstacleResult {
  altitudeFenetreNgf: number;
  firstObstacle: FirstObstacle | null; // null = rien dans l'axe
  verdict: Verdict;
}
```

---

## 8. Requêtes PostGIS (extraits)

Bâtiments traversés par le couloir (mode A & B), triés par distance :
```sql
SELECT cleabs AS building_id, hauteur, nombre_d_etages AS nombre_etages,
       z_min_sol, altitude_maximale_toit AS z_max_toit,
       altitude_minimale_toit AS z_min_toit,            -- vérifier noms réels
       ST_AsGeoJSON(ST_Intersection(geometrie, :couloir_2154)) AS region,
       ST_Distance(:origin_2154, geometrie) AS distance_m
FROM bdtopo_batiment
WHERE ST_Intersects(geometrie, :couloir_2154)
ORDER BY distance_m ASC;
```

Hauteur max sur la region (mode A, MNS propre) :
```sql
SELECT (ST_SummaryStats(ST_Clip(rast, :region_2154))).max AS h_ngf
FROM mns_bati_propre
WHERE ST_Intersects(rast, :region_2154);
```

---

## 9. Tests (vecteurs)

Fenêtre 4e étage : `altitude_fenetre = 41 + (4 × 2.90 + 1.65) = 54.25 m`.
Obstacles (altitude de toit) : A 18 m/48 m (non), B 32 m/50 m (non),
C 55 m/56 m → **premier obstacle réel**, D 95 m/59 m. → certifié (C ≥ 40 m).

Cas à couvrir :
- Mode A toit plat : franchissement au bon endroit.
- Mode A **toit en pente** : faîtage retenu comme point haut (pas un point du
  versant).
- Mode A **décroché** : aile basse non retenue, aile haute retenue.
- Mode A **pic technique** : cheminée rabotée en amont → si le toit réel < fenêtre,
  marche poursuivie jusqu'au vrai obstacle.
- Mode A **bord de façade** : statistique restreinte aux pixels bâtis (pas de
  pixel « côté rue » compté).
- Mode B : `BDTOPO_ROOF` / `ESTIMATE_FLOORS`.
- Indéterminé : `NONE` < 40 m.
- **Aucun arrondi** sur toute la chaîne.

---

## 10. Constantes

```ts
export const SVV = {
  FLOOR_HEIGHT_M: 2.90,
  EYE_HEIGHT_M: 1.65,
  THRESHOLD_M: 40,
  CORRIDOR_WIDTH_M: 2,      // largeur du couloir de contrôle
  BEAM_STEP_M: 0.5,         // pas d'échantillonnage = résolution MNS
  BEAM_RANGE_M: 200,        // portée d'analyse
  SPIKE_KERNEL_M: 3,        // périmètre anti-pic (à calibrer)
  CRS_WORK: 2154,
  CRS_GPS: 4326,
} as const;
```

---

## 11. Points à calibrer / décisions ouvertes

- Largeur du couloir (2 m de départ).
- Paramètres anti-pic : rayon du noyau (~3 m), seuil de dépassement, emprise max
  « technique » — calés sur ~20 immeubles connus du secteur.
- Détection plat/pente explicite : utile pour le score, optionnelle pour le verdict.
- (Phase 2) estimation IA de hauteur en dernier fallback, étiquetée.
