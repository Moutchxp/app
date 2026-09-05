/**
 * PL-A/PL-B — PLANCHE CADASTRALE (LECTURE SEULE). Charge, pour un permis, les parcelles RETENUES (lignes `permis_parcelle`
 * rattachées à `parcelle`) + les parcelles VOISINES dans un RAYON autour d'un CENTRE, et construit le schéma SVG via le module PUR
 * `affectationSchema` (EPSG:2154, aucune tuile, aucune lib carto). Module PROPRE : n'importe que db/client + le module pur + la
 * dérivation d'arrondissement cadastral (referenceCadastrale, pur).
 *
 * 🔑 RAYON réglable à l'écran (PL-B, 50→200 m ; défaut 50 m). Décision mesurée : le rayon s'appuie sur l'index GiST
 * `parcelle_geom_geom_idx` (ST_DWithin → `geom && ST_Expand(ref, rayon)`), et NON la section entière (Seq Scan, illisible).
 *
 * 🎯 CENTRAGE (PL-B) : 'empreinte' (défaut = comportement PL-A), 'parcelle' (une des parcelles du permis, au choix), ou 'adresse'
 * (adresse postale du dossier, GÉOCODÉE contre `adresse_ban`). ⚠️ « on ne devine pas » : si l'adresse ne se résout pas, on RESTE sur
 * l'empreinte et on le DIT (centreAvertissement) — jamais un point inventé.
 *
 * ⚠️ Ce module N'ÉCRIT RIEN (le clic « ajouter/retirer une parcelle » et la validation sont des lots séparés, PL-C). Provenance de
 * l'acteur résolue honnêtement (id admin → nom ; sinon valeur brute — cf. `acteurParcelle`).
 */
import { query } from '../db/client';
import { communeCadastrale } from '../sitadel/referenceCadastrale';
import { construireSchema, geomDepuisGeoJSON, repereDepuisIndex, projeterLambertDansSchema, type SchemaEmpreinte, type PolygoneEntreeSchema, type GeomPoly } from './affectationSchema';

/** Rayon par défaut (m) et bornes de sécurité. Réglable à l'écran de 50 à 200 m (PL-B) ; clamp large ici pour tolérer l'API. */
export const RAYON_VOISINES_DEFAUT_M = 50;
const RAYON_MIN_M = 10, RAYON_MAX_M = 200;
export function bornerRayon(rayonM: number | null | undefined): number {
  const n = typeof rayonM === 'number' && Number.isFinite(rayonM) ? rayonM : RAYON_VOISINES_DEFAUT_M;
  return Math.min(RAYON_MAX_M, Math.max(RAYON_MIN_M, Math.round(n)));
}

export type CentreMode = 'empreinte' | 'parcelle' | 'adresse';
export interface CentreDemande { mode: CentreMode; idu?: string | null }               // ce que l'écran demande
export interface CentreEffectif { mode: CentreMode; idu: string | null; point: { x: number; y: number } | null } // ce qui a RÉELLEMENT servi

/** Métadonnée d'une parcelle de la planche, PARALLÈLE à `schema.polygones` (même ordre) : la couleur/étiquette vit dans le rendu. */
export interface PlancheParcelleMeta {
  idu: string | null;
  section: string;
  numero: string;
  retenue: boolean;                            // true = parcelle du permis ; false = voisine (contexte)
  origine: 'saisie' | 'extraite' | null;       // renseignée seulement pour une retenue
  surfaceM2: number | null;                     // ST_Area(geom), Lambert-93
  majPar: string | null;                        // auteur BRUT (retenue corrigée/saisie) ; null pour une voisine
  majLe: string | null;                         // horodatage ISO ; null pour une voisine
  acteurNom: string | null;                     // prénom+nom si maj_par = id admin résolu ; null sinon
}

