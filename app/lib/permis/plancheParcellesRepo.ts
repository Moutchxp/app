/**
 * PL-A/PL-B — PLANCHE CADASTRALE (LECTURE SEULE). Charge, pour un permis, les parcelles DESSINÉES AUTOUR D'UN CENTRE (dans un
 * RAYON), en marquant celles du permis (RETENUES) — puis construit le schéma SVG via le module PUR `affectationSchema` (EPSG:2154,
 * aucune tuile). Module PROPRE : n'importe que db/client + le module pur + la dérivation d'arrondissement cadastral (pur).
 *
 * 🔑 RAYON réglable à l'écran (PL-B, 50→200 m ; défaut 50 m). Le rayon s'appuie sur l'index GiST `parcelle_geom_geom_idx`
 * (ST_DWithin → `geom && ST_Expand(ref, rayon)`), et NON la section entière (Seq Scan, illisible).
 *
 * 🎯 CENTRAGE (PL-B/B2) : 'empreinte' (défaut = toutes les parcelles du permis + voisines), 'parcelle' (autour d'UNE parcelle du
 * permis), ou 'adresse' (autour de l'adresse postale GÉOCODÉE contre `adresse_ban`). La planche est TOUJOURS « autour du centre » :
 * en mode adresse, on charge bien les parcelles AUTOUR DU POINT (PL-B2 §4), pas un simple recadrage. ⚠️ « on ne devine pas » : une
 * adresse non résolue RESTE sur l'empreinte et le DIT (centreAvertissement) — jamais un point inventé.
 *
 * ⚠️ Ce module N'ÉCRIT RIEN (le clic « ajouter/retirer » et la validation sont des lots séparés, PL-C).
 */
import { query } from '../db/client';
import { communeCadastrale } from '../sitadel/referenceCadastrale';
import { construireSchema, geomDepuisGeoJSON, repereDepuisIndex, projeterLambertDansSchema, cadreDe, type SchemaEmpreinte, type PolygoneEntreeSchema, type GeomPoly } from './affectationSchema';

export const RAYON_VOISINES_DEFAUT_M = 50;
const RAYON_MIN_M = 10, RAYON_MAX_M = 200;
export function bornerRayon(rayonM: number | null | undefined): number {
  const n = typeof rayonM === 'number' && Number.isFinite(rayonM) ? rayonM : RAYON_VOISINES_DEFAUT_M;
  return Math.min(RAYON_MAX_M, Math.max(RAYON_MIN_M, Math.round(n)));
}

/** Nom d'arrondissement parisien depuis l'INSEE CADASTRAL (751xx → « Paris 19e »). null hors Paris. PUR (testable) : la table
 *  `commune` ne porte que 75056 pour Paris entière, donc l'arrondissement se DÉRIVE du code, il ne se joint pas. */
export function nomParisArrondissement(insee: string | null): string | null {
  if (!insee || !/^751\d\d$/.test(insee) || insee === '75056') return null;
  const arr = parseInt(insee.slice(3), 10);
  if (arr < 1 || arr > 20) return null;
  return `Paris ${arr}${arr === 1 ? 'er' : 'e'}`;
}

export type CentreMode = 'empreinte' | 'parcelle' | 'adresse';
export type GeoProvenance = 'ban-local' | 'api-adresse'; // PL-D — d'où vient le point d'adresse (copie locale vs API nationale)
/** PL-E — une suggestion d'autocomplétion : libellé + point DÉJÀ en Lambert-93 (choisir = géocoder, sans 2e appel). */
export interface SuggestionAdresse { label: string; x: number; y: number }
export interface CentreDemande {
  mode: CentreMode; idu?: string | null;
  adresseTexte?: string | null;                          // PL-D — saisie manuelle libre (à géocoder)
  pointAdresse?: { x: number; y: number; label: string } | null; // PL-E — suggestion CHOISIE (point déjà connu → aucun re-géocodage)
}
export interface CentreEffectif { mode: CentreMode; idu: string | null; point: { x: number; y: number } | null; provenance: GeoProvenance | null; label: string | null }

