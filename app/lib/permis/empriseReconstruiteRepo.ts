/**
 * PROJ-2 — ADAPTATEUR IMPUR des emprises RECONSTITUÉES (tracé manuel assisté). Lit/écrit UNIQUEMENT `permis_emprise_reconstruite`.
 *
 * 🔴🔴🔴 GARDE FONDAMENTALE : une emprise reconstituée n'est JAMAIS une mesure. Ce module n'écrit RIEN dans `batiment`,
 * `permis_corps_batiment`, `permis_corps_polygone` ni `permis_polygone_altitude`. Il n'appelle NI le verdict, NI la préséance
 * d'altitude, NI un certificat. Sa seule table est `permis_emprise_reconstruite`. Un test (`empriseReconstruiteRepo.test.ts`)
 * casse si une écriture de ce module vise une autre table, et une garde statique vérifie que le moteur ignore cette table.
 *
 * RÉSILIENT : tant que la migration 149 n'est pas appliquée, la table n'existe pas → lecture repliée `[]` + `tableAbsente`,
 * écriture refusée avec motif clair (aucune exception qui remonte). Module PROPRE : n'importe que db/client et le module pur.
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { aireM2, deriverDebordement, appliquerAjustement, ajustementValide, type PointLambert, type Debordement, type Ajustement } from './calageEmprise';
import { grouperPolygonesConnexes, grouperParBatiment } from './adoptionEmprise';
import { lireSeuilMitoyenAireM2, qualifierMitoyennete, batimentAppartientPermis, type QualificationPolygone, type IntersectionParcelleBatiment } from './projectionConfig';

/** Journal de calage stocké tel quel (jsonb) — auditable, jamais lissé. */
export interface CalageTrace {
  paires: { plan: { x: number; y: number }; lambert: { x: number; y: number } }[];
  ratioDeclare: number | null;
  ratioImplicite: number;
  residuFitM: number;
  residuEchelleM: number | null;
  douteux: boolean;
  raisons: string[];
}

// PROJ-3q — provenance RÉELLE de l'emprise (liste fermée, alignée sur le CHECK en base). 'ign_retouche' pré-provisionné (chantier suivant).
export type ProvenanceEmprise = 'trace_manuel' | 'ign_adopte' | 'ign_retouche';

export interface EmpriseReconstruite {
  id: number;
  dossierId: number;
  corpsId: number | null;        // PROJ-2b — bâtiment (permis_corps_batiment) reconstitué ; null = ligne PROJ-2 antérieure
  libelle: string;
  anneau: PointLambert[];        // contour extérieur PRINCIPAL EPSG:2154 (1re partie) — compat historique
  anneaux: PointLambert[][];     // PROJ-3q — TOUS les contours extérieurs (MultiPolygon d'un groupe adopté à contact par sommet)
  surfaceM2: number | null;
  pieceId: number | null;
  page: number | null;
  calage: CalageTrace | null;
  residuM: number | null;
  provenance: ProvenanceEmprise; // PROJ-3q — 'trace_manuel' (tracé) | 'ign_adopte' (IGN) | 'ign_retouche'
  ajustement: Ajustement | null;  // PROJ-3t (lot 3a) — DELTA d'ajustement manuel réversible ; NULL = aucun. Non NULL = emprise retouchée à la main (traçabilité).
  creeLe: string | null;
}

export interface EntreeEnregistrement {
  dossierId: number;
  corpsId: number | null;        // PROJ-2b — bâtiment du permis auquel l'emprise se rattache
  libelle: string;
  anneau: PointLambert[];        // ≥ 3 sommets, en Lambert-93
  pieceId: number | null;
  page: number | null;
  calage: CalageTrace;
  residuM: number | null;
  creePar: string | null;
}

/** Table absente (149 pas encore appliquée) ? Détection par code Postgres 42P01 (undefined_table). */
function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}
/** Colonne absente (ex. NOM-1 : `nom_repli`, migration 168 non appliquée) ? Code Postgres 42703 (undefined_column). */
function estColonneAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';
}

/** WKT `POLYGON((x y, …, x y))` d'un anneau Lambert, FERMÉ explicitement. Nombres uniquement (aucune chaîne externe → pas d'injection). */
function anneauVersWkt(anneau: PointLambert[]): string {
  const pts = anneau.map((p) => `${p.x} ${p.y}`);
  if (pts.length > 0 && pts[0] !== pts[pts.length - 1]) pts.push(pts[0]); // fermeture explicite
  return `POLYGON((${pts.join(', ')}))`;
}

export type ResultatEnregistrement =
  | { ok: true; id: number }
  | { ok: false; motif: string; tableAbsente?: boolean };

/**
 * Enregistre UNE emprise reconstituée. Refuse un contour de moins de 3 sommets ou des coordonnées non finies (aucune
 * géométrie douteuse en base). La surface est calculée EN BASE (ST_Area) ET côté application (aireM2) — on stocke la valeur
 * base (autorité PostGIS). 🔴 N'écrit QUE dans permis_emprise_reconstruite ; `reconstitution` reste true (CHECK en base).
 */