export interface PlancheParcelles {
  schema: SchemaEmpreinte;      // empreinte (fond) + polygones projetés (paths SVG) — module pur
  meta: PlancheParcelleMeta[];  // parallèle à schema.polygones
  rayonM: number;               // rayon effectif (borné)
  nbRetenues: number;
  nbVoisines: number;
  motif: string | null;         // si rien à dessiner (aucune parcelle du permis rattachée à un contour) — jamais un cadre vide muet
  // PL-B — centrage : ce qui a réellement servi, l'éventuel avertissement (adresse non résolue), le marqueur d'adresse (coords boîte),
  //   et la liste des parcelles du permis proposables au centrage.
  centre: CentreEffectif;
  centreAvertissement: string | null;
  marqueurAdresse: { cx: number; cy: number } | null;
  parcellesChoix: { idu: string; section: string; numero: string }[];
}

interface LignePlanche {
  idu: string | null; section: string; numero: string; gj: unknown; origine: 'saisie' | 'extraite' | null;
  maj_par: string | null; maj_le: string | null; prenom: string | null; nom: string | null; retenue: boolean; surface_m2: string | number | null;
}

const nbOuNull = (v: string | number | null): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * GÉOCODAGE de l'adresse postale d'un dossier contre `adresse_ban` (LECTURE SEULE). Pièges connus gérés : l'INSEE cadastral (Paris
 * → arrondissement) dérivé du NUMÉRO de dossier (communeCadastrale) car `adresse_ban` est par arrondissement (751xx) alors que
 * Sitadel donne 75056 ; le libellé de voie Sitadel est TRONQUÉ à 26 car. → on matche en PRÉFIXE (BAN commence par le libellé
 * Sitadel), unaccent des deux côtés ; le n° peut porter un suffixe (« 5B ») → on isole l'entier de tête. « on ne devine pas » :
 *  · n° exact trouvé → point PRÉCIS ;
 *  · voie trouvée mais pas le n° → point de la voie au n° le PLUS PROCHE, AVEC un avertissement explicite (jamais un point muet) ;
 *  · rien → `erreur` (l'écran reste sur l'empreinte et le dit).
 */