/** PL-C — sélection validée à la main (superposition). active=false → 100% automatique. Provenance HONNÊTE (acteur résolu si id admin). */
export interface SelectionInfo {
  active: boolean;
  idus: string[];              // IDU de la sélection validée (l'ensemble effectif)
  validePar: string | null;    // valeur brute de valide_par (id admin, 'admin', ou autre)
  valideLe: string | null;     // ISO de la validation
  acteurNom: string | null;    // prénom+nom si valide_par est un id d'admin résolu ; null sinon
}

/** « Où l'on est » : commune de la planche + ce qu'on peut HONNÊTEMENT reconstituer du nom de planche (feuille non présente en base). */
export interface Localisation {
  communeCode: string | null;   // INSEE cadastral (arrondissement pour Paris)
  communeNom: string | null;    // « Paris 19e », « Arcueil »… ou null si non résolu
  sections: string[];           // sections des parcelles DU PERMIS
  feuilleLibelle: string;       // « Paris 19e — section DI » (reconstitué : commune + section)
  feuilleNote: string;          // pourquoi ce n'est pas un vrai n° de feuille
}

export interface PlancheParcelleMeta {
  idu: string | null; section: string; numero: string; retenue: boolean;
  origine: 'saisie' | 'extraite' | null; surfaceM2: number | null;
  majPar: string | null; majLe: string | null; acteurNom: string | null;
}

export interface PlancheParcelles {
  schema: SchemaEmpreinte;
  meta: PlancheParcelleMeta[];
  rayonM: number;
  nbRetenues: number;
  nbVoisines: number;
  motif: string | null;
  centre: CentreEffectif;
  centreAvertissement: string | null;
  marqueurAdresse: { cx: number; cy: number } | null;
  parcellesChoix: { idu: string; section: string; numero: string }[];
  localisation: Localisation;
  selection: SelectionInfo;     // PL-C — sélection validée (superposition) ; active=false = configuration automatique
}

interface LignePlanche {
  idu: string | null; section: string; numero: string; gj: unknown; origine: 'saisie' | 'extraite' | null;
  maj_par: string | null; maj_le: string | null; prenom: string | null; nom: string | null; retenue: boolean; surface_m2: string | number | null;
}

const nbOuNull = (v: string | number | null): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * PL-C — lit la SÉLECTION validée d'un dossier sous la forme SelectionInfo (active + idus + provenance résolue). Partagée par la
 * planche ET le bandeau « Bâtiments et projection » (route /emprise). Résiliente si migration 202 absente (42P01 → configuration automatique).
 */
export async function lireSelectionInfo(dossierId: number): Promise<SelectionInfo> {
  try {
    const { rows } = await query<{ idu: string; valide_par: string | null; valide_le: string | null; prenom: string | null; nom: string | null }>(
      `SELECT s.idu, s.valide_par, s.valide_le::text AS valide_le, au.prenom, au.nom
         FROM permis_parcelle_selection s
         LEFT JOIN admin_utilisateur au ON au.id = CASE WHEN s.valide_par ~ '^[0-9]+$' THEN s.valide_par::bigint ELSE NULL END
        WHERE s.dossier_id = $1 ORDER BY s.section, s.numero`, [dossierId]);
    if (rows.length === 0) return { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null };
    const p = rows[0];
    return { active: true, idus: rows.map((r) => r.idu), validePar: p.valide_par, valideLe: p.valide_le,
             acteurNom: p.prenom || p.nom ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : null };
  } catch (e) { if ((e as { code?: string })?.code === '42P01') return { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null }; throw e; }
}

/** Résout le nom d'une commune cadastrale : Paris → dérivé (pur) ; sinon table `commune`, repli `adresse_ban.nom_commune`, sinon null. */
async function resoudreCommune(insee: string): Promise<string | null> {
  const paris = nomParisArrondissement(insee);
  if (paris) return paris;
  const { rows } = await query<{ nom: string | null }>(
    `SELECT COALESCE((SELECT nom FROM commune WHERE code_insee = $1 LIMIT 1),
                     (SELECT nom_commune FROM adresse_ban WHERE insee_commune = $1 LIMIT 1)) AS nom`, [insee]);
  return rows[0]?.nom ?? null;
}