export async function enregistrerEmprise(e: EntreeEnregistrement): Promise<ResultatEnregistrement> {
  if (!Number.isInteger(e.dossierId) || e.dossierId <= 0) return { ok: false, motif: 'dossier invalide' };
  if (e.libelle.trim() === '') return { ok: false, motif: 'libellé du bâtiment requis' };
  if (e.anneau.length < 3) return { ok: false, motif: 'un contour exige au moins 3 sommets' };
  if (!e.anneau.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return { ok: false, motif: 'coordonnées invalides' };
  const wkt = anneauVersWkt(e.anneau);
  try {
    // 🔴 VALIDE la géométrie AVANT d'insérer (miroir EXACT de retoucherEmprise) : un contour AUTO-INTERSECTANT (des bords qui se
    //   croisent) passe le CHECK de TYPE (geometrytype ∈ POLYGON/MULTIPOLYGON) mais reste ST_IsValid=false. Sans ce garde, la ligne
    //   était persistée puis toute opération PostGIS AVAL sur l'union des emprises (ST_Union dans polygonesRecouvertsParEmprise, le
    //   débordement…) levait une TopologyException, masquée par le catch-all de la route en 503 « action indisponible » — écran
    //   contradictoire (emprise en base, « Aucune emprise » affiché). On refuse net, avec le message clair et actionnable.
    const { rows: v } = await query<{ ok: boolean | null }>(
      `SELECT ST_IsValid(ST_Force2D(ST_GeomFromText($1, 2154))) AS ok`, [wkt]);
    if (!v[0]?.ok) return { ok: false, motif: 'contour invalide : des bords se croisent — ajustez les sommets avant d’enregistrer' };
    const { rows } = await query<{ id: number }>(
      `INSERT INTO permis_emprise_reconstruite (dossier_id, corps_id, libelle, geom, surface_m2, piece_id, page, calage, residu_m, cree_par)
       VALUES ($1, $9, $2, ST_GeomFromText($3, 2154), ST_Area(ST_GeomFromText($3, 2154)), $4, $5, $6::jsonb, $7, $8)
       RETURNING id::int AS id`,
      [e.dossierId, e.libelle.trim(), wkt, e.pieceId, e.page, JSON.stringify(e.calage), e.residuM, e.creePar, e.corpsId],
    );
    await annulerValidationEmpriseCorps(e.corpsId); // (ré)enregistrer une emprise fait RETOMBER la validation du bâtiment
    return { ok: true, id: rows[0].id };
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des emprises absente (migration 149 non appliquée)', tableAbsente: true };
    throw err;
  }
}

/**
 * Mesure le DÉBORDEMENT d'une emprise (anneau Lambert-93) hors de la parcelle rattachée (`permis_empreinte`) — REPÈRE indicatif.
 * 🔴 L'anneau est déjà la géométrie RECALCULÉE CÔTÉ SERVEUR (similitude autoritative dans la route), jamais des coordonnées client.
 * `ST_Force2D` conservé sur les deux géométries (invariant : jamais retiré des opérations de distance/aire). Aucun arrondi (PostGIS
 * rend les valeurs brutes ; `deriverDebordement` ne fait que des rapports). Dégradations SÛRES, jamais une valeur inventée :
 *  · contour < 3 sommets ou coordonnées non finies → `null` ;
 *  · aucune parcelle rattachée (0 ligne / union NULL) → `parcelleRattachee:false` (part hors indisponible) ;
 *  · table absente ou exception topologique (contour en cours d'auto-intersection) → `null`.
 */
export async function mesurerDebordement(dossierId: number, anneau: PointLambert[]): Promise<Debordement | null> {
  if (anneau.length < 3 || !anneau.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  return mesurerDebordementWkt(dossierId, anneauVersWkt(anneau));
}

/** Débordement d'une géométrie WKT (Lambert-93) déjà bâtie CÔTÉ SERVEUR (tracé recalculé OU union IGN adoptée). Voir mesurerDebordement. */
async function mesurerDebordementWkt(dossierId: number, wkt: string): Promise<Debordement | null> {
  try {
    const { rows } = await query<{ aire: number; a_parcelle: boolean; aire_hors: number | null; perim_hors: number | null }>(
      `WITH par AS (SELECT ST_Force2D(ST_Union(geom)) AS g FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL),
            emp AS (SELECT ST_Force2D(ST_GeomFromText($2, 2154)) AS g)
       SELECT ST_Area(emp.g)                                                            AS aire,
              (par.g IS NOT NULL)                                                        AS a_parcelle,
              CASE WHEN par.g IS NULL THEN NULL ELSE ST_Area(ST_Difference(emp.g, par.g))      END AS aire_hors,
              CASE WHEN par.g IS NULL THEN NULL ELSE ST_Perimeter(ST_Difference(emp.g, par.g)) END AS perim_hors
         FROM emp CROSS JOIN par`,
      [dossierId, wkt]);
    const r = rows[0];
    if (!r) return null;
    return deriverDebordement(Number(r.aire), r.a_parcelle === true, r.aire_hors !== null ? Number(r.aire_hors) : null, r.perim_hors !== null ? Number(r.perim_hors) : null);
  } catch (err) {
    if (estTableAbsente(err)) return null;
    console.error('[permis/emprise] mesurerDebordement indisponible', { dossierId, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export type ResultatRetoucheEmprise =
  | { ok: true; emprises: EmpriseReconstruite[]; debordement: Debordement | null; provenance: ProvenanceEmprise }
  | { ok: false; motif: string; tableAbsente?: boolean };

/**
 * PROJ-3s — RETOUCHE d'une emprise EXISTANTE : remplace sa géométrie par le contour Lambert-93 fourni (positions de sommets), et
 * met à jour sa PROVENANCE dans le MÊME UPDATE (atomique) : 'ign_adopte' → 'ign_retouche' ; 'trace_manuel'/'ign_retouche' inchangées.
 * 🔴 Le serveur RECALCULE et VALIDE la géométrie (ST_IsValid → refus d'une auto-intersection, message clair) et l'aire (ST_Area) ;
 * ST_Force2D conservé. Ne change NI le bâtiment de rattachement, NI la provenance-vers-mesure (garde moteur : reconstitution reste
 * true). Renvoie les emprises à jour + le débordement RECALCULÉ (l'indicateur qui dit si la correction a servi).
 */
export async function retoucherEmprise(dossierId: number, id: number, anneau: PointLambert[], par: string | null): Promise<ResultatRetoucheEmprise> {
  if (!Number.isInteger(id) || !Number.isInteger(dossierId)) return { ok: false, motif: 'requête invalide' };
  if (anneau.length < 3) return { ok: false, motif: 'un contour exige au moins 3 sommets' };
  if (!anneau.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return { ok: false, motif: 'coordonnées invalides' };
  const wkt = anneauVersWkt(anneau);
  try {
    const { rows: v } = await query<{ ok: boolean | null }>(
      `SELECT ST_IsValid(ST_Force2D(ST_GeomFromText($1, 2154))) AS ok`, [wkt]);
    if (!v[0]?.ok) return { ok: false, motif: 'contour invalide : des bords se croisent — ajustez les sommets avant de valider' };
    const { rows: upd } = await query<{ provenance: ProvenanceEmprise }>(
      `UPDATE permis_emprise_reconstruite
          SET geom = ST_Force2D(ST_GeomFromText($3, 2154)),
              surface_m2 = ST_Area(ST_Force2D(ST_GeomFromText($3, 2154))),
              provenance = CASE WHEN provenance = 'ign_adopte' THEN 'ign_retouche' ELSE provenance END,
              cree_par = COALESCE($4, cree_par)
        WHERE id = $1 AND dossier_id = $2
        RETURNING provenance`,
      [id, dossierId, wkt, par]);
    if (upd.length === 0) return { ok: false, motif: 'emprise introuvable' };
    await annulerValidationParEmprise(id); // retoucher la géométrie fait RETOMBER la validation (même id, mais l'emprise a changé)
    const emprises = await listerEmprises(dossierId);
    const debordement = await mesurerDebordementWkt(dossierId, wkt);
    return { ok: true, emprises, debordement, provenance: upd[0].provenance };
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des emprises absente (migration 149/153 non appliquée)', tableAbsente: true };
    throw err;
  }
}

export type ResultatAjustement =
  | { ok: true; emprises: EmpriseReconstruite[] }
  | { ok: false; motif: string; colonneAbsente?: boolean; tableAbsente?: boolean };
const MOTIF_COLONNE_211 = 'ajustement indisponible : mise à jour de la base requise (migration 211)';

/**
 * PROJ-3t (lot 3b) — ENREGISTRE le DELTA d'ajustement d'UNE emprise (geste utilisateur). Le client envoie {tx, ty, rotDeg, echelle, centre} ;
 * le SERVEUR estampille pose_le (now()) + pose_par (jsonb `||`, écrasent ce que le client aurait mis). 🔴 `geom` d'origine JAMAIS touché.
 * 🔴 AUCUN recalcul d'auto-statut voisin (règle e du lot 3a) : cet UPDATE ne touche QUE la colonne ajustement. RÉSILIENT (colonne/table absente).
 */
export async function enregistrerAjustement(dossierId: number, id: number, ajustement: Ajustement, par: string | null): Promise<ResultatAjustement> {
  if (!Number.isInteger(id) || !Number.isInteger(dossierId)) return { ok: false, motif: 'requête invalide' };
  if (!ajustementValide(ajustement)) return { ok: false, motif: 'ajustement invalide (nombres finis, échelle > 0, centre requis)' };
  const noyau = { tx: ajustement.tx, ty: ajustement.ty, rotDeg: ajustement.rotDeg, echelle: ajustement.echelle, centre: ajustement.centre }; // on ne persiste QUE la transformation ; pose_le/pose_par posés par le serveur
  try {
    const { rowCount } = await query(
      `UPDATE permis_emprise_reconstruite
          SET ajustement = $3::jsonb || jsonb_build_object('pose_le', now(), 'pose_par', $4::text)
        WHERE id = $1 AND dossier_id = $2`,
      [id, dossierId, JSON.stringify(noyau), par]);
    if ((rowCount ?? 0) === 0) return { ok: false, motif: 'emprise introuvable' };
    return { ok: true, emprises: await listerEmprises(dossierId) };
  } catch (e) {
    if (estColonneAbsente(e)) return { ok: false, motif: MOTIF_COLONNE_211, colonneAbsente: true };
    if (estTableAbsente(e)) return { ok: false, motif: 'table des emprises absente', tableAbsente: true };
    throw e;
  }
}

/** PROJ-3t (lot 3b) — RETOUR AU TRACÉ D'ORIGINE d'UNE emprise : remet ajustement à NULL (le delta est jeté, la géométrie d'origine restituée EXACTEMENT). RÉSILIENT. */
export async function supprimerAjustement(dossierId: number, id: number): Promise<ResultatAjustement> {
  if (!Number.isInteger(id) || !Number.isInteger(dossierId)) return { ok: false, motif: 'requête invalide' };
  try {
    await query(`UPDATE permis_emprise_reconstruite SET ajustement = NULL WHERE id = $1 AND dossier_id = $2`, [id, dossierId]);
    return { ok: true, emprises: await listerEmprises(dossierId) };
  } catch (e) {
    if (estColonneAbsente(e)) return { ok: false, motif: MOTIF_COLONNE_211, colonneAbsente: true };
    if (estTableAbsente(e)) return { ok: false, motif: 'table des emprises absente', tableAbsente: true };
    throw e;
  }
}

/** Ligne brute d'emprise (les deux variantes de SELECT — avec ou sans la colonne `ajustement` — partagent cette forme, `ajustement` en option). */
type LigneEmprise = {
  id: number; corps_id: number | null; libelle: string; gj: { type: string; coordinates: number[][][] | number[][][][] } | null; surface_m2: number | null;
  piece_id: number | null; page: number | null; calage: CalageTrace | null; residu_m: number | null; provenance: ProvenanceEmprise | null; cree_le: Date | null; ajustement?: Ajustement | null;
};

/**
 * Liste les emprises reconstituées d'un dossier (contour EPSG:2154 → anneau). `[]` si la table n'existe pas encore.
 * 🔴 PROJ-3t (lot 3a) — le DELTA d'ajustement (colonne `ajustement`, jsonb) est appliqué ICI, au RENDU, PAR-DESSUS le tracé d'origine : c'est le
 *   POINT UNIQUE de consommation de la géométrie (schéma, lecture seule, Archives passent tous par ici) → jamais d'emprise ajustée à côté d'une
 *   non ajustée. `geom` en base reste le tracé d'ORIGINE (jamais réécrit). NULL = aucun ajustement → anneaux/surface d'origine, BYTE-IDENTIQUES à
 *   avant le lot. ORDRE : le delta s'applique APRÈS les retouches par sommet (retoucherEmprise réécrit `geom` ; le delta ride au-dessus, à la lecture).
 *   RÉSILIENT : colonne absente (42703, migration 211 non appliquée) → relecture sans `ajustement` (tous NULL) → comportement d'avant.
 */
export async function listerEmprises(dossierId: number): Promise<EmpriseReconstruite[]> {
  const base = `id::int AS id, corps_id::int AS corps_id, libelle, ST_AsGeoJSON(geom)::json AS gj, surface_m2, piece_id::int AS piece_id, page, calage, residu_m, provenance, cree_le`;
  try {
    let rows: LigneEmprise[];
    try { rows = (await query<LigneEmprise>(`SELECT ${base}, ajustement FROM permis_emprise_reconstruite WHERE dossier_id = $1 ORDER BY id`, [dossierId])).rows; }
    catch (e) { if (!estColonneAbsente(e)) throw e; rows = (await query<LigneEmprise>(`SELECT ${base} FROM permis_emprise_reconstruite WHERE dossier_id = $1 ORDER BY id`, [dossierId])).rows; } // 211 non appliquée
    return rows.map((r) => {
      // PROJ-3q — Polygon → un anneau extérieur ; MultiPolygon → un anneau extérieur PAR partie (groupe adopté à contact par sommet).
      const anneauxOrigine: PointLambert[][] = r.gj?.type === 'MultiPolygon'
        ? (r.gj.coordinates as number[][][][]).map((poly) => (poly[0] ?? []).map(([x, y]) => ({ x, y })))
        : r.gj?.type === 'Polygon'
          ? [((r.gj.coordinates as number[][][])[0] ?? []).map(([x, y]) => ({ x, y }))]
          : [];
      // DELTA appliqué au rendu (défensif : un delta malformé est ignoré = traité comme NULL). Surface RE-CALCULÉE si ajusté (l'échelle change l'aire) ;
      //   sans ajustement, on garde la valeur base (ST_Area sur l'origine), byte-identique à avant.
      const ajustement: Ajustement | null = ajustementValide(r.ajustement) ? (r.ajustement as Ajustement) : null;
      const anneaux = ajustement ? anneauxOrigine.map((a) => appliquerAjustement(a, ajustement)) : anneauxOrigine;
      const surfaceM2 = ajustement ? anneaux.reduce((s, a) => s + aireM2(a), 0) : (r.surface_m2 !== null ? Number(r.surface_m2) : null);
      return {
        id: r.id, dossierId, corpsId: r.corps_id, libelle: r.libelle,
        anneau: anneaux[0] ?? [], anneaux,
        surfaceM2,
        pieceId: r.piece_id, page: r.page, calage: r.calage,
        residuM: r.residu_m !== null ? Number(r.residu_m) : null,
        provenance: r.provenance ?? 'trace_manuel',
        ajustement,
        creeLe: r.cree_le ? r.cree_le.toISOString() : null,
      };
    });
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

export interface EtatEmpriseBatiment { surfaceM2: number | null; creeLe: string | null; nbEmprises: number; validee: boolean; valideeLe: string | null; valideePar: string | null; valideeParNom: string | null }
export interface EtatEmprisesPermis { projectionValidee: boolean; parBatiment: Record<number, EtatEmpriseBatiment>; ignoreCorps: number[] }

/** Projection du DOSSIER validée ? = existence d'une ligne `permis_projection` (validation de NIVEAU DOSSIER, jamais par bâtiment).
 *  LECTURE SEULE, résilient (table absente → false). SOURCE UNIQUE consommée par la capsule, le bandeau, la pastille et l'en-tête. */
export async function lireProjectionValidee(dossierId: number): Promise<boolean> {
  return query<{ ok: boolean }>(`SELECT EXISTS(SELECT 1 FROM permis_projection WHERE dossier_id = $1) AS ok`, [dossierId])
    .then((r) => r.rows[0]?.ok === true).catch((e) => { if (estTableAbsente(e)) return false; throw e; });
}

/**
 * ÉTAT D'EMPRISE PAR BÂTIMENT (pour la capsule du cartouche « Les bâtiments ») — LECTURE SEULE, lu depuis la BASE (jamais depuis
 * l'état local du composant de tracé). Pour chaque bâtiment (corps) portant ≥ 1 emprise reconstituée : surface TOTALE (m²) et date
 * de la PLUS RÉCENTE ; plus `ignoreCorps` (bâtiments à projection ignorée) et `projectionValidee` (permis_projection). 🔴 « emprise
 * enregistrée » et « projection validée » sont DEUX états distincts. Résilient : chaque source absente retombe sur son défaut.
 */
export async function lireEtatEmprisesPermis(dossierId: number): Promise<EtatEmprisesPermis> {
  const projectionValidee = await lireProjectionValidee(dossierId); // legacy niveau permis
  const parBatiment: Record<number, EtatEmpriseBatiment> = {};
  // Agrégat PAR BÂTIMENT (tous les bâtiments déclarés) : nb d'emprises + surface/date + VALIDATION par bâtiment (migration 206).
  //   validé ⟺ emprise_validee_id pointe une emprise ENCORE présente du bâtiment. RÉSILIENT : colonnes absentes (42703) → relecture
  //   sans validation (validee=false) → l'écran reste utilisable, la validation par bâtiment attend l'application de la migration.
  // DEMANDE 2 (LOT COMPLET) — l'auteur de la validation est RÉSOLU EN NOM à l'affichage (comme la trace d'altitude), jamais l'identifiant
  //   brut « 2 ». Lecture SEULE (aucune réécriture des valeurs en base) : sous-requête sur `admin_utilisateur` (prénom + nom).
  const avecValidation = `SELECT cb.id AS corps_id, count(e.id)::int AS n, SUM(e.surface_m2) AS surface, MAX(e.cree_le)::text AS cree_le,
              cb.emprise_validee_le::text AS validee_le, cb.emprise_validee_par AS validee_par,
              (SELECT nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '') FROM admin_utilisateur u WHERE u.id::text = cb.emprise_validee_par LIMIT 1) AS validee_par_nom,
              (cb.emprise_validee_id IS NOT NULL AND bool_or(e.id = cb.emprise_validee_id)) AS validee
         FROM permis_corps_batiment cb
         LEFT JOIN permis_emprise_reconstruite e ON e.corps_id = cb.id
        WHERE cb.dossier_id = $1
        GROUP BY cb.id, cb.emprise_validee_le, cb.emprise_validee_par, cb.emprise_validee_id`;
  const sansValidation = `SELECT cb.id AS corps_id, count(e.id)::int AS n, SUM(e.surface_m2) AS surface, MAX(e.cree_le)::text AS cree_le,
              NULL::text AS validee_le, NULL::text AS validee_par, NULL::text AS validee_par_nom, false AS validee
         FROM permis_corps_batiment cb
         LEFT JOIN permis_emprise_reconstruite e ON e.corps_id = cb.id
        WHERE cb.dossier_id = $1 GROUP BY cb.id`;
  try {
    let rows: { corps_id: number; n: number; surface: string | number | null; cree_le: string | null; validee_le: string | null; validee_par: string | null; validee_par_nom: string | null; validee: boolean }[];
    try { rows = (await query<typeof rows[number]>(avecValidation, [dossierId])).rows; }
    catch (e) { if (!estColonneAbsente(e)) throw e; rows = (await query<typeof rows[number]>(sansValidation, [dossierId])).rows; } // 206 non appliquée → sans validation
    for (const r of rows) {
      const nbEmprises = Number(r.n);
      // legacy : un dossier déjà validé (permis_projection) → tout bâtiment COUVERT est validé (OR avec le signal per-bâtiment).
      const validee = r.validee === true || (projectionValidee && nbEmprises > 0);
      parBatiment[r.corps_id] = { surfaceM2: r.surface !== null ? Number(r.surface) : null, creeLe: r.cree_le, nbEmprises, validee, valideeLe: r.validee_le, valideePar: r.validee_par, valideeParNom: r.validee_par_nom ?? null };
    }
  } catch (e) { if (!estTableAbsente(e)) throw e; }
  const ignoreCorps = await query<{ corps_id: number }>(
    `SELECT corps_id::int AS corps_id FROM permis_projection_ignoree WHERE dossier_id = $1`, [dossierId],
  ).then((r) => r.rows.map((x) => x.corps_id)).catch((e) => { if (estTableAbsente(e)) return [] as number[]; throw e; });
  return { projectionValidee, parBatiment, ignoreCorps };
}

/** VALIDATION par bâtiment (corpsId → validée ?), pour la pastille et le bandeau du bloc de tracé. Réutilise lireEtatEmprisesPermis (résilient). */
export async function lireValideeParCorps(dossierId: number): Promise<Record<number, boolean>> {
  const etat = await lireEtatEmprisesPermis(dossierId);
  const out: Record<number, boolean> = {};
  for (const [id, b] of Object.entries(etat.parBatiment)) out[Number(id)] = b.validee;
  return out;
}

/**
 * ③ COMPLÉMENT — ALTITUDE de sommet VALIDÉE par bâtiment (corpsId → altitude_sommet_ngf_confirme_le renseigné). Sert, avec
 * `lireValideeParCorps` (emprise), à décider l'en-tête « Projection(s) validée(s) » (tous les bâtiments alt ET emprise validées).
 * RÉSILIENT : en cas d'erreur, map vide (l'en-tête reste « non validée » plutôt que de casser l'écran).
 */
export async function lireAltitudeValideeParCorps(dossierId: number): Promise<Record<number, boolean>> {
  try {
    const { rows } = await query<{ corps_id: number; validee: boolean }>(
      `SELECT id AS corps_id, (altitude_sommet_ngf_confirme_le IS NOT NULL) AS validee FROM permis_corps_batiment WHERE dossier_id = $1`, [dossierId]);
    const out: Record<number, boolean> = {};
    for (const r of rows) out[Number(r.corps_id)] = r.validee === true;
    return out;
  } catch { return {}; }
}

export type ResultatValidationEmprise = { ok: true } | { ok: false; motif: string; migrationAbsente?: boolean };
const MOTIF_MIGRATION_206 = 'validation par bâtiment indisponible : mise à jour de la base requise (migration 206)';

/**
 * VALIDE l'emprise d'UN bâtiment — DÉCISION HUMAINE, calque de validerSommetCorps (altitude). Pointe `emprise_validee_id` sur
 * l'emprise COURANTE (la plus récente) du bâtiment → une emprise retracée/retouchée après coup ne restera pas validée. Refus clair si
 * aucune emprise à valider. RÉSILIENT : colonnes absentes (42703, migration 206 non appliquée) → refus explicite, jamais un crash.
 */
export async function validerEmpriseBatiment(corpsId: number, majPar: string): Promise<ResultatValidationEmprise> {
  try {
    const res = await query(
      `UPDATE permis_corps_batiment
          SET emprise_validee_id = (SELECT id FROM permis_emprise_reconstruite WHERE corps_id = $1 ORDER BY id DESC LIMIT 1),
              emprise_validee_le = now(), emprise_validee_par = $2, maj_le = now(), maj_par = $2
        WHERE id = $1 AND EXISTS (SELECT 1 FROM permis_emprise_reconstruite WHERE corps_id = $1)`, [corpsId, majPar]);
    if ((res.rowCount ?? 0) === 0) return { ok: false, motif: 'aucune emprise enregistrée à valider pour ce bâtiment — tracez d’abord l’emprise' };
    return { ok: true };
  } catch (e) { if (estColonneAbsente(e)) return { ok: false, motif: MOTIF_MIGRATION_206, migrationAbsente: true }; throw e; }
}

/** RETIRE la validation d'un bâtiment (réversible, comme le retour arrière de l'altitude). RÉSILIENT (colonnes absentes → refus clair). */
export async function devaliderEmpriseBatiment(corpsId: number, majPar: string): Promise<ResultatValidationEmprise> {
  try {
    await query(`UPDATE permis_corps_batiment SET emprise_validee_id = NULL, emprise_validee_le = NULL, emprise_validee_par = NULL, maj_le = now(), maj_par = $2 WHERE id = $1`, [corpsId, majPar]);
    return { ok: true };
  } catch (e) { if (estColonneAbsente(e)) return { ok: false, motif: MOTIF_MIGRATION_206, migrationAbsente: true }; throw e; }
}

/** Une MUTATION d'emprise (enregistrement / adoption) fait RETOMBER la validation du bâtiment (jamais un « validé » sur une emprise qui
 *  a changé). Best-effort, résilient (colonnes/table absentes → no-op). La SUPPRESSION est déjà gérée par la FK ON DELETE SET NULL. */
async function annulerValidationEmpriseCorps(corpsId: number | null): Promise<void> {
  if (corpsId === null) return;
  try { await query(`UPDATE permis_corps_batiment SET emprise_validee_id = NULL, emprise_validee_le = NULL, emprise_validee_par = NULL WHERE id = $1`, [corpsId]); }
  catch (e) { if (!estColonneAbsente(e) && !estTableAbsente(e)) throw e; }
}
/** RETOUCHE (UPDATE même id, géométrie changée) : la FK ne se déclenche pas → on efface explicitement toute validation pointant cette emprise. */
async function annulerValidationParEmprise(empriseId: number): Promise<void> {
  try { await query(`UPDATE permis_corps_batiment SET emprise_validee_id = NULL, emprise_validee_le = NULL, emprise_validee_par = NULL WHERE emprise_validee_id = $1`, [empriseId]); }
  catch (e) { if (!estColonneAbsente(e) && !estTableAbsente(e)) throw e; }
}

/** Supprime UNE emprise (scopée au dossier — jamais une suppression aveugle par id seul). Renvoie le nombre de lignes retirées. */
export async function supprimerEmprise(id: number, dossierId: number): Promise<number> {
  try {
    const { rowCount } = await query(`DELETE FROM permis_emprise_reconstruite WHERE id = $1 AND dossier_id = $2`, [id, dossierId]);
    return rowCount ?? 0;
  } catch (err) {
    if (estTableAbsente(err)) return 0;
    throw err;
  }
}

/** Aide d'affichage (pure) : surface application (aireM2) d'une emprise lue, pour recouper la valeur base sans la remplacer. */
export function surfaceApplicative(e: EmpriseReconstruite): number {
  return aireM2(e.anneau);
}

/**
 * CONTEXTE d'un dossier pour le tracé : empreinte de parcelle (Lambert, pour le schéma + désignation des points de calage)
 * et repères de VRAISEMBLANCE (terrain / plancher / étages) lus en base. LECTURE SEULE, chaque source ISOLÉE (résiliente à
 * l'ordre d'application des migrations) : une source absente vaut `null`/`[]`, jamais une exception qui casse l'écran.
 */
export interface BatimentContexte { corpsId: number; nbEtages: number | null; empriseM2: number | null }
export interface ContexteEmprise {
  empreinteAnneaux: PointLambert[][]; // parcelle en Lambert-93 (anneaux extérieurs)
  surfaceTerrainM2: number | null;
  surfacePlancherM2: number | null;   // au niveau du PERMIS ENTIER (permis_caracteristique)
  batiments: BatimentContexte[];      // chaque bâtiment du permis : ses niveaux + son emprise reconstituée (ou null) — pour la vraisemblance PAR bâtiment
}
export async function lireContexteEmprise(dossierId: number): Promise<ContexteEmprise> {
  // Chaque source ISOLÉE (résiliente à l'ordre des migrations). Le NOMBRE D'ÉTAGES vit PAR BÂTIMENT (jamais un max du permis) ;
  //   l'emprise de chaque bâtiment vient de `listerEmprises` (déjà résilient). On les recoupe par corpsId.
  const [empreinte, surfacePlancherM2, niveaux, emprises] = await Promise.all([
    lireEmpreinteParcelle(dossierId),
    lireSurfacePlancher(dossierId),
    lireBatimentsNiveaux(dossierId),
    listerEmprises(dossierId),
  ]);
  const aireParCorps = new Map<number, number>();
  for (const e of emprises) if (e.corpsId !== null && e.surfaceM2 !== null) aireParCorps.set(e.corpsId, e.surfaceM2);
  const batiments: BatimentContexte[] = niveaux.map((b) => ({ corpsId: b.corpsId, nbEtages: b.nbEtages, empriseM2: aireParCorps.get(b.corpsId) ?? null }));
  return { empreinteAnneaux: empreinte.anneaux, surfaceTerrainM2: empreinte.surfaceM2, surfacePlancherM2, batiments };
}

/**
 * PROJ-3h — polygones BD TOPO (couche VIVANTE `batiment`) qui intersectent l'empreinte du permis, avec leur ÉTAT IGN
 * (`etat_de_l_objet` : En service / En construction / En projet / En ruine). LECTURE SEULE, pour un pur AFFICHAGE (options de
 * visibilité du schéma de projection). Géométrie en Lambert-93 (comme la parcelle), `ST_Force2D` conservé (jamais retiré des
 * opérations géométriques). 🔴 Ce sont des DONNÉES IGN, jamais une reconstitution : aucune écriture, aucun couplage moteur. `[]`
 * si `permis_empreinte`/`batiment` absentes (résilient).
 */
// PROJ-MIT — un polygone porte sa QUALIFICATION d'affichage (aire d'intersection ; « sur la parcelle » vs « mitoyen ») ET, RÈGLE ARNO,
//   son APPARTENANCE AU PERMIS (`appartientPermis`) : le bâtiment est-il MAJORITAIREMENT sur une parcelle DU PERMIS (parcelle dominante) ?
//   Champs FACULTATIFS (rétro-compatibles avec les fixtures existantes). ⚠️ Le critère de SÉLECTION (ST_Intersects) est INCHANGÉ : on
//   récupère les MÊMES polygones (les voisins restent AFFICHÉS en contexte) ; `appartientPermis` ne fait que décider REPÈRE + AFFECTATION.
export interface PolygoneBdTopo { cleabs: string | null; anneau: PointLambert[]; etat: string | null; aireDansEmpreinteM2?: number; qualification?: QualificationPolygone; appartientPermis?: boolean }
export async function lirePolygonesEmpreinte(dossierId: number): Promise<PolygoneBdTopo[]> {
  try {
    // ORDER BY spatial STABLE (haut→bas, gauche→droite, cleabs) : fixe les repères A/B/C… de façon déterministe (comme le Rattachement).
    // PROJ-MIT : aire réelle d'intersection en SELECT ; RÈGLE ARNO : pour chaque bâtiment, la LISTE de ses intersections parcellaires
    //   (aire + « la parcelle fait-elle partie du permis » = majoritairement dans l'empreinte, ratio ≥ 0,5) → la décision d'appartenance est
    //   tranchée en JS par la fonction PURE `batimentAppartientPermis` (parcelle DOMINANTE du permis + bâtiment majoritairement dessus). Les
    //   sous-requêtes `par.geom && b.geom` tiennent l'index GiST (aucun KNN). Aire par BÂTIMENT (partagée par tous les anneaux d'un MultiPolygon).
    const { rows } = await query<{ cleabs: string | null; gj: { type: string; coordinates: number[][][] | number[][][][] } | null; etat: string | null; aire: number | string | null; aire_bat: number | string | null; parcelles: { aireInterM2: number | string; estParcellePermis: boolean }[] | null }>(
      `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT b.cleabs, ST_AsGeoJSON(ST_Force2D(b.geom))::json AS gj, b.etat_de_l_objet AS etat,
              ST_Area(ST_Intersection(ST_Force2D(b.geom), emp.geom)) AS aire,
              ST_Area(ST_Force2D(b.geom)) AS aire_bat,
              (SELECT json_agg(json_build_object(
                 'aireInterM2', ST_Area(ST_Intersection(ST_Force2D(par.geom), ST_Force2D(b.geom))),
                 'estParcellePermis', (ST_Area(ST_Intersection(ST_Force2D(par.geom), emp.geom)) / NULLIF(ST_Area(ST_Force2D(par.geom)), 0)) >= 0.5))
                 FROM parcelle par WHERE par.geom && b.geom AND ST_Intersects(par.geom, b.geom)) AS parcelles
         FROM batiment b, emp
        WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)
        ORDER BY ST_YMax(b.geom) DESC, ST_XMin(b.geom), b.cleabs`, [dossierId]);
    const { seuilM2 } = await lireSeuilMitoyenAireM2(); // seuil lu en config (repli sûr) — jamais en dur
    const out: PolygoneBdTopo[] = [];
    for (const r of rows) {
      if (!r.gj) continue;
      const aireDansEmpreinteM2 = Number.isFinite(Number(r.aire)) ? Number(r.aire) : 0;
      const qualification = qualifierMitoyennete(aireDansEmpreinteM2, seuilM2);
      const intersections: IntersectionParcelleBatiment[] = (r.parcelles ?? []).map((p) => ({ aireInterM2: Number(p.aireInterM2), estParcellePermis: p.estParcellePermis === true }));
      const appartientPermis = batimentAppartientPermis(Number(r.aire_bat ?? 0), intersections); // RÈGLE ARNO — parcelle dominante du permis
      const anneaux: number[][][] = r.gj.type === 'Polygon'
        ? [(r.gj.coordinates as number[][][])[0]].filter(Boolean)
        : r.gj.type === 'MultiPolygon'
          ? (r.gj.coordinates as number[][][][]).map((poly) => poly[0]).filter(Boolean)
          : [];
      for (const a of anneaux) out.push({ cleabs: r.cleabs ?? null, anneau: a.map(([x, y]) => ({ x, y })), etat: r.etat ?? null, aireDansEmpreinteM2, qualification, appartientPermis });
    }
    return out;
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

// PROJ-CTX — un objet de CONTEXTE (parcelle voisine ou bâti voisin) dans le rayon autour de l'empreinte. UNIQUEMENT pour l'affichage
//   (3e registre) : JAMAIS candidat à l'affectation ni à l'empreinte. `genre` distingue le tracé (contour de parcelle vs aplat de bâti).
export interface ObjetContexte { genre: 'parcelle' | 'batiment'; anneau: PointLambert[] }

/**
 * PROJ-CTX — parcelles VOISINES + leur BÂTI dans un RAYON autour de l'empreinte du permis (lecture seule). `rayonM` est passé par
 * l'appelant (lu en config, lireRayonContexteM) — jamais en dur. ANTI-DOUBLON (exigence d) : on EXCLUT les parcelles du permis
 * (intersection réelle avec l'empreinte ≥ 1 m² → c'est la parcelle focus) et le bâti DÉJÀ affiché (celui qui intersecte l'empreinte =
 * « sur la parcelle » / « mitoyen », déjà rendu). ST_DWithin (index GiST — vérifié EXPLAIN), JAMAIS un KNN. Résilient : table absente → [].
 */
export async function lireVoisinageContexte(dossierId: number, rayonM: number): Promise<ObjetContexte[]> {
  if (!(rayonM > 0)) return []; // rayon 0 (ou invalide) = aucun contexte
  try {
    const { rows } = await query<{ genre: 'parcelle' | 'batiment'; gj: { type: string; coordinates: number[][][] | number[][][][] } | null }>(
      `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT genre, ST_AsGeoJSON(geom)::json AS gj FROM (
         -- parcelles VOISINES dans le rayon, HORS parcelle(s) du permis (intersection réelle avec l'empreinte < 1 m² = simple mitoyenneté)
         SELECT 'parcelle'::text AS genre, ST_Force2D(par.geom) AS geom
           FROM parcelle par, emp
          WHERE ST_DWithin(par.geom, emp.geom, $2)
            AND ST_Area(ST_Intersection(ST_Force2D(par.geom), emp.geom)) < 1
         UNION ALL
         -- bâti VOISIN dans le rayon, HORS bâti déjà affiché (celui qui intersecte l'empreinte : sur la parcelle / mitoyen)
         SELECT 'batiment'::text, ST_Force2D(b.geom)
           FROM batiment b, emp
          WHERE ST_DWithin(b.geom, emp.geom, $2)
            AND NOT (b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom))
       ) q`, [dossierId, rayonM]);
    const out: ObjetContexte[] = [];
    for (const r of rows) {
      if (!r.gj) continue;
      const anneaux: number[][][] = r.gj.type === 'Polygon'
        ? [(r.gj.coordinates as number[][][])[0]].filter(Boolean)
        : r.gj.type === 'MultiPolygon'
          ? (r.gj.coordinates as number[][][][]).map((poly) => poly[0]).filter(Boolean)
          : [];
      for (const a of anneaux) out.push({ genre: r.genre, anneau: a.map(([x, y]) => ({ x, y })) });
    }
    return out;
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

// PROJ-3i — SÉLECTION des polygones « en projet » (permis_polygone_projet_ecarte, migration 152). Par DÉFAUT tout est RETENU ;
//   une ligne = un cleabs ÉCARTÉ (décoché) par Arno, tracé (qui/quand). 🔴 AFFICHAGE/décision seulement : n'alimente NI verdict,
//   NI altitude, NI rattachement ; aucune écriture moteur. Résilient : table absente (152 non appliquée) → liste vide / refus clair.
export type ResultatEcartPolygone = { ok: true } | { ok: false; motif: string; tableAbsente?: boolean };

/** cleabs des polygones « en projet » ÉCARTÉS d'un dossier (décochés). `[]` si la table n'existe pas encore. */
export async function listerPolygonesProjetEcartes(dossierId: number): Promise<string[]> {
  try {
    const { rows } = await query<{ cleabs: string }>(`SELECT cleabs FROM permis_polygone_projet_ecarte WHERE dossier_id = $1`, [dossierId]);
    return rows.map((r) => r.cleabs);
  } catch (err) { if (estTableAbsente(err)) return []; throw err; }
}

/** ÉCARTER un polygone « en projet » (décoché) : upsert idempotent, tracé (par). */
export async function ecarterPolygoneProjet(dossierId: number, cleabs: string, par: string | null): Promise<ResultatEcartPolygone> {
  if (!cleabs || cleabs.trim() === '') return { ok: false, motif: 'polygone invalide' };
  try {
    await query(`INSERT INTO permis_polygone_projet_ecarte (dossier_id, cleabs, ecarte_par) VALUES ($1, $2, $3)
                 ON CONFLICT (dossier_id, cleabs) DO NOTHING`, [dossierId, cleabs, par]);
    return { ok: true };
  } catch (err) { if (estTableAbsente(err)) return { ok: false, motif: 'sélection indisponible (migration 152 non appliquée)', tableAbsente: true }; throw err; }
}

/** RÉTABLIR un polygone « en projet » (re-coché) : supprime son écartement (réversible). */
export async function retablirPolygoneProjet(dossierId: number, cleabs: string): Promise<ResultatEcartPolygone> {
  if (!cleabs || cleabs.trim() === '') return { ok: false, motif: 'polygone invalide' };
  try {
    await query(`DELETE FROM permis_polygone_projet_ecarte WHERE dossier_id = $1 AND cleabs = $2`, [dossierId, cleabs]);
    return { ok: true };
  } catch (err) { if (estTableAbsente(err)) return { ok: false, motif: 'sélection indisponible (migration 152 non appliquée)', tableAbsente: true }; throw err; }
}

// ─── PROJ-3q — ADOPTION des polygones « en projet » IGN comme emprise (aucun tracé manuel) ────────────────────────────────────
// Les polygones cochés (« En projet », ∩ empreinte, NON écartés) sont GROUPÉS en composantes connexes CÔTÉ SERVEUR (adoptionEmprise,
//   pur/testé) à partir des géométries lues en base ; l'union de chaque groupe est calculée par PostGIS (autoritaire, Lambert-93,
//   ST_Force2D conservé). Un groupe = une emprise (provenance 'ign_adopte'). Aucune géométrie n'est reçue du client.

export interface PolygoneCoche { cleabs: string; anneau: PointLambert[]; surfaceM2: number }

/** Polygones « En projet » COCHÉS d'un dossier (∩ empreinte, hors écartés) : cleabs + anneau extérieur (Lambert-93) + aire. `[]` si absent. */
async function lireCochesEnProjet(dossierId: number): Promise<PolygoneCoche[]> {
  try {
    const { rows } = await query<{ cleabs: string | null; gj: { type: string; coordinates: number[][][] | number[][][][] } | null; aire: number | null }>(
      `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT b.cleabs, ST_AsGeoJSON(ST_Force2D(b.geom))::json AS gj, ST_Area(ST_Force2D(b.geom)) AS aire
         FROM batiment b, emp
        WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)
          AND b.etat_de_l_objet = 'En projet'
          AND b.cleabs IS NOT NULL
          AND b.cleabs NOT IN (SELECT cleabs FROM permis_polygone_projet_ecarte WHERE dossier_id = $1)
        ORDER BY ST_YMax(b.geom) DESC, ST_XMin(b.geom), b.cleabs`, [dossierId]);
    const out: PolygoneCoche[] = [];
    for (const r of rows) {
      if (!r.gj || r.cleabs === null) continue;
      const anneau = r.gj.type === 'Polygon'
        ? ((r.gj.coordinates as number[][][])[0] ?? [])
        : r.gj.type === 'MultiPolygon'
          ? ((r.gj.coordinates as number[][][][])[0]?.[0] ?? [])
          : [];
      if (anneau.length >= 3) out.push({ cleabs: r.cleabs, anneau: anneau.map(([x, y]) => ({ x, y })), surfaceM2: r.aire !== null ? Number(r.aire) : 0 });
    }
    return out;
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

/** Union PostGIS d'un groupe de polygones IGN (par cleabs) → WKT (Multi si contact par sommet) + aire brute (ST_Area). Null si vide. */
async function unionEtAireGroupe(cleabs: string[]): Promise<{ wkt: string; aireM2: number } | null> {
  if (cleabs.length === 0) return null;
  const { rows } = await query<{ wkt: string | null; aire: number | null }>(
    `WITH u AS (SELECT ST_UnaryUnion(ST_Force2D(ST_Collect(geom))) AS g FROM batiment WHERE cleabs = ANY($1))
     SELECT ST_AsText(g) AS wkt, ST_Area(g) AS aire FROM u`, [cleabs]);
  const r = rows[0];
  if (!r || !r.wkt || r.aire === null) return null;
  return { wkt: r.wkt, aireM2: Number(r.aire) };
}

/** Repère de chaque bâtiment déclaré du permis (permis_corps_batiment) : Map corpsId → repère (ou null). `Map()` vide si absent. */
async function lireReperesBatiments(dossierId: number): Promise<Map<number, string | null>> {
  try {
    const { rows } = await query<{ id: number; repere: string | null }>(
      `SELECT id::int AS id, repere FROM permis_corps_batiment WHERE dossier_id = $1`, [dossierId]);
    return new Map(rows.map((r) => [r.id, r.repere]));
  } catch (err) {
    if (estTableAbsente(err)) return new Map();
    throw err;
  }
}

export interface GroupeAdoption { cleabs: string[]; surfaceM2: number; polygones: { cleabs: string; surfaceM2: number }[] }
export interface ApercuAdoption { groupes: GroupeAdoption[] }

/**
 * APERÇU AUTOMATIQUE (lecture seule) : les polygones « en projet » cochés, REGROUPÉS par connexité (proposition par défaut), avec
 * l'aire de chaque groupe ET de chaque polygone (pour l'affichage « scindé »). Aucune écriture. `groupes: []` si aucun coché.
 */
export async function apercuAdoptionEnProjet(dossierId: number): Promise<ApercuAdoption> {
  const groupes = grouperPolygonesConnexes(await lireCochesEnProjet(dossierId));
  const out: GroupeAdoption[] = [];
  for (const g of groupes) {
    const u = await unionEtAireGroupe(g.map((p) => p.cleabs));
    if (u) out.push({ cleabs: g.map((p) => p.cleabs), surfaceM2: u.aireM2, polygones: g.map((p) => ({ cleabs: p.cleabs, surfaceM2: p.surfaceM2 })) });
  }
  return { groupes: out };
}

// Filtre + dédoublonne des affectations reçues (cleabs → corpsId), en ne gardant QUE les cleabs cochés et les bâtiments déclarés.
//   Exclusivité polygone → un seul bâtiment (Map : dernière affectation gagne, mais le client garantit l'unicité).
function affectationsValides(affectations: AffectationEntree[], coches: PolygoneCoche[], reperes: Map<number, string | null>): AffectationEntree[] {
  const cleabsCoches = new Set(coches.map((c) => c.cleabs));
  const parCleabs = new Map<string, number>();
  for (const a of affectations) if (cleabsCoches.has(a.cleabs) && reperes.has(a.corpsId)) parCleabs.set(a.cleabs, a.corpsId);
  return [...parCleabs].map(([cleabs, corpsId]) => ({ cleabs, corpsId }));
}

export interface AffectationEntree { cleabs: string; corpsId: number }
export interface EmpriseApercu { surfaceM2: number }
export interface BatimentAdoption { corpsId: number; repere: string | null; nomRepli?: string | null; emprises: EmpriseApercu[] } // NOM-1 — + nom de repli
export interface ApercuAffectations { batiments: BatimentAdoption[] }

/**
 * APERÇU PAR BÂTIMENT (lecture seule) d'une affectation donnée : pour chaque bâtiment, combien d'emprises seront créées et leur
 * aire. Regroupement PAR BÂTIMENT en composantes connexes CÔTÉ SERVEUR (grouperParBatiment) ; union/aire par PostGIS. Aucune écriture.
 */
export async function apercuAffectations(dossierId: number, affectations: AffectationEntree[]): Promise<ApercuAffectations> {
  const coches = await lireCochesEnProjet(dossierId);
  const reperes = await lireReperesBatiments(dossierId);
  const nomsRepli = new Map((await listerBatiments(dossierId)).map((b) => [b.corpsId, b.nomRepli])); // NOM-1 — nom de repli par corps (résilient)
  const valides = affectationsValides(affectations, coches, reperes);
  const parBat = grouperParBatiment(coches, valides);
  const out: BatimentAdoption[] = [];
  for (const b of parBat) {
    const emprises: EmpriseApercu[] = [];
    for (const comp of b.composantes) {
      const u = await unionEtAireGroupe(comp.map((p) => p.cleabs));
      if (u) emprises.push({ surfaceM2: u.aireM2 });
    }
    out.push({ corpsId: b.corpsId, repere: reperes.get(b.corpsId) ?? null, nomRepli: nomsRepli.get(b.corpsId) ?? null, emprises });
  }
  return { batiments: out };
}

export type ResultatAdoption =
  | { ok: true; nbCreees: number; emprises: EmpriseReconstruite[]; debordement: Debordement | null }
  | { ok: false; motif: string; tableAbsente?: boolean };

/**
 * ADOPTE les polygones « en projet » selon une AFFECTATION cleabs → bâtiment (PROJ-3r). Chaque bâtiment reçoit UNE emprise par
 * composante connexe de SES polygones ; deux groupes disjoints d'un même bâtiment restent DEUX emprises (jamais unis). Provenance
 * 'ign_adopte'. EXCLUSIVITÉ (PROJ-3q) : chaque bâtiment CIBLÉ voit ses emprises existantes remplacées ; les bâtiments non ciblés
 * sont intacts. Transactionnel. 🔴 Aucune géométrie reçue du client (seulement des identifiants cleabs/corpsId) ; union par PostGIS ;
 * garde moteur intacte. Le débordement de l'ensemble adopté vs parcelle est renvoyé (repère indicatif).
 */
export async function adopterAffectations(dossierId: number, affectations: AffectationEntree[], par: string | null): Promise<ResultatAdoption> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return { ok: false, motif: 'requête invalide' };
  const coches = await lireCochesEnProjet(dossierId);
  const reperes = await lireReperesBatiments(dossierId);
  const valides = affectationsValides(affectations, coches, reperes);
  if (valides.length === 0) return { ok: false, motif: 'aucun polygone « en projet » coché à adopter' };
  const parBat = grouperParBatiment(coches, valides);
  // Union PostGIS de chaque composante (autoritaire) AVANT la transaction (pas de géométrie client).
  const aInserer: { corpsId: number; libelle: string; wkt: string; cleabs: string[] }[] = [];
  for (const b of parBat) {
    const lib = reperes.get(b.corpsId) ?? `bâtiment ${b.corpsId}`;
    for (const comp of b.composantes) {
      const cleabs = comp.map((p) => p.cleabs);
      const u = await unionEtAireGroupe(cleabs);
      if (u) aInserer.push({ corpsId: b.corpsId, libelle: lib ?? `bâtiment ${b.corpsId}`, wkt: u.wkt, cleabs });
    }
  }
  if (aInserer.length === 0) return { ok: false, motif: 'union des polygones impossible' };
  const corpsCibles = [...new Set(parBat.map((b) => b.corpsId))];
  try {
    await withTransaction(async (tx) => {
      for (const corpsId of corpsCibles) await tx(`DELETE FROM permis_emprise_reconstruite WHERE dossier_id = $1 AND corps_id = $2`, [dossierId, corpsId]); // EXCLUSIVITÉ par bâtiment ciblé
      for (const e of aInserer) {
        const calage = JSON.stringify({ adoptionIgn: true, cleabs: e.cleabs }); // trace la SOURCE (mémorise le regroupement) ; pas de calage/échelle
        await tx(
          `INSERT INTO permis_emprise_reconstruite (dossier_id, corps_id, libelle, geom, surface_m2, calage, provenance, cree_par)
           VALUES ($1, $2, $3, ST_GeomFromText($4, 2154), ST_Area(ST_GeomFromText($4, 2154)), $5::jsonb, 'ign_adopte', $6)`,
          [dossierId, e.corpsId, e.libelle, e.wkt, calage, par]);
      }
    });
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des emprises absente (migration 149/153 non appliquée)', tableAbsente: true };
    throw err;
  }
  const emprises = await listerEmprises(dossierId);
  const toutAdopte = await unionEtAireGroupe(aInserer.flatMap((e) => e.cleabs));
  const debordement = toutAdopte ? await mesurerDebordementWkt(dossierId, toutAdopte.wkt) : null;
  return { ok: true, nbCreees: aInserer.length, emprises, debordement };
}

/** EXCLUSIVITÉ inverse : retire les emprises ADOPTÉES d'un bâtiment (quand on enregistre un tracé manuel à la place). Renvoie le nb retiré. */
export async function supprimerEmprisesAdoptees(dossierId: number, corpsId: number): Promise<number> {
  try {
    const { rowCount } = await query(
      `DELETE FROM permis_emprise_reconstruite WHERE dossier_id = $1 AND corps_id = $2 AND provenance IN ('ign_adopte', 'ign_retouche')`,
      [dossierId, corpsId]);
    return rowCount ?? 0;
  } catch (err) {
    if (estTableAbsente(err)) return 0;
    throw err;
  }
}

async function lireEmpreinteParcelle(dossierId: number): Promise<{ anneaux: PointLambert[][]; surfaceM2: number | null }> {
  try {
    const { rows } = await query<{ gj: { type: string; coordinates: number[][][] | number[][][][] } | null; surface_m2: number | null }>(
      `SELECT ST_AsGeoJSON(geom)::json AS gj, surface_m2 FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    if (!r || !r.gj) return { anneaux: [], surfaceM2: null };
    const anneaux: PointLambert[][] = [];
    if (r.gj.type === 'Polygon') { const c = r.gj.coordinates as number[][][]; if (c[0]) anneaux.push(c[0].map(([x, y]) => ({ x, y }))); }
    else if (r.gj.type === 'MultiPolygon') { for (const poly of r.gj.coordinates as number[][][][]) if (poly[0]) anneaux.push(poly[0].map(([x, y]) => ({ x, y }))); }
    return { anneaux, surfaceM2: r.surface_m2 !== null ? Number(r.surface_m2) : null };
  } catch (err) {
    if (estTableAbsente(err)) return { anneaux: [], surfaceM2: null };
    throw err;
  }
}

// ── Projections IGNORÉES par bâtiment (PROJ-2b) ──────────────────────────────
// État COURANT dans permis_projection_ignoree (réversible = suppression) ; AUDIT au journal append-only permis_rattachement_evenement
// (types 'projection_ignoree' / 'projection_retablie'), MÊME mécanique que les autres actions d'actionsRattachement. 🔴 N'écrit NI
// dans batiment, NI dans permis_polygone_altitude, NI dans permis_corps* : rien du moteur.
export interface ProjectionIgnoree { corpsId: number; motif: string }
export type ResultatIgnorance = { ok: true } | { ok: false; motif: string; tableAbsente?: boolean };

async function rattId(q: RequeteTx, dossierId: number): Promise<number | null> {
  const { rows } = await q<{ id: number }>(`SELECT id FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  return rows[0]?.id ?? null;
}

/** IGNORER la projection d'un bâtiment : motif OBLIGATOIRE. Upsert l'état courant + trace un événement 'projection_ignoree'. */
export async function ignorerProjection(dossierId: number, corpsId: number, motif: string, par: string | null): Promise<ResultatIgnorance> {
  const m = (motif ?? '').trim();
  if (!m) return { ok: false, motif: 'un motif court est obligatoire pour ignorer la projection' };
  if (!Number.isInteger(corpsId) || corpsId <= 0) return { ok: false, motif: 'bâtiment invalide' };
  try {
    return await withTransaction(async (q) => {
      await q(`INSERT INTO permis_projection_ignoree (dossier_id, corps_id, motif, par) VALUES ($1, $2, $3, $4)
               ON CONFLICT (corps_id) DO UPDATE SET motif = EXCLUDED.motif, par = EXCLUDED.par, le = now()`, [dossierId, corpsId, m, par]);
      const rid = await rattId(q, dossierId);
      if (rid !== null) await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
                                 VALUES ($1, 'projection_ignoree', NULL, NULL, $2::jsonb, $3)`, [rid, JSON.stringify({ corpsId, motif: m }), par]);
      return { ok: true } as const;
    });
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des projections ignorées absente (migration 150 non appliquée)', tableAbsente: true };
    throw err;
  }
}

/** RÉTABLIR (annuler l'ignorance) d'un bâtiment : supprime l'état courant + trace un événement 'projection_retablie'. Réversible. */
export async function retablirProjection(dossierId: number, corpsId: number, par: string | null): Promise<ResultatIgnorance> {
  if (!Number.isInteger(corpsId) || corpsId <= 0) return { ok: false, motif: 'bâtiment invalide' };
  try {
    return await withTransaction(async (q) => {
      await q(`DELETE FROM permis_projection_ignoree WHERE corps_id = $1 AND dossier_id = $2`, [corpsId, dossierId]);
      const rid = await rattId(q, dossierId);
      if (rid !== null) await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
                                 VALUES ($1, 'projection_retablie', NULL, NULL, $2::jsonb, $3)`, [rid, JSON.stringify({ corpsId }), par]);
      return { ok: true } as const;
    });
  } catch (err) {
    if (estTableAbsente(err)) return { ok: false, motif: 'table des projections ignorées absente (migration 150 non appliquée)', tableAbsente: true };
    throw err;
  }
}

/** Bâtiments déclarés du permis (permis_corps_batiment) — l'univers du tracé/ignorance. `[]` si la table manque.
 *  LOT 80 — porte aussi l'ALTITUDE DE SOMMET VALIDÉE du bâtiment (`altitude_sommet_ngf`, migration 108 — celle qui alimente
 *  `nbCorpsSansAltitude`/la sortie vers Rattachement), pour la légende par polygone du schéma « Projection des emprises » (altitude
 *  PORTÉE PAR LE BÂTIMENT, héritée par ses polygones). `null` = altitude non validée. */
export async function listerBatiments(dossierId: number): Promise<{ corpsId: number; repere: string | null; nomRepli: string | null; altitudeSommetNgf: number | null }[]> {
  try {
    const { rows } = await query<{ id: number; repere: string | null; nom_repli: string | null; alt: string | number | null }>(
      `SELECT id::int AS id, repere, nom_repli, altitude_sommet_ngf AS alt FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere, id`, [dossierId]); // NOM-1 nom_repli ; LOT 80 altitude validée
    return rows.map((r) => ({ corpsId: r.id, repere: r.repere, nomRepli: r.nom_repli, altitudeSommetNgf: r.alt == null ? null : Number(r.alt) }));
  } catch (err) {
    if (estTableAbsente(err)) return [];
    if (estColonneAbsente(err)) { // NOM-1 — migration 168 non appliquée : on relit SANS nom_repli (→ null, l'affichage retombe sur « bâtiment {id} »). altitude_sommet_ngf (108) reste lue.
      const { rows } = await query<{ id: number; repere: string | null; alt: string | number | null }>(
        `SELECT id::int AS id, repere, altitude_sommet_ngf AS alt FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere, id`, [dossierId]);
      return rows.map((r) => ({ corpsId: r.id, repere: r.repere, nomRepli: null, altitudeSommetNgf: r.alt == null ? null : Number(r.alt) }));
    }
    throw err;
  }
}

/** Projections IGNORÉES d'un dossier (état courant). `[]` si la table n'existe pas encore. */
export async function listerIgnorees(dossierId: number): Promise<ProjectionIgnoree[]> {
  try {
    const { rows } = await query<{ corps_id: number; motif: string }>(
      `SELECT corps_id::int AS corps_id, motif FROM permis_projection_ignoree WHERE dossier_id = $1 ORDER BY corps_id`, [dossierId]);
    return rows.map((r) => ({ corpsId: r.corps_id, motif: r.motif }));
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}

/**
 * `surface_plancher_m2` est au niveau PERMIS (`permis_caracteristique`) : c'est le plancher de TOUT le permis (tous bâtiments).
 * On ne le divise JAMAIS par un « nombre d'étages du permis » (qui n'existe pas) — le nombre de niveaux se lit PAR BÂTIMENT
 * (`lireBatimentsNiveaux`). `null` si non renseigné / table absente.
 */
async function lireSurfacePlancher(dossierId: number): Promise<number | null> {
  try {
    const { rows } = await query<{ surface_plancher_m2: number | null }>(
      `SELECT c.surface_plancher_m2 FROM permis_caracteristique c WHERE c.dossier_id = $1`, [dossierId]);
    const r = rows[0];
    return r && r.surface_plancher_m2 !== null ? Number(r.surface_plancher_m2) : null;
  } catch (err) {
    if (estTableAbsente(err)) return null;
    throw err;
  }
}

/**
 * Niveaux déclarés PAR BÂTIMENT (`permis_corps_batiment.nb_etages`) — jamais un agrégat du permis. Le contrôle de vraisemblance
 * choisit lui-même quoi en faire (niveaux du bâtiment courant, ou niveaux communs au permis). `[]` si la table manque.
 */
async function lireBatimentsNiveaux(dossierId: number): Promise<{ corpsId: number; nbEtages: number | null }[]> {
  try {
    const { rows } = await query<{ id: number; nb_etages: number | null }>(
      `SELECT id::int AS id, nb_etages FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY id`, [dossierId]);
    return rows.map((r) => ({ corpsId: r.id, nbEtages: r.nb_etages !== null ? Number(r.nb_etages) : null }));
  } catch (err) {
    if (estTableAbsente(err)) return [];
    throw err;
  }
}