export async function geocoderAdresse(dossierId: number): Promise<{ x: number; y: number; avertissement: string | null } | { erreur: string }> {
  const { rows } = await query<{ num_dau: string; code_insee: string; num: string | null; voie: string | null }>(
    `SELECT num_dau, code_insee, adr_num_ter AS num, adr_libvoie_ter AS voie FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const d = rows[0];
  if (!d) return { erreur: 'dossier introuvable' };
  const voie = (d.voie ?? '').trim();
  if (!voie) return { erreur: 'adresse du permis absente (Sitadel ne porte pas de libellé de voie) : centrage sur les parcelles conservé' };
  const c = communeCadastrale(d.num_dau, d.code_insee);
  const insee = 'insee' in c ? c.insee : (d.code_insee ?? '').trim(); // repli : la commune Sitadel (hors Paris, = arrondissement)
  const numTxt = (d.num ?? '').replace(/[^0-9].*$/, '');              // « 5B » → « 5 » ; « » si aucun chiffre de tête
  const numero = numTxt !== '' ? parseInt(numTxt, 10) : null;

  // ① n° EXACT (voie en préfixe, unaccent). Suffixe absent préféré (l'adresse « nue » avant les bis/ter).
  const exact = await query<{ x: number; y: number }>(
    `SELECT ST_X(geom) AS x, ST_Y(geom) AS y FROM adresse_ban
      WHERE insee_commune = $1 AND upper(unaccent(nom_voie)) LIKE upper(unaccent($2)) || '%' AND ($3::int IS NOT NULL AND numero = $3)
      ORDER BY (suffixe IS NULL) DESC LIMIT 1`, [insee, voie, numero]);
  if (exact.rows[0]) return { x: Number(exact.rows[0].x), y: Number(exact.rows[0].y), avertissement: null };

  // ② voie trouvée mais pas le n° exact → n° le plus PROCHE sur la voie, AVERTI (jamais un point muet). Sans n° Sitadel, 1re adresse de la voie.
  const voieSeule = await query<{ x: number; y: number; numero: number | null }>(
    `SELECT ST_X(geom) AS x, ST_Y(geom) AS y, numero FROM adresse_ban
      WHERE insee_commune = $1 AND upper(unaccent(nom_voie)) LIKE upper(unaccent($2)) || '%'
      ORDER BY CASE WHEN $3::int IS NULL THEN 0 ELSE abs(numero - $3) END, numero LIMIT 1`, [insee, voie, numero]);
  if (voieSeule.rows[0]) {
    const r = voieSeule.rows[0];
    const avert = numero !== null
      ? `n° ${numero} absent de la base BAN pour « ${voie} » — centré sur la voie (n° ${r.numero ?? '?'} le plus proche)`
      : `numéro du permis absent — centré sur la voie « ${voie} »`;
    return { x: Number(r.x), y: Number(r.y), avertissement: avert };
  }
  return { erreur: `adresse non localisée dans la base BAN (${insee} · ${voie}${numero !== null ? ` n° ${numero}` : ''}) : centrage sur les parcelles conservé` };
}

/**
 * Parcelles du permis + voisines (rayon) d'un dossier, prêtes à dessiner. LECTURE SEULE. Ordre déterministe (retenues d'abord, puis
 * haut→bas, gauche→droite, idu) → repères A/B/C… stables. La géométrie de RÉFÉRENCE du rayon dépend du CENTRE (empreinte / parcelle
 * du permis / point d'adresse géocodé). ST_DWithin JOIN → l'index GiST tient (cf. AGENTS.md : un DWithin n'est pas un KNN).
 */
export async function parcellesVoisines(dossierId: number, rayonM: number = RAYON_VOISINES_DEFAUT_M, centre?: CentreDemande): Promise<PlancheParcelles> {
  const rayon = bornerRayon(rayonM);

  // Liste des parcelles du permis (choix de centrage) — indépendante du reste, résiliente.
  const { rows: choixRows } = await query<{ idu: string; section: string; numero: string }>(
    `SELECT par.id AS idu, par.section, par.numero
       FROM permis_parcelle pp JOIN parcelle par ON par.id = pp.idu WHERE pp.dossier_id = $1 ORDER BY par.section, par.numero`, [dossierId]);
  const parcellesChoix = choixRows.map((r) => ({ idu: r.idu, section: r.section, numero: r.numero }));

  // Résolution du CENTRE demandé → mode effectif + params (jamais un point inventé : une adresse non résolue retombe sur l'empreinte + avertissement).
  const demande: CentreDemande = centre ?? { mode: 'empreinte' };
  let mode: CentreMode = 'empreinte';
  let idu: string | null = null;
  let point: { x: number; y: number } | null = null;
  let centreAvertissement: string | null = null;
  if (demande.mode === 'parcelle' && demande.idu && parcellesChoix.some((p) => p.idu === demande.idu)) {
    mode = 'parcelle'; idu = demande.idu;
  } else if (demande.mode === 'parcelle') {
    centreAvertissement = 'parcelle de centrage inconnue pour ce permis — centrage sur l’empreinte';
  } else if (demande.mode === 'adresse') {
    const geo = await geocoderAdresse(dossierId);
    if ('erreur' in geo) { centreAvertissement = geo.erreur; }
    else { mode = 'adresse'; point = { x: geo.x, y: geo.y }; centreAvertissement = geo.avertissement; }
  }

  // Empreinte du permis (fond du schéma), en Lambert-93 natif (aucune reprojection — le module pur travaille en 2154).
  const { rows: empRows } = await query<{ gj: unknown }>(
    `SELECT ST_AsGeoJSON(ST_Force2D(geom))::json AS gj FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL`, [dossierId]);
  const empGeom: GeomPoly | null = empRows[0]?.gj ? geomDepuisGeoJSON(empRows[0].gj) : null;

  // Retenues (rattachées à `parcelle`) + voisines (rayon autour du centre). L'auteur d'une retenue est résolu en nom si maj_par est
  //   un id admin. La CTE `ref` sélectionne la géométrie de référence selon le mode (CASE PARESSEUX : la branche adresse n'évalue
  //   ST_MakePoint que si mode='adresse', donc x/y NULL sur les autres modes ne posent aucun problème).
  const { rows } = await query<LignePlanche>(
    `WITH ref AS (
       SELECT CASE
         WHEN $3 = 'parcelle' THEN (SELECT geom FROM parcelle WHERE id = $4)
         WHEN $3 = 'adresse'  THEN ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 2154)
         ELSE COALESCE(
           (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL),
           (SELECT ST_Collect(par.geom) FROM permis_parcelle pp JOIN parcelle par ON par.id = pp.idu WHERE pp.dossier_id = $1))
       END AS g
     ),
     ret AS (
       SELECT par.id AS idu, par.section, par.numero, ST_Force2D(par.geom) AS geom, pp.origine,
              pp.maj_par, pp.maj_le::text AS maj_le, au.prenom, au.nom, TRUE AS retenue
         FROM permis_parcelle pp
         JOIN parcelle par ON par.id = pp.idu
         LEFT JOIN admin_utilisateur au ON au.id = CASE WHEN pp.maj_par ~ '^[0-9]+$' THEN pp.maj_par::bigint ELSE NULL END
        WHERE pp.dossier_id = $1
     ),
     vois AS (
       SELECT p.id AS idu, p.section, p.numero, ST_Force2D(p.geom) AS geom, NULL::text AS origine,
              NULL::text AS maj_par, NULL::text AS maj_le, NULL::text AS prenom, NULL::text AS nom, FALSE AS retenue
         FROM parcelle p, ref
        WHERE ref.g IS NOT NULL AND ST_DWithin(p.geom, ref.g, $2) AND p.id NOT IN (SELECT idu FROM ret)
     )
     SELECT u.idu, u.section, u.numero, ST_AsGeoJSON(u.geom)::json AS gj, u.origine, u.maj_par, u.maj_le,
            u.prenom, u.nom, u.retenue, round(ST_Area(u.geom)::numeric, 1) AS surface_m2
       FROM (SELECT * FROM ret UNION ALL SELECT * FROM vois) u
      ORDER BY u.retenue DESC, ST_Y(ST_Centroid(u.geom)) DESC, ST_X(ST_Centroid(u.geom)), u.idu`,
    [dossierId, rayon, mode, idu, point?.x ?? null, point?.y ?? null]);

  const meta: PlancheParcelleMeta[] = rows.map((r) => ({
    idu: r.idu, section: r.section, numero: r.numero, retenue: r.retenue === true,
    origine: r.origine, surfaceM2: nbOuNull(r.surface_m2), majPar: r.maj_par, majLe: r.maj_le,
    acteurNom: r.prenom || r.nom ? `${r.prenom ?? ''} ${r.nom ?? ''}`.trim() : null,
  }));
  const entrees: PolygoneEntreeSchema[] = rows.map((r, i) => ({
    repere: repereDepuisIndex(i), cleabs: r.idu, geom: geomDepuisGeoJSON(r.gj), horsEmpreinte: r.retenue !== true,
    attributs: { nombreEtages: null, hauteurM: null, altitudeToitNgf: null, surfaceM2: nbOuNull(r.surface_m2), etatDeLObjet: null },
  }));

  const nbRetenues = meta.filter((m) => m.retenue).length;
  const nbVoisines = meta.length - nbRetenues;
  const motif = nbRetenues === 0
    ? 'aucune parcelle de ce permis n’est rattachée à un contour cadastral : planche non dessinée (rattachez d’abord une parcelle)'
    : null;

  const schema = construireSchema(empGeom, entrees, 360, 300, 14);
  // Marqueur d'adresse : le point géocodé projeté dans la boîte du schéma (le composant ne connaît que des coords boîte).
  const marqueurAdresse = mode === 'adresse' && point && schema.transform
    ? (([cx, cy]) => ({ cx, cy }))(projeterLambertDansSchema(schema.transform, point.x, point.y))
    : null;

  return {
    schema, meta, rayonM: rayon, nbRetenues, nbVoisines, motif,
    centre: { mode, idu, point }, centreAvertissement, marqueurAdresse, parcellesChoix,
  };
}