/**
 * GÉOCODAGE de l'adresse postale d'un dossier contre `adresse_ban` (LECTURE SEULE). Pièges gérés : INSEE cadastral (Paris →
 * arrondissement dérivé du n° de dossier, communeCadastrale) car `adresse_ban` est par arrondissement (751xx) ; libellé de voie
 * Sitadel TRONQUÉ à 26 car. → match en PRÉFIXE unaccent ; n° à suffixe (« 5B ») → entier de tête. « on ne devine pas » :
 *  · n° exact → point PRÉCIS ; · voie sans le n° → n° le plus proche AVEC avertissement ; · rien → `erreur`.
 */
interface GeoOk { x: number; y: number; provenance: GeoProvenance; label: string | null; avertissement: string | null }

/**
 * PL-D — RECOURS FRANCE ENTIÈRE : api-adresse.data.gouv.fr (Base Adresse Nationale, Licence Ouverte/Etalab) quand la copie LOCALE
 * d'adresse_ban ne trouve rien (elle ne couvre que 103/399 communes de nos permis). L'API renvoie le point DIRECTEMENT en
 * Lambert-93 (`properties.x/y`) → aucune reprojection. Timeout borné ; toute panne réseau → null (repli propre, jamais un blocage).
 * ⚠️ Donnée EXTERNE : provenance='api-adresse' explicite (attribution BAN) — ce n'est PAS une décision humaine.
 */
async function geocoderViaApi(q: string, citycode: string | null): Promise<GeoOk | null> {
  const requete = q.trim();
  if (requete === '') return null;
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(requete)}&limit=1${citycode ? `&citycode=${encodeURIComponent(citycode)}` : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { features?: { properties?: { x?: number; y?: number; label?: string } }[] };
    const p = j.features?.[0]?.properties;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return { x: p.x, y: p.y, provenance: 'api-adresse', label: p.label ?? null,
             avertissement: 'adresse localisée via l’API nationale (api-adresse.data.gouv.fr — Base Adresse Nationale, Licence Ouverte)' };
  } catch { return null; } // réseau indisponible / timeout → repli propre
}

/**
 * PL-E — AUTOCOMPLÉTION d'adresse (api-adresse, mode `autocomplete`). BIAIS SOUPLE vers la commune du permis : on interroge à la fois
 * AVEC le code INSEE (résultats de la commune EN TÊTE) et SANS (France entière, pour chercher ailleurs — le cas où l'automatique
 * s'est trompé), puis on fusionne (commune d'abord, dédup par libellé). Chaque suggestion porte DÉJÀ le point Lambert-93 (choisir =
 * géocoder sans 2e appel). ≥ 3 caractères requis. Toute panne réseau → liste vide (repli propre). Donnée EXTERNE (BAN, Licence Ouverte).
 */
async function apiSuggest(q: string, citycode: string | null): Promise<SuggestionAdresse[]> {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&autocomplete=1&limit=5${citycode ? `&citycode=${encodeURIComponent(citycode)}` : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { features?: { properties?: { label?: string; x?: number; y?: number } }[] };
    return (j.features ?? []).flatMap((f) => {
      const p = f.properties;
      return p && typeof p.x === 'number' && typeof p.y === 'number' && p.label ? [{ label: p.label, x: p.x, y: p.y }] : [];
    });
  } catch { return []; }
}

export async function suggestionsAdresse(dossierId: number, q: string): Promise<SuggestionAdresse[]> {
  const requete = (q ?? '').trim();
  if (requete.length < 3) return []; // pas de rafale sur 1-2 caractères
  const { rows } = await query<{ num_dau: string; code_insee: string }>(
    `SELECT num_dau, code_insee FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const d = rows[0];
  const c = d ? communeCadastrale(d.num_dau, d.code_insee) : { motif: '' };
  const insee = 'insee' in c ? c.insee : (d?.code_insee ?? '').trim();
  const [commune, france] = await Promise.all([insee ? apiSuggest(requete, insee) : Promise.resolve([]), apiSuggest(requete, null)]);
  const vues = new Set<string>();
  const out: SuggestionAdresse[] = [];
  for (const s of [...commune, ...france]) { if (!vues.has(s.label)) { vues.add(s.label); out.push(s); } } // commune EN TÊTE, dédup
  return out.slice(0, 6);
}

/**
 * GÉOCODAGE : copie LOCALE d'adresse_ban d'abord (structuré : INSEE arrondissement + voie en préfixe unaccent + n° à suffixe géré),
 * puis RECOURS api-adresse (France entière) si le local échoue. Une SAISIE MANUELLE (`texteManuel`, PL-D) est du texte libre →
 * envoyée directement à l'API nationale (le local exige un libellé structuré). Provenance TOUJOURS explicite (ban-local vs api-adresse).
 */
export async function geocoderAdresse(dossierId: number, texteManuel?: string | null): Promise<GeoOk | { erreur: string }> {
  const { rows } = await query<{ num_dau: string; code_insee: string; num: string | null; voie: string | null }>(
    `SELECT num_dau, code_insee, adr_num_ter AS num, adr_libvoie_ter AS voie FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const d = rows[0];
  if (!d) return { erreur: 'dossier introuvable' };
  const c = communeCadastrale(d.num_dau, d.code_insee);
  const insee = 'insee' in c ? c.insee : (d.code_insee ?? '').trim();

  // SAISIE MANUELLE (texte libre) → API nationale directement, SANS forcer la commune (Arno saisit l'adresse complète : la contraindre
  //   à l'arrondissement du permis produirait un faux appariement si l'adresse est ailleurs). Le libellé retourné DIT ce qui a matché.
  const manuel = (texteManuel ?? '').trim();
  if (manuel !== '') {
    const api = await geocoderViaApi(manuel, null);
    if (api) return api;
    return { erreur: `adresse saisie « ${manuel} » non localisée (ni base locale ni API nationale)` };
  }

  // AUTO : adresse Sitadel. ① local exact ② local voie-seule ③ recours API nationale.
  const voie = (d.voie ?? '').trim();
  if (!voie) return { erreur: 'adresse du permis absente (Sitadel ne porte pas de libellé de voie) : saisissez une adresse' };
  const numTxt = (d.num ?? '').replace(/[^0-9].*$/, '');
  const numero = numTxt !== '' ? parseInt(numTxt, 10) : null;

  const exact = await query<{ x: number; y: number }>(
    `SELECT ST_X(geom) AS x, ST_Y(geom) AS y FROM adresse_ban
      WHERE insee_commune = $1 AND upper(unaccent(nom_voie)) LIKE upper(unaccent($2)) || '%' AND ($3::int IS NOT NULL AND numero = $3)
      ORDER BY (suffixe IS NULL) DESC LIMIT 1`, [insee, voie, numero]);
  if (exact.rows[0]) return { x: Number(exact.rows[0].x), y: Number(exact.rows[0].y), provenance: 'ban-local', label: null, avertissement: null };

  const voieSeule = await query<{ x: number; y: number; numero: number | null }>(
    `SELECT ST_X(geom) AS x, ST_Y(geom) AS y, numero FROM adresse_ban
      WHERE insee_commune = $1 AND upper(unaccent(nom_voie)) LIKE upper(unaccent($2)) || '%'
      ORDER BY CASE WHEN $3::int IS NULL THEN 0 ELSE abs(numero - $3) END, numero LIMIT 1`, [insee, voie, numero]);
  if (voieSeule.rows[0]) {
    const r = voieSeule.rows[0];
    const avert = numero !== null
      ? `n° ${numero} absent de la base BAN pour « ${voie} » — centré sur la voie (n° ${r.numero ?? '?'} le plus proche)`
      : `numéro du permis absent — centré sur la voie « ${voie} »`;
    return { x: Number(r.x), y: Number(r.y), provenance: 'ban-local', label: null, avertissement: avert };
  }

  const api = await geocoderViaApi(`${numero !== null ? numero + ' ' : ''}${voie}`, insee || null);
  if (api) return api;
  return { erreur: `adresse non localisée (${insee} · ${voie}${numero !== null ? ` n° ${numero}` : ''}) — ni base locale ni API nationale` };
}

/**
 * Planche d'un dossier : parcelles DESSINÉES autour du centre (dans le rayon), les parcelles du permis marquées RETENUES. LECTURE
 * SEULE. Ordre déterministe (retenues d'abord, puis haut→bas, gauche→droite, idu). La géométrie de RÉFÉRENCE dépend du CENTRE ; le
 * CADRE d'affichage suit le centre (pour 'parcelle'/'adresse' on cadre sur les parcelles autour du point, pas sur l'empreinte lointaine).
 */
export async function parcellesVoisines(dossierId: number, rayonM: number = RAYON_VOISINES_DEFAUT_M, centre?: CentreDemande): Promise<PlancheParcelles> {
  const rayon = bornerRayon(rayonM);

  const { rows: choixRows } = await query<{ idu: string; section: string; numero: string }>(
    `SELECT par.id AS idu, par.section, par.numero
       FROM permis_parcelle pp JOIN parcelle par ON par.id = pp.idu WHERE pp.dossier_id = $1 ORDER BY par.section, par.numero`, [dossierId]);
  const parcellesChoix = choixRows.map((r) => ({ idu: r.idu, section: r.section, numero: r.numero }));

  const selection = await lireSelectionInfo(dossierId); // PL-C — sélection validée (superposition) ; { active:false } = configuration automatique

  const demande: CentreDemande = centre ?? { mode: 'empreinte' };
  let mode: CentreMode = 'empreinte';
  let idu: string | null = null;
  let point: { x: number; y: number } | null = null;
  let centreAvertissement: string | null = null;
  let provenance: GeoProvenance | null = null;
  let label: string | null = null;
  if (demande.mode === 'parcelle' && demande.idu && parcellesChoix.some((p) => p.idu === demande.idu)) {
    mode = 'parcelle'; idu = demande.idu;
  } else if (demande.mode === 'parcelle') {
    centreAvertissement = 'parcelle de centrage inconnue pour ce permis — centrage sur l’empreinte';
  } else if (demande.mode === 'adresse') {
    if (demande.pointAdresse) {
      // PL-E — suggestion CHOISIE : le point est DÉJÀ connu (Lambert-93) → aucun re-géocodage. Donnée externe (BAN).
      mode = 'adresse'; point = { x: demande.pointAdresse.x, y: demande.pointAdresse.y }; provenance = 'api-adresse'; label = demande.pointAdresse.label;
      centreAvertissement = 'adresse choisie via l’API nationale (api-adresse.data.gouv.fr — Base Adresse Nationale, Licence Ouverte)';
    } else {
      const geo = await geocoderAdresse(dossierId, demande.adresseTexte); // PL-D : saisie manuelle → API nationale ; sinon adresse Sitadel (local puis API)
      if ('erreur' in geo) { centreAvertissement = geo.erreur; }
      else { mode = 'adresse'; point = { x: geo.x, y: geo.y }; centreAvertissement = geo.avertissement; provenance = geo.provenance; label = geo.label; }
    }
  }

  const { rows: empRows } = await query<{ gj: unknown }>(
    `SELECT ST_AsGeoJSON(ST_Force2D(geom))::json AS gj FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL`, [dossierId]);
  const empGeom: GeomPoly | null = empRows[0]?.gj ? geomDepuisGeoJSON(empRows[0].gj) : null;

  // Parcelles DESSINÉES = celles dans le rayon autour de la référence (CASE PARESSEUX : la branche adresse n'évalue ST_MakePoint que
  //   si mode='adresse'). Chaque parcelle est APPARIÉE au permis (retenue + origine/acteur) par LEFT JOIN LATERAL — une parcelle du
  //   permis qui tombe dans le rayon est donc marquée, où qu'on centre.
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
     drawn AS (
       SELECT p.id AS idu, p.section, p.numero, ST_Force2D(p.geom) AS geom
         FROM parcelle p, ref
        WHERE ref.g IS NOT NULL AND ST_DWithin(p.geom, ref.g, $2)
       UNION  -- PL-C : les parcelles du permis ET de la sélection sont TOUJOURS dessinées (donc basculables/vertes), même hors rayon.
       SELECT par.id, par.section, par.numero, ST_Force2D(par.geom)
         FROM parcelle par WHERE par.id = ANY($7::text[])
     )
     SELECT d.idu, d.section, d.numero, ST_AsGeoJSON(d.geom)::json AS gj,
            r.origine, r.maj_par, r.maj_le, r.prenom, r.nom, (r.idu IS NOT NULL) AS retenue,
            round(ST_Area(d.geom)::numeric, 1) AS surface_m2
       FROM drawn d
       LEFT JOIN LATERAL (
         SELECT pp.idu, pp.origine, pp.maj_par, pp.maj_le::text AS maj_le, au.prenom, au.nom
           FROM permis_parcelle pp
           LEFT JOIN admin_utilisateur au ON au.id = CASE WHEN pp.maj_par ~ '^[0-9]+$' THEN pp.maj_par::bigint ELSE NULL END
          WHERE pp.dossier_id = $1 AND pp.idu = d.idu LIMIT 1
       ) r ON true
      ORDER BY (r.idu IS NOT NULL) DESC, ST_Y(ST_Centroid(d.geom)) DESC, ST_X(ST_Centroid(d.geom)), d.idu`,
    [dossierId, rayon, mode, idu, point?.x ?? null, point?.y ?? null,
     [...new Set([...parcellesChoix.map((p) => p.idu), ...selection.idus])]]);

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
  // PL-D — Motif SEULEMENT s'il n'y a RIEN à dessiner (0 parcelle). Un permis SANS parcelle rattachée (impasse) doit quand même
  //   pouvoir composer sa sélection : en centrant sur l'ADRESSE (auto ou saisie), la planche dessine le voisinage réel → Arno clique
  //   la bonne parcelle. Ne reste muet que si aucune parcelle n'est dessinée ET aucune adresse ne localise le permis.
  const motif = meta.length > 0 ? null
    : (parcellesChoix.length === 0
        ? (centreAvertissement
            ? `aucune parcelle rattachée à ce permis et l’adresse ne se localise pas (${centreAvertissement}) : saisissez une adresse pour dessiner la planche et composer la sélection.`
            : 'aucune parcelle rattachée à ce permis : centrez sur l’adresse (ci-dessus) pour dessiner la planche et composer la sélection.')
        : 'aucune parcelle à dessiner dans ce rayon : élargissez le rayon ou changez de centrage.');

  // Cadre : 'empreinte' → auto (empreinte + tout le dessin) ; 'parcelle'/'adresse' → cadré sur le DESSIN autour du point (planche du
  //   centre, pas de l'empreinte lointaine). construireSchema force la bbox si `cadre` fourni.
  const cadre = mode === 'empreinte' ? null : cadreDe(null, entrees);
  const schema = construireSchema(empGeom, entrees, 360, 300, 14, cadre);
  const marqueurAdresse = mode === 'adresse' && point && schema.transform
    ? (([cx, cy]) => ({ cx, cy }))(projeterLambertDansSchema(schema.transform, point.x, point.y))
    : null;

  // Localisation : commune DOMINANTE des parcelles dessinées (reflète la planche affichée), sections DU PERMIS.
  const compteCommune = new Map<string, number>();
  for (const r of rows) { const c = (r.idu ?? '').slice(0, 5); if (c) compteCommune.set(c, (compteCommune.get(c) ?? 0) + 1); }
  const communeCode = [...compteCommune.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? parcellesChoix[0]?.idu?.slice(0, 5) ?? null;
  const sections = [...new Set(parcellesChoix.map((p) => p.section))].sort();
  const communeNom = communeCode ? await resoudreCommune(communeCode) : null;
  const feuilleLibelle = [communeNom ?? (communeCode ? `commune ${communeCode} (non résolue)` : null),
    sections.length ? `section${sections.length > 1 ? 's' : ''} ${sections.join(', ')}` : null].filter(Boolean).join(' — ') || 'localisation indéterminée';
  const localisation: Localisation = {
    communeCode, communeNom, sections, feuilleLibelle,
    feuilleNote: 'le numéro de feuille cadastrale n’est pas dans nos données : libellé reconstitué (commune + section).',
  };

  return {
    schema, meta, rayonM: rayon, nbRetenues, nbVoisines, motif,
    centre: { mode, idu, point, provenance, label }, centreAvertissement, marqueurAdresse, parcellesChoix, localisation, selection,
  };
}
